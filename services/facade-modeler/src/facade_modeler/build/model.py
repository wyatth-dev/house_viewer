"""把 HouseSpec 组装成网格模型（三种表示）。

white       薄壳，无洞口、无屋面厚度
color-block 材质分带、屋面厚度、出檐与封檐板，无洞口
render      color-block + 洞口（素材生成器）
立面以外的三面墙是白模补齐：color-block / render 中使用立面墙面材质，不开洞。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

import numpy as np

from facade_modeler.assets.catalog import Catalog
from facade_modeler.build.frame import FACADE_OUTWARD, to_side, to_world, turn_to_side
from facade_modeler.build.geometry import cut_rectangles, oriented, polygon_normal, split_at_heights, triangulate, unit
from facade_modeler.build.massing import RoofPlane, build_massing
from facade_modeler.build.materials import TRIM, WHITE_ROOF, WHITE_WALL, MaterialDef, MaterialTable, facade_slots
from facade_modeler.build.openings import OpeningFrame, opening_pieces
from facade_modeler.build.outline import facade_outline
from facade_modeler.config import Defaults
from facade_modeler.spec.model import HouseSpec

Mode = Literal["white", "color-block", "render"]
UP = np.array([0.0, 1.0, 0.0])


@dataclass
class MeshGroup:
    triangles: list[np.ndarray] = field(default_factory=list)
    normals: list[np.ndarray] = field(default_factory=list)
    uvs: list[np.ndarray] = field(default_factory=list)


@dataclass
class MeshModel:
    meshes: list[tuple[str, dict[int, MeshGroup]]] = field(default_factory=list)
    materials: list[MaterialDef] = field(default_factory=list)
    mode: str = "white"

    def mesh(self, name: str) -> dict[int, MeshGroup]:
        groups: dict[int, MeshGroup] = {}
        self.meshes.append((name, groups))
        return groups

    @staticmethod
    def add(groups: dict[int, MeshGroup], material: int, triangle: np.ndarray, normal: np.ndarray, uv: np.ndarray):
        group = groups.setdefault(material, MeshGroup())
        group.triangles.append(triangle)
        group.normals.append(np.tile(normal, (3, 1)))
        group.uvs.append(uv)


def build_model(spec: HouseSpec, catalog: Catalog, defaults: Defaults, mode: Mode) -> MeshModel:
    model, table = MeshModel(mode=mode), MaterialTable(catalog)
    massing = build_massing(spec, defaults)
    _facade_wall(model, table, spec, mode)
    wall_material = table.index(WHITE_WALL if mode == "white" else facade_slots(spec)["wall"])
    for wall in massing.walls:
        if wall.name != "Facade":
            _flat_wall(model, wall.name, wall.points, np.array(wall.outward, dtype=float), wall_material)
    for roof in massing.roofs:
        _roof(model, table, roof, spec, mode)
    if mode == "render":
        _openings(model, table, spec, catalog, defaults)
    model.materials = table.items
    return model


def place_on_side(model: MeshModel, width: float, depth: float, side: str) -> MeshModel:
    """把建模坐标的模型换到发布坐标（旋转不改变三角形绕向，UV 不变）。"""
    for _, groups in model.meshes:
        for group in groups.values():
            group.triangles = [to_side(tri, width, depth, side) for tri in group.triangles]
            group.normals = [turn_to_side(normal, side) for normal in group.normals]
    return model


# ---- 墙 ---------------------------------------------------------------------------
def _facade_wall(model: MeshModel, table: MaterialTable, spec: HouseSpec, mode: Mode) -> None:
    """立面：在二维立面坐标中三角化、按勒脚 / 檐口分带、开洞，再换到世界坐标。"""
    width = spec.facade.width_mm
    outline = [np.array([u, v, 0.0]) for u, v in facade_outline(spec)]
    triangles = triangulate(outline, (0, 0, 1))
    groups = model.mesh("Facade")
    if mode == "white":
        material = table.index(WHITE_WALL)
        for tri in triangles:
            _add_facade_triangle(model, groups, material, tri, width, "wall")
        return
    slots, eave = facade_slots(spec), spec.roof.eave_height_mm
    plinth = spec.facade.materials["plinth"].height_mm or 0.0
    triangles = split_at_heights(triangles, [plinth, eave], UP)
    if mode == "render":
        rects = [(o.u_mm - o.width_mm / 2, o.sill_mm, o.u_mm + o.width_mm / 2, o.sill_mm + o.height_mm)
                 for o in spec.facade.openings]
        triangles = [piece for tri in triangles for piece in cut_rectangles(tri, rects)]
    for tri in triangles:
        centre_v = tri[:, 1].mean()
        role = "plinth" if centre_v < plinth else "gable" if centre_v > eave else "wall"
        _add_facade_triangle(model, groups, table.index(slots[role]), tri, width, role)


def _add_facade_triangle(model, groups, material, tri2d, width, role) -> None:
    world = np.array([to_world(u, v, 0.0, width) for u, v, _ in tri2d])
    world = oriented(world, FACADE_OUTWARD)
    model.add(groups, material, world, FACADE_OUTWARD, _wall_uv(world, FACADE_OUTWARD, role == "plinth"))


def _flat_wall(model: MeshModel, name: str, points, outward: np.ndarray, material: int) -> None:
    groups = model.mesh(name)
    for tri in triangulate(points, outward):
        tri = oriented(tri, outward)
        model.add(groups, material, tri, outward, _wall_uv(tri, outward, False))


# ---- 屋面 -------------------------------------------------------------------------
def _roof(model: MeshModel, table: MaterialTable, roof: RoofPlane, spec: HouseSpec, mode: Mode) -> None:
    groups = model.mesh(roof.name)
    polygon = roof.white if mode == "white" else roof.eaves
    normal = polygon_normal(polygon)
    normal = normal if normal[1] > 0 else -normal
    if mode == "white":
        material = table.index(WHITE_ROOF)
        for tri in triangulate(polygon, normal):
            tri = oriented(tri, normal)
            model.add(groups, material, tri, normal, _slope_uv(tri, normal))
        return
    up = np.array([0.0, spec.roof.thickness_mm, 0.0])
    top_material = table.index(TRIM if roof.flat else spec.roof.material.asset)
    trim = table.index(TRIM)
    for tri in triangulate(polygon, normal):
        tri = oriented(tri, normal)
        top = tri + up
        model.add(groups, top_material, top, normal, _slope_uv(top, normal))
        bottom = tri[::-1].copy()
        model.add(groups, trim, bottom, -normal, _slope_uv(bottom, -normal))
    centre = np.mean(polygon, axis=0)
    for edge in roof.exposed:  # 封檐板 / 山墙封边
        a, b = polygon[edge], polygon[(edge + 1) % len(polygon)]
        out = np.cross(b - a, UP)
        out[1] = 0
        out = unit(out)
        if out @ ((a + b) / 2 - centre) < 0:
            out = -out
        for tri in (np.array([a, b, b + up]), np.array([a, b + up, a + up])):
            tri = oriented(tri, out)
            model.add(groups, trim, tri, out, _wall_uv(tri, out, False))


# ---- 洞口 -------------------------------------------------------------------------
def _openings(model: MeshModel, table: MaterialTable, spec: HouseSpec, catalog: Catalog, defaults: Defaults) -> None:
    width = spec.facade.width_mm
    for opening in spec.facade.openings:
        asset = catalog.component(opening.asset)
        if asset is None:
            continue  # 校验会报告 unknown_asset
        frame = OpeningFrame(
            centre=to_world(opening.u_mm, opening.sill_mm + opening.height_mm / 2, 0.0, width),
            u=np.array([1.0, 0, 0]), v=UP, out=FACADE_OUTWARD,
            width=opening.width_mm, height=opening.height_mm, grounded=opening.sill_mm <= 1.0,
        )
        params = catalog.resolve_params(opening.asset, opening.params)
        groups = model.mesh(f"Opening_{opening.id}")
        for piece in opening_pieces(frame, asset.generator, params, defaults.opening):
            material = table.index(piece.material)
            for ids in ((0, 1, 2), (0, 2, 3)):
                tri = oriented(piece.quad[list(ids)], piece.facing)
                normal = unit(np.cross(tri[1] - tri[0], tri[2] - tri[0]))
                model.add(groups, material, tri, normal, np.array([[0, 0], [1, 0], [1, 1]], dtype=float))


# ---- UV ---------------------------------------------------------------------------
def _wall_uv(tri: np.ndarray, normal: np.ndarray, stone: bool) -> np.ndarray:
    """墙面贴图：一张贴图 = 1600 mm（石材 1200 mm）。"""
    horizontal = tri[:, 0] if abs(normal[2]) >= abs(normal[0]) else tri[:, 2]
    return np.stack((horizontal, tri[:, 1]), axis=1) / (1200 if stone else 1600)


def _slope_uv(tri: np.ndarray, normal: np.ndarray) -> np.ndarray:
    u = np.cross(UP, normal)
    u = unit(u) if np.linalg.norm(u) > 0.1 else np.array([1.0, 0, 0])
    v = np.cross(normal, u)
    return np.stack((tri @ u, tri @ v), axis=1) / 1600
