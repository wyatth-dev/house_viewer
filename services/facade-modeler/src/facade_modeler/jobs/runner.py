"""上传后自动建模：在后台用 Claude Code 的无界面模式（claude -p）跑一次建模。

每个项目同一时间只有一个任务；运行中再次触发只排队一次重跑。
状态写在 data/intake/<id>/jobs/job.json，日志写在 jobs/run-N.log，
查看页通过 project_summary 读取并显示进度。

安全：只允许本项目的 facade-modeler MCP 工具（--allowedTools），关闭全部内置工具
（--tools ""），遇到其他需要确认的操作一律拒绝（--permission-mode dontAsk），
所以无人值守运行不会停在权限弹窗上，也碰不到电脑上的其他文件。
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Callable, Optional

from facade_modeler.paths import data_dir
from facade_modeler.project.store import ProjectStore

SERVER_NAME = "facade-modeler"
MAX_TURNS = 60
LOG_TAIL_LINES = 12
_AUTO = object()  # claude_bin 的默认值：自动查找

PROMPT = (
    "Model the facade in facade-modeler project {project_id}. Work autonomously and do not ask questions. "
    "Follow the facade-modeler server instructions: get_context, view_photo, rectify_photo, estimate the width "
    "if the user skipped it, measure and add every door and window, set the roof and materials, build, check "
    "render_preview(kind='overlay') and fix issues, then call submit with a short English note that says which "
    "values are estimates."
)

Command = Callable[[str, Path], Optional[list]]


def find_claude() -> Optional[str]:
    """查找 claude 命令：环境变量 FACADE_CLAUDE_BIN → PATH → 原生安装器的默认位置。"""
    candidates = [os.environ.get("FACADE_CLAUDE_BIN"), shutil.which("claude"),
                  str(Path.home() / ".local/bin/claude"), str(Path.home() / ".claude/local/claude")]
    for candidate in candidates:
        if candidate and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def build_command(claude_bin: str, project_id: str, mcp_config: Path) -> list:
    """claude -p 必须放在最前面：--allowedTools 等参数可接收多个值，会吞掉后面的位置参数。"""
    return [
        claude_bin, "-p", PROMPT.format(project_id=project_id),
        "--mcp-config", str(mcp_config), "--strict-mcp-config",
        "--allowedTools", f"mcp__{SERVER_NAME}",
        "--tools", "",
        "--permission-mode", "dontAsk",
        "--max-turns", str(MAX_TURNS),
        "--output-format", "stream-json", "--verbose",
    ]


def write_mcp_config(path: Path, projects_dir: Path) -> Path:
    """MCP 服务用当前 Python 解释器启动，保证和本服务是同一个环境。"""
    config = {"mcpServers": {SERVER_NAME: {
        "command": sys.executable,
        "args": ["-m", "facade_modeler.adapters.mcp_server"],
        "env": {"FACADE_PROJECTS_DIR": str(projects_dir.resolve()), "FACADE_DATA_DIR": str(data_dir().resolve())},
    }}}
    path.write_text(json.dumps(config, indent=2), encoding="utf-8")
    return path


class JobRunner:
    def __init__(self, store: ProjectStore, command: Optional[Command] = None, claude_bin=_AUTO):
        self.store = store
        self._guard = threading.RLock()
        self._threads: dict[str, threading.Thread] = {}
        if command is not None:
            self._command = command
        else:
            binary = find_claude() if claude_bin is _AUTO else claude_bin
            self._command = (lambda pid, cfg: build_command(binary, pid, cfg)) if binary else (lambda pid, cfg: None)

    # ---- 对外接口 ------------------------------------------------------------------
    def start(self, project_id: str) -> dict:
        """启动建模；已在运行则排队一次重跑。"""
        with self._guard:
            if self._running(project_id):
                return self._update(project_id, rerunPending=True)
            job = self._update(project_id, state="queued", rerunPending=False, error=None)
            thread = threading.Thread(target=self._loop, args=(project_id,), daemon=True)
            self._threads[project_id] = thread
            thread.start()
            return job

    def status(self, project_id: str) -> Optional[dict]:
        with self._guard:
            job = self._read(project_id)
            if job and job.get("state") in ("queued", "running") and not self._running(project_id):
                # 服务重启前没跑完的任务：进程已经不在了
                job = self._update(project_id, state="failed", rerunPending=False,
                                   error="The modelling run was interrupted (the server restarted).")
            return job

    # ---- 后台线程 ------------------------------------------------------------------
    def _loop(self, project_id: str) -> None:
        while True:
            self._run_once(project_id)
            with self._guard:
                job = self._read(project_id) or {}
                if not job.get("rerunPending"):
                    self._threads.pop(project_id, None)
                    return
                self._update(project_id, rerunPending=False)

    def _run_once(self, project_id: str) -> None:
        project = self.store.open(project_id)
        jobs_dir = project.root / "jobs"
        jobs_dir.mkdir(exist_ok=True)
        with self._guard:
            run = (self._read(project_id) or {}).get("run", 0) + 1
            self._update(project_id, state="running", run=run, startedAt=_now(), finishedAt=None,
                         exitCode=None, error=None, logTail="")
        command = self._command(project_id, write_mcp_config(jobs_dir / "mcp.json", self.store.root))
        if not command:
            self._finish(project_id, None, "Claude Code was not found. Install it and sign in, or set "
                                           "FACADE_CLAUDE_BIN to the path of the claude command.", "")
            return
        log_path = jobs_dir / f"run-{run}.log"
        env = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}  # 用订阅登录，不用 API key
        try:
            with open(log_path, "w", encoding="utf-8") as log:
                code = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                                      cwd=project.root, env=env, check=False).returncode
        except OSError as error:
            self._finish(project_id, None, f"Could not start Claude Code: {error}", "")
            return
        tail = _tail(log_path)
        self._finish(project_id, code, None if code == 0 else f"Claude Code exited with code {code}.", tail)

    def _finish(self, project_id, code, error, tail) -> None:
        with self._guard:
            self._update(project_id, state="done" if code == 0 else "failed", exitCode=code,
                         finishedAt=_now(), error=error, logTail=tail)

    # ---- job.json ----------------------------------------------------------------
    def _running(self, project_id: str) -> bool:
        thread = self._threads.get(project_id)
        return bool(thread and thread.is_alive())

    def _path(self, project_id: str) -> Path:
        return self.store.open(project_id).root / "jobs" / "job.json"

    def _read(self, project_id: str) -> Optional[dict]:
        path = self._path(project_id)
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None

    def _update(self, project_id: str, **fields) -> dict:
        path = self._path(project_id)
        path.parent.mkdir(exist_ok=True)
        job = {**(self._read(project_id) or {"run": 0}), **fields}
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(path)
        return job


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def _tail(path: Path, lines: int = LOG_TAIL_LINES) -> str:
    text = path.read_text(encoding="utf-8", errors="replace").splitlines()
    return "\n".join(line[:400] for line in text[-lines:])
