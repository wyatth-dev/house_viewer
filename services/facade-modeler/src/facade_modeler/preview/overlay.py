"""把当前模型的立面轮廓和洞口叠加在矫正照片上，便于 LM 逐个对齐。

注意：矫正只对立面所在平面成立；屋脊等位于立面后方的部分不能在矫正图上直接比对。
"""
from __future__ import annotations

from PIL import Image, ImageDraw

from facade_modeler.preview.draw import fit
from facade_modeler.preview.elevation import draw_facade, facade_to_pixels
from facade_modeler.spec.model import HouseSpec, Rectification


def render_overlay(spec: HouseSpec, rectification: Rectification, rectified: Image.Image) -> Image.Image:
    image = rectified.convert("RGB").copy()
    draw = ImageDraw.Draw(image)
    to_px = facade_to_pixels(spec, rectification.origin_px, rectification.px_per_width)
    draw_facade(draw, spec, to_px)
    return fit(image)[0]
