from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest
import yaml

from foundry_controller.app.agent import GovernanceViolation
from foundry_controller.app.registry import AppRegistry
from foundry_controller.app.workstation_bridge import SovereignWorkstationBridge


def policy(root: Path) -> dict:
    p = yaml.safe_load((Path(__file__).parents[1] / "governance" / "policy.yaml").read_text(encoding="utf-8"))
    p["execution"]["workspace_root"] = str(root)
    return p


def git(repo: Path, *args: str) -> str:
    r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, check=True)
    return r.stdout.strip()


def make_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "source-repo"
    repo.mkdir()
    git(repo, "init")
    git(repo, "config", "user.email", "test@example.invalid")
    git(repo, "config", "user.name", "Open Nova Test")
    (repo / "README.md").write_text("# Test App\n", encoding="utf-8")
    (repo / "app.py").write_text("print('ok')\n", encoding="utf-8")
    git(repo, "add", "README.md", "app.py")
    git(repo, "commit", "-m", "initial")
    return repo


def bridge(tmp_path: Path) -> SovereignWorkstationBridge:
    root = tmp_path / "workspace"
    root.mkdir()
    return SovereignWorkstationBridge(root, policy(root), AppRegistry(root / "runtime/registry/apps.jsonl"))


def test_assess_clean_local_git_repository(tmp_path: Path):
    repo = make_repo(tmp_path)
    b = bridge(tmp_path)
    result = b.assess_repository(str(repo))
    assert result["ready_to_stage"] is True
    assert result["clean"] is True
    assert result["tracked_file_count"] == 2
    assert result["repository_path_recorded"] is False
    assert result["remote_urls_recorded"] is False
    assert result["network_used"] is False
    assert len(result["commit_sha"]) == 40


def test_dirty_repository_is_blocked(tmp_path: Path):
    repo = make_repo(tmp_path)
    (repo / "untracked.txt").write_text("dirty", encoding="utf-8")
    result = bridge(tmp_path).assess_repository(str(repo))
    assert result["ready_to_stage"] is False
    assert "repository_worktree_not_clean" in result["blockers"]


def test_tracked_secret_is_blocked(tmp_path: Path):
    repo = make_repo(tmp_path)
    (repo / ".env.production").write_text("SECRET=value\n", encoding="utf-8")
    git(repo, "add", ".env.production")
    git(repo, "commit", "-m", "tracked secret fixture")
    result = bridge(tmp_path).assess_repository(str(repo))
    assert result["ready_to_stage"] is False
    assert any("secret-bearing" in x for x in result["blockers"])


def test_stage_and_verify_clean_snapshot(tmp_path: Path):
    repo = make_repo(tmp_path)
    b = bridge(tmp_path)
    result = b.stage_repository("pilot-app", str(repo), confirmed=True)
    assert result["staged"] is True
    assert result["source_modified"] is False
    assert result["repository_path_recorded"] is False
    verify = b.verify_staged("pilot-app")
    assert verify["valid"] is True
    status = b.repository_status("pilot-app")
    assert status["ready_for_governed_import"] is True
    source_evidence = b.workspace / "runtime/source-ingestion/pilot-app/latest.json"
    payload = json.loads(source_evidence.read_text(encoding="utf-8"))
    assert payload["source_kind"] == "clean_local_git_snapshot"
    assert payload["source_commit_sha"] == git(repo, "rev-parse", "HEAD")


def test_stage_requires_confirmation(tmp_path: Path):
    repo = make_repo(tmp_path)
    with pytest.raises(GovernanceViolation, match="confirmed=true"):
        bridge(tmp_path).stage_repository("pilot-app", str(repo), confirmed=False)


def test_staged_tamper_is_detected(tmp_path: Path):
    repo = make_repo(tmp_path)
    b = bridge(tmp_path)
    b.stage_repository("pilot-app", str(repo), confirmed=True)
    (b.workspace / "imports/projects/pilot-app/app.py").write_text("print('tampered')\n", encoding="utf-8")
    result = b.verify_staged("pilot-app")
    assert result["valid"] is False
    assert "app.py" in result["mismatches"]


def test_workstation_initialization_is_hashed_and_private(tmp_path: Path):
    b = bridge(tmp_path)
    result = b.initialize_workstation(confirmed=True)
    assert result["initialized"] is True
    assert result["state_integrity_valid"] is True
    assert result["workspace_path_recorded"] is False
    state_path = b.workspace / "runtime/workstation/state.json"
    data = json.loads(state_path.read_text(encoding="utf-8"))
    assert "workspace_path" not in data
    data["external_ai_default"] = "allowed"
    state_path.write_text(json.dumps(data), encoding="utf-8")
    assert b.workstation_status()["state_integrity_valid"] is False
