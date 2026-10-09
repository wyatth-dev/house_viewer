"""AI 出图：素材上传、提示词文件、OpenAI 请求、出图任务和 HTTP 接口（不调用真实的 OpenAI）。"""
import base64
import io
import json
import time

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from facade_modeler.adapters.http_server import create_app
from facade_modeler.assets.catalog import Catalog
from facade_modeler.config import load_defaults
from facade_modeler.env import load_env_file
from facade_modeler.projects.store import ProjectRegistry
from facade_modeler.rendering.media import MediaStore
from facade_modeler.rendering.openai_images import OpenAIImageSettings, RenderError, edit_image, fidelity_for, size_for
from facade_modeler.rendering.prompt import PROMPTS_DIR, InvalidRenderOptions, build_prompt, load_options, resolve_options
from facade_modeler.rendering.runner import RenderRunner, crop_back, pad_to
from facade_modeler.service.context import AppContext
from helpers import jpeg_bytes


def png_bytes(size=(1536, 1024), color=(20, 120, 40)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="PNG")
    return buffer.getvalue()


# ---- .env、提示词、尺寸 ----------------------------------------------------------------
def test_env_file_does_not_override_existing_values(tmp_path, monkeypatch):
    monkeypatch.setenv("KEEP_ME", "from-shell")
    monkeypatch.delenv("NEW_KEY", raising=False)
    monkeypatch.delenv("QUOTED", raising=False)
    env = tmp_path / ".env"
    env.write_text("# comment\nKEEP_ME=from-file\nexport NEW_KEY = abc\nQUOTED='x y'\nnot a line\n", encoding="utf-8")
    assert sorted(load_env_file(env)) == ["NEW_KEY", "QUOTED"]
    import os
    assert os.environ["KEEP_ME"] == "from-shell" and os.environ["NEW_KEY"] == "abc" and os.environ["QUOTED"] == "x y"
    assert load_env_file(tmp_path / "missing.env") == []


def test_prompt_files(tmp_path):
    (tmp_path / "render.txt").write_text("Render {capture}. Keep {unknown}.\n", encoding="utf-8")
    (tmp_path / "render-context.txt").write_text("{context} ({context_count}) are references.\n", encoding="utf-8")
    assert build_prompt(0, tmp_path) == "Render Image 1. Keep {unknown}.\n"
    assert build_prompt(1, tmp_path) == "Render Image 1. Keep {unknown}.\n\nImage 2 (1) are references.\n"
    assert build_prompt(3, tmp_path).endswith("Images 2 to 4 (3) are references.\n")
    (tmp_path / "render-context.txt").unlink()
    assert build_prompt(2, tmp_path) == "Render Image 1. Keep {unknown}.\n"


def test_repository_prompt_files_exist():
    assert (PROMPTS_DIR / "render.txt").is_file() and (PROMPTS_DIR / "render-context.txt").is_file()
    groups = load_options()
    assert [group["id"] for group in groups] == ["style", "time_of_day", "weather", "season"]
    assert {group["id"]: group["default"] for group in groups} == {
        "style": "commercial", "time_of_day": "day", "weather": "clear", "season": "summer"}
    for count in (0, 1, 3):
        text = build_prompt(count)
        assert "Change only the surfaces" in text and "{" not in text
    assert "Images 2 to 4" in build_prompt(3) and "Image 2" not in build_prompt(0)
    for group in groups:  # 每个选项都能拼出完整的提示词（选项写不写进提示词由 render.txt 决定）
        for option in group["options"]:
            assert "{" not in build_prompt(1, choices={group["id"]: option["id"]})


def test_render_options_file(tmp_path):
    (tmp_path / "render.txt").write_text("Make {capture} {style} in {weather}.", encoding="utf-8")
    (tmp_path / "options.toml").write_text(
        '[style]\nlabel = "Style"\ndefault = "b"\n'
        '[style.options.a]\nlabel = "A"\ntext = "style A"\n[style.options.b]\nlabel = "B"\ntext = "style B"\n'
        '[weather]\nlabel = "Weather"\n[weather.options.sun]\nlabel = "Sun"\ntext = "sunshine"\n', encoding="utf-8")
    groups = load_options(tmp_path)
    assert groups[1]["default"] == "sun"  # 没写 default 时取第一个
    assert resolve_options({}, groups) == {"style": "b", "weather": "sun"}
    assert build_prompt(0, tmp_path) == "Make Image 1 style B in sunshine.\n"
    assert build_prompt(0, tmp_path, {"style": "a"}) == "Make Image 1 style A in sunshine.\n"
    with pytest.raises(InvalidRenderOptions):
        resolve_options({"style": "zzz"}, groups)
    with pytest.raises(InvalidRenderOptions):
        resolve_options({"mood": "calm"}, groups)
    (tmp_path / "options.toml").write_text("[broken", encoding="utf-8")
    with pytest.raises(InvalidRenderOptions):
        load_options(tmp_path)


def test_size_for_picks_closest_supported_shape():
    assert size_for(1600, 900) == "1536x1024"
    assert size_for(900, 1600) == "1024x1536"
    assert size_for(1000, 1000) == "1024x1024"


def test_size_for_uses_capture_ratio_on_flexible_models():
    assert size_for(1600, 1183, "gpt-image-2.5-flare") == "1536x1136"
    assert size_for(900, 1600, "gpt-image-2") == "864x1536"
    assert size_for(4000, 500, "gpt-image-2.5-sunburst") == "1536x512"  # 比例限制在 3:1
    for text in (size_for(1600, 1183, "gpt-image-2.5-flare"), size_for(1371, 900, "gpt-image-2")):
        width, height = (int(v) for v in text.split("x"))
        assert width % 16 == 0 and height % 16 == 0


def test_input_fidelity_only_for_models_that_accept_it():
    assert fidelity_for("gpt-image-2.5-flare", "high") is None
    assert fidelity_for("gpt-image-2", None) is None
    assert fidelity_for("gpt-image-1-mini", "high") is None
    assert fidelity_for("gpt-image-1", None) == "high"
    assert fidelity_for("gpt-image-1.5", "low") == "low"


def test_pad_and_crop_back_keep_the_capture_framing():
    # 截图 1600x1183（比例 1.35）放进 1536x1024：高度占满，左右补边，不裁剪也不拉伸
    capture = Image.new("RGB", (1600, 1183), (200, 50, 50))
    for x in range(700, 900):
        for y in range(500, 700):
            capture.putpixel((x, y), (0, 0, 255))
    padded, box = pad_to(capture, (1536, 1024))
    left, top, width, height = box
    assert padded.size == (1536, 1024) and top == 0 and height == 1024 and width == round(1600 * 1024 / 1183)
    assert padded.getpixel((0, 512)) == padded.getpixel((left, 512))  # 边缘像素延伸，没有黑边
    buffer = io.BytesIO()
    padded.save(buffer, format="PNG")
    restored = Image.open(io.BytesIO(crop_back(buffer.getvalue(), (1536, 1024), box, (1600, 1183))))
    assert restored.size == (1600, 1183)
    r, g, b = restored.getpixel((800, 600))  # 蓝色方块还在原来的位置
    assert b > 200 and r < 60


def test_crop_back_accepts_other_output_sizes():
    data = png_bytes(size=(1024, 1024))
    assert Image.open(io.BytesIO(crop_back(data, (1536, 1024), (76, 0, 1385, 1024), (1600, 1183)))).size == (1600, 1183)


# ---- 素材 --------------------------------------------------------------------------------
def test_media_store_save_resolve_delete(tmp_path):
    media = MediaStore(tmp_path / "media")
    relative = media.save("context", jpeg_bytes(size=(4000, 3000)))
    assert relative.startswith("context/") and relative.endswith(".jpg")
    assert max(Image.open(media.resolve(relative)).size) == 2048
    with pytest.raises(ValueError):
        media.save("renders", jpeg_bytes())
    with pytest.raises(ValueError):
        media.save("context", b"not an image")
    with pytest.raises(FileNotFoundError):
        media.resolve("../outside.jpg")
    with pytest.raises(ValueError):
        media.delete("renders/r-1/result.jpg")
    assert media.delete(relative) is True and media.delete(relative) is False


# ---- OpenAI 请求 ---------------------------------------------------------------------------
def test_edit_image_sends_all_images_and_settings(tmp_path):
    capture, photo = tmp_path / "capture.jpg", tmp_path / "photo.jpg"
    capture.write_bytes(jpeg_bytes())
    photo.write_bytes(jpeg_bytes())
    seen = {}

    def handler(request: httpx.Request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["authorization"]
        seen["body"] = request.read()
        return httpx.Response(200, json={"data": [{"b64_json": base64.b64encode(b"PNGDATA").decode()}]})

    settings = OpenAIImageSettings(api_key="sk-test", model="gpt-image-1", quality="high", input_fidelity="high")
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        assert edit_image(settings, "make it real", [capture, photo], "1536x1024", client) == b"PNGDATA"
    body = seen["body"]
    assert seen["url"] == "https://api.openai.com/v1/images/edits" and seen["auth"] == "Bearer sk-test"
    assert body.count(b'name="image[]"') == 2
    for field in (b"gpt-image-1", b"make it real", b"1536x1024", b'name="input_fidelity"'):
        assert field in body


def test_edit_image_omits_input_fidelity_for_flexible_models(tmp_path):
    capture = tmp_path / "capture.png"
    capture.write_bytes(png_bytes())
    seen = {}

    def handler(request: httpx.Request):
        seen["body"] = request.read()
        return httpx.Response(200, json={"data": [{"b64_json": base64.b64encode(b"x").decode()}]})

    settings = OpenAIImageSettings(api_key="sk-test", model="gpt-image-2.5-flare", input_fidelity="high")
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        edit_image(settings, "p", [capture], "1536x1136", client)
    assert b'name="input_fidelity"' not in seen["body"] and b"1536x1136" in seen["body"]


def test_edit_image_reports_rejected_key(tmp_path):
    capture = tmp_path / "capture.jpg"
    capture.write_bytes(jpeg_bytes())
    transport = httpx.MockTransport(lambda request: httpx.Response(401, json={"error": {"message": "bad key"}}))
    with httpx.Client(transport=transport) as client, pytest.raises(RenderError, match="rejected the API key"):
        edit_image(OpenAIImageSettings(api_key="sk-bad"), "p", [capture], "1024x1024", client)


def test_settings_from_env(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert OpenAIImageSettings.from_env() is None
    monkeypatch.setenv("OPENAI_API_KEY", "sk-1")
    monkeypatch.delenv("OPENAI_IMAGE_MODEL", raising=False)
    monkeypatch.delenv("OPENAI_IMAGE_INPUT_FIDELITY", raising=False)
    settings = OpenAIImageSettings.from_env()
    assert settings.model == "gpt-image-2.5-flare" and settings.input_fidelity is None and settings.quality == "high"
    monkeypatch.setenv("OPENAI_IMAGE_MODEL", "gpt-image-1")
    monkeypatch.setenv("OPENAI_IMAGE_INPUT_FIDELITY", "high")
    settings = OpenAIImageSettings.from_env()
    assert settings.model == "gpt-image-1" and settings.input_fidelity == "high"


# ---- HTTP 接口 + 任务 -----------------------------------------------------------------------
@pytest.fixture
def app_ctx(tmp_path):
    return AppContext(ProjectRegistry(tmp_path / "projects"), Catalog.load(), load_defaults())


def make_client(app_ctx, generate=None):
    return TestClient(create_app(app_ctx, viewer_dist=None, renders=RenderRunner(app_ctx.media, generate)))


def upload(client, pid, kind, size=(1600, 900)):
    files = [("files", ("view.jpg", jpeg_bytes(size=size), "image/jpeg"))]
    reply = client.post(f"/api/projects/{pid}/media/{kind}", files=files)
    assert reply.status_code == 200, reply.text
    return reply.json()["result"]["files"][0]


def wait(client, pid, rid):
    for _ in range(200):
        job = client.get(f"/api/projects/{pid}/renders/{rid}").json()["result"]["render"]
        if job["state"] in ("done", "failed"):
            return job
        time.sleep(0.02)
    raise AssertionError("render did not finish")


def test_render_flow(app_ctx, monkeypatch):
    monkeypatch.delenv("OPENAI_IMAGE_MODEL", raising=False)  # 默认 gpt-image-2.5-flare：按截图比例出图
    calls = []

    def fake(prompt, images, size):
        calls.append((prompt, [p.name for p in images], size))
        return png_bytes()

    client = make_client(app_ctx, fake)
    pid = client.post("/api/projects", json={}).json()["result"]["id"]
    capture = upload(client, pid, "captures")
    context = upload(client, pid, "context", size=(800, 600))
    assert client.get(capture["url"]).status_code == 200

    reply = client.post(f"/api/projects/{pid}/renders", json={"sourceUrl": capture["url"], "contextUrls": [context["url"]]})
    assert reply.status_code == 200, reply.text
    job = wait(client, pid, reply.json()["result"]["render"]["id"])
    assert job["state"] == "done" and job["error"] is None
    assert Image.open(io.BytesIO(client.get(job["resultUrl"]).content)).size == (1600, 900)
    prompt, names, size = calls[0]
    assert size == "1536x864" and len(names) == 2 and prompt == build_prompt(1)
    assert names[0] == "input.png"
    folder = app_ctx.media(pid).root / "renders" / job["id"]
    assert (folder / "prompt.txt").read_text(encoding="utf-8") == prompt
    assert Image.open(folder / "input.png").size == (1536, 864)
    assert json.loads((folder / "job.json").read_text())["contextUrls"] == [context["url"]]

    assert client.delete(f"/api/projects/{pid}/media/{context['path']}").status_code == 200
    assert client.get(context["url"]).status_code == 404
    assert client.delete(f"/api/projects/{pid}/media/renders/{job['id']}/result.jpg").status_code == 400


def test_render_options_over_http(app_ctx):
    calls = []
    client = make_client(app_ctx, lambda prompt, images, size: calls.append(prompt) or png_bytes())
    groups = client.get("/api/render-options").json()["result"]["groups"]
    assert groups[0]["id"] == "style" and "text" not in groups[0]["options"][0]
    pid = client.post("/api/projects", json={}).json()["result"]["id"]
    capture = upload(client, pid, "captures")
    body = {"sourceUrl": capture["url"], "options": {"weather": "overcast", "time_of_day": "dusk"}}
    reply = client.post(f"/api/projects/{pid}/renders", json=body)
    assert reply.status_code == 200, reply.text
    job = wait(client, pid, reply.json()["result"]["render"]["id"])
    assert job["options"] == {"style": "commercial", "time_of_day": "dusk", "weather": "overcast", "season": "summer"}
    bad = client.post(f"/api/projects/{pid}/renders", json={"sourceUrl": capture["url"], "options": {"weather": "hail"}})
    assert bad.status_code == 400 and "hail" in bad.json()["detail"]


def test_render_failure_is_reported(app_ctx):
    def broken(prompt, images, size):
        raise RenderError("OpenAI rate limit or quota reached.")

    client = make_client(app_ctx, broken)
    pid = client.post("/api/projects", json={}).json()["result"]["id"]
    capture = upload(client, pid, "captures")
    rid = client.post(f"/api/projects/{pid}/renders", json={"sourceUrl": capture["url"]}).json()["result"]["render"]["id"]
    job = wait(client, pid, rid)
    assert job["state"] == "failed" and "quota" in job["error"] and job["resultUrl"] is None


def test_render_needs_api_key(app_ctx, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    client = make_client(app_ctx)
    pid = client.post("/api/projects", json={}).json()["result"]["id"]
    capture = upload(client, pid, "captures")
    reply = client.post(f"/api/projects/{pid}/renders", json={"sourceUrl": capture["url"]})
    assert reply.status_code == 409 and "OPENAI_API_KEY" in reply.json()["result"]["error"]


def test_render_inputs_must_belong_to_the_project(app_ctx):
    client = make_client(app_ctx, lambda prompt, images, size: png_bytes())
    first = client.post("/api/projects", json={}).json()["result"]["id"]
    second = client.post("/api/projects", json={}).json()["result"]["id"]
    capture = upload(client, first, "captures")
    context = upload(client, first, "context")
    post = lambda pid, body: client.post(f"/api/projects/{pid}/renders", json=body)  # noqa: E731
    assert post(second, {"sourceUrl": capture["url"]}).status_code == 400  # 别的项目的截图
    assert post(first, {"sourceUrl": context["url"]}).status_code == 400  # 源图必须是截图
    assert post(first, {"sourceUrl": capture["url"], "contextUrls": ["/etc/passwd"]}).status_code == 400
    assert post(first, {"sourceUrl": capture["url"], "contextUrls": [f"/files/{first}/house-001/../../project.json"]}).status_code in (400, 404)
    assert client.get(f"/api/projects/{first}/renders/r-missing").status_code == 404
    assert client.post("/api/projects/p-9999/media/context", files=[("files", ("a.jpg", jpeg_bytes(), "image/jpeg"))]).status_code == 404
    assert client.post(f"/api/projects/{first}/media/renders", files=[("files", ("a.jpg", jpeg_bytes(), "image/jpeg"))]).status_code == 404
    bad = client.post(f"/api/projects/{first}/media/context", files=[("files", ("a.jpg", b"nope", "image/jpeg"))])
    assert bad.status_code == 400


def test_photo_model_photo_can_be_context(app_ctx):
    client = make_client(app_ctx, lambda prompt, images, size: png_bytes())
    pid = client.post("/api/projects", json={}).json()["result"]["id"]
    files = [("files", ("house.jpg", jpeg_bytes(), "image/jpeg"))]
    mid = client.post(f"/api/projects/{pid}/photo-models", files=files).json()["result"]["photoModelId"]
    summary = client.get(f"/api/projects/{pid}/photo-models/{mid}").json()["result"]
    photo_url = f"/files/{pid}/{mid}/{summary['photos'][0]['file']}"
    capture = upload(client, pid, "captures")
    reply = client.post(f"/api/projects/{pid}/renders", json={"sourceUrl": capture["url"], "contextUrls": [photo_url]})
    assert reply.status_code == 200, reply.text
    assert wait(client, pid, reply.json()["result"]["render"]["id"])["state"] == "done"


def test_interrupted_render_is_marked_failed(app_ctx):
    client = make_client(app_ctx, lambda prompt, images, size: png_bytes())
    pid = client.post("/api/projects", json={}).json()["result"]["id"]
    folder = app_ctx.media(pid).root / "renders" / "r-old"
    folder.mkdir(parents=True)
    (folder / "job.json").write_text(json.dumps({"id": "r-old", "state": "running"}), encoding="utf-8")
    job = client.get(f"/api/projects/{pid}/renders/r-old").json()["result"]["render"]
    assert job["state"] == "failed" and "interrupted" in job["error"]
