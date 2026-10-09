"""项目素材：data/projects/<pid>/media/。

  media/captures/<id>.jpg      渲染队列里的模型截图
  media/context/<id>.jpg       用户在 Context 里上传的照片
  media/renders/<rid>/         出图任务（job.json、prompt.txt、result.jpg）

上传的图片统一转正、转成 JPEG（和照片录入同一套规范化），最长边不超过 MAX_EDGE。
浏览器通过 /data/projects/<pid>/media/<path> 读取。
"""
from __future__ import annotations

import io
import uuid
from pathlib import Path

from PIL import Image

from facade_modeler.photos.normalize import normalize_photo

KINDS = ("captures", "context")
MAX_EDGE = 2048
JPEG_QUALITY = 90


def media_url(pid: str, relative: str) -> str:
    return f"/data/projects/{pid}/media/{relative}"


def _limit(data: bytes) -> bytes:
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        if max(image.size) <= MAX_EDGE:
            return data
        image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        image.convert("RGB").save(buffer, format="JPEG", quality=JPEG_QUALITY)
        return buffer.getvalue()


class MediaStore:
    def __init__(self, root: Path):
        self.root = Path(root)

    def save(self, kind: str, data: bytes) -> str:
        """保存一张图片，返回相对 media/ 的路径；不是图片时抛 ValueError。"""
        if kind not in KINDS:
            raise ValueError(f"Unknown media kind {kind!r}")
        jpeg = _limit(normalize_photo(data))
        folder = self.root / kind
        folder.mkdir(parents=True, exist_ok=True)
        relative = f"{kind}/{uuid.uuid4().hex[:12]}.jpg"
        (self.root / relative).write_bytes(jpeg)
        return relative

    def resolve(self, relative: str) -> Path:
        """media/ 下的文件；越界或不存在时抛 FileNotFoundError。"""
        root = self.root.resolve()
        target = (root / relative).resolve()
        if root not in target.parents or not target.is_file():
            raise FileNotFoundError(relative)
        return target

    def delete(self, relative: str) -> bool:
        """只允许删除上传的截图和 Context 照片（渲染结果随任务保留）。"""
        if relative.split("/", 1)[0] not in KINDS:
            raise ValueError("Only captures and context photos can be deleted")
        try:
            self.resolve(relative).unlink()
        except FileNotFoundError:
            return False
        return True
