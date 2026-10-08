"""合成"立面照片"：已知尺寸的立面，用已知相机斜着拍，便于检验矫正精度。"""
import math

import cv2
import numpy as np


def facade_texture(width_mm: float, height_mm: float, px_per_m: int = 100) -> np.ndarray:
    """浅色墙面 + 每米一条深色网格线，立面四周留白。"""
    w, h = int(width_mm / 1000 * px_per_m), int(height_mm / 1000 * px_per_m)
    image = np.full((h, w, 3), 210, dtype=np.uint8)
    for x in range(0, w, px_per_m):
        image[:, x:x + 3] = 60
    for y in range(0, h, px_per_m):
        image[y:y + 3, :] = 60
    image[:, -3:] = 60
    image[-3:, :] = 60
    return image


def project_facade(width_mm, height_mm, yaw_deg=30.0, pitch_deg=5.0, focal_px=1400.0,
                   image_size=(1600, 1200), distance_mm=None):
    """返回立面四角在照片中的像素位置（左下、右下、右上、左上）。"""
    distance_mm = distance_mm or width_mm * 1.6
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    cx, cy = image_size[0] / 2, image_size[1] / 2
    corners_world = [(-width_mm / 2, 0), (width_mm / 2, 0), (width_mm / 2, height_mm), (-width_mm / 2, height_mm)]
    camera_height = height_mm / 2
    result = []
    for x, y in corners_world:
        # 立面绕竖直轴旋转 yaw，相机在 z = -distance 处，再整体俯仰 pitch。
        px, py, pz = x * math.cos(yaw), y - camera_height, distance_mm + x * math.sin(yaw)
        py, pz = py * math.cos(pitch) - pz * math.sin(pitch), py * math.sin(pitch) + pz * math.cos(pitch)
        result.append((cx + focal_px * px / pz, cy - focal_px * py / pz))
    return result


def synthetic_photo(width_mm=8000.0, height_mm=4000.0, **camera):
    """合成照片和四角像素。"""
    image_size = camera.get("image_size", (1600, 1200))
    texture = facade_texture(width_mm, height_mm)
    th, tw = texture.shape[:2]
    corners = project_facade(width_mm, height_mm, **camera)
    source = np.float32([(0, th), (tw, th), (tw, 0), (0, 0)])
    matrix = cv2.getPerspectiveTransform(source, np.float32(corners))
    photo = cv2.warpPerspective(texture, matrix, image_size, borderValue=(150, 170, 190))
    return photo, corners
