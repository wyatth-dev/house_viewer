"""数据目录：模拟数据库，与代码分开存放。

默认位置是 house-viewer 仓库根目录下的 data/（本包位于 services/facade-modeler）：

    data/
      projects/index.json                 用户项目的目录表
      projects/<pid>/project.json         项目文档
      projects/<pid>/photo-models/<mid>/  照片录入的建模工作区（照片、矫正图、spec、历史 build、任务日志）
      projects/<pid>/typologies/          本项目已发布的照片 typology（index.json + <mid>/ 契约文件）

环境变量 FACADE_DATA_DIR 可整体改位置。MCP 子进程只处理一个项目：JobRunner 通过
FACADE_PHOTO_MODELS_DIR 和 FACADE_TYPOLOGIES_DIR 把这个项目的两个目录传给它。
旧的 data/intake、data/typologies 只在第一次启动时被迁移（projects/migrate.py）。
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from facade_modeler.config import PACKAGE_ROOT

REPO_ROOT = PACKAGE_ROOT.parents[1]  # house-viewer/


def data_dir() -> Path:
    return Path(os.environ.get("FACADE_DATA_DIR", REPO_ROOT / "data"))


def projects_dir() -> Path:
    return data_dir() / "projects"


def photo_models_dir_env() -> Optional[Path]:
    value = os.environ.get("FACADE_PHOTO_MODELS_DIR")
    return Path(value) if value else None


def typologies_dir_env() -> Optional[Path]:
    value = os.environ.get("FACADE_TYPOLOGIES_DIR")
    return Path(value) if value else None
