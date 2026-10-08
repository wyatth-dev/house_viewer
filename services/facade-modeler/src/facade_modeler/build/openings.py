"""洞口几何生成器：每种构件样式（generator）一个函数。

移植并拆分自 house-viewer：scripts/typology/prepare-sunningdale.py 的 add_opening_details()。
所有洞口共享：四周侧壁（reveal）、内退的玻璃/门板、外凸的白色外框；
各生成器再加自己的分格、横档、门板等细节。

局部坐标：x 沿立面向右，y 向上，原点在洞口中心；depth 为正表示凸出墙面，负表示退进。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import numpy as np

from facade_modeler.build.geometry import unit
from facade_modeler.build.materials import ENTRY, GLASS, REVEAL, TRIM
from facade_modeler.config import OpeningDefaults

BAR_DEPTH = -125  # 分格条所在深度
BAR_HALF = 25  # 分格条半宽


@dataclass(frozen=True)
class OpeningFrame:
    centre: np.ndarray
    u: np.ndarray
    v: np.ndarray
    out: np.ndarray
    width: float
    height: float
    grounded: bool  # 底边在地面（门）：不做窗台，侧框不向下延伸


@dataclass(frozen=True)
class Piece:
    material: str
    quad: np.ndarray  # 4×3
    facing: np.ndarray


class PieceBuilder:
    def __init__(self, frame: OpeningFrame):
        self.frame = frame
        self.pieces: list[Piece] = []

    def point(self, x: float, y: float, depth: float = 0.0) -> np.ndarray:
        f = self.frame
        return f.centre + f.u * x + f.v * y + f.out * depth

    def face(self, points, material: str, facing: np.ndarray) -> None:
        self.pieces.append(Piece(material, np.array(points), facing))

    def panel(self, x0, y0, x1, y1, depth, material) -> None:
        p = self.point
        self.face([p(x0, y0, depth), p(x1, y0, depth), p(x1, y1, depth), p(x0, y1, depth)], material, self.frame.out)


def _shell(b: PieceBuilder, back_material: str, d: OpeningDefaults) -> None:
    """侧壁 + 内退面板 + 外框。"""
    f = b.frame
    w, h = f.width, f.height
    corners = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    for k, (x, y) in enumerate(corners):
        a, c = corners[(k + 1) % 4]
        inward = -unit(f.u * (x + a) / 2 + f.v * (y + c) / 2)
        b.face([b.point(x, y), b.point(a, c), b.point(a, c, -d.reveal_depth_mm), b.point(x, y, -d.reveal_depth_mm)],
               REVEAL, inward)
    b.panel(-w / 2, -h / 2, w / 2, h / 2, -d.glass_inset_mm, back_material)
    t, proud = d.frame_width_mm, d.frame_proud_mm
    below = 0 if f.grounded else t
    b.panel(-w / 2 - t, -h / 2 - below, -w / 2, h / 2 + t, proud, TRIM)
    b.panel(w / 2, -h / 2 - below, w / 2 + t, h / 2 + t, proud, TRIM)
    b.panel(-w / 2, h / 2, w / 2, h / 2 + t, proud, TRIM)
    if not f.grounded:
        b.panel(-w / 2, -h / 2 - t, w / 2, -h / 2, proud, TRIM)


def _vertical_bars(b: PieceBuilder, count: int, half=BAR_HALF) -> None:
    w, h = b.frame.width, b.frame.height
    for k in range(1, count):
        x = -w / 2 + w * k / count
        b.panel(x - half, -h / 2, x + half, h / 2, BAR_DEPTH, TRIM)


def casement(b: PieceBuilder, params: dict, d: OpeningDefaults) -> None:
    w, h = b.frame.width, b.frame.height
    _shell(b, GLASS, d)
    panes = params.get("panes") or (1 if w <= 700 else 3 if w >= 1700 else 2)
    _vertical_bars(b, panes)
    if h >= 1000:  # 上方横档（亮子）
        b.panel(-w / 2, h / 2 - 450, w / 2, h / 2 - 415, BAR_DEPTH, TRIM)


def sash(b: PieceBuilder, params: dict, d: OpeningDefaults) -> None:
    w, h = b.frame.width, b.frame.height
    _shell(b, GLASS, d)
    b.panel(-w / 2, -30, w / 2, 30, BAR_DEPTH + 20, TRIM)  # 上下扇交接横框
    grid = params.get("grid") or 0
    for y0, y1 in ((-h / 2, -30), (30, h / 2)):
        for k in range(1, grid + 1):
            x = -w / 2 + w * k / (grid + 1)
            b.panel(x - 12, y0, x + 12, y1, BAR_DEPTH, TRIM)


def patio(b: PieceBuilder, params: dict, d: OpeningDefaults) -> None:
    _shell(b, GLASS, d)
    _vertical_bars(b, params.get("panels") or 2, half=35)


def door(b: PieceBuilder, params: dict, d: OpeningDefaults) -> None:
    w, h = b.frame.width, b.frame.height
    _shell(b, ENTRY, d)
    if params.get("glazed", True):
        b.panel(-w / 2 + 100, 50, w / 2 - 100, h / 2 - 100, -140, GLASS)


def garage(b: PieceBuilder, params: dict, d: OpeningDefaults) -> None:
    w, h = b.frame.width, b.frame.height
    _shell(b, TRIM, d)
    sections = params.get("sections") or 5
    for row in range(1, sections):
        y = -h / 2 + h * row / sections
        b.panel(-w / 2, y - 10, w / 2, y + 10, -145, REVEAL)


def vent(b: PieceBuilder, params: dict, d: OpeningDefaults) -> None:
    w, h = b.frame.width, b.frame.height
    _shell(b, TRIM, d)
    for y in np.arange(-h / 2, h / 2, 45):
        b.panel(-w / 2, y, w / 2, min(y + 20, h / 2), -120, TRIM)


GENERATORS: dict[str, Callable[[PieceBuilder, dict, OpeningDefaults], None]] = {
    "casement": casement, "sash": sash, "patio": patio, "door": door, "garage": garage, "vent": vent,
}


def opening_pieces(frame: OpeningFrame, generator: str, params: dict, defaults: OpeningDefaults) -> list[Piece]:
    builder = PieceBuilder(frame)
    GENERATORS[generator](builder, params, defaults)
    return builder.pieces
