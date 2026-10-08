"""立面正视图（二维）：轮廓、勒脚线、檐口线、洞口与编号。供 LM 自查。"""
from __future__ import annotations

from PIL import Image, ImageDraw

from facade_modeler.build.outline import facade_outline
from facade_modeler.preview.draw import GUIDE, OPENING, OUTLINE, label
from facade_modeler.spec.model import HouseSpec


def facade_to_pixels(spec: HouseSpec, origin_px: tuple[float, float], px_per_width: float):
    """返回把立面毫米坐标换成图像像素的函数。"""
    ox, oy = origin_px
    scale = px_per_width / spec.facade.width_mm
    return lambda u, v: (ox + u * scale, oy - v * scale)


def draw_facade(draw: ImageDraw.ImageDraw, spec: HouseSpec, to_px, line_width: int = 3) -> None:
    width, eave = spec.facade.width_mm, spec.roof.eave_height_mm
    draw.polygon([to_px(u, v) for u, v in facade_outline(spec)], outline=OUTLINE, width=line_width)
    plinth = spec.facade.materials["plinth"].height_mm or 0
    for v in (plinth, eave):
        draw.line((to_px(0, v), to_px(width, v)), fill=GUIDE, width=max(1, line_width - 1))
    for o in spec.facade.openings:
        left, top = to_px(o.u_mm - o.width_mm / 2, o.sill_mm + o.height_mm)
        right, bottom = to_px(o.u_mm + o.width_mm / 2, o.sill_mm)
        draw.rectangle((left, top, right, bottom), outline=OPENING, width=line_width)
        label(draw, (left + 4, top + 4), o.id, OPENING)


def render_elevation(spec: HouseSpec, size: int = 1400) -> Image.Image:
    """白底正视图，四周留白；底部标注宽度，左侧标注檐高。"""
    width = spec.facade.width_mm
    outline = facade_outline(spec)
    top = max(v for _, v in outline)
    px_per_width = size * 0.8
    height = int(px_per_width * top / width + size * 0.25)
    image = Image.new("RGB", (size, height), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    origin = (size * 0.1, height - size * 0.1)
    to_px = facade_to_pixels(spec, origin, px_per_width)
    draw_facade(draw, spec, to_px)
    label(draw, (to_px(width / 2, 0)[0] - 40, origin[1] + 12), f"W {width:.0f}", OUTLINE, 20)
    label(draw, (8, to_px(0, spec.roof.eave_height_mm)[1] - 10), f"eave {spec.roof.eave_height_mm:.0f}", GUIDE, 16)
    return image
