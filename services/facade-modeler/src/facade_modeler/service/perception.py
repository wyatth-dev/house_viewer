"""LM 感知操作：观察照片与模型，不改动几何。

rectify_photo 与 measure 会把矫正参数、测量结果写入 HouseSpec（建模操作要引用它们），
并记入操作日志以便回放。
"""
from __future__ import annotations

from typing import Optional, Sequence

import cv2
import numpy as np
from PIL import Image, ImageDraw

from facade_modeler.photos.measure import normalize, read_focal_px, to_mm
from facade_modeler.photos.rectify import RectifyError, VerticalRef, rectify
from facade_modeler.preview.draw import OPENING, fit, grid, nice_step
from facade_modeler.preview.elevation import render_elevation
from facade_modeler.preview.overlay import render_overlay
from facade_modeler.service.context import ServiceContext
from facade_modeler.service.results import Result, fail, ok
from facade_modeler.service.summary import spec_summary, width_state
from facade_modeler.service.width import refresh_from_measurements
from facade_modeler.spec.model import Measurement, Rectification
from facade_modeler.spec.validate import validate


def get_context(ctx: ServiceContext, project_id: str) -> Result:
    project = ctx.project(project_id)
    spec = project.load_spec()
    return ok({
        "projectId": project_id,
        "width": width_state(spec),
        "photos": [{"id": pid, "primary": p.primary, "rectified": p.rectification is not None}
                   for pid, p in spec.photos.items()],
        "spec": spec_summary(spec),
        "latestBuild": project.latest_build(),
        "status": project.get_status(),
    }, issues=validate(spec, ctx.catalog))


def view_photo(ctx: ServiceContext, project_id: str, photo_id: str, grid_lines: bool = True,
               rectified: bool = False) -> Result:
    """查看原图或矫正图；网格标注的是该图的像素坐标（rectify / measure 使用的坐标）。"""
    project = ctx.project(project_id)
    spec = project.load_spec()
    if photo_id not in spec.photos:
        return fail(f"Photo {photo_id} does not exist")
    if rectified and spec.photos[photo_id].rectification is None:
        return fail("This photo has not been rectified yet; call rectify_photo first")
    path = project.rectified_path(photo_id) if rectified else project.photo_path(photo_id)
    image = Image.open(path).convert("RGB")
    size = list(image.size)
    shown, scale = fit(image)
    if grid_lines:
        shown = grid(shown, scale, nice_step(max(size)))
    return ok({"photoId": photo_id, "rectified": rectified, "sizePx": size}, images=[shown])


def rectify_photo(ctx: ServiceContext, project_id: str, photo_id: str, corners_px: Sequence[Sequence[float]],
                  vertical_ref: Optional[dict] = None) -> Result:
    """corners_px：立面墙体四角（左下、右下、右上、左上，取檐口高度），原图像素。"""
    project = ctx.project(project_id)
    with project.lock():
        spec = project.load_spec()
        if photo_id not in spec.photos:
            return fail(f"Photo {photo_id} does not exist")
        path = project.photo_path(photo_id)
        image = cv2.imread(str(path))
        if image is None:
            return fail(f"Cannot read photo {photo_id}")
        reference = VerticalRef(**vertical_ref) if vertical_ref else None
        try:
            result = rectify(image, [tuple(p) for p in corners_px], read_focal_px(path), reference,
                             ctx.defaults.rectified_width_px)
        except RectifyError as error:
            return fail(str(error))
        old = spec.photos[photo_id].rectification
        out_path = project.rectified_path(photo_id)
        cv2.imwrite(str(out_path), result.image)
        rect = Rectification(
            corners_px=[tuple(map(float, p)) for p in corners_px], homography=result.homography.tolist(),
            aspect=result.aspect, method=result.method, size=result.size, origin_px=result.origin_px,
            px_per_width=result.px_per_width, file=str(out_path.relative_to(project.root)))
        spec.photos[photo_id].rectification = rect
        for pid, photo in spec.photos.items():  # 在哪张照片上矫正，哪张就是主照片（review I-7）
            photo.primary = pid == photo_id
        _remap_measurements(spec, photo_id, old, rect)
        updated = refresh_from_measurements(spec, photo_id) if old else []  # review I-5
        project.save_spec(spec)
        project.append_op("rectify_photo", {"photoId": photo_id, "cornersPx": rect.corners_px,
                                            "verticalRef": vertical_ref})
    shown, scale = fit(Image.fromarray(cv2.cvtColor(result.image, cv2.COLOR_BGR2RGB)))
    return ok({"photoId": photo_id, "aspect": result.aspect, "method": result.method, "sizePx": list(result.size),
               "originPx": list(result.origin_px), "pxPerWidth": result.px_per_width, "updatedOpenings": updated,
               "note": result.note,
               "hint": "Use measure on the rectified image for openings, eaves, etc.; coordinates are rectified-image pixels (view_photo rectified=true shows the grid)"},
              images=[grid(shown, scale, nice_step(max(result.size)))])


def measure(ctx: ServiceContext, project_id: str, photo_id: str, box_px: Optional[Sequence[float]] = None,
            point_px: Optional[Sequence[float]] = None, label: str = "") -> Result:
    if (box_px is None) == (point_px is None):
        return fail("Give exactly one of box_px or point_px")
    project = ctx.project(project_id)
    with project.lock():
        spec = project.load_spec()
        photo = spec.photos.get(photo_id)
        if photo is None or photo.rectification is None:
            return fail("Call rectify_photo on this photo first")
        rect = photo.rectification
        px = [float(v) for v in (box_px if box_px is not None else point_px)]
        normalized = normalize(px, rect.origin_px, rect.px_per_width)
        measurement = Measurement(id=spec.next_id("m"), photo=photo_id, kind="box" if box_px else "point",
                                  px=px, normalized=normalized)
        spec.measurements = {**spec.measurements, measurement.id: measurement}
        project.save_spec(spec)
        project.append_op("measure", {"photoId": photo_id, "px": px, "label": label})
    mm = to_mm(normalized, spec.facade.width_mm)
    hint = "Pass this measurement to add_opening / update_opening" if mm else \
        "Width is unknown: only normalized coordinates (in facade widths) are returned. Estimate the width from a reference object and call estimate_width"
    return ok({"id": measurement.id, "label": label, "normalized": normalized, "mm": mm, "hint": hint},
              images=[_measurement_crop(project.root / rect.file, px)])


def search_assets(ctx: ServiceContext, query: str = "", category: Optional[str] = None) -> Result:
    return ok({"assets": [asset.summary() for asset in ctx.catalog.search(query, category)]})


def render_preview(ctx: ServiceContext, project_id: str, kind: str = "overlay") -> Result:
    """kind：elevation（白底正视图）或 overlay（叠加在主照片的矫正图上）。"""
    project = ctx.project(project_id)
    spec = project.load_spec()
    if spec.facade.width_mm is None:
        return fail("Width is unknown, so no preview can be drawn; call estimate_width first")
    if kind == "elevation":
        return ok({"kind": kind}, validate(spec, ctx.catalog), [render_elevation(spec)])
    photo_id, photo = next(((pid, p) for pid, p in spec.photos.items() if p.primary), (None, None))
    if photo is None or photo.rectification is None:
        return fail("The primary photo has not been rectified; use kind='elevation' instead")
    rectified = Image.open(project.root / photo.rectification.file)
    image = render_overlay(spec, photo.rectification, rectified)
    return ok({"kind": kind, "photoId": photo_id,
               "legend": "Red: facade outline; orange: plinth and eave lines; blue: openings (with IDs)"},
              validate(spec, ctx.catalog), [image])


def _remap_measurements(spec, photo_id: str, old: Optional[Rectification], new: Rectification) -> None:
    """重新矫正后，把这张照片上的旧测量换算到新矫正图（旧矫正 → 原图 → 新矫正）。"""
    if old is None:
        return
    to_original = np.linalg.inv(np.array(old.homography))
    to_new = np.array(new.homography) @ to_original
    for measurement in spec.measurements.values():
        if measurement.photo != photo_id:
            continue
        points = np.array(measurement.px, dtype=float).reshape(-1, 1, 2)
        mapped = cv2.perspectiveTransform(points, to_new).reshape(-1).tolist()
        measurement.px = mapped
        measurement.normalized = normalize(mapped, new.origin_px, new.px_per_width)


def _measurement_crop(path, px: list[float]) -> Image.Image:
    """返回测量位置附近的裁剪图，标出测量框 / 点，便于 LM 确认量对了地方。"""
    image = Image.open(path).convert("RGB")
    draw = ImageDraw.Draw(image)
    if len(px) == 4:
        draw.rectangle(px, outline=OPENING, width=3)
        x0, y0, x1, y1 = px
    else:
        x0, y0 = x1, y1 = px
        draw.ellipse((x0 - 8, y0 - 8, x0 + 8, y0 + 8), outline=OPENING, width=3)
    pad = max(150, (x1 - x0), (y1 - y0))
    crop = image.crop((max(0, x0 - pad), max(0, y0 - pad), min(image.width, x1 + pad), min(image.height, y1 + pad)))
    return fit(crop, 800)[0]
