from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

from foundry_controller.app.agent import GovernanceViolation
from foundry_controller.app.backend_runtime import SovereignBackendRuntime
from foundry_controller.app.registry import AppRegistry


def policy() -> dict:
    return {
        "backend_runtime": {
            "manifest": "governance/backend-runtime.yaml",
            "apps_root": "apps",
            "runtime_root": "runtime/backend-runtime",
            "secrets_root": "runtime/secrets",
            "require_confirmation": True,
        }
    }


def manifest(root: Path, bad_host: bool = False) -> None:
    (root / "governance").mkdir(parents=True, exist_ok=True)
    data = {
        "version": "0.9", "pull_policy": "never", "network": {"external": False},
        "services": {
            "postgres": {"image": "postgres:16.6-alpine", "host": "0.0.0.0" if bad_host else "127.0.0.1", "port": 55432, "container_port": 5432, "required": True},
            "auth": {"image": "resonance-service-auth:0.9", "host": "127.0.0.1", "port": 58080, "container_port": 8080, "required": True},
            "storage": {"image": "resonance-service-storage:0.9", "host": "127.0.0.1", "port": 59000, "container_port": 9000, "required": True},
            "gateway": {"image": "resonance-service-gateway:0.9", "host": "127.0.0.1", "port": 58000, "container_port": 8000, "required": True},
        }
    }
    (root / "governance/backend-runtime.yaml").write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


def runtime(root: Path) -> SovereignBackendRuntime:
    manifest(root)
    return SovereignBackendRuntime(root, policy(), AppRegistry(root / "runtime/registry/apps.jsonl"))


def test_manifest_requires_loopback_and_never_pull(tmp_path: Path):
    r = runtime(tmp_path)
    assert r.validate()["valid"] is True
    manifest(tmp_path, bad_host=True)
    result = SovereignBackendRuntime(tmp_path, policy()).validate()
    assert result["valid"] is False
    assert any("loopback" in x for x in result["errors"])


def test_secret_initialization_requires_confirmation_and_never_returns_values(tmp_path: Path):
    r = runtime(tmp_path)
    with pytest.raises(GovernanceViolation, match="confirmed=true"):
        r.initialize_secrets(confirmed=False)
    result = r.initialize_secrets(confirmed=True)
    assert result["secret_values_returned"] is False
    assert len(result["created_secret_refs"]) == 4
    for ref in result["created_secret_refs"]:
        p = tmp_path / ref
        assert p.exists() and len(p.read_text()) > 40
    rendered = json.dumps(result)
    assert "postgres-password" in rendered
    assert (tmp_path / "runtime/secrets/postgres-password").read_text() not in rendered


def test_compose_is_loopback_internal_and_never_pulls(tmp_path: Path):
    text = runtime(tmp_path).render_compose()
    assert "pull_policy: never" in text
    assert '"127.0.0.1:55432:5432"' in text
    assert "internal: true" in text
    assert "no-new-privileges:true" in text
    assert "0.0.0.0:" not in text


def test_runtime_write_requires_confirmation(tmp_path: Path):
    r = runtime(tmp_path)
    with pytest.raises(GovernanceViolation, match="confirmed=true"):
        r.write_runtime(confirmed=False)
    out = r.write_runtime(confirmed=True)
    assert (tmp_path / out["path"]).is_file()


def test_migration_plan_orders_and_blocks_destructive_sql(tmp_path: Path):
    r = runtime(tmp_path)
    app = tmp_path / "apps/demo"; app.mkdir(parents=True)
    (app / "001_create_items.sql").write_text("CREATE TABLE items(id integer primary key);\n")
    (app / "002_drop_items.sql").write_text("DROP TABLE items;\n")
    plan = r.migration_plan("demo")
    assert [x["path"] for x in plan["migrations"]] == ["001_create_items.sql", "002_drop_items.sql"]
    assert any("destructive_sql" in b for b in plan["blockers"])
    assert plan["ready_for_non_destructive_execution"] is False


def test_unordered_migration_filename_is_blocker(tmp_path: Path):
    r = runtime(tmp_path)
    app = tmp_path / "apps/demo"; app.mkdir(parents=True)
    (app / "create.sql").write_text("CREATE TABLE demo(id integer);\n")
    assert any("migration_filename_not_ordered" in b for b in r.migration_plan("demo")["blockers"])


def test_migration_exec_uses_psql_without_shell_and_records_registry(tmp_path: Path):
    r = runtime(tmp_path)
    r.initialize_secrets(confirmed=True)
    app = tmp_path / "apps/demo"; app.mkdir(parents=True)
    (app / "001_create_items.sql").write_text("CREATE TABLE items(id integer primary key);\n")
    calls = []
    def fake_runner(command, **kwargs):
        calls.append((command, kwargs)); return SimpleNamespace(returncode=0, stdout="", stderr="")
    out = r.execute_migrations("demo", confirmed=True, runner=fake_runner)
    assert out["executed"] == ["001_create_items.sql"]
    assert calls[0][0][0] == "psql"
    assert calls[0][1]["shell"] is False
    assert "--single-transaction" in calls[0][0]
    assert r.registry.verify_chain()["valid"] is True


def test_health_is_not_ready_when_required_services_are_absent(tmp_path: Path):
    r = runtime(tmp_path)
    result = r.health()
    assert result["ready"] is False
    assert result["network_scope"] == "loopback_only"


def test_certification_requires_health_bindings_and_adapter(tmp_path: Path, monkeypatch):
    r = runtime(tmp_path)
    app = tmp_path / "apps/demo"; (app / ".open-nova").mkdir(parents=True); (app / "open-nova-adapters").mkdir()
    (app / ".open-nova/service-bindings.json").write_text("{}")
    (app / "open-nova-adapters/supabase-compat.ts").write_text("export {}")
    (app / "001_schema.sql").write_text("CREATE TABLE items(id integer);\n")
    monkeypatch.setattr(r, "health", lambda: {"ready": True, "services": [], "network_scope": "loopback_only"})
    result = r.certify("demo")
    assert result["backend_ready"] is True
    assert (app / ".open-nova/backend-certification.json").is_file()
