"""立面轮廓由屋顶推导（spec 5.2 表格）。"""
import math

import pytest

from facade_modeler.build.outline import facade_outline, ridge_height
from helpers import make_spec


def test_gable_parallel_is_rectangle():
    spec = make_spec(width=11300, eave=5200)
    assert facade_outline(spec) == [(0, 0), (11300, 0), (11300, 5200), (0, 5200)]


def test_gable_perpendicular_has_apex():
    spec = make_spec(width=6000, ridge="perpendicular", eave=3000, pitch=45)
    outline = facade_outline(spec)
    assert len(outline) == 5
    assert outline[3] == pytest.approx((3000, 6000))
    assert ridge_height(spec) == pytest.approx(6000)


def test_mono_perpendicular_is_trapezoid():
    spec = make_spec(width=4000, roof_type="mono", ridge="perpendicular", eave=2500, pitch=30)
    left_low, right_high = 2500, 2500 + 4000 * math.tan(math.radians(30))
    assert facade_outline(spec) == pytest.approx([(0, 0), (4000, 0), (4000, right_high), (0, left_low)])


@pytest.mark.parametrize("roof_type", ["hip", "flat"])
@pytest.mark.parametrize("ridge", ["parallel", "perpendicular"])
def test_hip_and_flat_are_rectangles(roof_type, ridge):
    spec = make_spec(width=5000, roof_type=roof_type, ridge=ridge, eave=2800)
    assert facade_outline(spec) == [(0, 0), (5000, 0), (5000, 2800), (0, 2800)]


def test_gable_parallel_ridge_uses_depth():
    spec = make_spec(width=11300, eave=5200, pitch=math.degrees(math.atan(0.85)), depth=6800)
    assert ridge_height(spec) == pytest.approx(8090)


def test_flat_ridge_is_eave():
    assert ridge_height(make_spec(roof_type="flat", eave=2800)) == 2800
