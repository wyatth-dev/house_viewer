"""数据目录：模拟数据库，与代码分开存放。

默认位置是 house-viewer 仓库根目录下的 data/（本包位于 services/facade-modeler）：

    data/
      intake/<project-id>/      照片录入的建模工作区（照片、矫正图、spec、历史 build、任务日志）
      typologies/index.json     已发布 typology 的目录表
      typologies/<id>/          已发布的 typology：scene.json + 三种 GLB（house-viewer 只读这一层）

环境变量 FACADE_DATA_DIR 可整体改位置；FACADE_PROJECTS_DIR 只改 intake（旧用法，MCP 子进程也用它）。
"""
from __future__ import annotations

import os
from pathlib import Path

from facade_modeler.config import PACKAGE_ROOT

REPO_ROOT = PACKAGE_ROOT.parents[1]  # house-viewer/


def data_dir() -> Path:
    return Path(os.environ.get("FACADE_DATA_DIR", REPO_ROOT / "data"))


def intake_dir() -> Path:
    return Path(os.environ.get("FACADE_PROJECTS_DIR", data_dir() / "intake"))


def typologies_dir() -> Path:
    return data_dir() / "typologies"
