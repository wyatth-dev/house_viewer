"""读取 config/defaults.toml，得到全局默认数值。

所有"魔法数字"（屋面厚度、出檐、reveal 深度……）都集中在 defaults.toml，
代码只通过 Defaults 读取，方便调整和说明来源。
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

if sys.version_info >= (3, 11):
    import tomllib
else:  # Python 3.10
    import tomli as tomllib

PACKAGE_ROOT = Path(__file__).resolve().parents[2]
DEFAULTS_PATH = PACKAGE_ROOT / "config" / "defaults.toml"


@dataclass(frozen=True)
class RoofDefaults:
    thickness_mm: float
    overhang_mm: float
    pitch_deg: float
    eave_height_mm: float
    type: str
    ridge: str
    material: str


@dataclass(frozen=True)
class FacadeDefaults:
    plinth_height_mm: float
    plinth_material: str
    wall_material: str
    gable_material: str


@dataclass(frozen=True)
class OpeningDefaults:
    reveal_depth_mm: float
    frame_width_mm: float
    frame_proud_mm: float
    glass_inset_mm: float


@dataclass(frozen=True)
class Defaults:
    roof: RoofDefaults
    facade: FacadeDefaults
    massing_depth_mm: float
    opening: OpeningDefaults
    rectified_width_px: int
    annotation_offset_mm: float


@lru_cache(maxsize=None)
def load_defaults(path: Path = DEFAULTS_PATH) -> Defaults:
    data = tomllib.loads(Path(path).read_text(encoding="utf-8"))
    return Defaults(
        roof=RoofDefaults(**data["roof"]),
        facade=FacadeDefaults(**data["facade"]),
        massing_depth_mm=data["massing"]["depth_mm"],
        opening=OpeningDefaults(**data["opening"]),
        rectified_width_px=data["photos"]["rectified_width_px"],
        annotation_offset_mm=data["annotations"]["offset_mm"],
    )
