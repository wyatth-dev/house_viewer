"""项目写锁：MCP 进程和 HTTP 进程可能同时写同一个项目。

基于 fcntl.flock 的文件锁；同一进程内可重入（嵌套调用不会死锁）。
"""
from __future__ import annotations

import fcntl
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

_held: dict[Path, int] = {}
_guard = threading.RLock()


@contextmanager
def project_lock(path: Path) -> Iterator[None]:
    path = path.resolve()
    with _guard:
        if _held.get(path):
            _held[path] += 1
            try:
                yield
            finally:
                _held[path] -= 1
            return
        with open(path, "a+") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            _held[path] = 1
            try:
                yield
            finally:
                _held[path] = 0
                fcntl.flock(handle, fcntl.LOCK_UN)
