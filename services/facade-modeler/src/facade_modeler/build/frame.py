"""立面坐标 → 世界坐标（世界坐标只在 build/导出中出现）。

建模坐标（spec 9.2，builds/vN 使用）：立面朝 +Z，位于 z = 0；宽度沿 X，x ∈ [−宽度, 0]；
立面后方深度 d 对应 z = −d；+Y 向上，单位毫米。LM 自查和照片录入页都用这个坐标。

发布坐标（data/typologies 使用）：house-viewer 约定房屋正面朝 +Z。立面是后立面（facade.side = "back"）时，
发布前把整个模型绕体块中心转 180°：立面移到 z = −d、朝 −Z，体块范围不变。见 to_side()。
"""
from __future__ import annotations

import numpy as np

FACADE_OUTWARD = np.array([0.0, 0.0, 1.0])


def to_world(u: float, v: float, depth: float, width: float) -> np.ndarray:
    return np.array([u - width, v, -depth], dtype=float)


def to_side(points: np.ndarray, width: float, depth: float, side: str) -> np.ndarray:
    """建模坐标 → 发布坐标。points 的最后一维是 xyz。back：绕体块中心（−w/2, −d/2）转 180°。"""
    if side == "front":
        return points
    moved = np.array(points, dtype=float, copy=True)
    moved[..., 0] = -moved[..., 0] - width
    moved[..., 2] = -moved[..., 2] - depth
    return moved


def turn_to_side(vectors: np.ndarray, side: str) -> np.ndarray:
    """方向向量（法线）随 to_side 一起旋转。"""
    if side == "front":
        return vectors
    turned = np.array(vectors, dtype=float, copy=True)
    turned[..., 0] *= -1
    turned[..., 2] *= -1
    return turned
