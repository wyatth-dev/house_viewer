"""导出 house-viewer typology 契约文件：scene.json 与 annotations.json。

坐标规则见 build/frame.py。side 为 "front"（建模坐标，builds/vN）时立面在 z = 0 朝 +Z；
发布时 side 取 spec.facade.side，"back" 表示立面是后立面：在 z = −进深 朝 −Z，安装墙段也标为 back。
"""
from __future__ import annotations

import numpy as np

from facade_modeler.build.frame import to_side
from facade_modeler.build.outline import roof_rise
from facade_modeler.config import Defaults
from facade_modeler.spec.model import HouseSpec

WALL_FACE_ID = "facade-main"
MODEL_FILES = {"white": "model.glb", "color-block": "color-block/model.glb", "render": "render/model.glb"}


def _number(value: float):
    """整数毫米输出为 int，便于阅读与比较。"""
    return int(value) if float(value).is_integer() else round(value, 1)


def scene_json(spec: HouseSpec, side: str = "front") -> dict:
    width, depth = _number(spec.facade.width_mm), _number(spec.massing.depth_mm)
    back = side == "back"
    return {
        "schemaVersion": 1,
        "id": spec.id,
        "name": spec.id,
        "model": MODEL_FILES["white"],
        "units": "mm",
        "axes": {"up": "+Y", "front": "+Z"},
        "preview": {"mode": "generated"},
        "calibration": {
            "actualWidthMm": width,
            "sourceFootprint": {"minX": -width, "maxX": 0, "minZ": -depth, "maxZ": 0},
            "groundY": 0,
            "yawDegrees": 0,
        },
        "installationFaces": [{
            "wallFaceId": WALL_FACE_ID,
            "side": side,
            "originMm": {"x": -width, "y": 0, "z": -depth if back else 0},  # 与内置 typology 相同：起点在 x 最小端
            "lengthMm": width,
            "alongWallUnit": {"x": 1, "z": 0},
            "outwardUnit": {"x": 0, "z": -1 if back else 1},
        }],
        "representations": {mode: {"model": path} for mode, path in MODEL_FILES.items()},
    }


def annotations(spec: HouseSpec, defaults: Defaults, side: str = "front") -> list[dict]:
    """查看页的尺寸标注（世界坐标，毫米）。group：overall 总尺寸 / opening 洞口尺寸。"""
    items = _annotations(spec, defaults)
    if side == "front":
        return items
    width, depth = spec.facade.width_mm, spec.massing.depth_mm
    for item in items:
        for key in ("start", "end"):
            p = item[key]
            x, y, z = to_side(np.array([p["x"], p["y"], p["z"]]), width, depth, side)
            item[key] = {"x": _number(float(x)), "y": _number(float(y)), "z": _number(float(z))}
    return items


def _annotations(spec: HouseSpec, defaults: Defaults) -> list[dict]:
    width, eave = spec.facade.width_mm, spec.roof.eave_height_mm
    off = defaults.annotation_offset_mm
    items = [
        _line("width", "Facade width", (-width, 0, off), (0, 0, off), width, "overall"),
        _line("eave", "Eave height", (-width - off, 0, 0), (-width - off, eave, 0), eave, "overall"),
    ]
    rise = roof_rise(spec)
    if rise > 0:
        top = eave + rise
        items.append(_line("ridge", "Ridge height", (off, 0, 0), (off, top, 0), top, "overall"))
    for o in spec.facade.openings:
        left, right = o.u_mm - o.width_mm / 2 - width, o.u_mm + o.width_mm / 2 - width
        top = o.sill_mm + o.height_mm
        y = top + 150  # 宽度线画在洞口上方
        items.append(_line(f"{o.id}-width", f"{o.id} width", (left, y, 60), (right, y, 60), o.width_mm, "opening"))
        items.append(_line(f"{o.id}-height", f"{o.id} height", (right + 150, o.sill_mm, 60), (right + 150, top, 60),
                           o.height_mm, "opening"))
    return items


def _line(item_id, label, start, end, value, group) -> dict:
    point = lambda p: {"x": _number(p[0]), "y": _number(p[1]), "z": _number(p[2])}  # noqa: E731
    return {"id": item_id, "label": label, "start": point(start), "end": point(end),
            "valueMm": _number(value), "group": group}
