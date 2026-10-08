"""预览图共用的绘图小工具。"""
from __future__ import annotations

from PIL import Image, ImageDraw, ImageFont

OUTLINE = (220, 60, 40)
OPENING = (20, 110, 200)
GUIDE = (240, 160, 0)


def font(size: int = 18) -> ImageFont.ImageFont:
    return ImageFont.load_default(size=size)


def label(draw: ImageDraw.ImageDraw, xy, text: str, color, size: int = 18) -> None:
    """带白底的小标签，便于在照片上阅读。"""
    f = font(size)
    box = draw.textbbox(xy, text, font=f)
    draw.rectangle((box[0] - 3, box[1] - 2, box[2] + 3, box[3] + 2), fill=(255, 255, 255))
    draw.text(xy, text, fill=color, font=f)


def fit(image: Image.Image, max_side: int = 1600) -> tuple[Image.Image, float]:
    """等比缩小到最长边不超过 max_side，返回 (图, 缩放比)。"""
    scale = min(1.0, max_side / max(image.size))
    if scale < 1.0:
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    return image, scale


def grid(image: Image.Image, scale: float, step: int) -> Image.Image:
    """叠加像素网格；标注的是原图像素坐标（scale 为显示缩放比）。"""
    image = image.convert("RGB").copy()
    draw = ImageDraw.Draw(image, "RGBA")
    width, height = image.size
    for x in range(0, int(width / scale) + 1, step):
        draw.line((x * scale, 0, x * scale, height), fill=(255, 0, 255, 90), width=1)
        label(draw, (x * scale + 2, 2), str(x), (160, 0, 160), 13)
    for y in range(0, int(height / scale) + 1, step):
        draw.line((0, y * scale, width, y * scale), fill=(255, 0, 255, 90), width=1)
        label(draw, (2, y * scale + 2), str(y), (160, 0, 160), 13)
    return image


def nice_step(length: float, divisions: int = 12) -> int:
    raw = length / divisions
    for step in (25, 50, 100, 200, 250, 500):
        if step >= raw:
            return step
    return 1000
