"""上传后自动建模：后台任务的启动、成功、失败、排队与恢复。"""
import json
import sys
import threading
import time
from pathlib import Path

import pytest

from facade_modeler.assets.catalog import Catalog
from facade_modeler.config import load_defaults
from facade_modeler.jobs.runner import JobRunner, build_command, find_claude
from facade_modeler.projects.store import ProjectRegistry
from facade_modeler.service.context import AppContext

FAKE = str(Path(__file__).parent / "fake_claude.py")
PID = "p-0001"


def fake_command(project_id, mcp_config):
    return [sys.executable, FAKE, "-p", f"model {project_id}", "--mcp-config", str(mcp_config)]


def wait_for(runner, project_id, states=("done", "failed"), timeout=10):
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = runner.status(PID, project_id)
        if job and job["state"] in states and not job.get("rerunPending"):
            return job
        time.sleep(0.05)
    raise AssertionError(f"job did not finish: {runner.status(PID, project_id)}")


@pytest.fixture
def app_ctx(tmp_path):
    app_ctx = AppContext(ProjectRegistry(tmp_path / "projects"), Catalog.load(), load_defaults())
    assert app_ctx.projects.create("Test").id == PID
    return app_ctx


@pytest.fixture
def store(app_ctx):
    return app_ctx.service(PID).store


@pytest.fixture
def runner(app_ctx, monkeypatch, tmp_path):
    monkeypatch.setenv("FAKE_CLAUDE_MARK", str(tmp_path / "calls.jsonl"))
    return JobRunner(app_ctx.service, command=fake_command)


def calls(tmp_path):
    path = tmp_path / "calls.jsonl"
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


def test_job_runs_and_finishes(store, runner, tmp_path):
    project = store.create()
    runner.start(PID, project.id)
    job = wait_for(runner, project.id)
    assert job["state"] == "done" and job["run"] == 1 and job["exitCode"] == 0
    assert len(calls(tmp_path)) == 1
    log = (project.root / "jobs" / "run-1.log").read_text()
    assert '"subtype": "success"' in log


def test_mcp_config_points_at_this_projects_dirs(store, runner, app_ctx, tmp_path):
    project = store.create()
    runner.start(PID, project.id)
    wait_for(runner, project.id)
    args = calls(tmp_path)[0]
    config = json.loads(Path(args[args.index("--mcp-config") + 1]).read_text())
    server = config["mcpServers"]["facade-modeler"]
    assert args[args.index("-p") + 1] == f"model {project.id}"  # 提示里用照片模型 id
    assert server["env"] == {"FACADE_PHOTO_MODELS_DIR": str(app_ctx.projects.photo_models_dir(PID).resolve()),
                             "FACADE_TYPOLOGIES_DIR": str(app_ctx.projects.typologies_dir(PID).resolve())}
    assert store.root.resolve() == app_ctx.projects.photo_models_dir(PID).resolve()
    assert server["args"][-1] == "facade_modeler.adapters.mcp_server"


def test_failure_reports_exit_code_and_log_tail(store, runner, monkeypatch):
    monkeypatch.setenv("FAKE_CLAUDE_EXIT", "3")
    project = store.create()
    runner.start(PID, project.id)
    job = wait_for(runner, project.id)
    assert job["state"] == "failed" and job["exitCode"] == 3
    assert "fake failure" in job["logTail"]


def test_start_while_running_queues_one_rerun(store, runner, monkeypatch, tmp_path):
    monkeypatch.setenv("FAKE_CLAUDE_SLEEP", "0.5")
    project = store.create()
    runner.start(PID, project.id)
    time.sleep(0.1)
    runner.start(PID, project.id)
    runner.start(PID, project.id)  # 多次触发只排队一次
    job = wait_for(runner, project.id)
    assert job["run"] == 2 and len(calls(tmp_path)) == 2


def test_missing_claude_fails_with_clear_message(store, app_ctx):
    runner = JobRunner(app_ctx.service, command=None, claude_bin=None)
    project = store.create()
    runner.start(PID, project.id)
    job = wait_for(runner, project.id)
    assert job["state"] == "failed" and "Claude Code" in job["error"]


def test_interrupted_jobs_are_marked_failed_on_restart(store, app_ctx):
    project = store.create()
    (project.root / "jobs").mkdir()
    (project.root / "jobs" / "job.json").write_text(json.dumps({"state": "running", "run": 1}))
    runner = JobRunner(app_ctx.service, command=fake_command)
    job = runner.status(PID, project.id)
    assert job["state"] == "failed" and "interrupted" in job["error"]


def test_build_command_restricts_tools(tmp_path):
    command = build_command("/usr/local/bin/claude", "house-001", tmp_path / "mcp.json")
    assert command[:3] == ["/usr/local/bin/claude", "-p", command[2]] and "house-001" in command[2]
    for flag, value in (("--allowedTools", "mcp__facade-modeler"), ("--tools", ""),
                        ("--permission-mode", "dontAsk"), ("--mcp-config", str(tmp_path / "mcp.json"))):
        assert command[command.index(flag) + 1] == value
    assert "--strict-mcp-config" in command


def test_find_claude_prefers_env_override(monkeypatch, tmp_path):
    fake = tmp_path / "claude"
    fake.write_text("#!/bin/sh\n")
    fake.chmod(0o755)
    monkeypatch.setenv("FACADE_CLAUDE_BIN", str(fake))
    assert find_claude() == str(fake)


class HookedGuard:
    """代替 runner._guard 的可重入锁：armed 的线程完全释放锁时，同步执行一次回调。"""

    def __init__(self):
        self._lock = threading.RLock()
        self._local = threading.local()
        self.callback = None
        self.owner = None

    def __enter__(self):
        self._lock.acquire()
        self._local.depth = getattr(self._local, "depth", 0) + 1

    def __exit__(self, *exc):
        self._local.depth -= 1
        self._lock.release()
        if self._local.depth == 0 and self.callback and threading.current_thread() is self.owner:
            callback, self.callback = self.callback, None
            callback()


def test_start_right_after_the_final_rerun_check_is_not_lost(app_ctx, store, monkeypatch, tmp_path):
    """回归：后台线程判定"没有重跑"并释放锁之后、线程退出之前再 start，这次重跑不能丢。"""
    monkeypatch.setenv("FAKE_CLAUDE_MARK", str(tmp_path / "calls.jsonl"))
    runner = JobRunner(app_ctx.service, command=fake_command)
    guard = runner._guard = HookedGuard()
    project = store.create()
    original_finish = runner._finish
    fired = []

    def start_from_another_thread():
        thread = threading.Thread(target=runner.start, args=(PID, project.id))
        thread.start()
        thread.join()

    def finish_then_arm(*args):
        original_finish(*args)
        if not fired:  # 只在第一次运行后：下一次完全释放锁就是循环里最后那次 rerunPending 检查
            fired.append(True)
            guard.owner, guard.callback = threading.current_thread(), start_from_another_thread

    monkeypatch.setattr(runner, "_finish", finish_then_arm)
    runner.start(PID, project.id)
    deadline = time.time() + 10
    while time.time() < deadline:
        job = runner.status(PID, project.id)
        if len(calls(tmp_path)) == 2 and job["state"] == "done" and not job.get("rerunPending"):
            break
        time.sleep(0.05)
    job = runner.status(PID, project.id)
    assert fired and len(calls(tmp_path)) == 2, job
    assert job["run"] == 2 and job["state"] == "done" and not job.get("rerunPending")
