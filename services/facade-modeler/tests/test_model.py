"""三种表示的网格与 GLB。"""
import json
import struct

import numpy as np

from facade_modeler.assets.catalog import Catalog
from facade_modeler.build.glb import write_glb
from facade_modeler.build.model import build_model
from facade_modeler.config import load_defaults
from helpers import sunningdale_spec

CATALOG, DEFAULTS = Catalog.load(), load_defaults()


def facade_triangles(model):
    groups = dict(model.meshes)["Facade"]
    return np.concatenate([np.array(g.triangles) for g in groups.values()])


def cross2(p, q):
    return p[0] * q[1] - p[1] * q[0]


def covers(triangles, point):
    """2D（x, y）点是否落在某个三角形内部。"""
    for tri in triangles:
        a, b, c = tri[:, :2]
        d1, d2, d3 = cross2(b - a, point - a), cross2(c - b, point - b), cross2(a - c, point - c)
        if (d1 > 1 and d2 > 1 and d3 > 1) or (d1 < -1 and d2 < -1 and d3 < -1):
            return True
    return False


def test_render_cuts_eight_openings():
    spec = sunningdale_spec()
    model = build_model(spec, CATALOG, DEFAULTS, "render")
    names = [name for name, _ in model.meshes]
    assert sorted(n for n in names if n.startswith("Opening_")) == [f"Opening_o{i}" for i in range(1, 9)]
    triangles = facade_triangles(model)
    for opening in spec.facade.openings:
        centre = np.array([opening.u_mm - 11300, opening.sill_mm + opening.height_mm / 2])
        assert not covers(triangles, centre), opening.id


def test_white_has_no_openings():
    spec = sunningdale_spec()
    model = build_model(spec, CATALOG, DEFAULTS, "white")
    assert not any(name.startswith("Opening_") for name, _ in model.meshes)
    assert covers(facade_triangles(model), np.array([1700 - 11300, 1500]))


def test_color_block_bands_use_assets():
    model = build_model(sunningdale_spec(), CATALOG, DEFAULTS, "color-block")
    used = {model.materials[index].name for index in dict(model.meshes)["Facade"]}
    assert used == {"mat/stone-ashlar", "mat/siding-horizontal"}


def test_glb_is_valid(tmp_path):
    for mode in ("white", "color-block", "render"):
        path = tmp_path / mode / "model.glb"
        write_glb(build_model(sunningdale_spec(), CATALOG, DEFAULTS, mode), path)
        data = path.read_bytes()
        magic, version, length = struct.unpack("<III", data[:12])
        assert (magic, version, length) == (0x46546C67, 2, len(data))
        chunk_length = struct.unpack("<I", data[12:16])[0]
        gltf = json.loads(data[20:20 + chunk_length])
        assert all(m["doubleSided"] for m in gltf["materials"])
        for mesh in gltf["meshes"]:
            for primitive in mesh["primitives"]:
                assert {"POSITION", "NORMAL", "TEXCOORD_0"} <= set(primitive["attributes"])
