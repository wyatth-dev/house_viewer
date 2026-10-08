"""HouseSpec 的精简摘要，给 LM 与查看页阅读。"""
from __future__ import annotations

from facade_modeler.spec.model import HouseSpec


def width_state(spec: HouseSpec) -> dict:
    entry = spec.provenance.get("facade.widthMm")
    return {"widthMm": spec.facade.width_mm, "source": entry.source if entry else None,
            "skipped": spec.width_skipped}


def spec_summary(spec: HouseSpec) -> dict:
    data = spec.model_dump(by_alias=True, include={"facade", "roof", "massing"})
    data["measurements"] = {mid: {"photo": m.photo, "normalized": m.normalized}
                            for mid, m in spec.measurements.items()}
    return data
