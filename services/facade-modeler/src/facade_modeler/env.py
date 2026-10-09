"""读取仓库根目录的 .env（KEY=VALUE，每行一个）。已经存在的环境变量优先，不会被覆盖。

只支持最常见的写法：空行和 # 开头的注释会跳过，值两边的单引号或双引号会去掉，可以带 export 前缀。
"""
from __future__ import annotations

import os
from pathlib import Path


def load_env_file(path: Path) -> list[str]:
    """返回这次新设置的变量名；文件不存在时什么也不做。"""
    path = Path(path)
    if not path.is_file():
        return []
    loaded = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export "):].lstrip()
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value
            loaded.append(key)
    return loaded
