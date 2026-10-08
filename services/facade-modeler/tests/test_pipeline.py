"""构建流程：产物目录与 house-viewer typology 同构。"""
import json

import pytest

from facade_modeler.assets.catalog import Catalog
from facade_modeler.build.pipeline import run_build
from facade_modeler.build.typology import annotations, scene_json
from facade_modeler.build.verify import verify_build
from facade_modeler.config import load_defaults
from facade_modeler.project.store import ProjectStore
from helpers import sunningdale_spec

CATALOG, DEFAULTS = Catalog.load(), load_defaults()


@pytest.fixture
def project(tmp_path):
    project = ProjectStore(tmp_path).create()
    spec = sunningdale_spec()
    spec.id = project.id
    project.save_spec(spec)
    return project


def test_build_writes_typology_layout(project):
    result = run_build(project, CATALOG, DEFAULTS)
    assert result.version == 1 and result.issues == []
    for name in ("model.glb", "color-block/model.glb", "render/model.glb", "scene.json", "annotations.json",
                 "spec.json"):
        assert (result.dir / name).is_file(), name
    assert project.latest_build() == 1


def test_scene_json_contract():
    scene = scene_json(sunningdale_spec())
    assert scene["units"] == "mm" and scene["axes"] == {"up": "+Y", "front": "+Z"}
    assert scene["calibration"] == {
        "actualWidthMm": 11300, "groundY": 0, "yawDegrees": 0,
        "sourceFootprint": {"minX": -11300, "maxX": 0, "minZ": -6800, "maxZ": 0}}
    assert scene["installationFaces"] == [{
        "wallFaceId": "facade-main", "side": "front", "originMm": {"x": -11300, "y": 0, "z": 0},
        "lengthMm": 11300, "alongWallUnit": {"x": 1, "z": 0}, "outwardUnit": {"x": 0, "z": 1}}]
    assert scene["representations"]["render"] == {"model": "render/model.glb"}


def test_verify_passes_for_fixture(project):
    result = run_build(project, CATALOG, DEFAULTS)
    assert verify_build(result.dir) == []


def test_verify_detects_width_mismatch(project):
    result = run_build(project, CATALOG, DEFAULTS)
    scene_path = result.dir / "scene.json"
    scene = json.loads(scene_path.read_text())
    scene["calibration"]["actualWidthMm"] = 9999
    scene_path.write_text(json.dumps(scene))
    assert "width_mismatch" in [issue.code for issue in verify_build(result.dir)]


def test_failed_build_keeps_previous_latest(project):
    assert run_build(project, CATALOG, DEFAULTS).version == 1
    spec = project.load_spec()
    spec.facade.width_mm = None
    project.save_spec(spec)
    result = run_build(project, CATALOG, DEFAULTS)
    assert result.version is None
    assert [issue.code for issue in result.issues] == ["width_missing"]
    assert project.latest_build() == 1


def test_annotations_include_width_and_openings():
    items = {item["id"]: item for item in annotations(sunningdale_spec(), DEFAULTS)}
    assert items["width"]["valueMm"] == 11300 and items["width"]["group"] == "overall"
    assert items["eave"]["valueMm"] == 5200
    assert items["ridge"]["valueMm"] == pytest.approx(8090, abs=1)
    assert items["o3-width"]["valueMm"] == 1800 and items["o3-height"]["group"] == "opening"
    start, end = items["width"]["start"], items["width"]["end"]
    assert (start["x"], end["x"]) == (-11300, 0)
