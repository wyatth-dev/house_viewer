"""多边形工具：三角化、按平面切分、扇形拆分、开洞。

移植自 house-viewer：scripts/typology/sunningdale_baseline.py（triangulate、polygon_normal）
与 scripts/typology/prepare-sunningdale.py（unit、oriented、split、fan、cut_openings）。
移植时展开了压缩写法；开洞改为在立面二维坐标中进行。
"""
from __future__ import annotations

from typing import Iterator, Sequence

import numpy as np

EPS = 1e-7


def unit(vector) -> np.ndarray:
    vector = np.asarray(vector, dtype=float)
    return vector / max(np.linalg.norm(vector), 1e-12)


def oriented(triangle: np.ndarray, outward: np.ndarray) -> np.ndarray:
    """让三角形法线朝向 outward（必要时翻转顶点顺序）。"""
    normal = np.cross(triangle[1] - triangle[0], triangle[2] - triangle[0])
    return triangle[::-1].copy() if normal @ outward < 0 else triangle


def polygon_normal(points: Sequence) -> np.ndarray:
    p = np.asarray(points, dtype=float)
    normal = np.zeros(3)
    for i in range(len(p)):
        normal += np.cross(p[i], p[(i + 1) % len(p)])
    return normal / np.linalg.norm(normal)


def triangulate(points: Sequence, normal: Sequence[float]) -> list[np.ndarray]:
    """耳切法三角化平面简单多边形；三角形绕 normal 逆时针。"""
    p = [np.asarray(q, dtype=float) for q in points]
    n = np.asarray(normal, dtype=float)
    axis = np.array([1.0, 0, 0]) if abs(n[0]) < 0.9 else np.array([0.0, 1, 0])
    u = unit(np.cross(n, axis))
    v = np.cross(n, u)
    flat = [np.array([q @ u, q @ v]) for q in p]  # 投影到多边形所在平面
    area = sum(_cross2(flat[i], flat[(i + 1) % len(flat)]) for i in range(len(flat)))
    remaining = list(range(len(p)))
    if area < 0:
        remaining.reverse()
    triangles = []
    for _ in range(10000):
        if len(remaining) <= 3:
            break
        for k in range(len(remaining)):
            i0, i1, i2 = remaining[k - 1], remaining[k], remaining[(k + 1) % len(remaining)]
            if _turn(flat[i0], flat[i1], flat[i2]) <= 1e-9:
                continue  # 凹角，不是耳朵
            if any(_inside_triangle(flat[j], flat[i0], flat[i1], flat[i2])
                   for j in remaining if j not in (i0, i1, i2) and not _coincides(flat[j], flat, (i0, i1, i2))):
                continue
            triangles.append(np.array([p[i0], p[i1], p[i2]]))
            remaining.pop(k)
            break
        else:
            raise ValueError("Triangulation failed: the polygon may self-intersect")
    triangles.append(np.array([p[i] for i in remaining]))
    return triangles


def split(polygon: list[np.ndarray], axis: np.ndarray, value: float) -> list[list[np.ndarray]]:
    """用平面 p·axis == value 把凸多边形切成两半，返回非空的部分。"""
    parts = []
    for keep_above in (False, True):
        out = []
        for k, p in enumerate(polygon):
            q = polygon[(k + 1) % len(polygon)]
            a, b = p @ axis - value, q @ axis - value
            inside = a >= -EPS if keep_above else a <= EPS
            other = b >= -EPS if keep_above else b <= EPS
            if inside:
                out.append(p)
            if inside != other and abs(a - b) > 1e-9:
                out.append(p + (q - p) * (a / (a - b)))
        if len(out) >= 3:
            parts.append(out)
    return parts


def fan(polygon: list[np.ndarray]) -> Iterator[np.ndarray]:
    """凸多边形 → 三角形（跳过退化三角形）。"""
    for k in range(1, len(polygon) - 1):
        triangle = np.array([polygon[0], polygon[k], polygon[k + 1]])
        if np.linalg.norm(np.cross(triangle[1] - triangle[0], triangle[2] - triangle[0])) > 1e-5:
            yield triangle


def split_at_heights(triangles: list[np.ndarray], heights: Sequence[float], axis: np.ndarray) -> list[np.ndarray]:
    for level in heights:
        triangles = [t for tri in triangles for part in split(list(tri), axis, level) for t in fan(part)]
    return triangles


def cut_rectangles(triangle: np.ndarray, rects: Sequence[tuple[float, float, float, float]]) -> Iterator[np.ndarray]:
    """从三角形（二维点，z 可为 0）中挖掉矩形 (u0, v0, u1, v1)。"""
    pieces = [list(triangle)]
    ex, ey = np.zeros(len(triangle[0])), np.zeros(len(triangle[0]))
    ex[0], ey[1] = 1.0, 1.0
    for u0, v0, u1, v1 in rects:
        xs, ys = triangle[:, 0], triangle[:, 1]
        if xs.max() <= u0 or xs.min() >= u1 or ys.max() <= v0 or ys.min() >= v1:
            continue
        for axis, value in ((ex, u0), (ex, u1), (ey, v0), (ey, v1)):
            pieces = [part for piece in pieces for part in split(piece, axis, value)]
        pieces = [piece for piece in pieces if not _centre_in_rect(piece, (u0, v0, u1, v1))]
    for piece in pieces:
        yield from fan(piece)


def _centre_in_rect(piece, rect) -> bool:
    centre = np.mean(piece, axis=0)
    u0, v0, u1, v1 = rect
    return u0 + 1e-5 < centre[0] < u1 - 1e-5 and v0 + 1e-5 < centre[1] < v1 - 1e-5


def _cross2(a, b) -> float:
    return float(a[0] * b[1] - a[1] * b[0])


def _turn(o, a, b) -> float:
    return _cross2(a - o, b - o)


def _inside_triangle(point, a, b, c) -> bool:
    return _turn(a, b, point) >= -1e-9 and _turn(b, c, point) >= -1e-9 and _turn(c, a, point) >= -1e-9


def _coincides(point, flat, indices) -> bool:
    return any(np.allclose(point, flat[i]) for i in indices)
