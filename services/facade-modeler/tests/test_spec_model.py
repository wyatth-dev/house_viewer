"""HouseSpec 模型：默认值、JSON 往返、稳定 ID。"""
import json

from facade_modeler.config import load_defaults
from facade_modeler.spec.model import HouseSpec, Opening


def test_new_spec_defaults():
    spec = HouseSpec.new("house-001", load_defaults())
    assert spec.facade.width_mm is None
    assert spec.massing.depth_mm == 8000
    assert spec.roof.thickness_mm == 120
    assert spec.facade.segments[0].id == "main"


def test_json_roundtrip_uses_camel_case():
    spec = HouseSpec.new("house-001", load_defaults())
    spec.facade.width_mm = 11300
    text = spec.to_json()
    data = json.loads(text)
    assert data["facade"]["widthMm"] == 11300
    assert data["schemaVersion"] == 1
    assert HouseSpec.from_json(text) == spec


def test_ids_never_reused():
    spec = HouseSpec.new("house-001", load_defaults())
    first = spec.next_id("o")
    spec.facade.openings.append(
        Opening(id=first, asset="win/casement", u_mm=1000, sill_mm=900, width_mm=1200, height_mm=1200)
    )
    spec.facade.openings.clear()
    assert first == "o1"
    assert spec.next_id("o") == "o2"
