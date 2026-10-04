from __future__ import annotations

import hashlib
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .adapter_engine import SovereignAdapterEngine
from .agent import GovernanceViolation
from .cutover import SovereignCutoverManager
from .migration import IGNORED_DIRS, SovereignMigrator, is_secret_file
from .registry import APP_ID_RE, AppRegistry
from .service_fabric import SovereignServiceFabric
from .supply_chain import write_supply_chain_evidence, verify_supply_chain_evidence


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha256_json(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _path_hash(path: Path) -> str:
    return hashlib.sha256(str(path).encode("utf-8")).hexdigest()


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def _is_linklike(path: Path) -> bool:
    if path.is_symlink():
        return True
    checker = getattr(path, "is_junction", None)
    if callable(checker):
        try:
            return bool(checker())
        except OSError:
            return True
    return False


class RealSourceIngestor:
    """Copies an explicitly approved local source tree into the governed migration inbox.

    The original tree is never modified. The source path itself is not persisted; only a
    SHA-256 digest of that path is recorded as provenance metadata.
    """

    def __init__(self, workspace_root: Path, policy: dict[str, Any], registry: AppRegistry):
        self.workspace = workspace_root.resolve()
        self.policy = policy
        self.registry = registry
        cfg = policy.get("source_ingestion", {}) or {}
        self.stage_root = (self.workspace / str(cfg.get("stage_root", "imports/projects"))).resolve()
        self.apps_root = (self.workspace / str(cfg.get("apps_root", "apps"))).resolve()
        self.runtime_root = (self.workspace / str(cfg.get("runtime_root", "runtime/source-ingestion"))).resolve()
        self.max_files = int(cfg.get("max_files", 10000))
        self.max_total_bytes = int(cfg.get("max_total_bytes", 1_000_000_000))
        self.require_confirmation = bool(cfg.get("require_confirmation", True))
        for path in (self.stage_root, self.apps_root, self.runtime_root):
            path.relative_to(self.workspace)

    def _validate_app_id(self, app_id: str) -> None:
        if not APP_ID_RE.fullmatch(app_id):
            raise GovernanceViolation("Invalid application id.")

    def _iter_admitted_files(self, source: Path):
        count = 0
        total = 0
        for path in sorted(source.rglob("*")):
            rel = path.relative_to(source)
            if _is_linklike(path):
                raise GovernanceViolation(f"Source contains a symlink/reparse point: {rel.as_posix()}")
            if any(part in IGNORED_DIRS for part in rel.parts):
                continue
            if not path.is_file():
                continue
            if is_secret_file(path):
                raise GovernanceViolation(f"Source contains a secret-bearing file: {rel.as_posix()}")
            size = path.stat().st_size
            count += 1
            total += size
            if count > self.max_files:
                raise GovernanceViolation("Local source exceeds governed file-count limit.")
            if total > self.max_total_bytes:
                raise GovernanceViolation("Local source exceeds governed byte limit.")
            yield path, rel, size

    def stage_local(self, app_id: str, source_path: str, *, confirmed: bool = False) -> dict[str, Any]:
        self._validate_app_id(app_id)
        if self.require_confirmation and not confirmed:
            raise GovernanceViolation("Local source ingestion requires confirmed=true.")
        raw_source = Path(source_path).expanduser()
        if _is_linklike(raw_source):
            raise GovernanceViolation("Approved local source root cannot be a symlink/reparse point.")
        source = raw_source.resolve()
        if not source.is_dir():
            raise GovernanceViolation("Approved local source directory does not exist.")
        if source == self.workspace:
            raise GovernanceViolation("The Open Nova workspace itself cannot be ingested as an application.")
        destination = (self.stage_root / app_id).resolve()
        destination.relative_to(self.stage_root)
        managed = (self.apps_root / app_id).resolve()
        managed.relative_to(self.apps_root)
        if destination.exists():
            raise GovernanceViolation("A staged source with this application id already exists; refusing to overwrite.")
        if managed.exists():
            raise GovernanceViolation("A managed application with this id already exists; refusing to stage over it.")
        try:
            destination.relative_to(source)
            raise GovernanceViolation("Staging destination cannot be inside the approved source tree.")
        except ValueError:
            pass

        files = list(self._iter_admitted_files(source))
        if not files:
            raise GovernanceViolation("Approved local source contains no admissible files.")
        entries: list[dict[str, Any]] = []
        destination.mkdir(parents=True, exist_ok=False)
        try:
            for src, rel, size in files:
                target = destination / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, target)
                digest = _sha256_file(src)
                entries.append({"path": rel.as_posix(), "bytes": size, "sha256": digest})
        except Exception:
            shutil.rmtree(destination, ignore_errors=True)
            raise

        canonical = json.dumps(entries, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        tree_sha256 = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        record = {
            "schema": "resonance-real-source-ingestion/v1",
            "created_at": utc_now(),
            "release": "1.5.8",
            "app_id": app_id,
            "source_path_sha256": _path_hash(source),
            "source_path_recorded": False,
            "source_modified": False,
            "destination": f"imports/projects/{app_id}",
            "file_count": len(entries),
            "total_bytes": sum(x["bytes"] for x in entries),
            "tree_sha256": tree_sha256,
            "files": entries,
            "secrets_copied": False,
            "symlinks_copied": False,
            "network_used": False,
            "external_ai_used": False,
        }
        out_dir = self.runtime_root / app_id
        out_dir.mkdir(parents=True, exist_ok=True)
        out = out_dir / "latest.json"
        record["record_sha256"] = _sha256_json(record)
        out.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        event = self.registry.append(app_id, "real_source_staged", {
            "status": "real_source_staged", "tree_sha256": tree_sha256,
            "file_count": len(entries), "source_modified": False,
        })
        return {
            "app_id": app_id,
            "staged": True,
            "destination": record["destination"],
            "tree_sha256": tree_sha256,
            "file_count": len(entries),
            "source_path_recorded": False,
            "source_modified": False,
            "registry_event": event,
        }

    def _read_record(self, app_id: str) -> dict[str, Any] | None:
        self._validate_app_id(app_id)
        path = self.runtime_root / app_id / "latest.json"
        if not path.is_file():
            return None
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise GovernanceViolation("Source-ingestion evidence is invalid JSON.") from exc
        digest = record.get("record_sha256")
        base = {k: v for k, v in record.items() if k != "record_sha256"}
        if digest != _sha256_json(base):
            raise GovernanceViolation("Source-ingestion evidence failed integrity verification.")
        return record

    def status(self, app_id: str) -> dict[str, Any]:
        self._validate_app_id(app_id)
        record = self._read_record(app_id)
        staged = (self.stage_root / app_id).is_dir()
        managed = (self.apps_root / app_id).is_dir()
        blockers: list[str] = []
        if not staged and not managed:
            blockers.append("real_source_not_staged")
        if staged and not record:
            blockers.append("source_ingestion_evidence_missing")
        return {
            "schema": "resonance-real-source-status/v1",
            "app_id": app_id,
            "staged": staged,
            "managed": managed,
            "ingestion_evidence_valid": bool(record),
            "tree_sha256": record.get("tree_sha256") if record else None,
            "blockers": blockers,
            "real_source_available": (staged or managed) and not blockers,
        }

    def import_staged(self, app_id: str, *, confirmed: bool = False) -> dict[str, Any]:
        self._validate_app_id(app_id)
        if self.require_confirmation and not confirmed:
            raise GovernanceViolation("Real source import requires confirmed=true.")
        status = self.status(app_id)
        if not status["staged"]:
            raise GovernanceViolation("Real source has not been staged for this application.")
        if status["managed"]:
            raise GovernanceViolation("Managed application already exists; import will not overwrite it.")
        migrator = SovereignMigrator(self.workspace, self.policy)
        report = migrator.import_copy(f"imports/projects/{app_id}", app_name=app_id, confirmed=True)
        project = self.apps_root / app_id
        evidence = write_supply_chain_evidence(project, app_id)
        verified = verify_supply_chain_evidence(project)
        event = self.registry.append(app_id, "real_source_imported", {
            "status": "real_source_imported", "destination": report["destination"],
            "copied_files": report["copied_files"], "supply_chain_valid": bool(verified.get("valid")),
        })
        return {
            "app_id": app_id,
            "imported": True,
            "migration_report": report,
            "supply_chain_evidence": evidence,
            "supply_chain_verified": bool(verified.get("valid")),
            "source_modified": False,
            "registry_event": event,
        }


class MigrationExecutionManager:
    """Executes only deterministic, reversible provider-remediation steps.

    It never starts production cutover, never enables network access, and refuses
    unsupported provider semantics instead of guessing them.
    """

    def __init__(self, workspace_root: Path, policy: dict[str, Any], registry: AppRegistry):
        self.workspace = workspace_root.resolve()
        self.policy = policy
        self.registry = registry
        self.apps_root = (self.workspace / "apps").resolve()
        self.runtime_root = (self.workspace / "runtime" / "migration-execution").resolve()

    def _app(self, app_id: str) -> Path:
        if not APP_ID_RE.fullmatch(app_id):
            raise GovernanceViolation("Invalid application id.")
        app = (self.apps_root / app_id).resolve()
        app.relative_to(self.apps_root)
        if not app.is_dir():
            raise GovernanceViolation("Managed real application source is not present.")
        return app

    def prepare(self, app_id: str, *, confirmed: bool = False) -> dict[str, Any]:
        if not confirmed:
            raise GovernanceViolation("Migration execution preparation requires confirmed=true.")
        self._app(app_id)
        cutover = SovereignCutoverManager(self.workspace, self.policy, self.registry)
        baseline = cutover.baseline(app_id, confirmed=True)
        checkpoint = cutover.checkpoint(app_id, confirmed=True)
        fabric = SovereignServiceFabric(self.workspace, self.policy, self.registry)
        service_plan = fabric.migration_plan(app_id)
        adapter = SovereignAdapterEngine(self.workspace, self.policy, self.registry)
        adapter_plan = adapter.assess(app_id)
        record = {
            "schema": "resonance-migration-execution-preparation/v1",
            "created_at": utc_now(), "release": "1.5.8", "app_id": app_id,
            "baseline_id": baseline["baseline_id"],
            "checkpoint_sha256": checkpoint["archive_sha256"],
            "service_plan": service_plan,
            "adapter_plan": adapter_plan,
            "ready_for_supported_execution": bool(service_plan.get("ready_to_bind")) and not adapter_plan.get("unsupported_operations"),
            "production_cutover_performed": False, "network_used": False, "external_ai_used": False,
        }
        blockers: list[str] = []
        if not service_plan.get("ready_to_bind"):
            blockers.append("local_service_definitions_missing")
        blockers.extend(f"unsupported:{x}" for x in adapter_plan.get("unsupported_operations", []))
        record["blockers"] = blockers
        out_dir = self.runtime_root / app_id / "preparations"
        out_dir.mkdir(parents=True, exist_ok=True)
        out = out_dir / f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
        record["record_sha256"] = _sha256_json(record)
        out.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return {**record, "path": str(out.relative_to(self.workspace)).replace("\\", "/")}

    def execute_supported(self, app_id: str, *, confirmed: bool = False) -> dict[str, Any]:
        if not confirmed:
            raise GovernanceViolation("Supported migration execution requires confirmed=true.")
        app = self._app(app_id)
        cutover = SovereignCutoverManager(self.workspace, self.policy, self.registry)
        plan_before = cutover.plan(app_id)
        if not plan_before.get("baseline_id"):
            raise GovernanceViolation("A current real-source baseline is required before migration execution.")
        if "baseline_recorded_and_current" in plan_before.get("blockers", []):
            raise GovernanceViolation("Real-source baseline is stale; record a new baseline before execution.")
        if not plan_before.get("checkpoint") or not plan_before["checkpoint"].get("verified"):
            raise GovernanceViolation("A verified rollback checkpoint is required before migration execution.")

        fabric = SovereignServiceFabric(self.workspace, self.policy, self.registry)
        adapter = SovereignAdapterEngine(self.workspace, self.policy, self.registry)
        assessment = adapter.assess(app_id)
        if assessment.get("unsupported_operations"):
            raise GovernanceViolation("Supported migration execution blocked by ambiguous/unsupported provider operations.")
        if not assessment.get("providers"):
            raise GovernanceViolation("No supported provider-specific usage was detected for deterministic migration.")

        steps: list[dict[str, Any]] = []
        bindings_path = app / ".open-nova" / "service-bindings.json"
        if not bindings_path.exists():
            result = fabric.write_bindings(app_id, confirmed=True)
            steps.append({"step": "service_bindings", "status": "written", "path": result["bindings_path"]})
        else:
            steps.append({"step": "service_bindings", "status": "already_present", "path": str(bindings_path.relative_to(self.workspace)).replace("\\", "/")})

        adapter_file = app / "open-nova-adapters" / "supabase-compat.ts"
        if not adapter_file.exists():
            generated = adapter.generate(app_id, confirmed=True)
            steps.append({"step": "provider_neutral_adapters", "status": "generated", "count": len(generated["written"])})
        else:
            steps.append({"step": "provider_neutral_adapters", "status": "already_present"})

        migration = adapter.prepare_cutover(app_id, confirmed=True)
        steps.append({"step": "source_cutover", "status": "rewritten", "migration_id": migration["migration_id"], "changed_files": len(migration["changes"])})
        verification = adapter.verify_cutover(app_id)
        if not verification.get("cutover_ready"):
            adapter.rollback(app_id, migration["migration_id"], confirmed=True)
            raise GovernanceViolation("Provider cutover verification failed; deterministic rewrites were rolled back.")

        supply = write_supply_chain_evidence(app, app_id)
        supply_verified = verify_supply_chain_evidence(app)
        if not supply_verified.get("valid"):
            adapter.rollback(app_id, migration["migration_id"], confirmed=True)
            raise GovernanceViolation("Post-migration supply-chain integrity failed; deterministic rewrites were rolled back.")

        record = {
            "schema": "resonance-supported-migration-execution/v1",
            "created_at": utc_now(), "release": "1.5.8", "app_id": app_id,
            "migration_id": migration["migration_id"], "steps": steps,
            "adapter_verification": verification,
            "supply_chain": supply, "supply_chain_verified": True,
            "rollback_available": True,
            "production_cutover_performed": False, "network_used": False, "external_ai_used": False,
        }
        out_dir = self.runtime_root / app_id / "executions"
        out_dir.mkdir(parents=True, exist_ok=True)
        out = out_dir / f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{migration['migration_id']}.json"
        record["record_sha256"] = _sha256_json(record)
        out.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        event = self.registry.append(app_id, "supported_provider_migration_executed", {
            "status": "supported_provider_migration_executed", "migration_id": migration["migration_id"],
            "rollback_available": True, "production_cutover_performed": False,
        })
        return {**record, "path": str(out.relative_to(self.workspace)).replace("\\", "/"), "registry_event": event}

    def verify(self, app_id: str) -> dict[str, Any]:
        app = self._app(app_id)
        adapter = SovereignAdapterEngine(self.workspace, self.policy, self.registry).verify_cutover(app_id)
        supply = verify_supply_chain_evidence(app)
        cutover = SovereignCutoverManager(self.workspace, self.policy, self.registry).plan(app_id)
        blockers: list[str] = []
        if not adapter.get("cutover_ready"):
            blockers.extend(adapter.get("blockers") or ["adapter_cutover_not_ready"])
        if not supply.get("valid"):
            blockers.append("supply_chain_integrity_invalid")
        blockers.extend(x for x in cutover.get("blockers", []) if x not in blockers)
        return {
            "schema": "resonance-real-migration-verification/v1",
            "created_at": utc_now(), "release": "1.5.8", "app_id": app_id,
            "adapter": adapter, "supply_chain": supply, "cutover": cutover,
            "blockers": blockers,
            "ready_for_local_validation": not blockers,
            "production_cutover_performed": False,
        }

    def rollback(self, app_id: str, migration_id: str, *, confirmed: bool = False) -> dict[str, Any]:
        if not confirmed:
            raise GovernanceViolation("Migration execution rollback requires confirmed=true.")
        result = SovereignAdapterEngine(self.workspace, self.policy, self.registry).rollback(app_id, migration_id, confirmed=True)
        app = self._app(app_id)
        write_supply_chain_evidence(app, app_id)
        verified = verify_supply_chain_evidence(app)
        event = self.registry.append(app_id, "supported_provider_migration_rolled_back", {
            "status": "migration_rolled_back", "migration_id": migration_id,
            "supply_chain_valid": bool(verified.get("valid")),
        })
        return {
            "schema": "resonance-migration-execution-rollback/v1",
            "app_id": app_id, "migration_id": migration_id,
            "adapter_rollback": result, "supply_chain_verified": bool(verified.get("valid")),
            "production_cutover_performed": False, "registry_event": event,
        }
