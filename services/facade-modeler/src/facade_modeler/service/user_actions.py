"""用户操作（查看页 → HTTP）。用户唯一的手动操作是上传照片（可附宽度）。"""
from __future__ import annotations

import json
import math
from typing import Optional

from facade_modeler.photos.normalize import normalize_photo
from facade_modeler.service.context import ServiceContext
from facade_modeler.service.results import Result, fail, ok
from facade_modeler.service.summary import width_state
from facade_modeler.service.width import apply_width
from facade_modeler.spec.model import HouseSpec, ProvenanceEntry
from facade_modeler.spec.validate import validate


def upload_photos(ctx: ServiceContext, project_id: Optional[str], files: list[tuple[bytes, str]],
                  width_mm: Optional[float], facade_side: Optional[str] = None) -> Result:
    """project_id 为 None 时新建项目；width_mm 为 None 时视为跳过（已有宽度则保留）。
    facade_side：照片拍的是 front、back、left 或 right；None 时保留原值（新项目默认 back）。"""
    if not files:
        return fail("Upload at least one photo")
    if width_mm is not None and not (math.isfinite(width_mm) and width_mm > 0):
        return fail("Width must be a number of millimetres greater than 0")
    try:  # 先全部解码成功，再新建项目，避免留下空项目
        photos = [normalize_photo(data) for data, _ in files]
    except ValueError as error:
        return fail(str(error))
    project = ctx.store.create() if project_id is None else ctx.project(project_id)
    with project.lock():
        previous = project.load_spec()
        if facade_side is not None and previous.facade.side != facade_side:
            project.save_spec(previous)
            stored = previous.facade_inputs.get(facade_side)
            if stored is None:
                blank = HouseSpec.new(project.id, ctx.defaults)
                previous.facade = blank.facade
                previous.facade.side = facade_side
                previous.photos = {}
                previous.measurements = {}
                previous.provenance = {}
                previous.width_skipped = True
            else:
                previous.facade = stored.facade.model_copy(deep=True)
                previous.photos = {key: value.model_copy(deep=True) for key, value in stored.photos.items()}
                previous.measurements = {key: value.model_copy(deep=True) for key, value in stored.measurements.items()}
                previous.provenance = {key: value.model_copy(deep=True) for key, value in stored.provenance.items()}
                previous.width_skipped = stored.width_skipped
            project.save_spec(previous)
            project.set_status("draft")
    photo_ids = [project.add_photo(data, "photo.jpg") for data in photos]
    with project.lock():
        spec = project.load_spec()
        if width_mm is not None:
            if width_mm != spec.facade.width_mm:
                apply_width(spec, width_mm, "user")
            else:  # 宽度没变：只把来源记为用户输入，不重算洞口（review I-6）
                spec.provenance = {**spec.provenance, "facade.widthMm": ProvenanceEntry(source="user")}
            spec.width_skipped = False
        elif spec.facade.width_mm is None:
            spec.width_skipped = True
        if facade_side is not None:
            spec.facade.side = facade_side
        project.save_spec(spec)
    return ok({"projectId": project.id, "photoIds": photo_ids})


def list_projects(ctx: ServiceContext) -> Result:
    return ok({"projects": ctx.store.list()})


def project_summary(ctx: ServiceContext, project_id: str) -> Result:
    project = ctx.project(project_id)
    spec = project.load_spec()
    photos = [{"id": pid, "file": p.file, "primary": p.primary,
               "rectified": p.rectification.file if p.rectification else None} for pid, p in spec.photos.items()]
    latest = project.latest_build()
    return ok({
        "lastStep": _last_step(project),
        "id": project.id,
        "name": spec.name or ((ctx.typologies.for_project(project.id) or {}).get("name") if ctx.typologies else None) or project.id,
        "facadeSide": spec.facade.side,
        "photos": photos,
        "wallWidths": {side: saved.facade.width_mm for side, saved in spec.facade_inputs.items()},
        "facadePhotos": {
            side: [{"id": pid, "file": photo.file, "primary": photo.primary,
                    "rectified": photo.rectification.file if photo.rectification else None}
                   for pid, photo in saved.photos.items()]
            for side, saved in spec.facade_inputs.items()
        },
        "width": width_state(spec),
        "latestBuild": latest,
        "buildDir": f"builds/v{latest}" if latest else None,
        "status": project.get_status(),
        "issues": [issue.to_dict() for issue in validate(spec, ctx.catalog)],
        "typology": ctx.typologies.for_project(project.id) if ctx.typologies is not None else None,
    })


def _last_step(project) -> dict | None:
    """操作日志的最后一条（工具名与时间），查看页用来显示"正在做什么"。"""
    path = project.root / "ops.jsonl"
    if not path.exists():
        return None
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines:
        return None
    entry = json.loads(lines[-1])
    return {"tool": entry["tool"], "time": entry["time"]}
