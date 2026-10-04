from __future__ import annotations

import hashlib
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .agent import GovernanceViolation
from .migration import IGNORED_DIRS, is_secret_file
from .supply_chain import sha256_file


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SovereignExporter:
    """Creates a local, non-destructive application export without secret-bearing files."""

    def __init__(self, workspace_root: Path, policy: dict[str, Any]):
        self.workspace = workspace_root.resolve()
        cfg = policy.get("exports", {})
        self.apps_root = (self.workspace / str(cfg.get("apps_root", "apps"))).resolve()
        self.export_root = (self.workspace / str(cfg.get("export_root", "runtime/exports"))).resolve()
        self.max_files = int(cfg.get("max_files", 10000))
        self.max_total_bytes = int(cfg.get("max_total_bytes", 1_000_000_000))

    def _project(self, app_id: str) -> Path:
        if not app_id or "/" in app_id or "\\" in app_id or ".." in app_id:
            raise GovernanceViolation("Unsafe application identifier.")
        project = (self.apps_root / app_id).resolve()
        try:
            project.relative_to(self.apps_root)
        except ValueError as exc:
            raise GovernanceViolation("Application path escaped apps root.") from exc
        if not project.is_dir():
            raise GovernanceViolation("Application is not present in the sovereign apps workspace.")
        return project

    def _files(self, project: Path):
        count = 0
        total = 0
        for path in sorted(project.rglob("*")):
            if path.is_dir() or path.is_symlink():
                continue
            rel = path.relative_to(project)
            if any(part in IGNORED_DIRS for part in rel.parts):
                continue
            if is_secret_file(path):
                continue
            count += 1
            total += path.stat().st_size
            if count > self.max_files:
                raise GovernanceViolation("Export exceeds governed file-count limit.")
            if total > self.max_total_bytes:
                raise GovernanceViolation("Export exceeds governed total-size limit.")
            yield path, rel

    def export(self, app_id: str, *, confirmed: bool = False) -> dict[str, Any]:
        if not confirmed:
            raise GovernanceViolation("Application export requires confirmed=true.")
        project = self._project(app_id)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        target_dir = (self.export_root / app_id).resolve()
        target_dir.mkdir(parents=True, exist_ok=True)
        archive = target_dir / f"{app_id}-{stamp}.zip"
        if archive.exists():
            raise GovernanceViolation("Export archive already exists; refusing to overwrite.")

        entries: list[dict[str, Any]] = []
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
            for path, rel in self._files(project):
                arc = f"{app_id}/{str(rel).replace('\\', '/')}"
                zf.write(path, arcname=arc)
                entries.append({"path": str(rel).replace("\\", "/"), "bytes": path.stat().st_size, "sha256": sha256_file(path)})
            canonical = json.dumps(entries, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
            internal_manifest = {
                "schema": "resonance-sovereign-export/v1",
                "created_at": utc_now(),
                "app_id": app_id,
                "source_modified": False,
                "secret_files_included": False,
                "file_count": len(entries),
                "files_sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
                "files": entries,
            }
            zf.writestr(f"{app_id}/RESONANCE_EXPORT_MANIFEST.json", json.dumps(internal_manifest, indent=2, ensure_ascii=False) + "\n")

        archive_digest = sha256_file(archive)
        receipt = {
            "schema": "resonance-export-receipt/v1",
            "created_at": utc_now(),
            "app_id": app_id,
            "archive": str(archive.relative_to(self.workspace)).replace("\\", "/"),
            "archive_sha256": archive_digest,
            "file_count": len(entries),
            "secret_files_included": False,
            "source_modified": False,
            "external_ai_used": False,
        }
        receipt_path = archive.with_suffix(".receipt.json")
        receipt_path.write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        receipt["receipt_path"] = str(receipt_path.relative_to(self.workspace)).replace("\\", "/")
        return receipt

    def verify_export(self, relative_archive: str) -> dict[str, Any]:
        archive = (self.workspace / relative_archive).resolve()
        try:
            archive.relative_to(self.export_root)
        except ValueError as exc:
            raise GovernanceViolation("Export verification is limited to the sovereign export directory.") from exc
        receipt_path = archive.with_suffix(".receipt.json")
        if not archive.is_file() or not receipt_path.is_file():
            return {"valid": False, "reason": "Archive or export receipt missing."}
        try:
            receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {"valid": False, "reason": "Export receipt is invalid JSON."}
        actual = sha256_file(archive)
        zip_ok = zipfile.is_zipfile(archive)
        return {
            "valid": zip_ok and actual == receipt.get("archive_sha256"),
            "zip_valid": zip_ok,
            "stored_sha256": receipt.get("archive_sha256"),
            "actual_sha256": actual,
            "app_id": receipt.get("app_id"),
        }
