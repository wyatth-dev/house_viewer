"""文件式项目存储：每栋房屋一个目录，磁盘是唯一状态。

projects/<id>/
  spec.json      当前 HouseSpec
  ops.jsonl      建模操作日志
  photos/        原始照片
  rectified/     矫正图
  builds/vN/     每次 build 的产物；builds/latest.json 指向最近一次成功版本
  status.json    draft | submitted，以及提交说明
  .lock          写锁
"""
from __future__ import annotations

import json
import re
import time
from contextlib import AbstractContextManager
from pathlib import Path
from typing import Optional

from facade_modeler.config import Defaults, load_defaults
from facade_modeler.project.lock import project_lock
from facade_modeler.spec.model import HouseSpec, Photo

PROJECT_ID = re.compile(r"^house-(\d{3,})$")
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".heic"}


class Project:
    def __init__(self, root: Path):
        self.root = root
        self.id = root.name

    # ---- HouseSpec ----------------------------------------------------------------
    @property
    def spec_path(self) -> Path:
        return self.root / "spec.json"

    def load_spec(self) -> HouseSpec:
        return HouseSpec.from_json(self.spec_path.read_text(encoding="utf-8"))

    def save_spec(self, spec: HouseSpec) -> None:
        _write_atomic(self.spec_path, spec.to_json())

    # ---- 照片 ------------------------------------------------------------------------
    def add_photo(self, data: bytes, filename: str) -> str:
        """保存照片并登记到 HouseSpec；第一张照片默认为主照片。"""
        with self.lock():
            spec = self.load_spec()
            photo_id = spec.next_id("p")
            suffix = Path(filename).suffix.lower()
            suffix = suffix if suffix in IMAGE_SUFFIXES else ".jpg"
            relative = f"photos/{photo_id}{suffix}"
            (self.root / relative).write_bytes(data)
            spec.photos = {**spec.photos, photo_id: Photo(file=relative, primary=not spec.photos)}
            self.save_spec(spec)
            return photo_id

    def photo_path(self, photo_id: str) -> Path:
        return self.root / self.load_spec().photos[photo_id].file

    def rectified_path(self, photo_id: str) -> Path:
        return self.root / "rectified" / f"{photo_id}.png"

    # ---- 操作日志 ----------------------------------------------------------------------
    def append_op(self, tool: str, args: dict) -> None:
        entry = {"time": time.strftime("%Y-%m-%dT%H:%M:%S"), "tool": tool, "args": args}
        with open(self.root / "ops.jsonl", "a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")

    # ---- 构建版本 ----------------------------------------------------------------------
    @property
    def builds_dir(self) -> Path:
        return self.root / "builds"

    def new_build(self) -> tuple[int, Path]:
        existing = [int(p.name[1:]) for p in self.builds_dir.glob("v*") if p.name[1:].isdigit()]
        version = max(existing, default=0) + 1
        path = self.builds_dir / f"v{version}"
        path.mkdir(parents=True)
        return version, path

    def build_dir(self, version: int) -> Path:
        return self.builds_dir / f"v{version}"

    def commit_build(self, version: int) -> None:
        _write_atomic(self.builds_dir / "latest.json", json.dumps({"version": version}))

    def latest_build(self) -> Optional[int]:
        path = self.builds_dir / "latest.json"
        return json.loads(path.read_text())["version"] if path.exists() else None

    # ---- 状态 --------------------------------------------------------------------------
    def get_status(self) -> dict:
        path = self.root / "status.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"state": "draft", "note": ""}

    def set_status(self, state: str, note: str = "") -> None:
        _write_atomic(self.root / "status.json", json.dumps({"state": state, "note": note}, ensure_ascii=False))

    def lock(self) -> AbstractContextManager[None]:
        return project_lock(self.root / ".lock")


class ProjectStore:
    def __init__(self, root: Path, defaults: Optional[Defaults] = None):
        self.root = Path(root)
        self.defaults = defaults or load_defaults()
        self.root.mkdir(parents=True, exist_ok=True)

    def list(self) -> list[str]:
        return sorted(p.name for p in self.root.iterdir() if PROJECT_ID.match(p.name) and (p / "spec.json").exists())

    def create(self, project_id: Optional[str] = None) -> Project:
        with project_lock(self.root / ".create.lock"):
            if project_id is None:
                numbers = [int(PROJECT_ID.match(name).group(1)) for name in self.list()]
                project_id = f"house-{max(numbers, default=0) + 1:03d}"
            root = self.root / project_id
            for sub in ("photos", "rectified", "builds"):
                (root / sub).mkdir(parents=True, exist_ok=True)
            project = Project(root)
            project.save_spec(HouseSpec.new(project_id, self.defaults))
            return project

    def open(self, project_id: str) -> Project:
        root = self.root / project_id
        if not PROJECT_ID.match(project_id) or not (root / "spec.json").exists():
            raise KeyError(f"Project {project_id} does not exist")
        return Project(root)


def _write_atomic(path: Path, text: str) -> None:
    """先写临时文件再改名，避免另一个进程读到写了一半的文件。"""
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(text, encoding="utf-8")
    temporary.replace(path)
