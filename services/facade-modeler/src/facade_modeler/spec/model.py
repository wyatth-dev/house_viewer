"""HouseSpec：一栋房屋（目前只有一个立面）的结构化描述，是唯一事实来源。

坐标约定（立面坐标）：u 为从外面看从左到右，v 向上，原点在立面左下角地面，单位毫米。
JSON 使用 camelCase（如 widthMm），Python 内部使用 snake_case。
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from facade_modeler.config import Defaults

SCHEMA_VERSION = 1
RoofType = Literal["gable", "hip", "mono", "flat"]
RidgeDirection = Literal["parallel", "perpendicular"]
ProvenanceSource = Literal["user", "photo-measured", "photo-estimate", "default"]
FacadeSide = Literal["front", "back"]  # 照片拍的是房子的哪一面；决定发布后立面在 house-viewer 里的朝向


class SpecModel(BaseModel):
    """所有模型的基类：camelCase 别名，赋值时校验。"""

    # allow_inf_nan=False：inf / NaN 写进 JSON 会变成 null，之后项目无法再读取（review I-4）
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, validate_assignment=True,
                              allow_inf_nan=False)


class MaterialSlot(SpecModel):
    asset: str
    height_mm: Optional[float] = None  # 只有勒脚使用


class Segment(SpecModel):
    id: str = "main"


class Opening(SpecModel):
    id: str
    asset: str
    u_mm: float  # 洞口中心
    sill_mm: float  # 洞口底边高度
    width_mm: float = Field(gt=0)
    height_mm: float = Field(gt=0)
    params: dict[str, Any] = Field(default_factory=dict)
    # 例如 {"measurement": "m7", "overrides": {"sill_mm": 0}}：尺寸来自测量，overrides 是 LM 手动改过的字段
    evidence: Optional[dict[str, Any]] = None


class Facade(SpecModel):
    side: FacadeSide = "back"  # 照片通常拍的是后立面（veranda 装在后院）
    width_mm: Optional[float] = Field(default=None, gt=0)
    segments: list[Segment] = Field(default_factory=lambda: [Segment()])
    materials: dict[str, MaterialSlot]  # plinth / wall / gable
    openings: list[Opening] = Field(default_factory=list)


class Roof(SpecModel):
    type: RoofType
    ridge: RidgeDirection
    eave_height_mm: float = Field(gt=0)
    pitch_deg: float = Field(ge=0, lt=80)
    overhang_mm: float = Field(ge=0)
    thickness_mm: float = Field(gt=0)
    material: MaterialSlot


class Massing(SpecModel):
    depth_mm: float = Field(gt=0)


class Rectification(SpecModel):
    corners_px: list[tuple[float, float]]  # 左下、右下、右上、左上（原图像素）
    homography: list[list[float]]
    aspect: float  # 矫正矩形的 高 / 宽
    method: Literal["perspective", "affine", "reference"]
    size: tuple[int, int]  # 矫正图像素尺寸 (宽, 高)
    origin_px: tuple[float, float]  # 立面左下角在矫正图中的像素位置
    px_per_width: float  # 立面宽度对应的像素数
    file: str  # 相对项目目录


class Photo(SpecModel):
    file: str
    primary: bool = False
    rectification: Optional[Rectification] = None


class Measurement(SpecModel):
    id: str
    photo: str
    kind: Literal["point", "box"]
    px: list[float]  # 矫正图像素：点 [x, y]；框 [x0, y0, x1, y1]
    normalized: dict[str, float]  # 以立面宽度为单位：u / v 或 u0 u1 v0 v1


class ProvenanceEntry(SpecModel):
    source: ProvenanceSource
    note: Optional[str] = None
    measurement: Optional[str] = None


class HouseSpec(SpecModel):
    schema_version: int = SCHEMA_VERSION
    id: str
    units: Literal["mm"] = "mm"
    facade: Facade
    roof: Roof
    massing: Massing
    photos: dict[str, Photo] = Field(default_factory=dict)
    measurements: dict[str, Measurement] = Field(default_factory=dict)
    provenance: dict[str, ProvenanceEntry] = Field(default_factory=dict)
    width_skipped: bool = False  # 用户上传时没有填写宽度
    counters: dict[str, int] = Field(default_factory=dict)  # 稳定 ID 计数器

    @classmethod
    def new(cls, project_id: str, defaults: Defaults) -> "HouseSpec":
        r, f = defaults.roof, defaults.facade
        return cls(
            id=project_id,
            facade=Facade(
                materials={
                    "plinth": MaterialSlot(asset=f.plinth_material, height_mm=f.plinth_height_mm),
                    "wall": MaterialSlot(asset=f.wall_material),
                    "gable": MaterialSlot(asset=f.gable_material),
                }
            ),
            roof=Roof(
                type=r.type,
                ridge=r.ridge,
                eave_height_mm=r.eave_height_mm,
                pitch_deg=r.pitch_deg,
                overhang_mm=r.overhang_mm,
                thickness_mm=r.thickness_mm,
                material=MaterialSlot(asset=r.material),
            ),
            massing=Massing(depth_mm=defaults.massing_depth_mm),
        )

    def next_id(self, prefix: str) -> str:
        """返回下一个 ID（o1、m1、p1……）。计数只增不减，删除后也不复用。"""
        count = self.counters.get(prefix, 0) + 1
        self.counters = {**self.counters, prefix: count}
        return f"{prefix}{count}"

    def to_json(self) -> str:
        return self.model_dump_json(by_alias=True, indent=2)

    @classmethod
    def from_json(cls, text: str) -> "HouseSpec":
        return cls.model_validate_json(text)

    def opening(self, opening_id: str) -> Opening:
        for item in self.facade.openings:
            if item.id == opening_id:
                return item
        raise KeyError(opening_id)
