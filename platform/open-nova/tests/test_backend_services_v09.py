from pathlib import Path

from fastapi.testclient import TestClient

from services.auth import app as auth_mod
from services.storage import app as storage_mod
from services.gateway import app as gateway_mod


def test_local_auth_signup_session_roundtrip(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(auth_mod, "DB", tmp_path / "auth.db")
    key = tmp_path / "auth.key"; key.write_text("k" * 64, encoding="utf-8")
    monkeypatch.setattr(auth_mod, "KEY_FILE", key)
    client = TestClient(auth_mod.app)
    signed = client.post("/v1/auth/sign-up", json={"email": "local@example.test", "password": "sovereign-pass-123"})
    assert signed.status_code == 200
    session = client.get("/v1/auth/session")
    assert session.status_code == 200
    assert session.json()["session"]["user"]["email"] == "local@example.test"


def test_local_storage_blocks_path_escape(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(storage_mod, "ROOT", tmp_path.resolve())
    good = storage_mod.resolve("bucket", "folder/file.txt")
    assert str(good).startswith(str(tmp_path.resolve()))
    try:
        storage_mod.resolve("bucket", "../../outside.txt")
        assert False, "path escape should fail"
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 400


def test_gateway_health_reports_driver_state():
    client = TestClient(gateway_mod.app)
    result = client.get("/health")
    assert result.status_code == 200
    body = result.json()
    assert body["service"] == "gateway"
    assert "postgres_driver" in body
