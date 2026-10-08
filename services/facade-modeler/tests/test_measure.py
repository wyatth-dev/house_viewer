"""矫正图像素 → 立面坐标。"""
import pytest

from facade_modeler.photos.measure import normalize, to_mm


def test_measure_box_to_mm():
    normalized = normalize([500, 500, 700, 900], origin_px=(0, 1000), px_per_width=2000)
    assert to_mm(normalized, 8000) == pytest.approx({"u0": 2000, "u1": 2800, "v0": 400, "v1": 2000})


def test_measure_point():
    normalized = normalize([1000, 0], origin_px=(0, 1000), px_per_width=2000)
    assert normalized == pytest.approx({"u": 0.5, "v": 0.5})


def test_measure_without_width_returns_normalized_only():
    normalized = normalize([500, 500, 700, 900], origin_px=(0, 1000), px_per_width=2000)
    assert to_mm(normalized, None) is None
    assert normalized["u0"] == pytest.approx(0.25)
