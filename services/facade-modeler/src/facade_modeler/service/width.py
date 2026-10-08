"""宽度变更：写入宽度与来源，并按测量重算引用了测量的洞口（spec 5.2）。"""
from __future__ import annotations

from facade_modeler.spec.model import HouseSpec, Opening, ProvenanceEntry
from facade_modeler.spec.validate import Issue


def apply_width(spec: HouseSpec, width_mm: float, source: str, note: str | None = None) -> list[Issue]:
    spec.facade.width_mm = width_mm
    spec.provenance = {**spec.provenance, "facade.widthMm": ProvenanceEntry(source=source, note=note)}
    updated = set(refresh_from_measurements(spec))
    return [Issue("opening_not_rescaled", f"{o.id} has no measurement, so it was not rescaled with the new width", [o.id])
            for o in spec.facade.openings if o.id not in updated]


def box_to_opening(opening: Opening, box: dict[str, float], width_mm: float) -> None:
    """由测量框换算洞口尺寸，再套用 LM 手动改过的字段（review I-6）。"""
    opening.u_mm = (box["u0"] + box["u1"]) / 2 * width_mm
    opening.sill_mm = max(0.0, box["v0"] * width_mm)
    opening.width_mm = (box["u1"] - box["u0"]) * width_mm
    opening.height_mm = (box["v1"] - box["v0"]) * width_mm
    for name, value in ((opening.evidence or {}).get("overrides") or {}).items():
        setattr(opening, name, value)


def refresh_from_measurements(spec: HouseSpec, photo_id: str | None = None) -> list[str]:
    """按当前宽度重算引用测量的洞口；photo_id 给出时只处理该照片上的测量。返回更新过的洞口 ID。"""
    if spec.facade.width_mm is None:
        return []
    updated = []
    for opening in spec.facade.openings:
        measurement = spec.measurements.get((opening.evidence or {}).get("measurement", ""))
        if measurement and (photo_id is None or measurement.photo == photo_id):
            box_to_opening(opening, measurement.normalized, spec.facade.width_mm)
            updated.append(opening.id)
    return updated
