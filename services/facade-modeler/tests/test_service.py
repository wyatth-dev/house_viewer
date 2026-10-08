"""service 层：用户操作、LM 感知操作、LM 建模操作。"""
import cv2
import pytest

from facade_modeler.assets.catalog import Catalog
from facade_modeler.config import load_defaults
from facade_modeler.project.store import ProjectStore
from facade_modeler.service import modeling, perception, user_actions
from facade_modeler.service.context import ServiceContext
from synthetic import synthetic_photo


@pytest.fixture
def ctx(tmp_path):
    return ServiceContext(ProjectStore(tmp_path), Catalog.load(), load_defaults())


def upload(ctx, width_mm=8000.0):
    photo, corners = synthetic_photo(8000, 4000, yaw_deg=25, focal_px=1400)
    ok, encoded = cv2.imencode(".png", photo)
    result = user_actions.upload_photos(ctx, None, [(encoded.tobytes(), "back.png")], width_mm)
    assert result.ok
    return result.result["projectId"], corners


def window_box(rect, u0, u1, v0, v1, width=8000.0):
    """立面毫米 → 矫正图像素框。"""
    (ox, oy), scale = rect["originPx"], rect["pxPerWidth"] / width
    return [ox + u0 * scale, oy - v1 * scale, ox + u1 * scale, oy - v0 * scale]


def test_full_flow_on_synthetic_photo(ctx):
    pid, corners = upload(ctx)
    rect = perception.rectify_photo(ctx, pid, "p1", corners_px=corners)
    assert rect.ok and rect.images
    m = perception.measure(ctx, pid, "p1", box_px=window_box(rect.result, 2000, 3200, 1000, 2200))
    assert m.result["mm"]["u0"] == pytest.approx(2000, rel=0.03)
    added = modeling.add_opening(ctx, pid, asset="win/casement", measurement=m.result["id"])
    assert added.ok, added.result
    opening = added.result["opening"]
    assert opening["widthMm"] == pytest.approx(1200, rel=0.05)
    assert modeling.set_roof(ctx, pid, type="gable", ridge="perpendicular", eave_height_mm=4000, pitch_deg=35).ok
    built = modeling.build(ctx, pid)
    assert built.ok and built.result["version"] == 1
    preview = perception.render_preview(ctx, pid, kind="overlay")
    assert preview.ok and len(preview.images) == 1
    assert perception.get_context(ctx, pid).result["latestBuild"] == 1


def test_estimate_width_rejected_when_user_width(ctx):
    pid, _ = upload(ctx, width_mm=8000)
    result = modeling.estimate_width(ctx, pid, width_mm=9000, basis="门高 2100")
    assert not result.ok
    assert ctx.store.open(pid).load_spec().facade.width_mm == 8000


def test_measure_without_width_returns_normalized_only(ctx):
    pid, corners = upload(ctx, width_mm=None)
    rect = perception.rectify_photo(ctx, pid, "p1", corners_px=corners)
    m = perception.measure(ctx, pid, "p1", box_px=window_box(rect.result, 2000, 3200, 1000, 2200))
    assert m.ok and m.result["mm"] is None
    assert "estimate_width" in m.result["hint"]


def test_width_change_rescales_measured_openings(ctx):
    pid, corners = upload(ctx, width_mm=None)
    rect = perception.rectify_photo(ctx, pid, "p1", corners_px=corners)
    m = perception.measure(ctx, pid, "p1", box_px=window_box(rect.result, 2000, 3200, 1000, 2200))
    assert modeling.estimate_width(ctx, pid, width_mm=8000, basis="测试").ok
    first = modeling.add_opening(ctx, pid, asset="win/casement", measurement=m.result["id"]).result["opening"]
    assert modeling.estimate_width(ctx, pid, width_mm=10000, basis="测试").ok
    spec = ctx.store.open(pid).load_spec()
    assert spec.facade.openings[0].u_mm == pytest.approx(first["uMm"] * 1.25)
    assert spec.provenance["facade.widthMm"].source == "photo-estimate"


def test_invalid_asset_rejected_without_write(ctx):
    pid, _ = upload(ctx)
    ops = ctx.store.open(pid).root / "ops.jsonl"
    before = ops.read_text() if ops.exists() else ""
    result = modeling.add_opening(ctx, pid, asset="win/nope", u_mm=1000, sill_mm=900, width_mm=800, height_mm=800)
    assert not result.ok
    assert (ops.read_text() if ops.exists() else "") == before
    assert ctx.store.open(pid).load_spec().facade.openings == []


def test_rectify_rejects_degenerate_corners(ctx):
    pid, _ = upload(ctx)
    result = perception.rectify_photo(ctx, pid, "p1", corners_px=[(0, 100), (100, 100), (200, 100), (0, 0)])
    assert not result.ok
    assert ctx.store.open(pid).load_spec().photos["p1"].rectification is None


def test_upload_without_width_marks_skipped(ctx):
    pid, _ = upload(ctx, width_mm=None)
    summary = user_actions.project_summary(ctx, pid).result
    assert summary["width"] == {"widthMm": None, "source": None, "skipped": True}


def test_view_photo_returns_grid_image(ctx):
    pid, _ = upload(ctx)
    result = perception.view_photo(ctx, pid, "p1")
    assert result.ok and result.result["sizePx"] == [1600, 1200]
    assert result.images[0].size[0] <= 1600


def test_submit_sets_status(ctx):
    pid, _ = upload(ctx)
    assert modeling.submit(ctx, pid, note="完成第一版").ok
    assert user_actions.project_summary(ctx, pid).result["status"] == {"state": "submitted", "note": "完成第一版"}


@pytest.mark.parametrize("value", [float("inf"), float("nan")])
def test_nonfinite_number_rejected_and_project_survives(ctx, value):
    """inf / NaN 不能写进 spec.json，否则项目永久损坏（review I-4）。"""
    pid, _ = upload(ctx)
    result = modeling.add_opening(ctx, pid, asset="win/casement", u_mm=value, sill_mm=900, width_mm=800,
                                  height_mm=800)
    assert not result.ok
    assert perception.get_context(ctx, pid).ok
    assert ctx.store.open(pid).load_spec().facade.openings == []


def measured_opening(ctx, width_mm=8000.0):
    """上传 → 矫正 → 测量 → 由测量加一个窗。返回 (项目, 角点, 测量结果, 洞口)。"""
    pid, corners = upload(ctx, width_mm=width_mm)
    rect = perception.rectify_photo(ctx, pid, "p1", corners_px=corners)
    m = perception.measure(ctx, pid, "p1", box_px=window_box(rect.result, 2000, 3200, 1000, 2200))
    if width_mm is None:
        assert modeling.estimate_width(ctx, pid, width_mm=8000, basis="测试").ok
    opening = modeling.add_opening(ctx, pid, asset="win/casement", measurement=m.result["id"]).result["opening"]
    return pid, corners, m.result, opening


def test_rerectify_updates_openings_from_measurements(ctx):
    """重新矫正后，引用测量的洞口应随测量更新（review I-5）。"""
    pid, corners, _, before = measured_opening(ctx)
    shifted = [corners[0], corners[1], [corners[2][0], corners[2][1] - 40], [corners[3][0], corners[3][1] - 40]]
    result = perception.rectify_photo(ctx, pid, "p1", corners_px=shifted)
    assert result.result["updatedOpenings"] == ["o1"]
    spec = ctx.store.open(pid).load_spec()
    box = spec.measurements["m1"].normalized
    opening = spec.facade.openings[0]
    assert opening.height_mm == pytest.approx((box["v1"] - box["v0"]) * 8000)
    assert opening.height_mm != pytest.approx(before["heightMm"], rel=1e-3)


def test_manual_override_survives_width_change(ctx):
    """LM 手动微调的值在宽度变化后保留（review I-6）。"""
    pid, _, _, before = measured_opening(ctx, width_mm=None)
    assert modeling.update_opening(ctx, pid, "o1", sill_mm=950).ok
    assert modeling.estimate_width(ctx, pid, width_mm=8800, basis="测试").ok
    opening = ctx.store.open(pid).load_spec().facade.openings[0]
    assert opening.sill_mm == 950
    assert opening.u_mm == pytest.approx(before["uMm"] * 1.1)


def test_same_width_reupload_keeps_openings(ctx):
    pid, _, _, _ = measured_opening(ctx)
    assert modeling.update_opening(ctx, pid, "o1", sill_mm=950).ok
    photo, _ = synthetic_photo(8000, 4000)
    assert user_actions.upload_photos(ctx, pid, [(cv2.imencode(".png", photo)[1].tobytes(), "x.png")], 8000).ok
    assert ctx.store.open(pid).load_spec().facade.openings[0].sill_mm == 950


def test_rectify_marks_photo_primary(ctx):
    """LM 在哪张照片上矫正，哪张就是主照片，叠加预览随之切换（review I-7）。"""
    pid, corners = upload(ctx)
    photo, _ = synthetic_photo(8000, 4000, yaw_deg=25, focal_px=1400)
    user_actions.upload_photos(ctx, pid, [(cv2.imencode(".png", photo)[1].tobytes(), "b.png")], None)
    assert perception.rectify_photo(ctx, pid, "p2", corners_px=corners).ok
    spec = ctx.store.open(pid).load_spec()
    assert spec.photos["p2"].primary and not spec.photos["p1"].primary
    assert modeling.set_roof(ctx, pid, eave_height_mm=4000).ok
    preview = perception.render_preview(ctx, pid, kind="overlay")
    assert preview.ok and preview.result["photoId"] == "p2"


def test_summary_reports_last_step(ctx):
    pid, corners = upload(ctx)
    assert user_actions.project_summary(ctx, pid).result["lastStep"] is None
    perception.rectify_photo(ctx, pid, "p1", corners_px=corners)
    assert user_actions.project_summary(ctx, pid).result["lastStep"]["tool"] == "rectify_photo"
