"""服务上下文：项目存储、已发布 typology、素材库、默认值。由适配层创建一次后传给各操作。"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from facade_modeler.assets.catalog import Catalog
from facade_modeler.config import Defaults, load_defaults
from facade_modeler.paths import intake_dir, typologies_dir
from facade_modeler.project.store import Project, ProjectStore
from facade_modeler.typologies.store import TypologyStore


@dataclass
class ServiceContext:
    store: ProjectStore
    catalog: Catalog
    defaults: Defaults
    typologies: Optional[TypologyStore] = None  # None：提交后不发布（测试用）

    @classmethod
    def from_env(cls) -> "ServiceContext":
        defaults = load_defaults()
        return cls(ProjectStore(intake_dir(), defaults), Catalog.load(), defaults, TypologyStore(typologies_dir()))

    def project(self, project_id: str) -> Project:
        return self.store.open(project_id)
