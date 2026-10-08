"""HTTP 接口：上传照片（附可选宽度）与只读查询。"""
import pytest
from fastapi.testclient import TestClient

from facade_modeler.adapters.http_server import create_app
from facade_modeler.assets.catalog import Catalog
from facade_modeler.config import load_defaults
from facade_modeler.project.store import ProjectStore
from facade_modeler.service.context import ServiceContext
from helpers import jpeg_bytes


@pytest.fixture
def client(tmp_path):
    ctx = ServiceContext(ProjectStore(tmp_path), Catalog.load(), load_defaults())
    return TestClient(create_app(ctx, viewer_dist=None))


JPEG_A = jpeg_bytes()


def upload(client, width=None, project_id=None):
    data = {}
    if width is not None:
        data["widthMm"] = str(width)
    if project_id:
        data["projectId"] = project_id
    files = [("files", ("a.jpg", JPEG_A, "image/jpeg")), ("files", ("b.jpg", jpeg_bytes(color=(1, 2, 3)), "image/jpeg"))]
    return client.post("/api/uploads", data=data, files=files)


def test_http_upload_creates_project_with_width(client):
    response = upload(client, width=9500)
    assert response.status_code == 200
    project_id = response.json()["result"]["projectId"]
    summary = client.get(f"/api/projects/{project_id}").json()["result"]
    assert summary["width"] == {"widthMm": 9500, "source": "user", "skipped": False}
    assert [p["id"] for p in summary["photos"]] == ["p1", "p2"]
    assert client.get("/api/projects").json()["result"]["projects"] == [project_id]


def test_http_upload_without_width_marks_skipped(client):
    project_id = upload(client).json()["result"]["projectId"]
    summary = client.get(f"/api/projects/{project_id}").json()["result"]
    assert summary["width"]["skipped"] is True


def test_http_upload_to_existing_project(client):
    project_id = upload(client, width=8000).json()["result"]["projectId"]
    again = upload(client, project_id=project_id).json()["result"]
    assert again["projectId"] == project_id and again["photoIds"] == ["p3", "p4"]


def test_files_route_serves_photo(client):
    project_id = upload(client).json()["result"]["projectId"]
    assert client.get(f"/files/{project_id}/photos/p1.jpg").content[:2] == b"\xff\xd8"


def test_files_route_blocks_traversal(client):
    project_id = upload(client).json()["result"]["projectId"]
    assert client.get(f"/files/{project_id}/..%2F..%2Fetc%2Fpasswd").status_code == 404
    assert client.get(f"/files/{project_id}/.lock").status_code == 404


def test_unknown_project_is_404(client):
    assert client.get("/api/projects/house-999").status_code == 404


def test_http_rejects_non_image_without_creating_project(client):
    response = client.post("/api/uploads", files=[("files", ("x.jpg", b"not an image", "image/jpeg"))])
    assert response.status_code == 400
    assert client.get("/api/projects").json()["result"]["projects"] == []


@pytest.mark.parametrize("width", ["nan", "inf", "-5"])
def test_http_rejects_nonfinite_width_before_creating_project(client, width):
    response = client.post("/api/uploads", data={"widthMm": width},
                           files=[("files", ("a.jpg", JPEG_A, "image/jpeg"))])
    assert response.status_code == 400
    assert client.get("/api/projects").json()["result"]["projects"] == []


class RecordingRunner:
    """代替真正的 JobRunner：只记录被触发了哪些项目。"""

    def __init__(self):
        self.started = []

    def start(self, project_id):
        self.started.append(project_id)
        return {"state": "queued"}

    def status(self, project_id):
        return {"state": "running", "run": 1} if project_id in self.started else None


@pytest.fixture
def auto_client(tmp_path):
    ctx = ServiceContext(ProjectStore(tmp_path), Catalog.load(), load_defaults())
    runner = RecordingRunner()
    return TestClient(create_app(ctx, viewer_dist=None, runner=runner)), runner


def test_upload_starts_modelling_automatically(auto_client):
    client, runner = auto_client
    project_id = upload(client).json()["result"]["projectId"]
    assert runner.started == [project_id]
    summary = client.get(f"/api/projects/{project_id}").json()["result"]
    assert summary["job"] == {"state": "running", "run": 1}


def test_failed_upload_does_not_start_modelling(auto_client):
    client, runner = auto_client
    client.post("/api/uploads", files=[("files", ("x.jpg", b"not an image", "image/jpeg"))])
    assert runner.started == []


def test_run_again_endpoint(auto_client):
    client, runner = auto_client
    project_id = upload(client).json()["result"]["projectId"]
    assert client.post(f"/api/projects/{project_id}/run").status_code == 200
    assert runner.started == [project_id, project_id]
    assert client.post("/api/projects/house-999/run").status_code == 404


def test_summary_without_runner_has_no_job(client):
    project_id = upload(client).json()["result"]["projectId"]
    assert client.get(f"/api/projects/{project_id}").json()["result"]["job"] is None
