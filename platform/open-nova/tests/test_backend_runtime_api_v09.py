from pathlib import Path

import yaml
from fastapi.testclient import TestClient

from foundry_controller.app import main


def configured_client(tmp_path: Path, monkeypatch):
    policy = yaml.safe_load(Path("governance/policy.yaml").read_text(encoding="utf-8"))
    policy_path = tmp_path / "policy.yaml"
    policy_path.write_text(yaml.safe_dump(policy, sort_keys=False), encoding="utf-8")
    governance = tmp_path / "governance"; governance.mkdir(parents=True)
    for name in ("backend-runtime.yaml", "service-fabric.yaml", "provider-neutral-api.yaml"):
        governance.joinpath(name).write_text(Path("governance", name).read_text(encoding="utf-8"), encoding="utf-8")
    monkeypatch.setattr(main, "POLICY_PATH", policy_path)
    monkeypatch.setattr(main, "WORKSPACE_ROOT", tmp_path)
    monkeypatch.setattr(main, "REGISTRY_PATH", Path("runtime/registry/apps.jsonl"))
    monkeypatch.setattr(main, "RECEIPT_PATH", tmp_path / "runtime/receipts/execution.jsonl")
    return TestClient(main.app)


def test_backend_api_validate_init_write_plan_and_certify_blocked(tmp_path: Path, monkeypatch):
    client = configured_client(tmp_path, monkeypatch)
    valid = client.get("/v1/backend/validate")
    assert valid.status_code == 200 and valid.json()["valid"] is True
    denied = client.post("/v1/backend/secrets/init", json={"confirmed": False})
    assert denied.status_code == 403
    init = client.post("/v1/backend/secrets/init", json={"confirmed": True})
    assert init.status_code == 200 and init.json()["secret_values_returned"] is False
    written = client.post("/v1/backend/runtime/write", json={"confirmed": True})
    assert written.status_code == 200 and written.json()["pull_policy"] == "never"

    app = tmp_path / "apps/demo"; (app / ".open-nova").mkdir(parents=True); (app / "open-nova-adapters").mkdir()
    (app / ".open-nova/service-bindings.json").write_text("{}")
    (app / "open-nova-adapters/supabase-compat.ts").write_text("export {}")
    (app / "001_schema.sql").write_text("CREATE TABLE items(id integer);\n")
    plan = client.get("/v1/backend/apps/demo/migration-plan")
    assert plan.status_code == 200 and plan.json()["ready_for_non_destructive_execution"] is True
    monkeypatch.setattr(main.SovereignBackendRuntime, "health", lambda self: {
        "ready": False, "services": [], "network_scope": "loopback_only"
    })
    cert = client.post("/v1/backend/apps/demo/certify")
    assert cert.status_code == 200 and cert.json()["backend_ready"] is False
    assert "required_local_services_not_healthy" in cert.json()["blockers"]
