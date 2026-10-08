"""已发布 typology 的存储：data/typologies/。

index.json 相当于一张表，每一行是一个 typology：
    {"id", "name", "source": "photo", "projectId", "buildVersion", "manifest", "publishedAt"}
<id>/ 下是 house-viewer 读取的契约文件（scene.json、model.glb、color-block/、render/、annotations.json）。

发布 = 用建模项目最新成功 build 的 spec 快照，按 facade.side 在发布坐标里重新生成契约文件并登记
（后立面会转到 −Z 一侧，见 build/frame.py）。先写到临时目录、校验通过后整体换上，
所以 house-viewer 不会读到一半旧、一半新的文件。同一项目重新发布会覆盖原 typology。
"""
from __future__ import annotations

import json
import os
import re
import shutil
import time
from pathlib import Path
from typing import Optional

from facade_modeler.assets.catalog import Catalog
from facade_modeler.build.pipeline import write_typology
from facade_modeler.config import Defaults
from facade_modeler.project.lock import project_lock
from facade_modeler.project.store import Project
from facade_modeler.spec.model import HouseSpec

SCHEMA_VERSION = 1
TYPOLOGY_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
PREVIEW_FILE = "preview.png"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
MAX_PREVIEW_BYTES = 2_000_000


class NotPublishable(Exception):
    pass


class TypologyStore:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    @property
    def index_path(self) -> Path:
        return self.root / "index.json"

    # ---- 读取 ------------------------------------------------------------------------
    def entries(self) -> list[dict]:
        if not self.index_path.exists():
            return []
        return json.loads(self.index_path.read_text(encoding="utf-8")).get("typologies", [])

    def get(self, typology_id: str) -> Optional[dict]:
        return next((e for e in self.entries() if e["id"] == typology_id), None)

    def for_project(self, project_id: str) -> Optional[dict]:
        return next((e for e in self.entries() if e.get("projectId") == project_id), None)

    def directory(self, typology_id: str) -> Path:
        if not TYPOLOGY_ID.match(typology_id):
            raise KeyError(typology_id)
        return self.root / typology_id

    # ---- 发布 ------------------------------------------------------------------------
    def publish(self, project: Project, catalog: Catalog, defaults: Defaults, name: Optional[str] = None) -> dict:
        version = project.latest_build()
        if version is None:
            raise NotPublishable(f"Project {project.id} has no successful build yet")
        spec = HouseSpec.from_json((project.build_dir(version) / "spec.json").read_text(encoding="utf-8"))
        typology_id = project.id
        with project_lock(self.root / ".index.lock"):
            previous = self.get(typology_id)
            label = name or (previous or {}).get("name") or f"Photo · {project.id}"
            staging = self.root / f".{typology_id}.staging"
            if staging.exists():
                shutil.rmtree(staging)
            staging.mkdir()
            problems = write_typology(spec, catalog, defaults, staging, spec.facade.side)
            if problems:
                shutil.rmtree(staging)
                raise NotPublishable("; ".join(problem.message for problem in problems))
            scene = json.loads((staging / "scene.json").read_text(encoding="utf-8"))
            scene["id"], scene["name"] = typology_id, label
            (staging / "scene.json").write_text(json.dumps(scene, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            target = self.directory(typology_id)
            if target.exists():
                retired = self.root / f".{typology_id}.old"
                if retired.exists():
                    shutil.rmtree(retired)
                target.rename(retired)
                staging.rename(target)
                shutil.rmtree(retired)
            else:
                staging.rename(target)
            entry = {
                "id": typology_id,
                "name": label,
                "source": "photo",
                "facadeSide": spec.facade.side,
                "projectId": project.id,
                "buildVersion": version,
                "manifest": f"{typology_id}/scene.json",
                "publishedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
            }
            rows = [e for e in self.entries() if e["id"] != typology_id] + [entry]
            self._write_index(rows)
            return entry

    # ---- 预览图 ----------------------------------------------------------------------
    def set_preview(self, typology_id: str, data: bytes) -> dict:
        """保存 house-viewer 渲染的缩略图（PNG）。重新发布会换掉整个目录，预览图随之失效、下次打开时重新生成。"""
        if not data.startswith(PNG_MAGIC) or len(data) > MAX_PREVIEW_BYTES:
            raise ValueError("The preview must be a PNG image under 2 MB")
        with project_lock(self.root / ".index.lock"):
            entry = self.get(typology_id)
            if entry is None:
                raise KeyError(typology_id)
            path = self.directory(typology_id) / PREVIEW_FILE
            temporary = path.with_suffix(".tmp")
            temporary.write_bytes(data)
            os.replace(temporary, path)
            entry = {**entry, "preview": PREVIEW_FILE}
            self._write_index([e for e in self.entries() if e["id"] != typology_id] + [entry])
            return entry

    def _write_index(self, rows: list[dict]) -> None:
        data = {"schemaVersion": SCHEMA_VERSION, "typologies": sorted(rows, key=lambda e: e["id"])}
        temporary = self.index_path.with_suffix(".tmp")
        temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        os.replace(temporary, self.index_path)
