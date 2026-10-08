"""照片矫正：把斜拍的立面变成正视图。

输入立面墙体四角（左下、右下、右上、左上，取檐口高度）在照片中的像素位置。
难点是矩形的"高 / 宽"比：透视下无法直接从图上量出。按以下优先级确定：

1. perspective：用 Zhang & He 的白板矫正方法，由四边形的透视关系求高宽比。
   焦距取 EXIF；没有时由四边形本身估计（要求透视足够明显）。
2. affine：四边形接近平行四边形（基本正对拍摄）时，直接用图上的边长比。
3. reference：LM 额外给出一个已知尺寸的参照物（四角像素 + 实际宽高），
   先按 1/2 矫正，再用参照物把竖向比例校准到真实值。

输出的矫正图以立面宽度为基准排版：左右各留 10%，下方 5%，上方 60%（用于看屋顶）。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional, Sequence

import cv2
import numpy as np

Point = tuple[float, float]
MARGIN_SIDE, MARGIN_BOTTOM, MARGIN_TOP = 0.10, 0.05, 0.60  # 以立面宽度为单位
TYPICAL_FOCAL = 0.8  # 典型手机主摄的焦距 ≈ 0.8 × 长边像素（约 26–28 mm 等效）
PARALLEL_TOLERANCE_DEG = 1.0


class RectifyError(ValueError):
    """角点不合法（共线、交叉、顺序错误）或无法求解。"""


@dataclass(frozen=True)
class VerticalRef:
    corners_px: Sequence[Point]  # 参照物四角（原图像素，左下、右下、右上、左上）
    width_mm: float
    height_mm: float


@dataclass
class RectifyResult:
    image: np.ndarray
    homography: np.ndarray  # 原图像素 → 矫正图像素
    aspect: float  # 立面墙体矩形的 高 / 宽
    method: Literal["perspective", "affine", "reference"]
    origin_px: Point  # 立面左下角在矫正图中的像素位置
    px_per_width: float  # 立面宽度对应的像素数
    note: str = ""  # 精度提示，例如焦距是假设的

    @property
    def size(self) -> tuple[int, int]:
        return self.image.shape[1], self.image.shape[0]


def rectify(image: np.ndarray, corners_px: Sequence[Point], focal_px: Optional[float] = None,
            vertical_ref: Optional[VerticalRef] = None, out_width: int = 2000) -> RectifyResult:
    corners = _check_quad(corners_px)
    center = np.array([image.shape[1] / 2, image.shape[0] / 2])
    aspect, method, note = estimate_aspect(corners, center, focal_px, max(image.shape[:2]))
    if vertical_ref is not None:
        aspect = _calibrate_with_reference(corners, aspect, vertical_ref)
        method, note = "reference", ""
    px_per_width = out_width / (1 + 2 * MARGIN_SIDE)
    origin = (MARGIN_SIDE * px_per_width, (MARGIN_TOP + aspect) * px_per_width)
    out_height = int(round((MARGIN_TOP + aspect + MARGIN_BOTTOM) * px_per_width))
    homography = _homography(corners, aspect, origin, px_per_width)
    warped = cv2.warpPerspective(image, homography, (out_width, out_height), borderValue=(255, 255, 255))
    return RectifyResult(warped, homography, aspect, method, origin, px_per_width, note)


def estimate_aspect(corners: np.ndarray, center: np.ndarray, focal_px: Optional[float],
                    long_side_px: float) -> tuple[float, str, str]:
    """返回 (高/宽, 方法, 提示)。corners 顺序：左下、右下、右上、左上。"""
    if _is_parallelogram(corners):
        return _affine_aspect(corners), "affine", ""
    # 白板方法的点序：m1=(0,0) m2=(w,0) m3=(0,h) m4=(w,h)
    m1, m2, m4, m3 = (np.append(p - center, 1.0) for p in corners)
    k2 = np.dot(np.cross(m1, m4), m3) / np.dot(np.cross(m2, m4), m3)
    k3 = np.dot(np.cross(m1, m4), m2) / np.dot(np.cross(m3, m4), m2)
    n2, n3 = k2 * m2 - m1, k3 * m3 - m1
    note = ""
    if focal_px is None:
        # 某一组边平行时，对应消失点在无穷远（n 的 z 分量 ≈ 0），焦距无解，算出来的数只是数值噪声
        at_infinity = min(abs(n2[2]) / np.linalg.norm(n2), abs(n3[2]) / np.linalg.norm(n3)) < 1e-4
        with np.errstate(divide="ignore", invalid="ignore"):
            focal_sq = -(n2[0] * n3[0] + n2[1] * n3[1]) / (n2[2] * n3[2])
        plausible = 0.3 * long_side_px, 5.0 * long_side_px  # 手机到长焦的合理焦距范围
        if at_infinity or not np.isfinite(focal_sq) or not plausible[0] ** 2 <= focal_sq <= plausible[1] ** 2:
            # 只有一组边汇聚（例如相机水平拍摄）时无法从图上求焦距：按典型手机焦距估计（review I-8）
            focal_sq = (TYPICAL_FOCAL * long_side_px) ** 2
            note = "The photo has no focal length, so the aspect ratio assumes a typical phone lens; if the overlay is off vertically, calibrate with vertical_ref"
    else:
        focal_sq = focal_px ** 2
    width = np.sqrt((n2[0] ** 2 + n2[1] ** 2) / focal_sq + n2[2] ** 2)
    height = np.sqrt((n3[0] ** 2 + n3[1] ** 2) / focal_sq + n3[2] ** 2)
    return float(height / width), "perspective", note


def _calibrate_with_reference(corners: np.ndarray, aspect: float, ref: VerticalRef) -> float:
    """按当前 aspect 矫正参照物，比较量到的高宽比与真实值，按比例修正竖向。"""
    ref_corners = _check_quad(ref.corners_px)
    homography = _homography(corners, aspect, (0.0, aspect), 1.0)
    mapped = cv2.perspectiveTransform(ref_corners.reshape(-1, 1, 2), homography).reshape(-1, 2)
    measured_w = (np.linalg.norm(mapped[1] - mapped[0]) + np.linalg.norm(mapped[2] - mapped[3])) / 2
    measured_h = (np.linalg.norm(mapped[3] - mapped[0]) + np.linalg.norm(mapped[2] - mapped[1])) / 2
    return aspect * (ref.height_mm / ref.width_mm) / (measured_h / measured_w)


def _homography(corners: np.ndarray, aspect: float, origin: Point, px_per_width: float) -> np.ndarray:
    ox, oy = origin
    w, h = px_per_width, aspect * px_per_width
    target = np.float32([(ox, oy), (ox + w, oy), (ox + w, oy - h), (ox, oy - h)])
    return cv2.getPerspectiveTransform(np.float32(corners), target)


def _affine_aspect(corners: np.ndarray) -> float:
    bl, br, tr, tl = corners
    width = (np.linalg.norm(br - bl) + np.linalg.norm(tr - tl)) / 2
    height = (np.linalg.norm(tl - bl) + np.linalg.norm(tr - br)) / 2
    return float(height / width)


def _is_parallelogram(corners: np.ndarray) -> bool:
    bl, br, tr, tl = corners
    return (_angle_between(br - bl, tr - tl) < PARALLEL_TOLERANCE_DEG
            and _angle_between(tl - bl, tr - br) < PARALLEL_TOLERANCE_DEG)


def _cross2(a: np.ndarray, b: np.ndarray) -> float:
    return float(a[0] * b[1] - a[1] * b[0])


def _angle_between(a: np.ndarray, b: np.ndarray) -> float:
    cos = np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))
    return float(np.degrees(np.arccos(np.clip(cos, -1.0, 1.0))))


def _check_quad(points: Sequence[Point]) -> np.ndarray:
    """四点必须构成不自交的凸四边形，且不能有三点共线。"""
    quad = np.asarray(points, dtype=float)
    if quad.shape != (4, 2) or not np.all(np.isfinite(quad)):
        raise RectifyError("Four corners are required: bottom-left, bottom-right, top-right, top-left")
    crosses = []
    for i in range(4):
        a, b, c = quad[i], quad[(i + 1) % 4], quad[(i + 2) % 4]
        crosses.append(_cross2(b - a, c - b))
    scale = max(np.ptp(quad[:, 0]), np.ptp(quad[:, 1])) ** 2
    if any(abs(c) < 1e-3 * scale for c in crosses):
        raise RectifyError("Three of the corners are collinear; please mark them again")
    if not (all(c > 0 for c in crosses) or all(c < 0 for c in crosses)):
        raise RectifyError("The corners cross or the quadrilateral is not convex; the order is bottom-left, bottom-right, top-right, top-left")
    bl, br, tr, tl = quad
    if (bl[1] + br[1]) / 2 <= (tl[1] + tr[1]) / 2:
        raise RectifyError("The bottom edge must be below the top edge; the order is bottom-left, bottom-right, top-right, top-left")
    # 图像坐标 y 向下：左下→右下→右上→左上 的转向（叉积）为负。为正说明左右对调，立面会被镜像。
    if crosses[0] > 0 or br[0] <= bl[0] or tr[0] <= tl[0]:
        raise RectifyError("Left and right corners are swapped; the order is bottom-left, bottom-right, top-right, top-left (as seen in the photo)")
    return quad
