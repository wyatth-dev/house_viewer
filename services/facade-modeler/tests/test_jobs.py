"""上传后自动建模：后台任务的启动、成功、失败、排队与恢复。"""
import json
import sys
import time
from pathlib import Path

import pytest

from facade_modeler.jobs.runner import JobRunner, build_command, find_claude
from facade_modeler.project.store import ProjectStore

FAKE = str(Path(__file__).parent / "fake_claude.py")


def fake_command(project_id, mcp_config):
    return [sys.executable, FAKE, "-p", f"model {project_id}", "--mcp-config", str(mcp_config)]


def wait_for(runner, project_id, states=("done", "failed"), timeout=10):
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = runner.status(project_id)
        if job and job["state"] in states and not job.get("rerunPending"):
            return job
        time.sleep(0.05)
    raise AssertionError(f"job did not finish: {runner.status(project_id)}")


@pytest.fixture
def store(tmp_path):
    return ProjectStore(tmp_path / "projects")


@pytest.fixture
def runner(store, monkeypatch, tmp_path):
    monkeypatch.setenv("FAKE_CLAUDE_MARK", str(tmp_path / "calls.jsonl"))
    return JobRunner(store, command=fake_command)


def calls(tmp_path):
    path = tmp_path / "calls.jsonl"
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


def test_job_runs_and_finishes(store, runner, tmp_path):
    project = store.create()
    runner.start(project.id)
    job = wait_for(runner, project.id)
    assert job["state"] == "done" and job["run"] == 1 and job["exitCode"] == 0
    assert len(calls(tmp_path)) == 1
    log = (project.root / "jobs" / "run-1.log").read_text()
    assert '"subtype": "success"' in log


def test_mcp_config_points_at_this_projects_dir(store, runner, tmp_path):
    project = store.create()
    runner.start(project.id)
    wait_for(runner, project.id)
    args = calls(tmp_path)[0]
    config = json.loads(Path(args[args.index("--mcp-config") + 1]).read_text())
    server = config["mcpServers"]["facade-modeler"]
    assert server["env"]["FACADE_PROJECTS_DIR"] == str(store.root.resolve())
    assert server["args"][-1] == "facade_modeler.adapters.mcp_server"


def test_failure_reports_exit_code_and_log_tail(store, runner, monkeypatch):
    monkeypatch.setenv("FAKE_CLAUDE_EXIT", "3")
    project = store.create()
    runner.start(project.id)
    job = wait_for(runner, project.id)
    assert job["state"] == "failed" and job["exitCode"] == 3
    assert "fake failure" in job["logTail"]


def test_start_while_running_queues_one_rerun(store, runner, monkeypatch, tmp_path):
    monkeypatch.setenv("FAKE_CLAUDE_SLEEP", "0.5")
    project = store.create()
    runner.start(project.id)
    time.sleep(0.1)
    runner.start(project.id)
    runner.start(project.id)  # 多次触发只排队一次
    job = wait_for(runner, project.id)
    assert job["run"] == 2 and len(calls(tmp_path)) == 2


def test_missing_claude_fails_with_clear_message(store, tmp_path):
    runner = JobRunner(store, command=None, claude_bin=None)
    project = store.create()
    runner.start(project.id)
    job = wait_for(runner, project.id)
    assert job["state"] == "failed" and "Claude Code" in job["error"]


def test_interrupted_jobs_are_marked_failed_on_restart(store):
    project = store.create()
    (project.root / "jobs").mkdir()
    (project.root / "jobs" / "job.json").write_text(json.dumps({"state": "running", "run": 1}))
    runner = JobRunner(store, command=fake_command)
    job = runner.status(project.id)
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
