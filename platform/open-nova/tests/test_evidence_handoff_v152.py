from __future__ import annotations

import importlib.util
import json
import zipfile
from pathlib import Path


def load_module(root: Path):
    path = root / "scripts" / "evidence-handoff.py"
    spec = importlib.util.spec_from_file_location("evidence_handoff", path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def write_json(path: Path, payload: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def test_sanitizer_redacts_secrets_paths_emails_and_external_urls(tmp_path):
    root = Path(__file__).resolve().parents[1]
    mod = load_module(root)
    payload = {
        "clientSecret": "super-secret",
        "api_key": "abc",
        "sourcePath": r"C:\\Users\\Ashley\\ResonanceAppDev",
        "detail": r"failed at C:\\Users\\Ashley\\private\\file.txt",
        "email": "owner@example.com",
        "external": "https://example.com/private?q=secret",
        "loopback": "http://127.0.0.1:8787/builder?token=bad",
        "relative_path": "runtime/real-execution/reson8-life/latest.json",
    }
    clean = mod.sanitize(payload)
    assert clean["clientSecret"] == "[REDACTED]"
    assert clean["api_key"] == "[REDACTED]"
    assert clean["sourcePath"] == "[redacted-local-path]"
    assert clean["detail"] == "[redacted-local-path-context]"
    assert clean["email"] == "[redacted-email]"
    assert clean["external"] == "[redacted-external-url]"
    assert clean["loopback"] == "http://127.0.0.1:8787/builder"
    assert clean["relative_path"].startswith("runtime/")


def test_bundle_excludes_source_and_secret_roots(tmp_path):
    root = Path(__file__).resolve().parents[1]
    mod = load_module(root)
    workspace = tmp_path / "ws"
    app = "reson8-life"
    write_json(workspace / "runtime" / "real-execution" / app / "readiness" / "one.json", {
        "state": "blocked", "blockers": ["backend_runtime_not_healthy"], "source_path": r"C:\\private\\repo"
    })
    write_json(workspace / "runtime" / "secrets" / "do-not-share.json", {"password": "no"})
    write_json(workspace / "apps" / app / "APP_SPEC.json", {"source": "must not ship"})
    write_json(workspace / "exports" / "operator-reports" / f"{app}-local-handoff.json", {
        "result": {"readiness": {"state": "blocked", "next_action": "start_local_runtime", "blockers": ["runner"]}}
    })
    out = tmp_path / "bundle.zip"
    result = mod.create_bundle(workspace, app, out)
    assert result["source_included"] is False
    assert result["secrets_included"] is False
    with zipfile.ZipFile(out) as zf:
        names = set(zf.namelist())
        assert not any(name.startswith("evidence/apps/") for name in names)
        assert not any("runtime/secrets" in name for name in names)
        readiness_name = next(name for name in names if "real-execution" in name and name.endswith("one.json"))
        clean = json.loads(zf.read(readiness_name))
        assert clean["source_path"] == "[redacted-local-path]"
        summary = json.loads(zf.read("SUMMARY.json"))
        assert summary["application_source_included"] is False
        assert summary["next_action"] == "start_local_runtime"


def test_bundle_verifies_and_detects_tamper(tmp_path):
    root = Path(__file__).resolve().parents[1]
    mod = load_module(root)
    workspace = tmp_path / "ws"
    app = "reson8-life"
    write_json(workspace / "runtime" / "real-execution" / app / "readiness" / "one.json", {"state": "blocked"})
    out = tmp_path / "bundle.zip"
    mod.create_bundle(workspace, app, out)
    assert mod.verify_bundle(out)["valid"] is True

    tampered = tmp_path / "tampered.zip"
    with zipfile.ZipFile(out, "r") as src, zipfile.ZipFile(tampered, "w", compression=zipfile.ZIP_DEFLATED) as dst:
        for info in src.infolist():
            data = src.read(info.filename)
            if info.filename.endswith("one.json"):
                data = b'{"state":"ready"}\n'
            dst.writestr(info, data)
    result = mod.verify_bundle(tampered)
    assert result["valid"] is False
    assert result["mismatches"]


def test_candidate_files_are_app_scoped(tmp_path):
    root = Path(__file__).resolve().parents[1]
    mod = load_module(root)
    workspace = tmp_path / "ws"
    write_json(workspace / "runtime" / "real-execution" / "reson8-life" / "readiness" / "one.json", {"ok": True})
    write_json(workspace / "runtime" / "real-execution" / "other-app" / "readiness" / "two.json", {"ok": True})
    files = [str(p.relative_to(workspace)).replace("\\", "/") for p in mod.candidate_files(workspace, "reson8-life")]
    assert any("reson8-life" in f for f in files)
    assert not any("other-app" in f for f in files)


def test_non_json_runtime_files_are_not_collected(tmp_path):
    root = Path(__file__).resolve().parents[1]
    mod = load_module(root)
    workspace = tmp_path / "ws"
    path = workspace / "runtime" / "real-execution" / "reson8-life" / "logs" / "raw.txt"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(r"secret path C:\\Users\\Ashley\\repo", encoding="utf-8")
    assert list(mod.candidate_files(workspace, "reson8-life")) == []
