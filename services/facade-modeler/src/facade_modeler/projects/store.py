"""用户项目的存储：data/projects/index.json（目录表）+ <pid>/project.json。

写操作都持有 .index.lock；文件先写临时文件再 os.replace。磁盘上损坏的 project.json 只会报错，不会被覆盖。
"""
from __future__ import annotations

import json
import os
import re
import shutil
import time
from pathlib import Path
from typing import Optional

from pydantic import ValidationError

from facade_modeler.photo_model.lock import project_lock
from facade_modeler.projects.model import PROJECT_SCHEMA_VERSION, ProjectDocument, default_project

PROJECT_ID = re.compile(r"^p-\d{4,}$")
DEFAULT_NAME = "Untitled project"


class ProjectNotFound(Exception):
    pass


class ProjectUnreadable(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class InvalidProject(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class RevisionConflict(Exception):
    def __init__(self, current: ProjectDocument):
        super().__init__("The project was changed elsewhere")
        self.current = current


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def _describe(error: ValidationError) -> str:
    return "; ".join(
        f"{'.'.join(str(part) for part in item['loc']) or 'document'}: {item['msg']}" for item in error.errors()
    )


def _atomic_write(path: Path, text: str) -> None:
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(text, encoding="utf-8")
    os.replace(temporary, path)


class ProjectRegistry:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    # ---- 路径 ------------------------------------------------------------------------
    @property
    def index_path(self) -> Path:
        return self.root / "index.json"

    @property
    def _lock_path(self) -> Path:
        return self.root / ".index.lock"

    def directory(self, pid: str) -> Path:
        if not PROJECT_ID.match(pid):
            raise ProjectNotFound(pid)
        return self.root / pid

    def photo_models_dir(self, pid: str) -> Path:
        return self.directory(pid) / "photo-models"

    def typologies_dir(self, pid: str) -> Path:
        return self.directory(pid) / "typologies"

    # ---- 读取 ------------------------------------------------------------------------
    def _index(self) -> dict:
        if not self.index_path.exists():
            return {"schemaVersion": 1, "nextId": 1, "projects": []}
        try:
            data = json.loads(self.index_path.read_text(encoding="utf-8"))
            data.setdefault("projects", [])
            return data
        except (OSError, ValueError):
            raise ProjectUnreadable("The project index (index.json) is damaged")

    def list(self) -> list[dict]:
        return sorted(self._index()["projects"], key=lambda row: row["updatedAt"], reverse=True)

    def get(self, pid: str) -> ProjectDocument:
        path = self.directory(pid) / "project.json"
        if not path.exists():
            raise ProjectNotFound(pid)
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            raise ProjectUnreadable(f"project.json of {pid} cannot be read: {error}")
        if not isinstance(raw, dict) or raw.get("schemaVersion") != PROJECT_SCHEMA_VERSION:
            version = raw.get("schemaVersion") if isinstance(raw, dict) else None
            raise ProjectUnreadable(f"project.json of {pid} has an unsupported schemaVersion: {version!r}")
        try:
            return ProjectDocument.model_validate(raw)
        except ValidationError as error:
            raise ProjectUnreadable(f"project.json of {pid} is invalid: {_describe(error)}")

    # ---- 写入 ------------------------------------------------------------------------
    def create(self, name: Optional[str] = None) -> ProjectDocument:
        with project_lock(self._lock_path):
            index = self._index()
            used = [int(row["id"][2:]) for row in index["projects"] if PROJECT_ID.match(row["id"])]
            used += [int(p.name[2:]) for p in self.root.iterdir() if PROJECT_ID.match(p.name)]
            number = max([index.get("nextId", 1) - 1, *used, 0]) + 1
            pid = f"p-{number:04d}"
            try:
                document = default_project(pid, name if name is not None else DEFAULT_NAME, _now())
            except ValidationError as error:
                raise InvalidProject(_describe(error))
            self.photo_models_dir(pid).mkdir(parents=True)
            self.typologies_dir(pid).mkdir(parents=True)
            self._write_document(document)
            index["nextId"] = number + 1
            index["projects"].append(self._row(document))
            self._write_index(index)
            return document

    def save(self, pid: str, payload: dict) -> ProjectDocument:
        with project_lock(self._lock_path):
            current = self.get(pid)
            try:
                incoming = ProjectDocument.model_validate(payload)
            except ValidationError as error:
                raise InvalidProject(_describe(error))
            if incoming.revision != current.revision:
                raise RevisionConflict(current)
            saved = incoming.model_copy(update={
                "id": current.id, "created_at": current.created_at,
                "revision": current.revision + 1, "updated_at": _now(),
            })
            self._write_document(saved)
            self._update_row(saved)
            return saved

    def rename(self, pid: str, name: str) -> ProjectDocument:
        with project_lock(self._lock_path):
            current = self.get(pid)
            try:
                renamed = ProjectDocument.model_validate(
                    {**current.model_dump(by_alias=True), "name": name, "revision": current.revision + 1,
                     "updatedAt": _now()})
            except ValidationError as error:
                raise InvalidProject(_describe(error))
            self._write_document(renamed)
            self._update_row(renamed)
            return renamed

    def delete(self, pid: str) -> None:
        with project_lock(self._lock_path):
            directory = self.directory(pid)
            index = self._index()
            known = any(row["id"] == pid for row in index["projects"])
            if not directory.exists() and not known:
                raise ProjectNotFound(pid)
            index["projects"] = [row for row in index["projects"] if row["id"] != pid]
            self._write_index(index)
            shutil.rmtree(directory, ignore_errors=True)

    # ---- 内部 ------------------------------------------------------------------------
    @staticmethod
    def _row(document: ProjectDocument) -> dict:
        return {"id": document.id, "name": document.name, "createdAt": document.created_at,
                "updatedAt": document.updated_at, "house": document.house.model_dump(by_alias=True)}

    def _update_row(self, document: ProjectDocument) -> None:
        index = self._index()
        index["projects"] = [row for row in index["projects"] if row["id"] != document.id] + [self._row(document)]
        self._write_index(index)

    def _write_document(self, document: ProjectDocument) -> None:
        _atomic_write(self.directory(document.id) / "project.json",
                      json.dumps(document.model_dump(by_alias=True), indent=2, ensure_ascii=False) + "\n")

    def _write_index(self, index: dict) -> None:
        _atomic_write(self.index_path, json.dumps(index, indent=2, ensure_ascii=False) + "\n")
