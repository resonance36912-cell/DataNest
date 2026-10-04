from pathlib import Path

import yaml
from fastapi.testclient import TestClient

from foundry_controller.app import main


def configured_client(tmp_path: Path, monkeypatch):
    governance = tmp_path / "governance"; governance.mkdir(parents=True)
    for name in ("release.yaml", "backend-runtime.yaml", "service-fabric.yaml", "suite.yaml", "local-service-replacements.yaml"):
        governance.joinpath(name).write_text(Path("governance", name).read_text(encoding="utf-8"), encoding="utf-8")
    p = yaml.safe_load(Path("governance/policy.yaml").read_text(encoding="utf-8"))
    policy_path = tmp_path / "policy.yaml"; policy_path.write_text(yaml.safe_dump(p, sort_keys=False), encoding="utf-8")
    governance.joinpath("policy.yaml").write_text(yaml.safe_dump(p, sort_keys=False), encoding="utf-8")
    target_main = tmp_path / "foundry_controller/app/main.py"; target_main.parent.mkdir(parents=True); target_main.write_text(Path("foundry_controller/app/main.py").read_text(encoding="utf-8"), encoding="utf-8")
    monkeypatch.setattr(main, "POLICY_PATH", policy_path)
    monkeypatch.setattr(main, "WORKSPACE_ROOT", tmp_path)
    monkeypatch.setattr(main, "REGISTRY_PATH", Path("runtime/registry/apps.jsonl"))
    monkeypatch.setattr(main, "RECEIPT_PATH", tmp_path / "runtime/receipts/execution.jsonl")
    return TestClient(main.app)


def test_release_api_preflight_and_confirmation(tmp_path: Path, monkeypatch):
    client = configured_client(tmp_path, monkeypatch)
    preflight = client.get("/v1/release/preflight")
    assert preflight.status_code == 200 and preflight.json()["passed"] is True
    denied = client.post("/v1/release/certify", json={"confirmed": False})
    assert denied.status_code == 403
    certified = client.post("/v1/release/certify", json={"confirmed": True})
    assert certified.status_code == 200
    assert certified.json()["level"] == "release_candidate_integrity"
    assert certified.json()["operational_runtime_verified"] is False


def test_health_reports_v1_release(tmp_path: Path, monkeypatch):
    client = configured_client(tmp_path, monkeypatch)
    result = client.get("/health")
    assert result.status_code == 200
    assert result.json()["version"] == "1.5.8"
