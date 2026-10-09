"""上传后自动建模：在后台用 Claude Code 的无界面模式（claude -p）跑一次建模。

每个照片模型同一时间只有一个任务（按 "<pid>/<mid>" 区分）；运行中再次触发只排队一次重跑。
状态写在 data/projects/<pid>/photo-models/<mid>/jobs/job.json，日志写在 jobs/run-N.log，
查看页通过照片模型详情接口读取并显示进度。MCP 子进程通过 FACADE_PHOTO_MODELS_DIR 和
FACADE_TYPOLOGIES_DIR 拿到这个项目的两个目录，只能操作本项目的照片模型。

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

from facade_modeler.photo_model.store import PhotoModel
from facade_modeler.projects.store import ProjectNotFound
from facade_modeler.service.context import ServiceContext

SERVER_NAME = "facade-modeler"
MAX_TURNS = 60
LOG_TAIL_LINES = 12
_AUTO = object()  # claude_bin 的默认值：自动查找

PROMPT = (  # project_id 是照片模型 id：MCP 工具的参数名沿用 project_id
    "Model the facade in facade-modeler project {project_id}. Work autonomously and do not ask questions. "
    "Follow the facade-modeler server instructions: get_context, view_photo, rectify_photo, estimate the width "
    "if the user skipped it, measure and add every door and window, set the roof and materials, build, check "
    "render_preview(kind='overlay') and fix issues, then call submit with a short English note that says which "
    "values are estimates."
)

Command = Callable[[str, Path], Optional[list]]  # (照片模型 id, mcp.json) → 命令行


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


def write_mcp_config(path: Path, photo_models_dir: Path, typologies_dir: Path) -> Path:
    """MCP 服务用当前 Python 解释器启动，保证和本服务是同一个环境；两个目录都属于同一个用户项目。"""
    config = {"mcpServers": {SERVER_NAME: {
        "command": sys.executable,
        "args": ["-m", "facade_modeler.adapters.mcp_server"],
        "env": {"FACADE_PHOTO_MODELS_DIR": str(Path(photo_models_dir).resolve()),
                "FACADE_TYPOLOGIES_DIR": str(Path(typologies_dir).resolve())},
    }}}
    path.write_text(json.dumps(config, indent=2), encoding="utf-8")
    return path


class JobRunner:
    """context_for(pid) 返回这个项目的 ServiceContext（项目不存在时抛 ProjectNotFound）。"""

    def __init__(self, context_for: Callable[[str], ServiceContext], command: Optional[Command] = None,
                 claude_bin=_AUTO):
        self.context_for = context_for
        self._guard = threading.RLock()
        self._threads: dict[str, threading.Thread] = {}
        self._processes: dict[str, subprocess.Popen] = {}
        self._cancelled: set[str] = set()  # 被 cancel_project 停掉的任务：不再写状态、不再重跑
        if command is not None:
            self._command = command
        else:
            binary = find_claude() if claude_bin is _AUTO else claude_bin
            self._command = (lambda mid, cfg: build_command(binary, mid, cfg)) if binary else (lambda mid, cfg: None)

    # ---- 对外接口 ------------------------------------------------------------------
    def start(self, pid: str, mid: str) -> dict:
        """启动建模；已在运行则排队一次重跑。"""
        key = f"{pid}/{mid}"
        with self._guard:
            if self._running(key):
                return self._update(pid, mid, rerunPending=True)
            job = self._update(pid, mid, state="queued", rerunPending=False, error=None)
            thread = threading.Thread(target=self._loop, args=(pid, mid), daemon=True)
            self._threads[key] = thread
            thread.start()
            return job

    def cancel_project(self, pid: str, timeout: float = 5.0) -> None:
        """删除项目前调用：停掉这个项目所有正在运行的建模（结束 claude 进程），并等线程退出。"""
        prefix = f"{pid}/"
        with self._guard:
            keys = [key for key in self._threads if key.startswith(prefix)]
            self._cancelled.update(keys)
            processes = [self._processes[key] for key in keys if key in self._processes]
            threads = [self._threads[key] for key in keys]
        for process in processes:
            _stop(process)
        deadline = time.time() + timeout
        for thread in threads:
            thread.join(max(0.0, deadline - time.time()))
        with self._guard:
            self._cancelled.difference_update(keys)

    def status(self, pid: str, mid: str) -> Optional[dict]:
        with self._guard:
            job = self._read(pid, mid)
            if job and job.get("state") in ("queued", "running") and not self._running(f"{pid}/{mid}"):
                # 服务重启前没跑完的任务：进程已经不在了
                job = self._update(pid, mid, state="failed", rerunPending=False,
                                   error="The modelling run was interrupted (the server restarted).")
            return job

    # ---- 后台线程 ------------------------------------------------------------------
    def _loop(self, pid: str, mid: str) -> None:
        key = f"{pid}/{mid}"
        try:
            while True:
                self._run_once(pid, mid)
                with self._guard:
                    if key in self._cancelled:
                        self._threads.pop(key, None)
                        return
                    job = self._read(pid, mid) or {}
                    if not job.get("rerunPending"):
                        # 判定和登记退出必须在同一段锁里：否则 start() 会看到线程还活着，只写 rerunPending，重跑就丢了
                        self._threads.pop(key, None)
                        return
                    self._update(pid, mid, rerunPending=False)
        except (ProjectNotFound, KeyError, OSError):  # 项目或照片模型在运行期间被删除：任务随之结束
            return
        finally:  # 只给异常路径兜底；正常退出时上面已经移除，这里不会误删新启动的线程
            with self._guard:
                if self._threads.get(key) is threading.current_thread():
                    self._threads.pop(key, None)

    def _run_once(self, pid: str, mid: str) -> None:
        ctx = self.context_for(pid)
        model = ctx.store.open(mid)
        jobs_dir = model.root / "jobs"
        jobs_dir.mkdir(exist_ok=True)
        with self._guard:
            run = (self._read(pid, mid) or {}).get("run", 0) + 1
            self._update(pid, mid, state="running", run=run, startedAt=_now(), finishedAt=None,
                         exitCode=None, error=None, logTail="")
        config = write_mcp_config(jobs_dir / "mcp.json", ctx.store.root, ctx.typologies.root)
        command = self._command(mid, config)
        if not command:
            self._finish(pid, mid, None, "Claude Code was not found. Install it and sign in, or set "
                                         "FACADE_CLAUDE_BIN to the path of the claude command.", "")
            return
        log_path = jobs_dir / f"run-{run}.log"
        env = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}  # 用订阅登录，不用 API key
        key = f"{pid}/{mid}"
        try:
            with open(log_path, "w", encoding="utf-8") as log:
                with self._guard:
                    if key in self._cancelled:
                        return
                    process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT,
                                               stdin=subprocess.DEVNULL, cwd=model.root, env=env)
                    self._processes[key] = process
                try:
                    code = process.wait()
                finally:
                    with self._guard:
                        self._processes.pop(key, None)
        except OSError as error:
            self._finish(pid, mid, None, f"Could not start Claude Code: {error}", "")
            return
        if key in self._cancelled:  # 项目已删除：目录不在了，不写结果
            return
        tail = _tail(log_path)
        self._finish(pid, mid, code, None if code == 0 else f"Claude Code exited with code {code}.", tail)

    def _finish(self, pid, mid, code, error, tail) -> None:
        with self._guard:
            self._update(pid, mid, state="done" if code == 0 else "failed", exitCode=code,
                         finishedAt=_now(), error=error, logTail=tail)

    # ---- job.json（放在照片模型目录里）----------------------------------------------------
    def _running(self, key: str) -> bool:
        thread = self._threads.get(key)
        return bool(thread and thread.is_alive())

    def _model(self, pid: str, mid: str) -> PhotoModel:
        return self.context_for(pid).store.open(mid)

    def _path(self, pid: str, mid: str) -> Path:
        return self._model(pid, mid).root / "jobs" / "job.json"

    def _read(self, pid: str, mid: str) -> Optional[dict]:
        path = self._path(pid, mid)
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None

    def _update(self, pid: str, mid: str, **fields) -> dict:
        path = self._path(pid, mid)
        path.parent.mkdir(exist_ok=True)
        job = {**(self._read(pid, mid) or {"run": 0}), **fields}
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(path)
        return job


def _stop(process: subprocess.Popen, grace: float = 3.0) -> None:
    """先 terminate，等一会儿还在就 kill。"""
    if process.poll() is not None:
        return
    try:
        process.terminate()
        process.wait(grace)
    except subprocess.TimeoutExpired:
        process.kill()
    except OSError:
        pass


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def _tail(path: Path, lines: int = LOG_TAIL_LINES) -> str:
    text = path.read_text(encoding="utf-8", errors="replace").splitlines()
    return "\n".join(line[:400] for line in text[-lines:])
