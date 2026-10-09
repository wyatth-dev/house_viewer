"""按项目的 HTTP 接口：项目 CRUD、照片模型挂在项目下、跨项目隔离、旧接口已删除。"""
import pytest
from fastapi.testclient import TestClient

from facade_modeler.adapters.http_server import create_app
from facade_modeler.assets.catalog import Catalog
from facade_modeler.config import load_defaults
from facade_modeler.projects.store import ProjectNotFound, ProjectRegistry
from facade_modeler.service.context import AppContext, ServiceContext
from helpers import jpeg_bytes


@pytest.fixture
def app_ctx(tmp_path):
    return AppContext(ProjectRegistry(tmp_path / "projects"), Catalog.load(), load_defaults())


@pytest.fixture
def client(app_ctx):
    return TestClient(create_app(app_ctx, viewer_dist=None))


def upload(client, pid, **data):
    files = [("files", ("a.jpg", jpeg_bytes(), "image/jpeg"))]
    return client.post(f"/api/projects/{pid}/photo-models", data=data, files=files)


def test_project_crud_over_http(client):
    created = client.post("/api/projects", json={"name": "My house"})
    assert created.status_code == 200
    doc = created.json()["result"]
    assert doc["id"] == "p-0001" and doc["name"] == "My house"
    assert client.get("/api/projects").json()["result"]["projects"][0]["id"] == "p-0001"

    fetched = client.get("/api/projects/p-0001")
    assert fetched.status_code == 200 and fetched.json()["result"]["revision"] == 0

    doc["site"]["dimensionsMm"]["front"] = 8000
    saved = client.put("/api/projects/p-0001", json=doc)
    assert saved.status_code == 200
    assert saved.json()["result"]["revision"] == 1
    assert saved.json()["result"]["site"]["dimensionsMm"]["front"] == 8000

    stale = client.put("/api/projects/p-0001", json=doc)  # 仍然带 revision 0
    assert stale.status_code == 409
    body = stale.json()
    assert body["ok"] is False and body["issues"] == []
    assert body["result"]["current"]["revision"] == 1
    assert body["result"]["current"]["site"]["dimensionsMm"]["front"] == 8000

    invalid = {**saved.json()["result"], "media": {"renders": []}}
    reply = client.put("/api/projects/p-0001", json=invalid)
    assert reply.status_code == 422 and "media" in reply.json()["result"]["error"]

    assert client.put("/api/projects/p-0001/name", json={"name": ""}).status_code == 400
    assert client.put("/api/projects/p-0001/name", json={"name": "x" * 121}).status_code == 400
    renamed = client.put("/api/projects/p-0001/name", json={"name": "Renamed"})
    assert renamed.status_code == 200 and renamed.json()["result"]["name"] == "Renamed"
    assert renamed.json()["result"]["revision"] == 2

    assert client.post("/api/projects", json={}).json()["result"]["id"] == "p-0002"
    assert client.post("/api/projects").json()["result"]["name"] == "Untitled project"

    assert client.delete("/api/projects/p-0001").status_code == 200
    assert client.get("/api/projects/p-0001").status_code == 404
    assert client.delete("/api/projects/p-0001").status_code == 404
    assert client.put("/api/projects/p-0001", json=doc).status_code == 404
    assert {row["id"] for row in client.get("/api/projects").json()["result"]["projects"]} == {"p-0002", "p-0003"}


def test_unreadable_project_is_422_and_not_overwritten(client, app_ctx):
    client.post("/api/projects", json={"name": "A"})
    path = app_ctx.projects.directory("p-0001") / "project.json"
    path.write_text("{broken", encoding="utf-8")
    reply = client.get("/api/projects/p-0001")
    assert reply.status_code == 422 and reply.json()["ok"] is False
    assert path.read_text(encoding="utf-8") == "{broken"
    assert client.get("/api/projects/not-a-project").status_code == 404


def test_photo_model_upload_lives_under_its_project(client, app_ctx, tmp_path):
    client.post("/api/projects", json={"name": "A"})
    reply = upload(client, "p-0001", widthMm="9000")
    assert reply.status_code == 200
    result = reply.json()["result"]
    assert result["photoModelId"] == "house-001" and "projectId" not in result
    photos = tmp_path / "projects" / "p-0001" / "photo-models" / "house-001" / "photos"
    assert [p.name for p in photos.iterdir()] == ["p1.jpg"]
    assert "house-001" in client.get("/api/projects/p-0001/photo-models").json()["result"]["projects"]
    summary = client.get("/api/projects/p-0001/photo-models/house-001").json()["result"]
    assert summary["id"] == "house-001" and summary["width"]["widthMm"] == 9000 and summary["job"] is None
    assert client.get("/files/p-0001/house-001/photos/p1.jpg").content[:2] == b"\xff\xd8"
    again = upload(client, "p-0001", projectId="house-001").json()["result"]
    assert again["photoModelId"] == "house-001" and again["photoIds"] == ["p2"]
    assert client.put("/api/projects/p-0001/photo-models/house-001/name", json={"name": "Back"}).json()["result"] == {"name": "Back"}
    assert upload(client, "p-0009").status_code == 404
    assert not (tmp_path / "projects" / "p-0009").exists()


def test_photo_models_are_scoped_to_their_project(client):
    client.post("/api/projects", json={"name": "A"})
    client.post("/api/projects", json={"name": "B"})
    assert upload(client, "p-0001").json()["result"]["photoModelId"] == "house-001"
    assert client.get("/files/p-0001/house-001/spec.json").status_code == 200
    assert client.get("/files/p-0002/house-001/spec.json").status_code == 404
    assert client.get("/api/projects/p-0002/photo-models/house-001").status_code == 404
    assert client.get("/api/projects/p-0002/photo-models").json()["result"]["projects"] == []
    assert upload(client, "p-0002", projectId="house-001").status_code == 404
    assert client.get("/files/p-0001/house-001/../../p-0002/project.json").status_code == 404
    assert client.get("/files/p-0001/house-001/..%2F..%2Fp-0002%2Fproject.json").status_code == 404
    assert client.get("/files/p-0001/..%2Fp-0002/project.json").status_code == 404
    assert client.get("/files/p-0001/house-001/.lock").status_code == 404
    assert client.get("/data/projects/p-0002/typologies/house-001/scene.json").status_code == 404
    assert client.get("/api/projects/p-0002/typologies").json()["result"]["typologies"] == []


def test_legacy_routes_are_gone(client):
    files = [("files", ("a.jpg", jpeg_bytes(), "image/jpeg"))]
    assert client.post("/api/uploads", files=files).status_code in (404, 405)
    assert client.get("/api/typologies").status_code in (404, 405)
    assert client.get("/data/typologies/house-001/scene.json").status_code in (404, 405)


def test_app_context_service_is_per_project(app_ctx):
    app_ctx.projects.create("A")
    service = app_ctx.service("p-0001")
    assert isinstance(service, ServiceContext)
    assert service.store.root == app_ctx.projects.photo_models_dir("p-0001")
    assert service.typologies.root == app_ctx.projects.typologies_dir("p-0001")
    with pytest.raises(ProjectNotFound):
        app_ctx.service("p-0002")
    assert not app_ctx.projects.directory("p-0002").exists()


def test_service_context_from_env_requires_both_dirs(monkeypatch, tmp_path):
    monkeypatch.delenv("FACADE_PHOTO_MODELS_DIR", raising=False)
    monkeypatch.setenv("FACADE_TYPOLOGIES_DIR", str(tmp_path / "t"))
    with pytest.raises(RuntimeError, match="FACADE_PHOTO_MODELS_DIR"):
        ServiceContext.from_env()
    monkeypatch.setenv("FACADE_PHOTO_MODELS_DIR", str(tmp_path / "m"))
    monkeypatch.delenv("FACADE_TYPOLOGIES_DIR")
    with pytest.raises(RuntimeError, match="FACADE_TYPOLOGIES_DIR"):
        ServiceContext.from_env()
    monkeypatch.setenv("FACADE_TYPOLOGIES_DIR", str(tmp_path / "t"))
    ctx = ServiceContext.from_env()
    assert ctx.store.root == tmp_path / "m" and ctx.typologies.root == tmp_path / "t"


def test_app_context_from_env_migrates_legacy_data(monkeypatch, tmp_path):
    (tmp_path / "intake" / "house-001").mkdir(parents=True)
    monkeypatch.setenv("FACADE_DATA_DIR", str(tmp_path))
    app_ctx = AppContext.from_env()
    assert app_ctx.projects.root == tmp_path / "projects"
    [row] = app_ctx.projects.list()
    assert row["id"] == "p-0001" and row["name"] == "My first project"
    assert (app_ctx.projects.photo_models_dir("p-0001") / "house-001").is_dir()


def test_project_list_reports_generating(app_ctx):
    class Runner:
        def __init__(self):
            self.states = {}

        def start(self, pid, mid):
            self.states[(pid, mid)] = "running"
            return {"state": "running"}

        def status(self, pid, mid):
            state = self.states.get((pid, mid))
            return {"state": state} if state else None

    runner = Runner()
    client = TestClient(create_app(app_ctx, viewer_dist=None, runner=runner))
    busy = client.post("/api/projects", json={"name": "Busy"}).json()["result"]["id"]
    idle = client.post("/api/projects", json={"name": "Idle"}).json()["result"]["id"]
    mid = upload(client, busy).json()["result"]["photoModelId"]
    rows = {row["id"]: row for row in client.get("/api/projects").json()["result"]["projects"]}
    assert rows[busy]["generating"] is True and rows[idle]["generating"] is False
    runner.states[(busy, mid)] = "done"
    rows = {row["id"]: row for row in client.get("/api/projects").json()["result"]["projects"]}
    assert rows[busy]["generating"] is False
