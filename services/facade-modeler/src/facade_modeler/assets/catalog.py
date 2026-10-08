"""素材库：内置的构件样式（窗、门、通风口）与材质。

每个素材是 assets/ 下的一个 JSON 文件。构件通过 generator 字段指向
build/openings.py 中的几何生成器，params 声明它接受的参数。
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from facade_modeler.config import PACKAGE_ROOT

ASSETS_DIR = PACKAGE_ROOT / "assets"


@dataclass(frozen=True)
class ParamDef:
    type: str  # "int" | "float" | "bool"
    default: Any = None
    min: Optional[float] = None
    max: Optional[float] = None
    doc: str = ""

    def check(self, value: Any) -> Optional[str]:
        """返回错误说明；合法时返回 None。"""
        if value is None:
            return None
        expected = {"int": int, "float": (int, float), "bool": bool}[self.type]
        if isinstance(value, bool) and self.type != "bool":
            return f"should be {self.type}"
        if not isinstance(value, expected):
            return f"should be {self.type}"
        if self.min is not None and value < self.min:
            return f"cannot be less than {self.min}"
        if self.max is not None and value > self.max:
            return f"cannot be greater than {self.max}"
        return None


@dataclass(frozen=True)
class AssetInfo:
    id: str
    category: str  # "component" | "material"
    description: str
    tags: tuple[str, ...]
    generator: Optional[str] = None
    params: dict[str, ParamDef] = field(default_factory=dict)
    color: Optional[tuple[int, int, int]] = None
    texture: Optional[str] = None

    def summary(self) -> dict:
        data = {"id": self.id, "category": self.category, "description": self.description, "tags": list(self.tags)}
        if self.generator:
            data["generator"] = self.generator
            data["params"] = {name: {"type": p.type, "default": p.default, "min": p.min, "max": p.max, "doc": p.doc}
                              for name, p in self.params.items()}
        return data


def _read_asset(path: Path) -> AssetInfo:
    data = json.loads(path.read_text(encoding="utf-8"))
    params = {name: ParamDef(**definition) for name, definition in data.get("params", {}).items()}
    color = tuple(data["color"]) if data.get("color") else None
    return AssetInfo(
        id=data["id"],
        category=data["category"],
        description=data["description"],
        tags=tuple(data.get("tags", [])),
        generator=data.get("generator"),
        params=params,
        color=color,
        texture=data.get("texture"),
    )


class Catalog:
    def __init__(self, assets: list[AssetInfo]):
        self._assets = {asset.id: asset for asset in assets}

    @classmethod
    def load(cls, root: Path = ASSETS_DIR) -> "Catalog":
        return cls([_read_asset(path) for path in sorted(root.rglob("*.json"))])

    def get(self, asset_id: str, category: Optional[str] = None) -> Optional[AssetInfo]:
        asset = self._assets.get(asset_id)
        if asset and category and asset.category != category:
            return None
        return asset

    def component(self, asset_id: str) -> Optional[AssetInfo]:
        return self.get(asset_id, "component")

    def material(self, asset_id: str) -> Optional[AssetInfo]:
        return self.get(asset_id, "material")

    def search(self, query: str = "", category: Optional[str] = None) -> list[AssetInfo]:
        """按类别过滤，再按文字匹配排序：标签完全命中 > 标签包含 > 描述包含。"""
        words = [w.lower() for w in query.split()]
        scored = []
        for asset in self._assets.values():
            if category and asset.category != category:
                continue
            score = sum(_match_score(asset, word) for word in words)
            if words and score == 0:
                continue
            scored.append((-score, asset.id, asset))
        return [asset for _, _, asset in sorted(scored)]

    def resolve_params(self, asset_id: str, params: dict[str, Any]) -> dict[str, Any]:
        """补全省略的参数（使用素材默认值）。"""
        asset = self.component(asset_id)
        if asset is None:
            raise KeyError(asset_id)
        return {name: params.get(name, definition.default) for name, definition in asset.params.items()}

    def param_errors(self, asset_id: str, params: dict[str, Any]) -> list[str]:
        asset = self.component(asset_id)
        if asset is None:
            return [f"Asset {asset_id} does not exist"]
        errors = [f"Unknown parameter {name}" for name in params if name not in asset.params]
        for name, value in params.items():
            if name in asset.params and (message := asset.params[name].check(value)):
                errors.append(f"{name} {message}")
        return errors


def _match_score(asset: AssetInfo, word: str) -> int:
    tags = [tag.lower() for tag in asset.tags]
    if word in tags:
        return 3
    if any(word in tag for tag in tags) or word in asset.id.lower():
        return 2
    return 1 if word in asset.description.lower() else 0
