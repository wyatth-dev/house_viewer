"""程序化贴图（底色 + 法线），物理尺度与 house-viewer 的 Fairy / Sunningdale 原型一致。

移植自 house-viewer：scripts/typology/prepare-sunningdale.py 的 texture()；
新增 brick（砖墙，顺砖砌法）。底色由素材的 color 决定。
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw

SIZE = 512
SEED = 1539


@lru_cache(maxsize=None)
def texture(kind: str, base: tuple[int, int, int]) -> tuple[Image.Image, Image.Image]:
    """返回 (底色图, 法线图)。kind: roof | horizontal | vertical | stone | brick。"""
    rng = np.random.default_rng(SEED)
    if kind == "stone":
        color, height = _stone(rng, base)
    elif kind == "brick":
        color, height = _brick(rng, base)
    else:
        color, height = _lined(rng, kind, base)
    return color, _normal_map(height)


def _noise_base(rng, base) -> Image.Image:
    pixels = np.clip(np.array(base) + rng.normal(0, 2.2, (SIZE, SIZE, 1)), 0, 255).astype("uint8")
    return Image.fromarray(pixels)


def _lined(rng, kind, base):
    """屋面瓦（错缝）或挂板（水平 / 竖向线条）。"""
    color = _noise_base(rng, base)
    draw = ImageDraw.Draw(color)
    height = Image.fromarray(np.full((SIZE, SIZE), 180, dtype=np.uint8))
    hdraw = ImageDraw.Draw(height)
    dark = tuple(int(c * 0.62) for c in base)
    if kind == "roof":
        for row, y in enumerate(range(0, SIZE, 64)):
            draw.line((0, y, SIZE, y), fill=dark, width=3)
            hdraw.line((0, y, SIZE, y), fill=70, width=3)
            for x in range(-128, SIZE + 128, 128):
                x += 64 * (row % 2)
                draw.line((x, y, x, y + 64), fill=dark, width=2)
                hdraw.line((x, y, x, y + 64), fill=100, width=2)
    else:
        groove = tuple(int(c * 0.85) for c in base)
        for t in range(0, SIZE, 64):
            line = (0, t, SIZE, t) if kind == "horizontal" else (t, 0, t, SIZE)
            draw.line(line, fill=groove, width=2)
            hdraw.line(line, fill=95, width=2)
    return color, height


def _brick(rng, base):
    """顺砖砌法：砖 215×65，灰缝 10（贴图 512 px ≈ 1600 mm）。"""
    mortar = (196, 190, 178)
    color = Image.new("RGB", (SIZE, SIZE), mortar)
    height = Image.new("L", (SIZE, SIZE), 60)
    draw, hdraw = ImageDraw.Draw(color), ImageDraw.Draw(height)
    course, brick = SIZE / 22, SIZE / 7  # 22 皮 × 7 块
    for row in range(22):
        y0 = row * course
        offset = (row % 2) * brick / 2
        for col in range(-1, 8):
            x0 = col * brick + offset
            shade = int(rng.integers(-18, 14))
            fill = tuple(int(np.clip(c + shade, 0, 255)) for c in base)
            box = (x0 + 1.5, y0 + 1.5, x0 + brick - 1.5, y0 + course - 1.5)
            draw.rectangle(box, fill=fill)
            hdraw.rectangle(box, fill=int(rng.integers(170, 210)))
    return color, height


def _stone(rng, base):
    """不规则方整石（与 house-viewer 原型相同的算法）。"""
    color = Image.new("RGB", (SIZE, SIZE), tuple(int(c * 0.7) for c in base))
    height = Image.new("L", (SIZE, SIZE), 85)
    draw, hdraw = ImageDraw.Draw(color), ImageDraw.Draw(height)
    for row, y in enumerate(range(0, SIZE, 64)):
        widths = rng.integers(65, 165, size=5)
        widths = widths / widths.sum() * SIZE
        bounds = np.round(np.r_[0, np.cumsum(widths)]).astype(int)
        offset = (row * 91) % SIZE
        for k in range(5):
            left, right = bounds[k] + offset, bounds[k + 1] + offset
            var, warm = int(rng.integers(-25, 22)), int(rng.integers(-5, 6))
            fill = tuple(int(np.clip(c + var + w, 0, 255)) for c, w in zip(base, (warm, 0, -warm)))
            poly = [(left + 4, y + 6), (left + 18, y + 3), (right - 12, y + 5), (right - 3, y + 11),
                    (right - 5, y + 53), (right - 15, y + 60), (left + 12, y + 58), (left + 3, y + 49)]
            for wrap in (-SIZE, 0, SIZE):
                shifted = [(x + wrap, z) for x, z in poly]
                draw.polygon(shifted, fill=fill)
                hdraw.polygon(shifted, fill=int(rng.integers(175, 222)))
    return color, height


def _normal_map(height: Image.Image) -> Image.Image:
    h = np.asarray(height, dtype=float) / 255
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.4
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.4
    n = np.stack((-gx, gy, np.ones_like(h)), axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return Image.fromarray(np.clip((n * 0.5 + 0.5) * 255, 0, 255).astype("uint8"))
