"""体块：由 HouseSpec 推导四面墙与屋面（世界坐标）。

屋面用"平面图 (u, d) 上的高度函数"描述：u 沿立面宽度，d 为离立面的深度。
每种屋顶拆成若干平面，每块平面给出：
  white   不带出檐的轮廓（白模用）
  eaves   外边缘向外挑出 overhang 的轮廓（color-block / render 用）
  exposed 需要生成封檐板的边（位于房屋外边缘的边）
墙顶轮廓沿墙边采样屋面高度，因此山墙、单坡高侧墙会自动得到正确形状。
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable

import numpy as np

from facade_modeler.build.frame import to_world
from facade_modeler.config import Defaults
from facade_modeler.spec.model import HouseSpec

Height = Callable[[float, float], float]  # (u, d) → 高度


@dataclass
class WallPoly:
    name: str
    outward: tuple[float, float, float]
    points: list[np.ndarray]


@dataclass
class RoofPlane:
    name: str
    white: list[np.ndarray]
    eaves: list[np.ndarray]
    exposed: list[int]  # eaves 中需要封檐板的边：第 i 条边连接点 i 与点 i+1
    flat: bool = False


@dataclass
class Massing3D:
    walls: list[WallPoly]
    roofs: list[RoofPlane]


def build_massing(spec: HouseSpec, defaults: Defaults) -> Massing3D:
    width, depth = spec.facade.width_mm, spec.massing.depth_mm
    if width is None:
        raise ValueError("Facade width is unknown")
    planes = _roof_planes(spec, width, depth)
    height = _surface(planes)
    walls = _walls(width, depth, height)
    roofs = [_roof_plane(f"Roof_{i + 1}", polygon, h, width, depth, spec.roof.overhang_mm, spec.roof.type == "flat")
             for i, (polygon, h) in enumerate(planes)]
    return Massing3D(walls, roofs)


# ---- 屋面平面 ---------------------------------------------------------------------
def _roof_planes(spec: HouseSpec, w: float, d: float) -> list[tuple[list[tuple[float, float]], Height]]:
    roof = spec.roof
    eave, slope = roof.eave_height_mm, math.tan(math.radians(roof.pitch_deg))
    whole = [(0, 0), (w, 0), (w, d), (0, d)]
    if roof.type == "flat":
        return [(whole, lambda u, z: eave)]
    if roof.type == "mono":
        if roof.ridge == "parallel":
            return [(whole, lambda u, z: eave + slope * z)]  # 立面一侧低，后墙高
        return [(whole, lambda u, z: eave + slope * u)]  # 左低右高
    if roof.type == "gable":
        if roof.ridge == "parallel":
            return [([(0, 0), (w, 0), (w, d / 2), (0, d / 2)], lambda u, z: eave + slope * z),
                    ([(0, d / 2), (w, d / 2), (w, d), (0, d)], lambda u, z: eave + slope * (d - z))]
        return [([(0, 0), (w / 2, 0), (w / 2, d), (0, d)], lambda u, z: eave + slope * u),
                ([(w / 2, 0), (w, 0), (w, d), (w / 2, d)], lambda u, z: eave + slope * (w - u))]
    return _hip_planes(w, d, eave, slope)


def _hip_planes(w: float, d: float, eave: float, slope: float):
    """四坡：屋脊沿较长的一边；四个坡度相同。"""
    r = min(w, d) / 2
    front = lambda u, z: eave + slope * z  # noqa: E731
    back = lambda u, z: eave + slope * (d - z)  # noqa: E731
    left = lambda u, z: eave + slope * u  # noqa: E731
    right = lambda u, z: eave + slope * (w - u)  # noqa: E731
    if w >= d:
        a, b = (r, r), (w - r, r)
        return [([(0, 0), (w, 0), b, a], front), ([(w, d), (0, d), a, b], back),
                ([(0, d), (0, 0), a], left), ([(w, 0), (w, d), b], right)]
    a, b = (r, r), (r, d - r)
    return [([(0, 0), (w, 0), a], front), ([(w, d), (0, d), b], back),
            ([(0, d), (0, 0), a, b], left), ([(w, 0), (w, d), b, a], right)]


def _surface(planes) -> Height:
    """整个屋面的高度 = 各平面高度的最小值（对凸屋面成立）。"""
    return lambda u, z: min(h(u, z) for _, h in planes)


# ---- 墙 ---------------------------------------------------------------------------
def _walls(w: float, d: float, height: Height) -> list[WallPoly]:
    def profile(start, end, steps=(0.0, 0.5, 1.0)):
        """沿墙顶采样屋面高度；0.5 处是山墙尖（若有）。"""
        tops = []
        for t in steps:
            u, z = start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t
            tops.append((u, z, height(u, z)))
        return tops

    def wall(name, outward, start, end):
        tops = profile(start, end)
        points = [to_world(start[0], 0, start[1], w), to_world(end[0], 0, end[1], w)]
        points += [to_world(u, h, z, w) for u, z, h in reversed(tops)]
        return WallPoly(name, outward, _drop_collinear(points))

    return [
        wall("Facade", (0, 0, 1), (0, 0), (w, 0)),
        wall("Side_Right", (1, 0, 0), (w, 0), (w, d)),
        wall("Rear", (0, 0, -1), (w, d), (0, d)),
        wall("Side_Left", (-1, 0, 0), (0, d), (0, 0)),
    ]


def _drop_collinear(points: list[np.ndarray]) -> list[np.ndarray]:
    result = []
    for i, p in enumerate(points):
        prev, nxt = points[i - 1], points[(i + 1) % len(points)]
        if np.linalg.norm(np.cross(p - prev, nxt - p)) > 1e-6 * max(1.0, np.linalg.norm(nxt - prev)) ** 2:
            result.append(p)
    return result


# ---- 出檐 -------------------------------------------------------------------------
def _roof_plane(name, polygon, height: Height, w, d, overhang, flat) -> RoofPlane:
    def on(value, edge):
        return abs(value - edge) < 1e-6

    def push(u, z):
        """位于外边缘上的顶点向外挑出 overhang；内部顶点（屋脊、斜脊）不动。"""
        du = -overhang if on(u, 0) else overhang if on(u, w) else 0.0
        dz = -overhang if on(z, 0) else overhang if on(z, d) else 0.0
        return u + du, z + dz

    def sides(u, z):
        return {s for s, hit in (("u0", on(u, 0)), ("uw", on(u, w)), ("z0", on(z, 0)), ("zd", on(z, d))) if hit}

    white = [to_world(u, height(u, z), z, w) for u, z in polygon]
    eaves = [to_world(pu, height(pu, pz), pz, w) for pu, pz in (push(u, z) for u, z in polygon)]
    exposed = [i for i, (a, b) in enumerate(zip(polygon, polygon[1:] + polygon[:1])) if sides(*a) & sides(*b)]
    return RoofPlane(name, white, eaves, exposed, flat)
