"""材质表：把 HouseSpec 引用的素材 ID 变成 GLB 材质。

除素材库中的材质外，洞口还需要三种固定材质（玻璃、侧壁、入户门板），
白模则只用两种固定的白色材质。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from facade_modeler.assets.catalog import Catalog
from facade_modeler.spec.model import HouseSpec

TRIM = "mat/trim-white"
GLASS, REVEAL, ENTRY = "House_Window_Glass", "House_Opening_Reveal", "House_Entry_Panel"
WHITE_ROOF, WHITE_WALL = "WhiteModel_Roof", "WhiteModel_Wall"


@dataclass(frozen=True)
class MaterialDef:
    name: str
    color: tuple[float, ...]  # sRGB 0–255，或白模的线性 RGBA
    roughness: float = 0.88
    metallic: float = 0.0
    texture: Optional[str] = None
    linear: bool = False  # True 表示 color 已是线性 0–1


FIXED = {
    GLASS: MaterialDef(GLASS, (64, 94, 104), roughness=0.15, metallic=0.15),
    REVEAL: MaterialDef(REVEAL, (209, 209, 199), roughness=0.9),
    ENTRY: MaterialDef(ENTRY, (55, 83, 94), roughness=0.65),
}
WHITE = {
    WHITE_ROOF: MaterialDef(WHITE_ROOF, (0.89126205, 0.8993845, 0.9075472, 1.0), roughness=0.9, linear=True),
    WHITE_WALL: MaterialDef(WHITE_WALL, (0.8355278, 0.85125166, 0.8671355, 1.0), roughness=0.9, linear=True),
}


class MaterialTable:
    """按需登记材质，返回它在 GLB materials 数组中的下标。"""

    def __init__(self, catalog: Catalog):
        self.catalog = catalog
        self.items: list[MaterialDef] = []
        self._index: dict[str, int] = {}

    def index(self, key: str) -> int:
        if key not in self._index:
            self._index[key] = len(self.items)
            self.items.append(self._definition(key))
        return self._index[key]

    def _definition(self, key: str) -> MaterialDef:
        if key in FIXED:
            return FIXED[key]
        if key in WHITE:
            return WHITE[key]
        asset = self.catalog.material(key)
        if asset is None:
            raise KeyError(f"Material {key} is not in the asset library")
        return MaterialDef(asset.id, asset.color or (200, 200, 200), texture=asset.texture)


def facade_slots(spec: HouseSpec) -> dict[str, str]:
    """立面三个材质槽 → 素材 ID。"""
    materials = spec.facade.materials
    return {role: materials[role].asset for role in ("plinth", "wall", "gable")}
