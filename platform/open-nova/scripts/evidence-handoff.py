from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import urllib.parse
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = "resonance-real-execution-evidence-bundle/v1"
RELEASE = "1.5.2-handoff1"

SECRET_KEY_RE = re.compile(
    r"(?:^|_)(?:secret|password|passwd|token|api[_-]?key|private[_-]?key|credential|cookie|authorization|access[_-]?key|client[_-]?secret|connection[_-]?string)(?:$|_)",
    re.I,
)
PATH_KEY_RE = re.compile(r"(?:^|_)(?:source_path|repository_path|absolute_path|local_path|home_path|user_path)(?:$|_)", re.I)
EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
WINDOWS_ABS_RE = re.compile(r"^[A-Za-z]:[\\/]")
WINDOWS_ANY_RE = re.compile(r"(?:^|[^A-Za-z0-9])[A-Za-z]:[\\/]")
URL_RE = re.compile(r"https?://[^\s\"\'<>]+", re.I)
UNIX_PRIVATE_PREFIXES = ("/home/", "/Users/", "/root/", "/mnt/c/Users/")
SENSITIVE_VALUE_RES = [
    re.compile(r"\bsk-[A-Za-z0-9_-]{12,}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{20,}\b"),
    re.compile(r"\bAKIA[A-Z0-9]{16}\b"),
    re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
]

ALLOWED_ROOTS = (
    "runtime/real-execution",
    "runtime/source-ingestion",
    "runtime/migration-execution",
    "runtime/cutover",
    "runtime/workstation",
    "runtime/deployment",
    "runtime/supply-chain",
    "runtime/backend-runtime",
    "exports/operator-reports",
)
DENIED_PARTS = {"secrets", "apps", "imports", ".git", "node_modules", "dependency-cache", "artifact-inbox"}
ALLOWED_SUFFIXES = {".json"}
MAX_FILE_BYTES = 2_000_000


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def looks_absolute_path(value: str) -> bool:
    return bool(WINDOWS_ABS_RE.match(value)) or value.startswith(UNIX_PRIVATE_PREFIXES)


def sanitize_url(value: str) -> str:
    try:
        parsed = urllib.parse.urlsplit(value)
    except ValueError:
        return value
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return value
    host = parsed.hostname or ""
    if host not in {"127.0.0.1", "localhost", "::1"}:
        return "[redacted-external-url]"
    port = f":{parsed.port}" if parsed.port else ""
    return urllib.parse.urlunsplit((parsed.scheme, f"{host}{port}", parsed.path, "", ""))


def sanitize_string(value: str) -> str:
    if looks_absolute_path(value) or WINDOWS_ANY_RE.search(value) or any(prefix in value for prefix in UNIX_PRIVATE_PREFIXES):
        return "[redacted-local-path-context]"
    value = EMAIL_RE.sub("[redacted-email]", value)
    for rx in SENSITIVE_VALUE_RES:
        value = rx.sub("[REDACTED]", value)
    value = URL_RE.sub(lambda m: sanitize_url(m.group(0)), value)
    return value


def _normalized_key(key: str) -> str:
    return re.sub(r"[^a-z0-9]", "", key.lower())


def _secret_key(key: str) -> bool:
    norm = _normalized_key(key)
    return bool(SECRET_KEY_RE.search(key)) or any(token in norm for token in (
        "password", "passwd", "secret", "apikey", "privatekey", "credential",
        "authorization", "accesstoken", "refreshtoken", "clientsecret", "connectionstring",
    ))


def _path_key(key: str) -> bool:
    norm = _normalized_key(key)
    return bool(PATH_KEY_RE.search(key)) or norm in {
        "sourcepath", "repositorypath", "absolutepath", "localpath", "homepath", "userpath"
    }


def sanitize(value: Any, key: str | None = None) -> Any:
    if key and _secret_key(key):
        return "[REDACTED]"
    if key and _path_key(key):
        if isinstance(value, str) and not looks_absolute_path(value):
            # Preserve workspace-relative provenance paths.
            return sanitize_string(value)
        return "[redacted-local-path]"
    if isinstance(value, dict):
        return {str(k): sanitize(v, str(k)) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize(v) for v in value]
    if isinstance(value, tuple):
        return [sanitize(v) for v in value]
    if isinstance(value, str):
        return sanitize_string(value)
    return value


def candidate_files(workspace: Path, app_id: str) -> Iterable[Path]:
    seen: set[Path] = set()
    for rel_root in ALLOWED_ROOTS:
        root = (workspace / rel_root).resolve()
        try:
            root.relative_to(workspace.resolve())
        except ValueError:
            continue
        if not root.exists():
            continue
        for path in sorted(root.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in ALLOWED_SUFFIXES:
                continue
            rel = path.relative_to(workspace)
            if any(part in DENIED_PARTS for part in rel.parts):
                continue
            # App-scoped roots may contain multiple applications; keep only this app when the app id is a path segment.
            scoped_roots = {"real-execution", "source-ingestion", "migration-execution", "cutover", "backend-runtime", "supply-chain"}
            if len(rel.parts) >= 2 and rel.parts[0] == "runtime" and rel.parts[1] in scoped_roots:
                if len(rel.parts) >= 3 and rel.parts[2] != app_id and rel.parts[2] != ".gitkeep":
                    continue
            if path.stat().st_size > MAX_FILE_BYTES:
                continue
            rp = path.resolve()
            if rp not in seen:
                seen.add(rp)
                yield path


def sanitize_file(path: Path) -> tuple[bytes, dict[str, Any]]:
    raw = path.read_bytes()
    suffix = path.suffix.lower()
    if suffix == ".json":
        try:
            parsed = json.loads(raw.decode("utf-8"))
            clean = sanitize(parsed)
            out = (json.dumps(clean, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode("utf-8")
            return out, {"parsed_json": True}
        except (UnicodeDecodeError, json.JSONDecodeError):
            pass
    text = raw.decode("utf-8", errors="replace")
    clean_text = sanitize_string(text)
    return clean_text.encode("utf-8"), {"parsed_json": False}


def build_summary(workspace: Path, app_id: str, included: list[dict[str, Any]]) -> dict[str, Any]:
    latest = workspace / "runtime" / "real-execution" / app_id / "latest.json"
    latest_payload: dict[str, Any] = {}
    if latest.is_file():
        try:
            latest_payload = sanitize(json.loads(latest.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            latest_payload = {"status": "unreadable"}
    operator_report = workspace / "exports" / "operator-reports" / f"{app_id}-local-handoff.json"
    readiness: dict[str, Any] = {}
    if operator_report.is_file():
        try:
            report = sanitize(json.loads(operator_report.read_text(encoding="utf-8")))
            readiness = (report.get("result") or {}).get("readiness") or {}
        except (OSError, json.JSONDecodeError, AttributeError):
            readiness = {"status": "unreadable"}
    return {
        "schema": SCHEMA,
        "release": RELEASE,
        "generated_at": utc_now(),
        "app_id": app_id,
        "bundle_scope": "governance_and_execution_evidence_only",
        "application_source_included": False,
        "secret_values_included": False,
        "database_contents_included": False,
        "absolute_local_paths_included": False,
        "git_remote_urls_included": False,
        "production_cutover_performed_by_packager": False,
        "latest_execution_pointer": latest_payload,
        "readiness_state": readiness.get("state"),
        "next_action": readiness.get("next_action"),
        "blockers": readiness.get("blockers", []),
        "included_file_count": len(included),
        "included_files": included,
    }


def create_bundle(workspace: Path, app_id: str, output: Path) -> dict[str, Any]:
    workspace = workspace.resolve()
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="resonance-evidence-") as td:
        stage = Path(td) / "bundle"
        evidence_dir = stage / "evidence"
        evidence_dir.mkdir(parents=True)
        included: list[dict[str, Any]] = []
        for src in candidate_files(workspace, app_id):
            rel = src.relative_to(workspace)
            clean, meta = sanitize_file(src)
            dest = evidence_dir / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(clean)
            included.append({
                "path": str(Path("evidence") / rel).replace("\\", "/"),
                "sha256": sha256_bytes(clean),
                "bytes": len(clean),
                **meta,
            })
        summary = build_summary(workspace, app_id, included)
        (stage / "SUMMARY.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        (stage / "UPLOAD_THIS_TO_CHATGPT.txt").write_text(
            "Resonance Open Nova real-execution evidence bundle.\n"
            "This bundle intentionally excludes application source code, secrets, database contents, and absolute local paths.\n"
            "Upload this ZIP into the same ChatGPT project/thread for migration analysis.\n",
            encoding="utf-8",
        )
        manifest_entries = []
        for file in sorted(p for p in stage.rglob("*") if p.is_file() and p.name != "MANIFEST.json"):
            manifest_entries.append({
                "path": str(file.relative_to(stage)).replace("\\", "/"),
                "sha256": sha256_file(file),
                "bytes": file.stat().st_size,
            })
        manifest = {
            "schema": "resonance-evidence-manifest/v1",
            "release": RELEASE,
            "created_at": utc_now(),
            "files": manifest_entries,
        }
        manifest["aggregate_sha256"] = sha256_bytes(
            json.dumps(manifest_entries, sort_keys=True, separators=(",", ":")).encode("utf-8")
        )
        (stage / "MANIFEST.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        if output.exists():
            output.unlink()
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for file in sorted(p for p in stage.rglob("*") if p.is_file()):
                zf.write(file, arcname=str(file.relative_to(stage)).replace("\\", "/"))
    return {
        "schema": SCHEMA,
        "release": RELEASE,
        "app_id": app_id,
        "bundle_path": str(output),
        "bundle_sha256": sha256_file(output),
        "included_file_count": len(included),
        "aggregate_sha256": manifest["aggregate_sha256"],
        "source_included": False,
        "secrets_included": False,
    }


def verify_bundle(path: Path) -> dict[str, Any]:
    path = path.resolve()
    mismatches: list[str] = []
    missing: list[str] = []
    with zipfile.ZipFile(path, "r") as zf:
        names = set(zf.namelist())
        if "MANIFEST.json" not in names:
            return {"valid": False, "error": "manifest_missing", "mismatches": [], "missing": ["MANIFEST.json"]}
        manifest = json.loads(zf.read("MANIFEST.json").decode("utf-8"))
        for entry in manifest.get("files", []):
            name = str(entry.get("path", ""))
            if name not in names:
                missing.append(name)
                continue
            if sha256_bytes(zf.read(name)) != entry.get("sha256"):
                mismatches.append(name)
        entries = manifest.get("files", [])
        aggregate = sha256_bytes(json.dumps(entries, sort_keys=True, separators=(",", ":")).encode("utf-8"))
        if aggregate != manifest.get("aggregate_sha256"):
            mismatches.append("MANIFEST.aggregate_sha256")
    return {
        "schema": "resonance-evidence-verification/v1",
        "valid": not mismatches and not missing,
        "bundle_sha256": sha256_file(path),
        "checked": len(manifest.get("files", [])),
        "mismatches": mismatches,
        "missing": missing,
    }


def main() -> int:
    p = argparse.ArgumentParser(description="Create or verify a redacted Resonance Open Nova execution evidence bundle")
    p.add_argument("--workspace", default=str(ROOT))
    p.add_argument("--app-id", default="reson8-life")
    p.add_argument("--output")
    p.add_argument("--verify")
    args = p.parse_args()
    if args.verify:
        result = verify_bundle(Path(args.verify))
        print(json.dumps(result, indent=2))
        return 0 if result.get("valid") else 2
    workspace = Path(args.workspace)
    default_output = workspace / "exports" / "evidence-bundles" / f"{args.app_id}-real-execution-evidence.zip"
    result = create_bundle(workspace, args.app_id, Path(args.output) if args.output else default_output)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
