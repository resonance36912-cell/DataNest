import json
import os
from pathlib import Path

import pytest

from foundry_controller.app.agent import GovernanceViolation, SovereignWorkspace
from foundry_controller.app.build_cycle import apply_transactional_repairs, parse_repair_proposal, rollback_transaction
from foundry_controller.app.runner import DependencyGuard, IsolatedRunner, StaticSecurityScanner


@pytest.fixture
def policy():
    return {
        "execution": {"max_file_bytes": 100000, "max_command_seconds": 5},
        "protected_paths": ["governance/", "runtime/receipts/", ".env.sovereign"],
        "dependency_policy": {
            "require_exact_python_versions": True,
            "require_node_lockfile": True,
            "deny_remote_sources": True,
        },
        "security_scan": {"block_severities": ["critical", "high"], "max_files": 100, "max_file_bytes": 100000},
        "isolated_runner": {
            "engine": "podman",
            "allowed_project_prefixes": ["apps"],
            "max_seconds": 10,
            "memory": "512m",
            "cpus": "1.0",
            "pids_limit": 64,
            "user": "1000:1000",
            "tasks": {"compile": {"image": "resonance-runner-python:0.3", "command": ["python", "-m", "compileall", "-q", "."]}},
        },
    }


def test_canonical_protected_path_cannot_be_bypassed(tmp_path: Path, policy):
    (tmp_path / "apps" / "demo").mkdir(parents=True)
    (tmp_path / "governance").mkdir()
    ws = SovereignWorkspace(tmp_path, policy)
    with pytest.raises(GovernanceViolation):
        ws.write_file("apps/demo/../../governance/policy.yaml", "bypass")


def test_dependency_guard_accepts_exact_pins(tmp_path: Path, policy):
    project = tmp_path / "apps" / "demo"
    project.mkdir(parents=True)
    (project / "requirements.txt").write_text("fastapi==0.116.1\nuvicorn==0.35.0\n")
    result = DependencyGuard(policy).check(project)
    assert result["passed"] is True


def test_dependency_guard_rejects_remote_and_floating(tmp_path: Path, policy):
    project = tmp_path / "apps" / "demo"
    project.mkdir(parents=True)
    (project / "requirements.txt").write_text("demo>=1\nother @ https://example.com/pkg.whl\n")
    result = DependencyGuard(policy).check(project)
    assert result["passed"] is False
    assert len(result["violations"]) >= 2


def test_security_scanner_blocks_private_key(tmp_path: Path, policy):
    project = tmp_path / "apps" / "demo"
    project.mkdir(parents=True)
    (project / "secret.txt").write_text("-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n")
    result = StaticSecurityScanner(policy).scan(project)
    assert result["passed"] is False
    assert any(item["rule"] == "private_key" for item in result["blocking_findings"])


def test_runner_command_has_hard_isolation_flags(tmp_path: Path, policy):
    project = tmp_path / "apps" / "demo"
    project.mkdir(parents=True)
    command = IsolatedRunner(tmp_path, policy).build_command("compile", "apps/demo")
    joined = " ".join(command)
    assert "--network=none" in command
    assert "--pull=never" in command
    assert "--read-only" in command
    assert "--cap-drop=ALL" in command
    assert "--security-opt=no-new-privileges" in command
    assert "resonance-runner-python:0.3" in command
    assert "shell=True" not in joined


@pytest.mark.skipif(os.name != "nt", reason="Podman machine connection records are Windows-specific")
def test_runner_uses_only_default_loopback_podman_machine(tmp_path: Path, policy, monkeypatch):
    appdata = tmp_path / "appdata"
    connection_dir = appdata / "containers"
    connection_dir.mkdir(parents=True)
    identity = tmp_path / "podman-machine-key"
    identity.write_text("test key", encoding="utf-8")
    connection = {
        "Connection": {
            "Default": "podman-machine-default",
            "Connections": {
                "podman-machine-default": {
                    "URI": "ssh://user@127.0.0.1:61234/run/user/1000/podman/podman.sock",
                    "Identity": str(identity),
                    "IsMachine": True,
                }
            },
        }
    }
    (connection_dir / "podman-connections.json").write_text(json.dumps(connection), encoding="utf-8")
    monkeypatch.setenv("APPDATA", str(appdata))
    monkeypatch.delenv("CONTAINER_HOST", raising=False)
    monkeypatch.delenv("CONTAINER_SSHKEY", raising=False)
    runner = IsolatedRunner(tmp_path, policy)
    environment = runner._local_podman_machine_environment()
    assert environment["CONTAINER_HOST"].startswith("ssh://user@127.0.0.1:")
    assert environment["CONTAINER_SSHKEY"] == str(identity)


@pytest.mark.skipif(os.name != "nt", reason="Podman machine connection records are Windows-specific")
def test_runner_accepts_only_loopback_machine_settings(tmp_path: Path, policy, monkeypatch):
    identity = tmp_path / "podman-machine-key"
    identity.write_text("test key", encoding="utf-8")
    monkeypatch.setenv("CONTAINER_HOST", "ssh://user@127.0.0.1:61234/run/user/1000/podman/podman.sock")
    monkeypatch.setenv("CONTAINER_SSHKEY", str(identity))
    runner = IsolatedRunner(tmp_path, policy)
    assert runner._local_podman_machine_environment()["CONTAINER_HOST"].startswith("ssh://user@127.0.0.1:")
    monkeypatch.setenv("CONTAINER_HOST", "ssh://user@example.invalid/run/user/1000/podman/podman.sock")
    assert runner._podman_machine_environment(os.environ["CONTAINER_HOST"], str(identity)) == {}


def test_runner_denies_project_outside_apps(tmp_path: Path, policy):
    (tmp_path / "other").mkdir()
    runner = IsolatedRunner(tmp_path, policy)
    with pytest.raises(GovernanceViolation):
        runner.resolve_project("other")


def test_repair_transaction_rolls_back(tmp_path: Path, policy):
    project = tmp_path / "apps" / "demo"
    project.mkdir(parents=True)
    target = project / "app.py"
    target.write_text("print('before')\n")
    ws = SovereignWorkspace(tmp_path, policy)
    proposal = parse_repair_proposal('{"summary":"fix","changes":[{"path":"app.py","content":"print(\\"after\\")\\n"},{"path":"new.py","content":"x=1\\n"}]}')
    originals = {}
    apply_transactional_repairs(ws, "apps/demo", proposal, originals)
    assert "after" in target.read_text()
    assert (project / "new.py").exists()
    rollback_transaction(ws, originals)
    assert target.read_text() == "print('before')\n"
    assert not (project / "new.py").exists()


def test_repair_cannot_escape_target_project(tmp_path: Path, policy):
    project = tmp_path / "apps" / "demo"
    project.mkdir(parents=True)
    (tmp_path / "governance").mkdir()
    ws = SovereignWorkspace(tmp_path, policy)
    proposal = {"summary": "bad", "changes": [{"path": "../../governance/policy.yaml", "content": "bad"}]}
    with pytest.raises(GovernanceViolation):
        apply_transactional_repairs(ws, "apps/demo", proposal, {})


def test_project_scoped_git_commit_leaves_unrelated_change_uncommitted(tmp_path: Path, policy):
    import subprocess

    (tmp_path / "apps" / "demo").mkdir(parents=True)
    (tmp_path / "notes").mkdir()
    (tmp_path / "apps" / "demo" / "app.py").write_text("x=1\n")
    (tmp_path / "notes" / "note.txt").write_text("base\n")
    subprocess.run(["git", "init"], cwd=tmp_path, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "test@example.invalid"], cwd=tmp_path, check=True)
    subprocess.run(["git", "config", "user.name", "Resonance Test"], cwd=tmp_path, check=True)
    subprocess.run(["git", "add", "-A"], cwd=tmp_path, check=True)
    subprocess.run(["git", "commit", "-m", "base"], cwd=tmp_path, check=True, capture_output=True)

    (tmp_path / "apps" / "demo" / "app.py").write_text("x=2\n")
    (tmp_path / "notes" / "note.txt").write_text("unrelated\n")
    ws = SovereignWorkspace(tmp_path, policy)
    result = ws.git_commit_paths("project only", ["apps/demo"])
    assert result["committed"] is True
    status = subprocess.run(["git", "status", "--porcelain"], cwd=tmp_path, text=True, capture_output=True, check=True).stdout
    assert "notes/note.txt" in status
    assert "apps/demo/app.py" not in status
