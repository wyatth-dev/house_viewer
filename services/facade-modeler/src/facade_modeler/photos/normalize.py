"""上传照片规范化：所有照片在入库前统一处理一次。

- 按 EXIF 方向标签把像素转正：手机竖拍的照片在浏览器里是正的，
  但若不转正，LM 看到的、矫正用到的可能是横着的图（review C-1）。
- HEIC（iPhone 默认格式）等格式统一转为 JPEG（review I-1）。
- 无法解码的文件直接拒绝。
- 保留 EXIF 中的焦距（矫正时用来估计透视）。
"""
from __future__ import annotations

import io

from PIL import Image, ImageOps, UnidentifiedImageError

try:  # HEIC 支持；pillow-heif 是依赖，但缺失时其他格式仍可用
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:  # pragma: no cover
    pass

ORIENTATION_TAG = 0x0112
JPEG_QUALITY = 92


def normalize_photo(data: bytes) -> bytes:
    """返回转正后的 JPEG 字节；不是可解码的图片时抛 ValueError。"""
    try:
        with Image.open(io.BytesIO(data)) as source:
            source.load()
            exif = source.getexif()
            upright = ImageOps.exif_transpose(source).convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise ValueError("Unrecognised image file; please upload JPG, PNG or HEIC photos") from error
    exif[ORIENTATION_TAG] = 1  # 像素已转正
    buffer = io.BytesIO()
    upright.save(buffer, format="JPEG", quality=JPEG_QUALITY, exif=exif.tobytes())
    return buffer.getvalue()
