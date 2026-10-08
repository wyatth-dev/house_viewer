"""矫正图像素 ↔ 立面坐标。

归一化坐标以立面宽度为单位（u 向右、v 向上，原点为立面左下角），
因此宽度未知时也能先测量，宽度确定或改变后再换算成毫米。
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional, Sequence

from PIL import Image

EXIF_IFD = 0x8769
FOCAL_35MM_TAG = 41989


def normalize(px: Sequence[float], origin_px: tuple[float, float], px_per_width: float) -> dict[str, float]:
    """点 [x, y] → {u, v}；框 [x0, y0, x1, y1] → {u0, u1, v0, v1}（u0<u1，v0<v1）。"""
    ox, oy = origin_px

    def u(x):
        return (x - ox) / px_per_width

    def v(y):
        return (oy - y) / px_per_width

    if len(px) == 2:
        return {"u": u(px[0]), "v": v(px[1])}
    if len(px) == 4:
        x0, y0, x1, y1 = px
        return {"u0": min(u(x0), u(x1)), "u1": max(u(x0), u(x1)),
                "v0": min(v(y0), v(y1)), "v1": max(v(y0), v(y1))}
    raise ValueError("Pixel coordinates must be a point [x, y] or a box [x0, y0, x1, y1]")


def to_mm(normalized: dict[str, float], width_mm: Optional[float]) -> Optional[dict[str, float]]:
    if width_mm is None:
        return None
    return {key: value * width_mm for key, value in normalized.items()}


def read_focal_px(path: Path) -> Optional[float]:
    """由 EXIF 的 35mm 等效焦距换算像素焦距（35mm 画幅长边 36 mm）。"""
    try:
        with Image.open(path) as image:
            focal_35 = image.getexif().get_ifd(EXIF_IFD).get(FOCAL_35MM_TAG)
            long_side = max(image.size)
    except OSError:
        return None
    if not focal_35:
        return None
    return float(focal_35) / 36.0 * long_side
