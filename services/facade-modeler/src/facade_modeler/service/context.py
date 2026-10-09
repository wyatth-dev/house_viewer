"""服务上下文。

- ServiceContext：一个用户项目里的照片模型上下文（照片模型存储、本项目已发布的 typology、素材库、默认值）。
  建模操作（service/*）都只接收它，不知道外面还有项目层。
- AppContext：HTTP 服务的全局上下文（项目目录表、素材库、默认值），按 pid 构造 ServiceContext。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from facade_modeler.assets.catalog import Catalog
from facade_modeler.config import Defaults, load_defaults
from facade_modeler.paths import data_dir, photo_models_dir_env, projects_dir, typologies_dir_env
from facade_modeler.photo_model.store import PhotoModel, PhotoModelStore
from facade_modeler.projects.migrate import migrate_legacy, split_legacy_photo_projects
from facade_modeler.projects.store import ProjectNotFound, ProjectRegistry
from facade_modeler.rendering.media import MediaStore
from facade_modeler.typologies.store import TypologyStore


@dataclass
class ServiceContext:
    store: PhotoModelStore
    catalog: Catalog
    defaults: Defaults
    typologies: Optional[TypologyStore] = None  # None：提交后不发布（测试用）

    @classmethod
    def from_env(cls) -> "ServiceContext":
        """MCP 子进程用：两个目录由 JobRunner 写进 mcp.json 的 env，缺一个就报错。"""
        photo_models, typologies = photo_models_dir_env(), typologies_dir_env()
        missing = [name for name, value in (("FACADE_PHOTO_MODELS_DIR", photo_models),
                                            ("FACADE_TYPOLOGIES_DIR", typologies)) if value is None]
        if missing:
            raise RuntimeError(f"Set {' and '.join(missing)} to the project's photo-models and typologies folders")
        defaults = load_defaults()
        return cls(PhotoModelStore(photo_models, defaults), Catalog.load(), defaults, TypologyStore(typologies))

    def project(self, project_id: str) -> PhotoModel:
        """project_id 是照片模型 id（house-00N）；MCP 工具对 LM 暴露的参数名沿用 project_id。"""
        return self.store.open(project_id)


@dataclass
class AppContext:
    projects: ProjectRegistry
    catalog: Catalog
    defaults: Defaults

    @classmethod
    def from_env(cls) -> "AppContext":
        """HTTP 服务用：data/projects；第一次启动时把旧的 data/intake、data/typologies 迁移进 p-0001。"""
        registry = ProjectRegistry(projects_dir())
        registry.purge_deleted()
        migrate_legacy(data_dir(), registry)
        split_legacy_photo_projects(registry)
        return cls(registry, Catalog.load(), load_defaults())

    def service(self, pid: str) -> ServiceContext:
        """项目不存在时抛 ProjectNotFound；不会为不存在的项目建目录。"""
        if not (self.projects.directory(pid) / "project.json").is_file():
            raise ProjectNotFound(pid)
        return ServiceContext(PhotoModelStore(self.projects.photo_models_dir(pid), self.defaults), self.catalog,
                              self.defaults, TypologyStore(self.projects.typologies_dir(pid)))

    def media(self, pid: str) -> MediaStore:
        """项目的素材目录（截图、Context 照片、出图任务）；项目不存在时抛 ProjectNotFound。"""
        if not (self.projects.directory(pid) / "project.json").is_file():
            raise ProjectNotFound(pid)
        return MediaStore(self.projects.directory(pid) / "media")
