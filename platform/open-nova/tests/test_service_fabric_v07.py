from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest
import yaml

from foundry_controller.app.agent import GovernanceViolation
from foundry_controller.app.registry import AppRegistry
from foundry_controller.app.service_fabric import SovereignServiceFabric


def policy(tmp_path: Path) -> dict:
    return {
        "service_fabric": {
            "manifest": "governance/service-fabric.yaml",
            "runtime_root": "runtime/service-fabric",
            "apps_root": "apps",
            "bindings_dirname": ".open-nova",
            "require_loopback_bind": True,
            "health_timeout_seconds": 0.01,
        }
    }


def write_manifest(root: Path, *, bad_host: bool = False, inline_secret: bool = False) -> None:
    (root / "governance").mkdir(parents=True, exist_ok=True)
    manifest = {
        "version": "0.7",
        "mode": "local-only",
        "services": [
            {
                "service_id": "postgres",
                "kind": "database",
                "endpoint": "postgresql://0.0.0.0:55432/resonance" if bad_host else "postgresql://127.0.0.1:55432/resonance",
                "image": "resonance-service-postgres:0.7",
                "required": True,
                "secret_refs": ["runtime/secrets/postgres-password"],
                **({"password": "bad-inline-secret"} if inline_secret else {}),
            },
            {"service_id": "auth", "kind": "auth", "endpoint": "http://127.0.0.1:58080", "image": "resonance-service-auth:0.7", "required": True, "secret_refs": ["runtime/secrets/auth-signing-key"]},
            {"service_id": "storage", "kind": "storage", "endpoint": "http://127.0.0.1:59000", "image": "resonance-service-storage:0.7", "required": True, "secret_refs": []},
            {"service_id": "gateway", "kind": "gateway", "endpoint": "http://127.0.0.1:58000", "image": "resonance-service-gateway:0.7", "required": True, "secret_refs": []},
            {"service_id": "ollama", "kind": "ai", "endpoint": "http://127.0.0.1:11434", "image": None, "required": False, "secret_refs": []},
            {"service_id": "foundry-controller", "kind": "controller", "endpoint": "http://127.0.0.1:8787", "image": None, "required": False, "secret_refs": []},
            {"service_id": "secrets", "kind": "secrets", "endpoint": "file://runtime/secrets", "image": None, "required": True, "secret_refs": []},
        ],
    }
    (root / "governance/service-fabric.yaml").write_text(yaml.safe_dump(manifest, sort_keys=False), encoding="utf-8")


def make_fabric(tmp_path: Path) -> SovereignServiceFabric:
    write_manifest(tmp_path)
    return SovereignServiceFabric(tmp_path, policy(tmp_path), AppRegistry(tmp_path / "runtime/registry/apps.jsonl"))


def test_manifest_accepts_loopback_and_tagged_local_images(tmp_path: Path):
    fabric = make_fabric(tmp_path)
    result = fabric.validate()
    assert result["valid"] is True
    assert len(result["services"]) == 7
    assert result["external_ai_required"] is False


def test_manifest_rejects_non_loopback_endpoint(tmp_path: Path):
    write_manifest(tmp_path, bad_host=True)
    fabric = SovereignServiceFabric(tmp_path, policy(tmp_path))
    result = fabric.validate()
    assert result["valid"] is False
    assert any("loopback" in error for error in result["errors"])


def test_manifest_rejects_inline_secret_material(tmp_path: Path):
    write_manifest(tmp_path, inline_secret=True)
    fabric = SovereignServiceFabric(tmp_path, policy(tmp_path))
    result = fabric.validate()
    assert result["valid"] is False
    assert any("inline secret" in error for error in result["errors"])


def test_supabase_signal_maps_to_database_auth_storage_gateway(tmp_path: Path):
    fabric = make_fabric(tmp_path)
    app = tmp_path / "apps/demo"
    app.mkdir(parents=True)
    (app / "client.ts").write_text('const x = "https://abc.supabase.co"; const y = "@supabase/supabase-js";', encoding="utf-8")
    plan = fabric.migration_plan("demo")
    assert "supabase-hosted" in plan["detected_external_services"]
    assert plan["required_local_services"] == ["postgres", "auth", "storage", "gateway"]
    assert plan["ready_to_bind"] is True


def test_openai_signal_maps_to_local_ollama(tmp_path: Path):
    fabric = make_fabric(tmp_path)
    app = tmp_path / "apps/demo"
    app.mkdir(parents=True)
    (app / "ai.py").write_text('endpoint="https://api.openai.com/v1/chat/completions"', encoding="utf-8")
    plan = fabric.migration_plan("demo")
    assert plan["required_local_services"] == ["ollama"]


def test_binding_write_requires_confirmation(tmp_path: Path):
    fabric = make_fabric(tmp_path)
    (tmp_path / "apps/demo").mkdir(parents=True)
    with pytest.raises(GovernanceViolation, match="confirmed=true"):
        fabric.write_bindings("demo", confirmed=False)


def test_bindings_write_refs_not_values(tmp_path: Path):
    fabric = make_fabric(tmp_path)
    app = tmp_path / "apps/demo"
    app.mkdir(parents=True)
    (app / "x.ts").write_text('const x="supabase.co";', encoding="utf-8")
    result = fabric.write_bindings("demo", confirmed=True)
    payload = json.loads((app / ".open-nova/service-bindings.json").read_text(encoding="utf-8"))
    assert result["contains_secret_values"] is False
    assert payload["contains_secret_values"] is False
    rendered = json.dumps(payload).lower()
    assert "postgres-password" in rendered
    assert "bad-inline-secret" not in rendered
    env = (app / ".env.sovereign.example").read_text(encoding="utf-8")
    assert "runtime/secrets/" in env
    assert "PASSWORD=" not in env


def test_binding_path_cannot_use_invalid_app_id(tmp_path: Path):
    fabric = make_fabric(tmp_path)
    with pytest.raises(GovernanceViolation, match="Invalid application id"):
        fabric.migration_plan("../governance")


def test_rendered_compose_is_internal_loopback_and_never_pulls(tmp_path: Path):
    fabric = make_fabric(tmp_path)
    result = fabric.render_compose()
    text = result["yaml"]
    assert "pull_policy: never" in text
    assert "127.0.0.1:" in text
    assert "internal: true" in text
    assert "0.0.0.0:" not in text
    assert "no-new-privileges:true" in text


def test_compose_write_requires_confirmation(tmp_path: Path):
    fabric = make_fabric(tmp_path)
    with pytest.raises(GovernanceViolation, match="confirmed=true"):
        fabric.write_compose(confirmed=False)
    result = fabric.write_compose(confirmed=True)
    assert (tmp_path / result["path"]).exists()


def test_health_for_file_secret_boundary_is_local_contract(tmp_path: Path):
    fabric = make_fabric(tmp_path)
    result = fabric.health()
    secret = next(x for x in result["services"] if x["service_id"] == "secrets")
    assert secret["reachable"] is True
    assert secret["check"] == "local_path_contract"
    assert result["network_scope"] == "loopback_only"
