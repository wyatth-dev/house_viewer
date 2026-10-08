"""几何与素材校验：问题以 Issue 列表返回，不抛异常。"""
from facade_modeler.assets.catalog import Catalog
from facade_modeler.spec.validate import validate
from helpers import add_opening, make_spec

CATALOG = Catalog.load()


def codes(spec):
    return [issue.code for issue in validate(spec, CATALOG)]


def test_clean_spec_has_no_issues():
    spec = make_spec()
    add_opening(spec)
    assert codes(spec) == []


def test_width_missing_skips_geometry_checks():
    spec = make_spec()
    spec.facade.width_mm = None
    add_opening(spec, u=99999)
    assert codes(spec) == ["width_missing"]


def test_opening_outside_outline_reported():
    spec = make_spec(eave=3000)  # gable parallel → rectangle up to 3000
    opening = add_opening(spec, sill=2000, h=1500)
    issues = validate(spec, CATALOG)
    assert [i.code for i in issues] == ["opening_outside_wall"]
    assert issues[0].ids == [opening.id]


def test_opening_inside_gable_apex_is_fine():
    spec = make_spec(width=6000, ridge="perpendicular", eave=3000, pitch=45)
    add_opening(spec, u=3000, sill=3400, w=600, h=600)
    assert codes(spec) == []


def test_overlap_and_door_grounding():
    spec = make_spec()
    a = add_opening(spec, u=1500)
    b = add_opening(spec, u=2000)
    add_opening(spec, asset="door/entry", u=4500, sill=100, w=1000, h=2100)
    issues = validate(spec, CATALOG)
    assert {(i.code, tuple(i.ids)) for i in issues} == {
        ("opening_overlap", (a.id, b.id)),
        ("door_not_grounded", ("o3",)),
    }


def test_unknown_asset_and_invalid_param():
    spec = make_spec()
    add_opening(spec, asset="win/nope")
    add_opening(spec, u=4000, panes=99)
    spec.facade.materials["wall"].asset = "mat/nope"
    assert sorted(codes(spec)) == ["invalid_param", "unknown_asset", "unknown_asset"]
