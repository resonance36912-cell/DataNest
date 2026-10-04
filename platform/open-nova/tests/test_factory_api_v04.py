from pathlib import Path

import yaml
from fastapi.testclient import TestClient

from foundry_controller.app import main


def test_builder_and_deterministic_factory_endpoint(tmp_path: Path, monkeypatch):
    policy = yaml.safe_load(Path("governance/policy.yaml").read_text())
    policy_path = tmp_path / "policy.yaml"
    policy_path.write_text(yaml.safe_dump(policy, sort_keys=False))
    monkeypatch.setattr(main, "POLICY_PATH", policy_path)
    monkeypatch.setattr(main, "WORKSPACE_ROOT", tmp_path)
    monkeypatch.setattr(main, "REGISTRY_PATH", Path("runtime/registry/apps.jsonl"))
    monkeypatch.setattr(main, "RECEIPT_PATH", tmp_path / "runtime/receipts/execution.jsonl")

    client = TestClient(main.app)
    ui = client.get("/builder")
    assert ui.status_code == 200
    assert "Sovereign App Factory" in ui.text

    response = client.post("/v1/factory/generate", json={
        "intent": "Create a local inventory application",
        "app_name": "Factory API Demo",
        "template": "python-fastapi",
        "strategy": "deterministic",
    })
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["validated"] is True
    assert data["preview"]["host"] == "127.0.0.1"
    assert data["receipt"]["external_ai_used"] is False
    assert (tmp_path / "apps/factory-api-demo/app.py").exists()

    registry = client.get("/v1/apps").json()
    assert registry["chain"]["valid"] is True
    assert registry["apps"][0]["app_id"] == "factory-api-demo"
