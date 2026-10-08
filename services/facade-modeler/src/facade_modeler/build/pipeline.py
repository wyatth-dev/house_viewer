"""一次 build：校验 → 三种 GLB → scene.json → annotations.json → spec 快照 → verify。

全部成功才更新 builds/latest.json；失败时上一个成功版本保持不变。
build 用建模坐标（立面朝 +Z）；发布为 typology 时用 write_typology(side=spec.facade.side) 按同一 spec 重新生成。
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from facade_modeler.assets.catalog import Catalog
from facade_modeler.build.glb import write_glb
from facade_modeler.build.model import build_model, place_on_side
from facade_modeler.build.typology import MODEL_FILES, annotations, scene_json
from facade_modeler.build.verify import verify_build
from facade_modeler.config import Defaults
from facade_modeler.project.store import Project
from facade_modeler.spec.model import HouseSpec
from facade_modeler.spec.validate import Issue, validate

BLOCKING = {"width_missing", "unknown_asset", "invalid_param"}


@dataclass
class BuildResult:
    version: Optional[int]
    issues: list[Issue]
    dir: Optional[Path]


def run_build(project: Project, catalog: Catalog, defaults: Defaults) -> BuildResult:
    spec = project.load_spec()
    issues = validate(spec, catalog)
    if any(issue.code in BLOCKING for issue in issues):
        return BuildResult(None, issues, None)
    version, directory = project.new_build()
    problems = write_typology(spec, catalog, defaults, directory, "front")
    if problems:
        return BuildResult(None, issues + problems, directory)
    project.commit_build(version)
    return BuildResult(version, issues, directory)


def write_typology(spec: HouseSpec, catalog: Catalog, defaults: Defaults, directory: Path, side: str) -> list[Issue]:
    """在 directory 写出 typology 契约文件（三种 GLB、scene.json、annotations.json、spec 快照）并校验。"""
    width, depth = spec.facade.width_mm, spec.massing.depth_mm
    for mode, relative in MODEL_FILES.items():
        write_glb(place_on_side(build_model(spec, catalog, defaults, mode), width, depth, side), directory / relative)
    _write_json(directory / "scene.json", scene_json(spec, side))
    _write_json(directory / "annotations.json", annotations(spec, defaults, side))
    (directory / "spec.json").write_text(spec.to_json(), encoding="utf-8")
    return verify_build(directory)


def _write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
