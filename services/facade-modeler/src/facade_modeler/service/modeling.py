"""LM 建模操作：修改 HouseSpec 并写入操作日志。

每个操作：校验参数（非法则拒绝、不写入）→ 修改 → 保存 → 记日志 → 返回当前问题清单。
任何修改都会把项目状态重置为 draft。
"""
from __future__ import annotations

from typing import Any, Callable, Optional

from pydantic import ValidationError

from facade_modeler.build.pipeline import run_build
from facade_modeler.service.context import ServiceContext
from facade_modeler.service.results import Result, fail, ok
from facade_modeler.service.width import apply_width, box_to_opening
from facade_modeler.spec.model import HouseSpec, MaterialSlot, Opening
from facade_modeler.spec.validate import validate
from facade_modeler.typologies.store import NotPublishable

ROOF_FIELDS = {"type", "ridge", "eave_height_mm", "pitch_deg", "overhang_mm"}


class Rejected(Exception):
    """参数非法：整个操作不写入。"""


def _modify(ctx: ServiceContext, project_id: str, tool: str, args: dict,
            change: Callable[[HouseSpec], dict]) -> Result:
    project = ctx.project(project_id)
    with project.lock():
        spec = project.load_spec()
        try:
            extra = change(spec) or {}
            spec = HouseSpec.model_validate(spec.model_dump())  # 整体再校验一次
        except (Rejected, ValidationError, ValueError) as error:
            return fail(str(error))
        project.save_spec(spec)
        project.append_op(tool, args)
        project.set_status("draft")
    issues = extra.pop("issues", []) + validate(spec, ctx.catalog)
    return ok(extra, issues)


def estimate_width(ctx: ServiceContext, project_id: str, width_mm: float, basis: str) -> Result:
    def change(spec: HouseSpec):
        entry = spec.provenance.get("facade.widthMm")
        if entry and entry.source == "user":
            raise Rejected("The user has supplied the width; it cannot be overridden")
        if width_mm <= 0:
            raise Rejected("Width must be greater than 0")
        return {"widthMm": width_mm, "issues": apply_width(spec, width_mm, "photo-estimate", basis)}
    return _modify(ctx, project_id, "estimate_width", {"widthMm": width_mm, "basis": basis}, change)


def set_roof(ctx: ServiceContext, project_id: str, material: Optional[str] = None, **fields: Any) -> Result:
    def change(spec: HouseSpec):
        unknown = set(fields) - ROOF_FIELDS
        if unknown:
            raise Rejected(f"Unknown fields: {sorted(unknown)}")
        data = spec.roof.model_dump()
        data.update({k: v for k, v in fields.items() if v is not None})
        if material is not None:
            _require_material(ctx, material)
            data["material"] = {"asset": material}
        spec.roof = type(spec.roof).model_validate(data)
        return {"roof": spec.roof.model_dump(by_alias=True)}
    return _modify(ctx, project_id, "set_roof", {**fields, "material": material}, change)


def set_materials(ctx: ServiceContext, project_id: str, plinth: Optional[str] = None, wall: Optional[str] = None,
                  gable: Optional[str] = None, plinth_height_mm: Optional[float] = None) -> Result:
    def change(spec: HouseSpec):
        materials = dict(spec.facade.materials)
        for role, asset in (("plinth", plinth), ("wall", wall), ("gable", gable)):
            if asset is not None:
                _require_material(ctx, asset)
                materials[role] = MaterialSlot(asset=asset, height_mm=materials[role].height_mm)
        if plinth_height_mm is not None:
            if plinth_height_mm < 0:
                raise Rejected("Plinth height cannot be negative")
            materials["plinth"] = MaterialSlot(asset=materials["plinth"].asset, height_mm=plinth_height_mm)
        spec.facade.materials = materials
        return {"materials": {k: v.model_dump(by_alias=True) for k, v in materials.items()}}
    args = {"plinth": plinth, "wall": wall, "gable": gable, "plinthHeightMm": plinth_height_mm}
    return _modify(ctx, project_id, "set_materials", args, change)


def add_opening(ctx: ServiceContext, project_id: str, asset: str, measurement: Optional[str] = None,
                u_mm: Optional[float] = None, sill_mm: Optional[float] = None, width_mm: Optional[float] = None,
                height_mm: Optional[float] = None, params: Optional[dict] = None) -> Result:
    def change(spec: HouseSpec):
        opening = Opening(id="new", asset=asset, u_mm=0, sill_mm=0, width_mm=1, height_mm=1, params=params or {})
        _apply_opening_fields(ctx, spec, opening, measurement, u_mm, sill_mm, width_mm, height_mm, require_all=True)
        opening.id = spec.next_id("o")
        spec.facade.openings = [*spec.facade.openings, opening]
        return {"opening": opening.model_dump(by_alias=True)}
    args = {"asset": asset, "measurement": measurement, "uMm": u_mm, "sillMm": sill_mm, "widthMm": width_mm,
            "heightMm": height_mm, "params": params}
    return _modify(ctx, project_id, "add_opening", args, change)


def update_opening(ctx: ServiceContext, project_id: str, opening_id: str, asset: Optional[str] = None,
                   measurement: Optional[str] = None, u_mm: Optional[float] = None, sill_mm: Optional[float] = None,
                   width_mm: Optional[float] = None, height_mm: Optional[float] = None,
                   params: Optional[dict] = None) -> Result:
    def change(spec: HouseSpec):
        try:
            opening = spec.opening(opening_id)
        except KeyError:
            raise Rejected(f"Opening {opening_id} does not exist") from None
        if asset is not None:
            opening.asset = asset
        if params is not None:
            opening.params = params
        _apply_opening_fields(ctx, spec, opening, measurement, u_mm, sill_mm, width_mm, height_mm, require_all=False)
        return {"opening": opening.model_dump(by_alias=True)}
    args = {"openingId": opening_id, "asset": asset, "measurement": measurement, "uMm": u_mm, "sillMm": sill_mm,
            "widthMm": width_mm, "heightMm": height_mm, "params": params}
    return _modify(ctx, project_id, "update_opening", args, change)


def remove_opening(ctx: ServiceContext, project_id: str, opening_id: str) -> Result:
    def change(spec: HouseSpec):
        if opening_id not in {o.id for o in spec.facade.openings}:
            raise Rejected(f"Opening {opening_id} does not exist")
        spec.facade.openings = [o for o in spec.facade.openings if o.id != opening_id]
        return {"removed": opening_id}
    return _modify(ctx, project_id, "remove_opening", {"openingId": opening_id}, change)


def build(ctx: ServiceContext, project_id: str) -> Result:
    project = ctx.project(project_id)
    with project.lock():
        result = run_build(project, ctx.catalog, ctx.defaults)
        project.append_op("build", {"version": result.version})
    if result.version is None:
        return fail("Build failed; the previous successful version is unchanged", issues=[i.to_dict() for i in result.issues])
    return ok({"version": result.version, "hint": "Check against the photo with render_preview"}, result.issues)


def submit(ctx: ServiceContext, project_id: str, note: str) -> Result:
    project = ctx.project(project_id)
    with project.lock():
        project.set_status("submitted", note)
        project.append_op("submit", {"note": note})
    result = {"status": "submitted", "latestBuild": project.latest_build()}
    if ctx.typologies is not None and result["latestBuild"] is not None:
        # 提交即发布：最新成功 build 成为 house-viewer 里可选的 typology
        try:
            result["typologyId"] = ctx.typologies.publish(project, ctx.catalog, ctx.defaults)["id"]
        except NotPublishable as error:
            result["publishError"] = str(error)
    return ok(result)


# ---- 辅助 -------------------------------------------------------------------------
def _require_material(ctx: ServiceContext, asset: str) -> None:
    if ctx.catalog.material(asset) is None:
        raise Rejected(f"Material {asset} is not in the asset library; use search_assets(category='material')")


def _apply_opening_fields(ctx, spec: HouseSpec, opening: Opening, measurement, u_mm, sill_mm, width_mm, height_mm,
                          require_all: bool) -> None:
    if ctx.catalog.component(opening.asset) is None:
        raise Rejected(f"Component {opening.asset} is not in the asset library; use search_assets(category='component')")
    if errors := ctx.catalog.param_errors(opening.asset, opening.params):
        raise Rejected("；".join(errors))
    if measurement is not None:
        found = spec.measurements.get(measurement)
        if found is None or found.kind != "box":
            raise Rejected(f"Measurement {measurement} does not exist or is not a box")
        if spec.facade.width_mm is None:
            raise Rejected("Width is unknown, so the measurement cannot be converted; call estimate_width first")
        opening.evidence = {"measurement": measurement}
        box_to_opening(opening, found.normalized, spec.facade.width_mm)
    explicit = {"u_mm": u_mm, "sill_mm": sill_mm, "width_mm": width_mm, "height_mm": height_mm}
    if require_all and measurement is None and any(v is None for v in explicit.values()):
        raise Rejected("Give a measurement, or all of u_mm, sill_mm, width_mm and height_mm")
    given = {name: value for name, value in explicit.items() if value is not None}
    for name, value in given.items():
        setattr(opening, name, value)
    if given and opening.evidence and opening.evidence.get("measurement"):
        # 记下 LM 手动改过的字段，之后宽度变化或重新矫正时保留（review I-6）
        overrides = {**(opening.evidence.get("overrides") or {}), **given}
        opening.evidence = {**opening.evidence, "overrides": overrides}
