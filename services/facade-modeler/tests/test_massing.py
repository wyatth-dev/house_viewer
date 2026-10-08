"""体块：四面墙 + 屋面，世界坐标遵守 typology 契约。"""
import itertools

import numpy as np
import pytest

from facade_modeler.build.massing import build_massing
from facade_modeler.config import load_defaults
from helpers import make_spec, sunningdale_spec

DEFAULTS = load_defaults()


def all_points(massing):
    walls = [p for wall in massing.walls for p in wall.points]
    roofs = [p for roof in massing.roofs for p in roof.white]
    return np.array(walls + roofs)


def test_sunningdale_ridge_height():
    points = all_points(build_massing(sunningdale_spec(), DEFAULTS))
    assert points[:, 1].max() == pytest.approx(8090, abs=1)


def test_facade_wall_at_z0_spans_width():
    massing = build_massing(sunningdale_spec(), DEFAULTS)
    facade = next(w for w in massing.walls if w.name == "Facade")
    pts = np.array(facade.points)
    assert np.allclose(pts[:, 2], 0)
    assert pts[:, 0].min() == pytest.approx(-11300) and pts[:, 0].max() == pytest.approx(0)
    assert tuple(facade.outward) == (0, 0, 1)


def test_envelope_matches_footprint():
    massing = build_massing(sunningdale_spec(), DEFAULTS)
    walls = np.array([p for w in massing.walls for p in w.points])
    assert walls[:, 2].min() == pytest.approx(-6800)
    assert {w.name for w in massing.walls} == {"Facade", "Side_Left", "Side_Right", "Rear"}


def test_eaves_overhang_beyond_walls():
    massing = build_massing(sunningdale_spec(), DEFAULTS)
    eaves = np.array([p for roof in massing.roofs for p in roof.eaves])
    assert eaves[:, 0].min() == pytest.approx(-11300 - 180)
    assert eaves[:, 2].max() == pytest.approx(180)


@pytest.mark.parametrize("roof_type,ridge", list(itertools.product(["gable", "hip", "mono", "flat"],
                                                                   ["parallel", "perpendicular"])))
def test_all_roof_types_build(roof_type, ridge):
    for width, depth in ((9000, 6000), (5000, 8000)):
        massing = build_massing(make_spec(width=width, depth=depth, roof_type=roof_type, ridge=ridge), DEFAULTS)
        points = all_points(massing)
        assert np.all(np.isfinite(points))
        assert massing.roofs, "至少一块屋面"
        # 屋面在墙顶处闭合：每块屋面最低点不低于檐口
        assert points[:, 1].min() == pytest.approx(0)
