"""照片矫正：用合成照片检验高宽比恢复精度。"""
import pytest

from facade_modeler.photos.rectify import RectifyError, VerticalRef, rectify
from synthetic import synthetic_photo

TRUE_ASPECT = 4000 / 8000  # 高 / 宽


def test_rectify_recovers_aspect():
    photo, corners = synthetic_photo(yaw_deg=30, focal_px=1400)
    result = rectify(photo, corners, focal_px=1400)
    assert result.method == "perspective"
    assert result.aspect == pytest.approx(TRUE_ASPECT, rel=0.02)


def test_rectify_estimates_focal_without_exif():
    photo, corners = synthetic_photo(yaw_deg=30, pitch_deg=8, focal_px=1400)
    result = rectify(photo, corners)
    assert result.aspect == pytest.approx(TRUE_ASPECT, rel=0.04)


def test_near_frontal_uses_affine():
    photo, corners = synthetic_photo(yaw_deg=0, pitch_deg=0)
    result = rectify(photo, corners)
    assert result.method == "affine"
    assert result.aspect == pytest.approx(TRUE_ASPECT, rel=0.02)


def test_vertical_reference_overrides_aspect():
    photo, corners = synthetic_photo(yaw_deg=30, focal_px=1400)
    # 参照物：整面墙本身（8000 × 4000），故意把焦距给错
    ref = VerticalRef(corners_px=corners, height_mm=4000, width_mm=8000)
    result = rectify(photo, corners, focal_px=500, vertical_ref=ref)
    assert result.method == "reference"
    assert result.aspect == pytest.approx(TRUE_ASPECT, rel=0.01)


def test_rectified_image_layout():
    photo, corners = synthetic_photo()
    result = rectify(photo, corners, focal_px=1400, out_width=2000)
    assert result.image.shape[1] == 2000
    ox, oy = result.origin_px
    assert result.px_per_width == pytest.approx(2000 / 1.2)
    assert ox == pytest.approx(0.1 * result.px_per_width)
    assert oy - result.aspect * result.px_per_width > 0  # 檐口以上留有空间（看屋顶）


@pytest.mark.parametrize("corners", [
    [(0, 100), (100, 100), (200, 100), (0, 0)],      # 三点共线
    [(0, 100), (100, 0), (100, 100), (0, 0)],         # 顺序交叉
])
def test_rectify_rejects_degenerate_corners(corners):
    photo, _ = synthetic_photo()
    with pytest.raises(RectifyError):
        rectify(photo, corners)


def test_rectify_rejects_mirrored_corners():
    """左右对调（右下、左下、左上、右上）会把整个立面镜像，必须拒绝（review I-2）。"""
    photo, (bl, br, tr, tl) = synthetic_photo()
    with pytest.raises(RectifyError):
        rectify(photo, [br, bl, tl, tr])


@pytest.mark.parametrize("yaw", [30, 45])
def test_level_camera_without_exif_assumes_focal(yaw):
    """相机水平（竖边平行）且没有 EXIF 焦距时，按典型手机焦距估计，而不是退化为 affine（review I-8）。"""
    photo, corners = synthetic_photo(yaw_deg=yaw, pitch_deg=0, focal_px=1300)
    result = rectify(photo, corners)
    assert result.method == "perspective"
    assert result.aspect == pytest.approx(TRUE_ASPECT, rel=0.06)
    assert "focal length" in result.note
