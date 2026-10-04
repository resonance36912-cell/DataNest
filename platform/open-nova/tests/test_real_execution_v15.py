from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

from foundry_controller.app.agent import GovernanceViolation
from foundry_controller.app.real_execution import FirstRealExecutionPack
from foundry_controller.app.registry import AppRegistry

ROOT = Path(__file__).parents[1]


def git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, check=True).stdout.strip()


def make_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "real-repo"
    repo.mkdir()
    git(repo, "init")
    git(repo, "config", "user.email", "test@example.invalid")
    git(repo, "config", "user.name", "Open Nova Test")
    (repo / "README.md").write_text("# Real App\n", encoding="utf-8")
    (repo / "app.py").write_text("print('real')\n", encoding="utf-8")
    git(repo, "add", "README.md", "app.py")
    git(repo, "commit", "-m", "real source")
    return repo


def make_workspace(tmp_path: Path) -> tuple[Path, dict]:
    root = tmp_path / "workspace"
    (root / "governance").mkdir(parents=True)
    for name in ("policy.yaml", "service-fabric.yaml", "backend-runtime.yaml", "provider-neutral-api.yaml", "local-service-replacements.yaml", "suite.yaml", "release.yaml"):
        shutil.copy2(ROOT / "governance" / name, root / "governance" / name)
    p = yaml.safe_load((root / "governance/policy.yaml").read_text(encoding="utf-8"))
    p["execution"]["workspace_root"] = str(root)
    (root / "governance/policy.yaml").write_text(yaml.safe_dump(p, sort_keys=False), encoding="utf-8")
    return root, p


def pack(tmp_path: Path) -> FirstRealExecutionPack:
    root, p = make_workspace(tmp_path)
    return FirstRealExecutionPack(root, p, AppRegistry(root / "runtime/registry/apps.jsonl"))


def test_readiness_truthfully_requires_real_repository(tmp_path: Path):
    p = pack(tmp_path)
    result = p.readiness("reson8-life")
    assert result["state"] == "blocked"
    assert "real_repository_not_admitted" in result["blockers"]
    assert result["production_cutover_allowed"] is False
    assert result["network_used"] is False
    assert result["external_ai_used"] is False


def test_assess_and_admit_clean_repository_copy_only(tmp_path: Path):
    repo = make_repo(tmp_path)
    before = git(repo, "status", "--porcelain")
    p = pack(tmp_path)
    assessment = p.assess_repository("pilot-app", str(repo))
    assert assessment["ready_for_admission"] is True
    result = p.admit_repository("pilot-app", str(repo), confirmed=True)
    assert result["managed_imported"] is True
    assert result["source_modified"] is False
    assert result["repository_path_recorded"] is False
    assert result["remote_urls_recorded"] is False
    assert git(repo, "status", "--porcelain") == before == ""
    assert (p.workspace / "apps/pilot-app/app.py").read_text(encoding="utf-8") == "print('real')\n"


def test_admission_requires_confirmation(tmp_path: Path):
    repo = make_repo(tmp_path)
    with pytest.raises(GovernanceViolation, match="confirmed=true"):
        pack(tmp_path).admit_repository("pilot-app", str(repo), confirmed=False)


def test_real_execution_evidence_detects_tamper(tmp_path: Path):
    repo = make_repo(tmp_path)
    p = pack(tmp_path)
    result = p.admit_repository("pilot-app", str(repo), confirmed=True)
    assert p.verify_evidence("pilot-app")["valid"] is True
    path = p.workspace / result["evidence"]["path"]
    data = json.loads(path.read_text(encoding="utf-8"))
    data["network_used"] = True
    path.write_text(json.dumps(data), encoding="utf-8")
    checked = p.verify_evidence("pilot-app")
    assert checked["valid"] is False
    assert checked["mismatches"]


def test_governance_denies_network_external_ai_and_production_cutover(tmp_path: Path):
    p = pack(tmp_path)
    assert p.network_access_allowed is False
    assert p.external_ai_allowed is False
    assert p.production_cutover_allowed is False
