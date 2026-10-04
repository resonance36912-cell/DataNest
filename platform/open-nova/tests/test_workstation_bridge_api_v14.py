from __future__ import annotations

import subprocess
from pathlib import Path

import yaml
from fastapi.testclient import TestClient

import foundry_controller.app.main as main


def git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, check=True).stdout.strip()


def make_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    git(repo, "init")
    git(repo, "config", "user.email", "test@example.invalid")
    git(repo, "config", "user.name", "Open Nova Test")
    (repo / "README.md").write_text("# App\n", encoding="utf-8")
    git(repo, "add", "README.md")
    git(repo, "commit", "-m", "initial")
    return repo


def configure(tmp_path: Path, monkeypatch) -> Path:
    root = tmp_path / "workspace"
    root.mkdir()
    source_policy = Path(__file__).parents[1] / "governance" / "policy.yaml"
    p = yaml.safe_load(source_policy.read_text(encoding="utf-8"))
    p["execution"]["workspace_root"] = str(root)
    gov = root / "governance"
    gov.mkdir()
    policy_path = gov / "policy.yaml"
    policy_path.write_text(yaml.safe_dump(p, sort_keys=False), encoding="utf-8")
    monkeypatch.setattr(main, "POLICY_PATH", policy_path)
    monkeypatch.setattr(main, "WORKSPACE_ROOT", root)
    monkeypatch.setattr(main, "REGISTRY_PATH", root / "runtime/registry/apps.jsonl")
    monkeypatch.setattr(main, "RECEIPT_PATH", root / "runtime/receipts/execution.jsonl")
    return root


def test_v14_routes_registered():
    paths = {route.path for route in main.app.routes}
    required = {
        "/v1/workstation/status",
        "/v1/workstation/initialize",
        "/v1/repository-bridge/{app_id}/assess",
        "/v1/repository-bridge/{app_id}/stage",
        "/v1/repository-bridge/{app_id}/status",
        "/v1/repository-bridge/{app_id}/verify",
    }
    assert required <= paths
    assert main.app.version == "1.5.8"


def test_repository_bridge_api_round_trip(tmp_path: Path, monkeypatch):
    configure(tmp_path, monkeypatch)
    repo = make_repo(tmp_path)
    client = TestClient(main.app)
    init = client.post("/v1/workstation/initialize", json={"confirmed": True})
    assert init.status_code == 200
    assess = client.post("/v1/repository-bridge/pilot-app/assess", json={"source_path": str(repo), "confirmed": False})
    assert assess.status_code == 200
    assert assess.json()["ready_to_stage"] is True
    stage = client.post("/v1/repository-bridge/pilot-app/stage", json={"source_path": str(repo), "confirmed": True})
    assert stage.status_code == 200
    assert stage.json()["commit_sha"] == git(repo, "rev-parse", "HEAD")
    verify = client.get("/v1/repository-bridge/pilot-app/verify")
    assert verify.status_code == 200
    assert verify.json()["valid"] is True
    status = client.get("/v1/repository-bridge/pilot-app/status")
    assert status.status_code == 200
    assert status.json()["ready_for_governed_import"] is True
