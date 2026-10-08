"""内置素材库：加载与检索。"""
from facade_modeler.assets.catalog import Catalog

CATALOG = Catalog.load()


def test_builtin_components_and_materials():
    assert {a.id for a in CATALOG.search(category="component")} == {
        "win/casement", "win/sash", "door/patio", "door/entry", "door/garage", "vent/gable"}
    assert "mat/brick-red" in {a.id for a in CATALOG.search(category="material")}


def test_search_by_tag_and_text():
    assert "win/sash" in [a.id for a in CATALOG.search("推拉", "component")]
    assert CATALOG.search("brick")[0].id == "mat/brick-red"


def test_param_defaults_fill_missing():
    assert CATALOG.resolve_params("door/garage", {}) == {"sections": 5}
