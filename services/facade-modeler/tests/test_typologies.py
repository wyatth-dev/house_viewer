"""发布为 typology：提交后最新 build 复制到本项目的 typologies/，并登记在 index.json。"""
import json
import struct

import pytest
from fastapi.testclient import TestClient

from facade_modeler.adapters.http_server import create_app
from facade_modeler.assets.catalog import Catalog
from facade_modeler.build.pipeline import run_build
from facade_modeler.config import load_defaults
from facade_modeler.projects.store import ProjectRegistry
from facade_modeler.service import modeling, user_actions
from facade_modeler.service.context import AppContext
from facade_modeler.typologies.store import NotPublishable
from helpers import sunningdale_spec

CATALOG, DEFAULTS = Catalog.load(), load_defaults()
PID = "p-0001"
MODELS = f"/api/projects/{PID}/photo-models"
TYPOLOGIES = f"/api/projects/{PID}/typologies"
DATA = f"/data/projects/{PID}/typologies"


@pytest.fixture
def app_ctx(tmp_path):
    app_ctx = AppContext(ProjectRegistry(tmp_path / "projects"), CATALOG, DEFAULTS)
    assert app_ctx.projects.create("Test").id == PID
    return app_ctx


@pytest.fixture
def ctx(app_ctx):
    return app_ctx.service(PID)


def built_project(ctx):
    project = ctx.store.create()
    spec = sunningdale_spec()
    spec.id = project.id
    project.save_spec(spec)
    assert run_build(project, CATALOG, DEFAULTS).version == 1
    return project


def test_submit_publishes_latest_build(ctx):
    project = built_project(ctx)
    result = modeling.submit(ctx, project.id, note="done")
    assert result.ok and result.result["typologyId"] == project.id
    folder = ctx.typologies.root / project.id
    for item in ("scene.json", "model.glb", "color-block/model.glb", "render/model.glb", "annotations.json"):
        assert (folder / item).is_file(), item
    scene = json.loads((folder / "scene.json").read_text())
    assert scene["id"] == project.id and scene["name"] == f"Photo · {project.id}"
    [entry] = ctx.typologies.entries()
    assert entry["projectId"] == project.id and entry["buildVersion"] == 1 and entry["manifest"] == f"{project.id}/scene.json"
    assert user_actions.photo_model_summary(ctx, project.id).result["typology"]["id"] == project.id


def test_republish_replaces_files_and_keeps_one_row(ctx):
    project = built_project(ctx)
    ctx.typologies.publish(project, CATALOG, DEFAULTS, name="My house")
    assert run_build(project, CATALOG, DEFAULTS).version == 2
    ctx.typologies.publish(project, CATALOG, DEFAULTS)
    [entry] = ctx.typologies.entries()
    assert entry["buildVersion"] == 2 and entry["name"] == "My house"  # 名称保留
    leftovers = [p.name for p in ctx.typologies.root.iterdir() if p.name.startswith(".") and not p.name.endswith(".lock")]
    assert leftovers == []


def test_submit_without_build_does_not_publish(ctx):
    project = ctx.store.create()
    result = modeling.submit(ctx, project.id, note="nothing built")
    assert result.ok and "typologyId" not in result.result
    assert ctx.typologies.entries() == []
    with pytest.raises(NotPublishable):
        ctx.typologies.publish(project, CATALOG, DEFAULTS)


def test_http_typology_routes(ctx, app_ctx):
    project = built_project(ctx)
    client = TestClient(create_app(app_ctx, viewer_dist=None))
    assert client.get(TYPOLOGIES).json()["result"]["typologies"] == []
    assert client.post(f"{MODELS}/{project.id}/publish").json()["result"]["typology"]["id"] == project.id
    [row] = client.get(TYPOLOGIES).json()["result"]["typologies"]
    assert row["baseUrl"] == f"{DATA}/{project.id}/"
    assert client.get(f"{DATA}/{project.id}/scene.json").json()["id"] == project.id
    assert client.get(f"{DATA}/{project.id}/render/model.glb").status_code == 200
    assert client.get(f"{DATA}/{project.id}/../index.json").status_code == 404
    assert client.get(f"{DATA}/unknown/scene.json").status_code == 404
    assert client.delete(f"{TYPOLOGIES}/{project.id}").status_code == 200
    assert client.get(TYPOLOGIES).json()["result"]["typologies"] == []
    assert client.delete(f"{TYPOLOGIES}/{project.id}").status_code == 404


def _facade_z(path):
    data = path.read_bytes()
    gltf = json.loads(data[20:20 + struct.unpack("<I", data[12:16])[0]])
    [mesh] = [m for m in gltf["meshes"] if m["name"] == "Facade"]
    accessors = [gltf["accessors"][p["attributes"]["POSITION"]] for p in mesh["primitives"]]
    return min(a["min"][2] for a in accessors), max(a["max"][2] for a in accessors)


@pytest.mark.parametrize("side", ["back", "front"])
def test_published_facade_sits_on_its_side(ctx, side):
    project = built_project(ctx)
    spec = project.load_spec()
    spec.facade.side = side
    project.save_spec(spec)
    assert run_build(project, CATALOG, DEFAULTS).version == 2
    entry = ctx.typologies.publish(project, CATALOG, DEFAULTS)
    assert entry["facadeSide"] == side
    folder = ctx.typologies.root / project.id
    depth = spec.massing.depth_mm
    [face] = json.loads((folder / "scene.json").read_text())["installationFaces"]
    assert face["side"] == side
    assert face["outwardUnit"] == {"x": 0, "z": -1 if side == "back" else 1}
    assert face["originMm"]["z"] == (-depth if side == "back" else 0)
    expected = -depth if side == "back" else 0
    for item in ("model.glb", "color-block/model.glb", "render/model.glb"):
        low, high = _facade_z(folder / item)
        assert abs(low - expected) < 1 and abs(high - expected) < 1, item
    # 建模用的 build 保持立面朝 +Z，录入页与 LM 自查不受影响
    assert _facade_z(project.build_dir(2) / "model.glb") == pytest.approx((0, 0), abs=1)


def test_old_specs_default_to_back(ctx):
    project = built_project(ctx)
    data = json.loads(project.spec_path.read_text())
    data["facade"].pop("side", None)
    project.spec_path.write_text(json.dumps(data))
    assert project.load_spec().facade.side == "back"


def test_upload_sets_facade_side(ctx, app_ctx):
    from helpers import jpeg_bytes
    client = TestClient(create_app(app_ctx, viewer_dist=None))
    files = [("files", ("a.jpg", jpeg_bytes(), "image/jpeg"))]
    pid = client.post(MODELS, data={"facadeSide": "front"}, files=files).json()["result"]["photoModelId"]
    assert client.get(f"{MODELS}/{pid}").json()["result"]["facadeSide"] == "front"
    pid = client.post(MODELS, files=files).json()["result"]["photoModelId"]
    assert client.get(f"{MODELS}/{pid}").json()["result"]["facadeSide"] == "back"
    for side in ("left", "right"):
        reply = client.post(MODELS, data={"facadeSide": side}, files=files)
        assert reply.status_code == 200
        project_id = reply.json()["result"]["photoModelId"]
        assert client.get(f"{MODELS}/{project_id}").json()["result"]["facadeSide"] == side
    assert client.post(MODELS, data={"facadeSide": "unknown"}, files=files).status_code == 400


def test_preview_is_stored_and_dropped_on_republish(ctx, app_ctx):
    project = built_project(ctx)
    client = TestClient(create_app(app_ctx, viewer_dist=None))
    client.post(f"{MODELS}/{project.id}/publish")
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 100
    assert client.put(f"{TYPOLOGIES}/{project.id}/preview", content=b"not a png").status_code == 400
    assert client.put(f"{TYPOLOGIES}/unknown/preview", content=png).status_code == 404
    assert client.put(f"{TYPOLOGIES}/{project.id}/preview", content=png).json()["result"]["typology"]["preview"] == "preview.png"
    assert client.get(f"{DATA}/{project.id}/preview.png").content == png
    [row] = client.get(TYPOLOGIES).json()["result"]["typologies"]
    assert row["preview"] == "preview.png"
    client.post(f"{MODELS}/{project.id}/publish")  # 新版本：旧预览图作废
    [row] = client.get(TYPOLOGIES).json()["result"]["typologies"]
    assert "preview" not in row
    assert client.get(f"{DATA}/{project.id}/preview.png").status_code == 404


def test_edit_upload_preserves_other_facade_inputs(ctx, app_ctx):
    from helpers import jpeg_bytes
    client = TestClient(create_app(app_ctx, viewer_dist=None))
    files = [("files", ("a.jpg", jpeg_bytes(), "image/jpeg"))]
    project = built_project(ctx)
    previous = project.load_spec()
    old_ids = set(previous.photos)
    for side in ("front", "left", "right"):
        response = client.post(MODELS, data={"projectId": project.id, "facadeSide": side}, files=files)
        assert response.status_code == 200
        spec = project.load_spec()
        assert spec.facade.side == side
        assert len(spec.photos) == 1
        assert next(iter(spec.photos.values())).primary
        assert not (set(spec.photos) & old_ids)
        assert not spec.measurements and not spec.facade.openings
        assert set(previous.photos) <= set(spec.facade_inputs["back"].photos)
        old_ids |= set(spec.photos)
        spec.facade.width_mm = 6000
        project.save_spec(spec)
        assert run_build(project, CATALOG, DEFAULTS).version is not None
        ctx.typologies.publish(project, CATALOG, DEFAULTS)
        manifest = json.loads((ctx.typologies.directory(project.id) / "scene.json").read_text())
        face = manifest["installationFaces"][0]
        assert face["side"] == side
        assert face["outwardUnit"] == {"front": {"x": 0, "z": 1}, "back": {"x": 0, "z": -1}, "left": {"x": -1, "z": 0}, "right": {"x": 1, "z": 0}}[side]
