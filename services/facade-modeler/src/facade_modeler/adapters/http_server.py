"""HTTP 适配：给 house-viewer 使用（照片录入页 + typology 列表）。

用户的写操作只有上传照片（可附宽度）和失败后重跑；建模提交后自动发布为 typology。
上传成功后自动启动建模任务（jobs/runner.py）；设置 FACADE_AUTORUN=0 可关闭。

接口：
  /api/projects…              照片录入项目（data/intake）
  /files/<project>/<path>     录入项目里的文件（照片、矫正图、build）
  /api/typologies             已发布 typology 的目录表（data/typologies/index.json）
  /data/typologies/<id>/<path> 已发布 typology 的文件

开发时由仓库根目录的 npm run dev 启动；如果 house-viewer/dist 存在（npm run build 之后），
同一端口也直接提供页面（npm start）。
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from facade_modeler.jobs.runner import JobRunner
from facade_modeler.paths import REPO_ROOT
from facade_modeler.service import user_actions
from facade_modeler.service.context import ServiceContext
from facade_modeler.service.results import Result
from facade_modeler.typologies.store import NotPublishable

VIEWER_DIST = REPO_ROOT / "dist"
HIDDEN = {".lock", "ops.jsonl"}


def _respond(result: Result) -> JSONResponse:
    return JSONResponse(result.to_dict(), status_code=200 if result.ok else 400)


def create_app(ctx: ServiceContext, viewer_dist: Optional[Path] = VIEWER_DIST, runner: Optional[Any] = None) -> FastAPI:
    """runner：自动建模任务（JobRunner）；为 None 时上传后不自动建模。"""
    app = FastAPI(title="Facade Modeler")

    def project_or_404(project_id: str):
        try:
            return ctx.project(project_id)
        except KeyError:
            raise HTTPException(404, f"Project {project_id} does not exist") from None

    @app.get("/api/projects")
    def list_projects():
        return _respond(user_actions.list_projects(ctx))

    @app.get("/api/projects/{project_id}")
    def project_summary(project_id: str):
        project_or_404(project_id)
        result = user_actions.project_summary(ctx, project_id)
        result.result["job"] = runner.status(project_id) if runner else None
        return _respond(result)

    @app.post("/api/projects/{project_id}/run")
    def run_again(project_id: str):
        """只在自动建模失败后由查看页的 Run again 按钮调用。"""
        project_or_404(project_id)
        if runner is None:
            raise HTTPException(409, "Automatic modelling is turned off (FACADE_AUTORUN=0)")
        return {"ok": True, "result": {"job": runner.start(project_id)}, "issues": []}

    @app.post("/api/uploads")
    async def upload(files: list[UploadFile] = File(...), widthMm: Optional[str] = Form(None),  # noqa: N803
                     projectId: Optional[str] = Form(None),  # noqa: N803
                     facadeSide: Optional[str] = Form(None)):  # noqa: N803
        if projectId:
            project_or_404(projectId)
        try:
            width = float(widthMm) if widthMm not in (None, "") else None
        except ValueError:
            raise HTTPException(400, "Width must be a number (millimetres)") from None
        if facadeSide not in (None, "", "front", "back"):
            raise HTTPException(400, "facadeSide must be front or back")
        payload = [(await f.read(), f.filename or "photo.jpg") for f in files]
        result = user_actions.upload_photos(ctx, projectId or None, payload, width, facadeSide or None)
        if result.ok and runner is not None:
            runner.start(result.result["projectId"])  # 上传后自动开始建模
        return _respond(result)

    @app.post("/api/projects/{project_id}/publish")
    def publish(project_id: str):
        """手动发布（通常不需要：建模提交时会自动发布）。"""
        project = project_or_404(project_id)
        if ctx.typologies is None:
            raise HTTPException(409, "Publishing is turned off")
        try:
            entry = ctx.typologies.publish(project, ctx.catalog, ctx.defaults)
        except NotPublishable as error:
            return JSONResponse({"ok": False, "result": {"error": str(error)}, "issues": []}, status_code=400)
        return {"ok": True, "result": {"typology": entry}, "issues": []}

    @app.get("/api/typologies")
    def list_typologies():
        rows = ctx.typologies.entries() if ctx.typologies is not None else []
        items = [{**row, "baseUrl": f"/data/typologies/{row['id']}/"} for row in rows]
        return {"ok": True, "result": {"typologies": items}, "issues": []}

    @app.put("/api/typologies/{typology_id}/preview")
    async def save_preview(typology_id: str, request: Request):
        """house-viewer 第一次打开一个照片 typology 时，把渲染好的缩略图（PNG 正文）交给服务保存。"""
        if ctx.typologies is None or ctx.typologies.get(typology_id) is None:
            raise HTTPException(404, "Typology not found")
        try:
            entry = ctx.typologies.set_preview(typology_id, await request.body())
        except ValueError as error:
            raise HTTPException(400, str(error)) from None
        return {"ok": True, "result": {"typology": entry}, "issues": []}

    @app.get("/data/typologies/{typology_id}/{path:path}")
    def typology_file(typology_id: str, path: str):
        if ctx.typologies is None or ctx.typologies.get(typology_id) is None:
            raise HTTPException(404, "Typology not found")
        return _safe_file(ctx.typologies.directory(typology_id), path)

    @app.get("/files/{project_id}/{path:path}")
    def project_file(project_id: str, path: str):
        return _safe_file(project_or_404(project_id).root, path)

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
    ctx = ServiceContext.from_env()
    runner = JobRunner(ctx.store) if os.environ.get("FACADE_AUTORUN", "1") != "0" else None
    uvicorn.run(create_app(ctx, runner=runner), host="127.0.0.1", port=port)


if __name__ == "__main__":
    main()
