from pathlib import Path

import yaml
from fastapi.testclient import TestClient

from foundry_controller.app import main
import foundry_controller.app.local_deployment as deployment_mod


def configured_client(tmp_path: Path, monkeypatch):
    governance = tmp_path / "governance"; governance.mkdir(parents=True)
    for name in ("release.yaml", "backend-runtime.yaml", "service-fabric.yaml", "suite.yaml", "local-service-replacements.yaml"):
        governance.joinpath(name).write_text(Path("governance", name).read_text(encoding="utf-8"), encoding="utf-8")
    p = yaml.safe_load(Path("governance/policy.yaml").read_text(encoding="utf-8"))
    policy_path = tmp_path / "policy.yaml"; policy_path.write_text(yaml.safe_dump(p, sort_keys=False), encoding="utf-8")
    governance.joinpath("policy.yaml").write_text(yaml.safe_dump(p, sort_keys=False), encoding="utf-8")
    monkeypatch.setattr(main, "POLICY_PATH", policy_path)
    monkeypatch.setattr(main, "WORKSPACE_ROOT", tmp_path)
    monkeypatch.setattr(main, "REGISTRY_PATH", Path("runtime/registry/apps.jsonl"))
    monkeypatch.setattr(main, "RECEIPT_PATH", tmp_path / "runtime/receipts/execution.jsonl")
    monkeypatch.setattr(deployment_mod.shutil, "which", lambda name: f"/bin/{name}" if name in {"git", "podman", "openssl"} else None)
    monkeypatch.setattr(deployment_mod, "_tool_version", lambda exe, args: f"{exe} test" if exe in {"git", "podman", "openssl"} else None)
    monkeypatch.setattr(deployment_mod, "_port_state", lambda *args, **kwargs: "closed")
    return TestClient(main.app)


def test_deployment_preflight_and_evidence_api(tmp_path: Path, monkeypatch):
    client = configured_client(tmp_path, monkeypatch)
    pre = client.get("/v1/deployment/preflight")
    assert pre.status_code == 200
    assert pre.json()["ready_for_offline_runtime"] is True
    denied = client.post("/v1/deployment/evidence", json={"confirmed": False})
    assert denied.status_code == 403
    saved = client.post("/v1/deployment/evidence", json={"confirmed": True})
    assert saved.status_code == 200
    verified = client.get("/v1/deployment/evidence/verify")
    assert verified.status_code == 200 and verified.json()["valid"] is True


def test_first_app_plan_api(tmp_path: Path, monkeypatch):
    client = configured_client(tmp_path, monkeypatch)
    result = client.get("/v1/deployment/first-app/reson8-life/plan")
    assert result.status_code == 200
    data = result.json()
    assert data["app_id"] == "reson8-life"
    assert data["current_state"] == "source_needed"
    written = client.post("/v1/deployment/first-app/reson8-life/plan", json={"confirmed": True})
    assert written.status_code == 200
    assert written.json()["plan_path"].endswith("first-app-reson8-life.json")
