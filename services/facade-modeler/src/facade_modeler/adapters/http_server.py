"""HTTP 适配：给 house-viewer 使用（Your projects、项目编辑、照片录入页、typology 列表）。

照片录入的写操作只有上传照片（可附宽度）、失败后重跑和改名；建模提交后自动发布为本项目的 typology。
上传成功后自动启动建模任务（jobs/runner.py）；设置 FACADE_AUTORUN=0 可关闭。

接口（<pid> 是用户项目 p-0001，<mid> 是项目里的照片模型 house-001）：
  GET/POST /api/projects                               项目列表 / 新建 {name?}
  GET/PUT/DELETE /api/projects/<pid>                   读取 / 保存（带 revision，不一致 409）/ 删除
  PUT /api/projects/<pid>/name                         项目改名 {name}
  GET/POST /api/projects/<pid>/photo-models            照片模型列表 / 上传照片（multipart）
  GET /api/projects/<pid>/photo-models/<mid>           照片模型详情（含任务状态）
  POST …/<mid>/run、POST …/<mid>/publish、PUT …/<mid>/name   重跑、手动发布、改名
  GET /files/<pid>/<mid>/<path>                        照片模型里的文件（照片、矫正图、build）
  GET /api/projects/<pid>/typologies                   本项目已发布的照片 typology（每行带 baseUrl）
  DELETE …/typologies/<mid>、PUT …/typologies/<mid>/preview   删除、保存缩略图
  GET /data/projects/<pid>/typologies/<mid>/<path>     已发布 typology 的文件

项目不存在、照片模型不存在：404；保存时 revision 冲突：409 {"result": {"current": 服务器上的文档}}；
项目文档不合法或磁盘上的 project.json 损坏：422。

开发时由仓库根目录的 npm run dev 启动；如果 house-viewer/dist 存在（npm run build 之后），
同一端口也直接提供页面（npm start）。
"""
from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Any, Optional

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from facade_modeler.jobs.runner import JobRunner
from facade_modeler.paths import REPO_ROOT
from facade_modeler.projects.store import InvalidProject, ProjectNotFound, ProjectUnreadable, RevisionConflict
from facade_modeler.service import user_actions
from facade_modeler.service.context import AppContext, ServiceContext
from facade_modeler.service.results import Result
from facade_modeler.service.width import apply_width
from facade_modeler.typologies.store import NotPublishable

VIEWER_DIST = REPO_ROOT / "dist"
HIDDEN = {".lock", "ops.jsonl"}


def _respond(result: Result) -> JSONResponse:
    return JSONResponse(result.to_dict(), status_code=200 if result.ok else 400)


def _envelope(result: dict, ok: bool = True, status: int = 200) -> JSONResponse:
    return JSONResponse({"ok": ok, "result": result, "issues": []}, status_code=status)


def _document(doc) -> dict:
    return doc.model_dump(by_alias=True)


def _valid_name(payload: Any) -> str:
    name = payload.get("name") if isinstance(payload, dict) else None
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 120:
        raise HTTPException(400, "Enter a name of 1–120 characters")
    return name.strip()


def create_app(app_ctx: AppContext, viewer_dist: Optional[Path] = VIEWER_DIST, runner: Optional[Any] = None) -> FastAPI:
    """runner：自动建模任务（JobRunner）；为 None 时上传后不自动建模。"""
    app = FastAPI(title="Facade Modeler")
    projects = app_ctx.projects

    @app.exception_handler(ProjectNotFound)
    def _not_found(request: Request, error: ProjectNotFound):
        return _envelope({"error": f"Project {error.args[0] if error.args else ''} does not exist"}, False, 404)

    @app.exception_handler(RevisionConflict)
    def _conflict(request: Request, error: RevisionConflict):
        return _envelope({"current": _document(error.current)}, False, 409)

    @app.exception_handler(InvalidProject)
    @app.exception_handler(ProjectUnreadable)
    def _unprocessable(request: Request, error):
        return _envelope({"error": error.message}, False, 422)

    def service(pid: str) -> ServiceContext:
        return app_ctx.service(pid)  # 不存在时抛 ProjectNotFound → 404

    def photo_model_or_404(ctx: ServiceContext, mid: str):
        try:
            return ctx.project(mid)
        except KeyError:
            raise HTTPException(404, f"Photo model {mid} does not exist") from None

    def typology_or_404(ctx: ServiceContext, mid: str) -> dict:
        entry = ctx.typologies.get(mid) if ctx.typologies is not None else None
        if entry is None:
            raise HTTPException(404, "Typology not found")
        return entry

    # ---- 用户项目 ----------------------------------------------------------------------
    @app.get("/api/projects")
    def list_projects():
        return _envelope({"projects": projects.list()})

    @app.post("/api/projects")
    def create_project(payload: Optional[dict] = None):
        name = _valid_name(payload) if payload and "name" in payload else None
        return _envelope(_document(projects.create(name)))

    @app.get("/api/projects/{pid}")
    def get_project(pid: str):
        return _envelope(_document(projects.get(pid)))

    @app.put("/api/projects/{pid}")
    def save_project(pid: str, payload: dict):
        return _envelope(_document(projects.save(pid, payload)))

    @app.put("/api/projects/{pid}/name")
    def rename_project(pid: str, payload: dict):
        name = _valid_name(payload)
        return _envelope(_document(projects.rename(pid, name)))

    @app.delete("/api/projects/{pid}")
    def delete_project(pid: str):
        projects.delete(pid)
        return _envelope({})

    # ---- 照片模型 ----------------------------------------------------------------------
    @app.get("/api/projects/{pid}/photo-models")
    def list_photo_models(pid: str):
        return _respond(user_actions.list_photo_models(service(pid)))

    @app.post("/api/projects/{pid}/photo-models")
    async def upload(pid: str, files: list[UploadFile] = File(...), widthMm: Optional[str] = Form(None),  # noqa: N803
                     projectId: Optional[str] = Form(None),  # noqa: N803  已有照片模型的 id（表单字段沿用旧名）
                     facadeSide: Optional[str] = Form(None), name: Optional[str] = Form(None)):  # noqa: N803
        ctx = service(pid)
        if projectId:
            photo_model_or_404(ctx, projectId)
        try:
            width = float(widthMm) if widthMm not in (None, "") else None
        except ValueError:
            raise HTTPException(400, "Width must be a number (millimetres)") from None
        if facadeSide not in (None, "", "front", "back", "left", "right"):
            raise HTTPException(400, "facadeSide must be front, back, left or right")
        if name is not None and (not name.strip() or len(name.strip()) > 120):
            raise HTTPException(400, "Enter a name of 1–120 characters")
        payload = [(await f.read(), f.filename or "photo.jpg") for f in files]
        result = user_actions.upload_photos(ctx, projectId or None, payload, width, facadeSide or None)
        if result.ok and name is not None:
            model = ctx.project(result.result["photoModelId"])
            with model.lock():
                spec = model.load_spec()
                spec.name = name.strip()
                model.save_spec(spec)
        if result.ok and runner is not None:
            runner.start(pid, result.result["photoModelId"])  # 上传后自动开始建模
        return _respond(result)

    @app.get("/api/projects/{pid}/photo-models/{mid}")
    def photo_model_summary(pid: str, mid: str):
        ctx = service(pid)
        photo_model_or_404(ctx, mid)
        result = user_actions.photo_model_summary(ctx, mid)
        result.result["job"] = runner.status(pid, mid) if runner else None
        return _respond(result)

    @app.put("/api/projects/{pid}/photo-models/{mid}/name")
    def rename_photo_model(pid: str, mid: str, payload: dict):
        ctx = service(pid)
        model = photo_model_or_404(ctx, mid)
        name = _valid_name(payload)
        with model.lock():
            spec = model.load_spec()
            spec.name = name
            model.save_spec(spec)
        if ctx.typologies is not None:
            entry = ctx.typologies.for_project(mid)
            if entry is not None:
                ctx.typologies.rename(entry["id"], name)
        return {"ok": True, "result": {"name": name}, "issues": []}

    @app.post("/api/projects/{pid}/photo-models/{mid}/run")
    def run_again(pid: str, mid: str, payload: Optional[dict] = None):
        """只在自动建模失败后由查看页的 Run again 按钮调用。"""
        model = photo_model_or_404(service(pid), mid)
        if runner is None:
            raise HTTPException(409, "Automatic modelling is turned off (FACADE_AUTORUN=0)")
        if payload is not None and "widthMm" in payload:
            value = payload["widthMm"]
            if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0):
                raise HTTPException(400, "Width must be greater than 0 mm")
            with model.lock():
                spec = model.load_spec()
                if value is None:
                    spec.facade.width_mm = None
                    spec.width_skipped = True
                else:
                    apply_width(spec, value, "user")
                    spec.width_skipped = False
                model.save_spec(spec)
        return {"ok": True, "result": {"job": runner.start(pid, mid)}, "issues": []}

    @app.post("/api/projects/{pid}/photo-models/{mid}/publish")
    def publish(pid: str, mid: str):
        """手动发布（通常不需要：建模提交时会自动发布）。"""
        ctx = service(pid)
        model = photo_model_or_404(ctx, mid)
        if ctx.typologies is None:
            raise HTTPException(409, "Publishing is turned off")
        try:
            entry = ctx.typologies.publish(model, ctx.catalog, ctx.defaults)
        except NotPublishable as error:
            return JSONResponse({"ok": False, "result": {"error": str(error)}, "issues": []}, status_code=400)
        return {"ok": True, "result": {"typology": entry}, "issues": []}

    @app.get("/files/{pid}/{mid}/{path:path}")
    def photo_model_file(pid: str, mid: str, path: str):
        return _safe_file(photo_model_or_404(service(pid), mid).root, path)

    # ---- 本项目已发布的 typology -------------------------------------------------------------
    @app.get("/api/projects/{pid}/typologies")
    def list_typologies(pid: str):
        ctx = service(pid)
        rows = ctx.typologies.entries() if ctx.typologies is not None else []
        items = [{**row, "baseUrl": f"/data/projects/{pid}/typologies/{row['id']}/"} for row in rows]
        return {"ok": True, "result": {"typologies": items}, "issues": []}

    @app.delete("/api/projects/{pid}/typologies/{mid}")
    def delete_typology(pid: str, mid: str):
        ctx = service(pid)
        typology_or_404(ctx, mid)
        ctx.typologies.delete(mid)
        return {"ok": True, "result": {}, "issues": []}

    @app.put("/api/projects/{pid}/typologies/{mid}/preview")
    async def save_preview(pid: str, mid: str, request: Request):
        """house-viewer 第一次打开一个照片 typology 时，把渲染好的缩略图（PNG 正文）交给服务保存。"""
        ctx = service(pid)
        typology_or_404(ctx, mid)
        try:
            entry = ctx.typologies.set_preview(mid, await request.body())
        except ValueError as error:
            raise HTTPException(400, str(error)) from None
        return {"ok": True, "result": {"typology": entry}, "issues": []}

    @app.get("/data/projects/{pid}/typologies/{mid}/{path:path}")
    def typology_file(pid: str, mid: str, path: str):
        ctx = service(pid)
        typology_or_404(ctx, mid)
        return _safe_file(ctx.typologies.directory(mid), path)

    if viewer_dist is not None and viewer_dist.is_dir():
        app.mount("/", StaticFiles(directory=viewer_dist, html=True), name="viewer")
    return app


def _safe_file(root: Path, path: str) -> FileResponse:
    root = root.resolve()
    target = (root / path).resolve()
    if root not in target.parents or target.name in HIDDEN or not target.is_file():
        raise HTTPException(404, "File not found")
    return FileResponse(target, headers={"Cache-Control": "no-cache"})


def main() -> None:
    port = int(os.environ.get("FACADE_HTTP_PORT", "8765"))
    app_ctx = AppContext.from_env()
    runner = JobRunner(app_ctx.service) if os.environ.get("FACADE_AUTORUN", "1") != "0" else None
    uvicorn.run(create_app(app_ctx, runner=runner), host="127.0.0.1", port=port)


if __name__ == "__main__":
    main()
