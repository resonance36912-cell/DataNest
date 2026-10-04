from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import yaml
from fastapi.testclient import TestClient

import foundry_controller.app.main as main

ROOT = Path(__file__).parents[1]


def git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, check=True).stdout.strip()


def make_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    git(repo, "init")
    git(repo, "config", "user.email", "test@example.invalid")
    git(repo, "config", "user.name", "Open Nova Test")
    (repo / "README.md").write_text("# App\n", encoding="utf-8")
    (repo / "main.py").write_text("print('ok')\n", encoding="utf-8")
    git(repo, "add", "README.md", "main.py")
    git(repo, "commit", "-m", "initial")
    return repo


def configure(tmp_path: Path, monkeypatch) -> Path:
    root = tmp_path / "workspace"
    gov = root / "governance"
    gov.mkdir(parents=True)
    for name in ("policy.yaml", "service-fabric.yaml", "backend-runtime.yaml", "provider-neutral-api.yaml", "local-service-replacements.yaml", "suite.yaml", "release.yaml"):
        shutil.copy2(ROOT / "governance" / name, gov / name)
    p = yaml.safe_load((gov / "policy.yaml").read_text(encoding="utf-8"))
    p["execution"]["workspace_root"] = str(root)
    (gov / "policy.yaml").write_text(yaml.safe_dump(p, sort_keys=False), encoding="utf-8")
    monkeypatch.setattr(main, "POLICY_PATH", gov / "policy.yaml")
    monkeypatch.setattr(main, "WORKSPACE_ROOT", root)
    monkeypatch.setattr(main, "REGISTRY_PATH", root / "runtime/registry/apps.jsonl")
    monkeypatch.setattr(main, "RECEIPT_PATH", root / "runtime/receipts/execution.jsonl")
    return root


def test_v15_routes_registered():
    paths = {route.path for route in main.app.routes}
    required = {
        "/v1/real-execution/{app_id}/readiness",
        "/v1/real-execution/{app_id}/assess-repository",
        "/v1/real-execution/{app_id}/admit-repository",
        "/v1/real-execution/{app_id}/prepare",
        "/v1/real-execution/{app_id}/execute-supported",
        "/v1/real-execution/{app_id}/readiness-report",
        "/v1/real-execution/{app_id}/evidence/verify",
    }
    assert required <= paths
    assert main.app.version == "1.5.0-rc1"


def test_v15_api_repository_admission_round_trip(tmp_path: Path, monkeypatch):
    configure(tmp_path, monkeypatch)
    repo = make_repo(tmp_path)
    client = TestClient(main.app)
    assess = client.post("/v1/real-execution/pilot-app/assess-repository", json={"source_path": str(repo), "confirmed": False})
    assert assess.status_code == 200
    assert assess.json()["ready_for_admission"] is True
    admit = client.post("/v1/real-execution/pilot-app/admit-repository", json={"source_path": str(repo), "confirmed": True})
    assert admit.status_code == 200
    assert admit.json()["managed_imported"] is True
    readiness = client.get("/v1/real-execution/pilot-app/readiness")
    assert readiness.status_code == 200
    assert readiness.json()["source"]["managed"] is True
    verify = client.get("/v1/real-execution/pilot-app/evidence/verify")
    assert verify.status_code == 200
    assert verify.json()["valid"] is True
