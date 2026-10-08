"""HouseSpec 校验：返回问题清单（Issue），由 LM 据此修正。

参数非法由 service 层直接拒绝；这里只报告"写进去了但不合理"的问题。
"""
from __future__ import annotations

from dataclasses import dataclass, field

from facade_modeler.assets.catalog import Catalog
from facade_modeler.build.outline import facade_outline
from facade_modeler.spec.model import HouseSpec, Opening

GROUNDED_GENERATORS = {"door", "patio", "garage"}
TOLERANCE_MM = 1.0


@dataclass
class Issue:
    code: str
    message: str
    ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"code": self.code, "message": self.message, "ids": self.ids}


def validate(spec: HouseSpec, catalog: Catalog) -> list[Issue]:
    issues = _asset_issues(spec, catalog)
    if spec.facade.width_mm is None:
        return [Issue("width_missing", "Facade width is unknown: the user skipped it. Call estimate_width first.")] + issues
    return _geometry_issues(spec, catalog) + issues


def _asset_issues(spec: HouseSpec, catalog: Catalog) -> list[Issue]:
    issues = []
    slots = dict(spec.facade.materials, roof=spec.roof.material)
    for name, slot in slots.items():
        if catalog.material(slot.asset) is None:
            issues.append(Issue("unknown_asset", f"Material {slot.asset} ({name}) is not in the asset library", [name]))
    for opening in spec.facade.openings:
        if catalog.component(opening.asset) is None:
            issues.append(Issue("unknown_asset", f"Component {opening.asset} is not in the asset library", [opening.id]))
        elif errors := catalog.param_errors(opening.asset, opening.params):
            issues.append(Issue("invalid_param", f"{opening.id}: " + "；".join(errors), [opening.id]))
    return issues


def _geometry_issues(spec: HouseSpec, catalog: Catalog) -> list[Issue]:
    outline = facade_outline(spec)
    openings = spec.facade.openings
    issues = []
    for opening in openings:
        if not all(_inside(point, outline) for point in _corners(opening)):
            issues.append(Issue("opening_outside_wall", f"{opening.id} extends outside the wall outline", [opening.id]))
        component = catalog.component(opening.asset)
        if component and component.generator in GROUNDED_GENERATORS and opening.sill_mm > TOLERANCE_MM:
            issues.append(Issue("door_not_grounded", f"{opening.id} is a door; its bottom should be at ground level (sill=0)", [opening.id]))
    for i, a in enumerate(openings):
        for b in openings[i + 1:]:
            if _overlap(a, b):
                issues.append(Issue("opening_overlap", f"{a.id} overlaps {b.id}", [a.id, b.id]))
    return issues


def _corners(o: Opening) -> list[tuple[float, float]]:
    left, right = o.u_mm - o.width_mm / 2, o.u_mm + o.width_mm / 2
    bottom, top = o.sill_mm, o.sill_mm + o.height_mm
    return [(left, bottom), (right, bottom), (right, top), (left, top)]


def _overlap(a: Opening, b: Opening) -> bool:
    du = min(a.u_mm + a.width_mm / 2, b.u_mm + b.width_mm / 2) - max(a.u_mm - a.width_mm / 2, b.u_mm - b.width_mm / 2)
    dv = min(a.sill_mm + a.height_mm, b.sill_mm + b.height_mm) - max(a.sill_mm, b.sill_mm)
    return du > TOLERANCE_MM and dv > TOLERANCE_MM


def _inside(point: tuple[float, float], polygon: list[tuple[float, float]]) -> bool:
    """凸多边形（逆时针）包含测试，边界上算在内（容差 1 mm）。"""
    x, y = point
    for (x0, y0), (x1, y1) in zip(polygon, polygon[1:] + polygon[:1]):
        edge = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
        cross = (x1 - x0) * (y - y0) - (y1 - y0) * (x - x0)
        if cross < -TOLERANCE_MM * edge:
            return False
    return True
