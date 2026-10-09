"""出图任务：模型截图 + Context 照片 + 提示词（仓库根目录 prompts/）→ AI 效果图。

每个任务一个目录 data/projects/<pid>/media/renders/<rid>/：
  job.json     状态（queued → running → done | failed）、输入、错误
  input.png    实际发送的截图：等比缩放后放进出图尺寸的画布，四周用边缘像素延伸补齐（不裁剪、不拉伸）
  prompt.txt   实际发送的提示词（方便回看和调提示词）
  result.jpg   效果图：从出图结果里切回截图所在的区域，缩放成和截图一样的尺寸，前后对比时可以直接叠在一起

出图尺寸：gpt-image-2 / 2.5 系列按截图的比例出图（几乎不用补边）；旧模型只有三种固定尺寸，
比例不同的截图如果直接发过去，模型会自己重新取景，再裁回截图比例时房子会被放大、移位（看起来像换了角度），所以要补边。

任务在后台线程里跑，同一时间最多 MAX_PARALLEL 个；浏览器轮询 GET …/renders/<rid>。
服务重启前没跑完的任务在下次读取时标记为 failed。
"""
from __future__ import annotations

import io
import json
import threading
import time
import uuid
from pathlib import Path
from typing import Callable, Optional

import numpy as np
from PIL import Image, ImageOps

from facade_modeler.rendering.media import MediaStore, media_url
from facade_modeler.rendering.openai_images import OpenAIImageSettings, RenderError, edit_image, model_from_env, size_for
from facade_modeler.rendering.prompt import build_prompt

MAX_PARALLEL = 2
MAX_CONTEXT = 6  # 最多带几张 Context 照片（太多会稀释截图的约束，也更慢更贵）
JPEG_QUALITY = 92
NOT_CONFIGURED = ("AI rendering is not set up. Add OPENAI_API_KEY to the .env file in the house-viewer folder, "
                  "then restart npm run dev.")

Generator = Callable[[str, list, str], bytes]  # (提示词, 输入图片路径, 尺寸) → 图片字节


def openai_generator(prompt: str, images: list, size: str) -> bytes:
    settings = OpenAIImageSettings.from_env()
    if settings is None:
        raise RenderError(NOT_CONFIGURED)
    return edit_image(settings, prompt, images, size)


Box = tuple[int, int, int, int]  # 截图在画布里的位置 (left, top, width, height)


def pad_to(source: Image.Image, size: tuple[int, int]) -> tuple[Image.Image, Box]:
    """等比缩放截图放进 size 的画布正中，四周复制边缘像素补齐。"""
    canvas_w, canvas_h = size
    scale = min(canvas_w / source.width, canvas_h / source.height)
    width, height = max(1, round(source.width * scale)), max(1, round(source.height * scale))
    resized = np.asarray(source.convert("RGB").resize((width, height), Image.Resampling.LANCZOS))
    left, top = (canvas_w - width) // 2, (canvas_h - height) // 2
    padded = np.pad(resized, ((top, canvas_h - height - top), (left, canvas_w - width - left), (0, 0)), mode="edge")
    return Image.fromarray(padded), (left, top, width, height)


def crop_back(data: bytes, canvas: tuple[int, int], box: Box, size: tuple[int, int]) -> bytes:
    """从出图结果里切回截图所在的区域，缩放成截图的尺寸。"""
    left, top, width, height = box
    with Image.open(io.BytesIO(data)) as image:
        result = image.convert("RGB")
    if result.size != canvas:  # 万一模型没按要求的尺寸出图
        result = result.resize(canvas, Image.Resampling.LANCZOS)
    cropped = result.crop((left, top, left + width, top + height)).resize(size, Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    cropped.save(buffer, format="JPEG", quality=JPEG_QUALITY)
    return buffer.getvalue()


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


class RenderRunner:
    """media_for(pid) 返回这个项目的 MediaStore（项目不存在时抛 ProjectNotFound）。"""

    def __init__(self, media_for: Callable[[str], MediaStore], generate: Optional[Generator] = None):
        self.media_for = media_for
        self._generate = generate or openai_generator
        self._custom = generate is not None
        self._guard = threading.RLock()
        self._slots = threading.Semaphore(MAX_PARALLEL)
        self._threads: dict[str, threading.Thread] = {}

    def configured(self) -> bool:
        return self._custom or OpenAIImageSettings.from_env() is not None

    # ---- 对外接口 ------------------------------------------------------------------
    def start(self, pid: str, source: Path, context: list[Path], source_url: str, context_urls: list[str],
              options: Optional[dict] = None) -> dict:
        """options：已经校验、补全过的氛围参数（prompt.resolve_options）。"""
        media = self.media_for(pid)
        rid = f"r-{uuid.uuid4().hex[:10]}"
        folder = media.root / "renders" / rid
        folder.mkdir(parents=True)
        job = {"id": rid, "state": "queued", "createdAt": _now(), "startedAt": None, "finishedAt": None,
               "sourceUrl": source_url, "contextUrls": context_urls[:MAX_CONTEXT], "options": options or {},
               "error": None}
        self._write(folder, job)
        thread = threading.Thread(target=self._run, args=(pid, folder, Path(source), [Path(p) for p in context[:MAX_CONTEXT]],
                                                          options or {}), daemon=True)
        with self._guard:
            self._threads[f"{pid}/{rid}"] = thread
        thread.start()
        return self._public(pid, job)

    def status(self, pid: str, rid: str) -> Optional[dict]:
        if not rid.startswith("r-") or "/" in rid or ".." in rid:
            return None
        folder = self.media_for(pid).root / "renders" / rid
        with self._guard:
            job = self._read(folder)
            if job is None:
                return None
            thread = self._threads.get(f"{pid}/{rid}")
            if job["state"] in ("queued", "running") and not (thread and thread.is_alive()):
                job = self._update(folder, state="failed", finishedAt=_now(),
                                   error="The render was interrupted (the server restarted). Please render again.")
        return self._public(pid, job)

    # ---- 后台线程 ------------------------------------------------------------------
    def _run(self, pid: str, folder: Path, source: Path, context: list[Path], options: dict) -> None:
        key = f"{pid}/{folder.name}"
        try:
            with self._slots:
                self._update(folder, state="running", startedAt=_now())
                try:
                    with Image.open(source) as image:
                        original = image.size
                        size = size_for(*original, model_from_env())
                        canvas = tuple(int(value) for value in size.split("x"))
                        padded, box = pad_to(image, canvas)
                    padded.save(folder / "input.png")
                    prompt = build_prompt(len(context), choices=options)
                    (folder / "prompt.txt").write_text(prompt, encoding="utf-8")
                    data = self._generate(prompt, [folder / "input.png", *context], size)
                    (folder / "result.jpg").write_bytes(crop_back(data, canvas, box, original))
                    self._update(folder, state="done", finishedAt=_now())
                except RenderError as error:
                    self._update(folder, state="failed", finishedAt=_now(), error=str(error))
                except Exception as error:  # noqa: BLE001  任何失败都要落到 job.json，界面才不会一直转圈
                    self._update(folder, state="failed", finishedAt=_now(), error=f"Rendering failed: {error}")
        except OSError:  # 项目在出图期间被删除：目录已经不在了
            pass
        finally:
            with self._guard:
                self._threads.pop(key, None)

    # ---- job.json -------------------------------------------------------------------
    @staticmethod
    def _read(folder: Path) -> Optional[dict]:
        path = folder / "job.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None

    def _write(self, folder: Path, job: dict) -> None:
        temporary = folder / "job.tmp"
        temporary.write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(folder / "job.json")

    def _update(self, folder: Path, **fields) -> dict:
        with self._guard:
            job = {**(self._read(folder) or {}), **fields}
            self._write(folder, job)
            return job

    @staticmethod
    def _public(pid: str, job: dict) -> dict:
        done = job.get("state") == "done"
        return {**job, "resultUrl": media_url(pid, f"renders/{job['id']}/result.jpg") if done else None}
