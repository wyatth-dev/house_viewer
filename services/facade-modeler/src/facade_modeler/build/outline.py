"""由屋顶推导立面轮廓（立面坐标，毫米）。见 spec 5.2 的表格。

ridge = "parallel"：屋脊与立面平行，立面顶边是檐口；
ridge = "perpendicular"：屋脊与立面垂直，立面是山墙面。
"""
from __future__ import annotations

import math

from facade_modeler.spec.model import HouseSpec

Point2 = tuple[float, float]


def _rise(span_mm: float, pitch_deg: float) -> float:
    return span_mm * math.tan(math.radians(pitch_deg))


def facade_outline(spec: HouseSpec) -> list[Point2]:
    """逆时针多边形，从左下角开始。"""
    width = spec.facade.width_mm
    if width is None:
        raise ValueError("Facade width is unknown")
    roof = spec.roof
    eave = roof.eave_height_mm
    rectangle = [(0, 0), (width, 0), (width, eave), (0, eave)]
    if roof.ridge == "parallel" or roof.type in ("hip", "flat"):
        return rectangle
    if roof.type == "gable":
        apex = (width / 2, eave + _rise(width / 2, roof.pitch_deg))
        return [(0, 0), (width, 0), (width, eave), apex, (0, eave)]
    # mono + perpendicular：左低右高
    return [(0, 0), (width, 0), (width, eave + _rise(width, roof.pitch_deg)), (0, eave)]


def roof_rise(spec: HouseSpec) -> float:
    """屋面最高点比檐口高出的距离。"""
    roof, width, depth = spec.roof, spec.facade.width_mm, spec.massing.depth_mm
    if width is None:
        raise ValueError("Facade width is unknown")
    if roof.type == "flat":
        return 0.0
    if roof.type == "hip":
        return _rise(min(width, depth) / 2, roof.pitch_deg)
    span = depth if roof.ridge == "parallel" else width
    if roof.type == "gable":
        return _rise(span / 2, roof.pitch_deg)
    return _rise(span, roof.pitch_deg)  # mono


def ridge_height(spec: HouseSpec) -> float:
    return spec.roof.eave_height_mm + roof_rise(spec)
