"""project.json 文档模型（schemaVersion 1）。JSON 用 camelCase；多余字段一律拒绝。"""
from __future__ import annotations

from typing import Literal, Union

from pydantic import ConfigDict, Field, StrictInt, StrictFloat

from facade_modeler.spec.model import SpecModel

PROJECT_SCHEMA_VERSION = 1
Number = Union[StrictInt, StrictFloat]


class _Strict(SpecModel):
    model_config = ConfigDict(**SpecModel.model_config, extra="forbid")


class House(_Strict):
    source: Literal["preset", "photo"]
    typology_id: str = Field(min_length=1)


class Dimensions(_Strict):
    front: Number
    back: Number
    left: Number
    right: Number


class Site(_Strict):
    dimensions_mm: Dimensions


class Display(_Strict):
    representation: Literal["white", "color-block", "render"]
    trees: bool
    fence: bool
    dimensions: bool


class Attachment(_Strict):
    wall_face_id: str
    along_wall_offset_mm: Number


class VarendaParamsRecord(_Strict):
    width_mm: Number
    depth_mm: Number
    wall_height_mm: Number
    underside_height_mm: Number
    post_interval: Number
    rafter_interval: Number


class ProductRecord(_Strict):
    instance_id: str
    product_type: str
    name: str
    attachment: Attachment
    params: VarendaParamsRecord
    locked_dimensions: list[str] = Field(default_factory=list)
    locked_parameters: list[str] = Field(default_factory=list)


class Media(_Strict):
    renders: list
    references: list


class ProjectDocument(_Strict):
    schema_version: Literal[1] = PROJECT_SCHEMA_VERSION
    id: str
    name: str = Field(min_length=1, max_length=120)
    revision: int = Field(ge=0)
    created_at: str
    updated_at: str
    house: House
    site: Site
    display: Display
    products: list[ProductRecord]
    media: Media


def default_project(project_id: str, name: str, now: str) -> ProjectDocument:
    return ProjectDocument(
        id=project_id, name=name, revision=0, created_at=now, updated_at=now,
        house=House(source="preset", typology_id="fairy-house"),
        site=Site(dimensions_mm=Dimensions(front=5000, back=7000, left=2000, right=2000)),
        display=Display(representation="render", trees=True, fence=False, dimensions=True),
        products=[], media=Media(renders=[], references=[]),
    )
