from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .agent import GovernanceViolation
from .backend_runtime import SovereignBackendRuntime
from .cutover import SovereignCutoverManager
from .registry import APP_ID_RE, AppRegistry
from .runner import IsolatedRunner
from .service_fabric import SovereignServiceFabric
from .source_execution import MigrationExecutionManager, RealSourceIngestor
from .supply_chain import verify_supply_chain_evidence
from .workstation_bridge import SovereignWorkstationBridge

RELEASE = "1.5.8"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha256_json(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


class FirstRealExecutionPack:
    """Orchestrates the first real repository admission and migration proof.

    The pack deliberately stops before production deployment. It may copy an explicitly
    approved clean local Git snapshot into Open Nova and may invoke the pre-existing
    deterministic migration engine, but it cannot enable network access, use external AI,
    or perform a production cutover.
    """

    def __init__(self, workspace_root: Path, policy: dict[str, Any], registry: AppRegistry):
        self.workspace = workspace_root.resolve()
        self.policy = policy
        self.registry = registry
        cfg = policy.get("real_execution", {})
        self.runtime_root = (self.workspace / str(cfg.get("runtime_root", "runtime/real-execution"))).resolve()
        self.require_confirmation = bool(cfg.get("require_confirmation", True))
        self.production_cutover_allowed = bool(cfg.get("production_cutover_allowed", False))
        self.network_access_allowed = bool(cfg.get("network_access_allowed", False))
        self.external_ai_allowed = bool(cfg.get("external_ai_allowed", False))

    def _validate_app_id(self, app_id: str) -> None:
        if not APP_ID_RE.fullmatch(app_id):
            raise GovernanceViolation("Invalid application id.")

    @staticmethod
    def _safe(call: Callable[[], dict[str, Any]], fallback: dict[str, Any]) -> dict[str, Any]:
        try:
            return call()
        except (GovernanceViolation, OSError, ValueError) as exc:
            return {**fallback, "error": type(exc).__name__, "detail": str(exc)}

    def assess_repository(self, app_id: str, source_path: str) -> dict[str, Any]:
        self._validate_app_id(app_id)
        bridge = SovereignWorkstationBridge(self.workspace, self.policy, self.registry)
        assessment = bridge.assess_repository(source_path)
        blockers = list(assessment.get("blockers", []))
        return {
            "schema": "resonance-first-real-execution-assessment/v1",
            "release": RELEASE,
            "app_id": app_id,
            "repository": assessment,
            "ready_for_admission": bool(assessment.get("ready_to_stage")) and not blockers,
            "blockers": blockers,
            "source_mutation_allowed": False,
            "repository_path_recorded": False,
            "remote_urls_recorded": False,
            "network_used": False,
            "external_ai_used": False,
            "production_cutover_performed": False,
        }

    def admit_repository(self, app_id: str, source_path: str, *, confirmed: bool = False) -> dict[str, Any]:
        self._validate_app_id(app_id)
        if self.require_confirmation and not confirmed:
            raise GovernanceViolation("Real repository admission requires confirmed=true.")
        bridge = SovereignWorkstationBridge(self.workspace, self.policy, self.registry)
        workstation = bridge.workstation_status()
        if not workstation.get("initialized") or not workstation.get("state_integrity_valid"):
            bridge.initialize_workstation(confirmed=True)
        assessment = bridge.assess_repository(source_path)
        if not assessment.get("ready_to_stage"):
            raise GovernanceViolation("Repository failed sovereign admission assessment.")
        staged = bridge.stage_repository(app_id, source_path, confirmed=True)
        verified = bridge.verify_staged(app_id)
        if not verified.get("valid"):
            raise GovernanceViolation("Staged repository snapshot failed integrity verification.")
        imported = RealSourceIngestor(self.workspace, self.policy, self.registry).import_staged(app_id, confirmed=True)
        record = {
            "schema": "resonance-first-real-repository-admission/v1",
            "created_at": utc_now(),
            "release": RELEASE,
            "app_id": app_id,
            "source_commit_sha": staged.get("commit_sha"),
            "tree_sha256": staged.get("tree_sha256"),
            "staged_snapshot_valid": True,
            "managed_imported": bool(imported.get("imported")),
            "supply_chain_verified": bool(imported.get("supply_chain_verified")),
            "source_modified": False,
            "repository_path_recorded": False,
            "remote_urls_recorded": False,
            "network_used": False,
            "external_ai_used": False,
            "production_cutover_performed": False,
        }
        evidence = self._write_record(app_id, "admission", record)
        return {**record, "evidence": evidence}

    def prepare(self, app_id: str, *, confirmed: bool = False) -> dict[str, Any]:
        self._validate_app_id(app_id)
        if self.require_confirmation and not confirmed:
            raise GovernanceViolation("First real execution preparation requires confirmed=true.")
        result = MigrationExecutionManager(self.workspace, self.policy, self.registry).prepare(app_id, confirmed=True)
        record = {
            "schema": "resonance-first-real-execution-preparation/v1",
            "created_at": utc_now(), "release": RELEASE, "app_id": app_id,
            "baseline_id": result.get("baseline_id"),
            "checkpoint_sha256": result.get("checkpoint_sha256"),
            "ready_for_supported_execution": bool(result.get("ready_for_supported_execution")),
            "blockers": result.get("blockers", []),
            "network_used": False, "external_ai_used": False, "production_cutover_performed": False,
        }
        evidence = self._write_record(app_id, "preparation", record)
        return {**result, "execution_pack_evidence": evidence}

    def execute_supported(self, app_id: str, *, confirmed: bool = False) -> dict[str, Any]:
        self._validate_app_id(app_id)
        if self.require_confirmation and not confirmed:
            raise GovernanceViolation("First real supported migration requires confirmed=true.")
        if self.network_access_allowed or self.external_ai_allowed or self.production_cutover_allowed:
            raise GovernanceViolation("Real-execution governance must deny network, external AI, and production cutover.")
        result = MigrationExecutionManager(self.workspace, self.policy, self.registry).execute_supported(app_id, confirmed=True)
        record = {
            "schema": "resonance-first-real-execution-run/v1",
            "created_at": utc_now(), "release": RELEASE, "app_id": app_id,
            "migration_id": result.get("migration_id"),
            "supply_chain_verified": bool(result.get("supply_chain_verified")),
            "rollback_available": bool(result.get("rollback_available")),
            "network_used": False, "external_ai_used": False, "production_cutover_performed": False,
        }
        evidence = self._write_record(app_id, "migration", record)
        return {**result, "execution_pack_evidence": evidence}

    def readiness(self, app_id: str) -> dict[str, Any]:
        self._validate_app_id(app_id)
        bridge = SovereignWorkstationBridge(self.workspace, self.policy, self.registry)
        workstation = bridge.workstation_status()
        repository = bridge.repository_status(app_id)
        source = RealSourceIngestor(self.workspace, self.policy, self.registry).status(app_id)
        managed = bool(source.get("managed"))

        runner = self._safe(
            lambda: IsolatedRunner(self.workspace, self.policy).preflight(),
            {"engine_found": False, "images": {}, "error": "runner_preflight_unavailable"},
        )
        service_health = self._safe(
            lambda: SovereignServiceFabric(self.workspace, self.policy, self.registry).health(),
            {"ready": False, "services": [], "error": "service_fabric_unavailable"},
        )
        backend_health = self._safe(
            lambda: SovereignBackendRuntime(self.workspace, self.policy, self.registry).health(),
            {"ready": False, "services": [], "error": "backend_runtime_unavailable"},
        )

        migration = self._safe(
            lambda: MigrationExecutionManager(self.workspace, self.policy, self.registry).verify(app_id),
            {"ready_for_local_validation": False, "blockers": ["managed_real_source_required"]},
        ) if managed else {"ready_for_local_validation": False, "blockers": ["managed_real_source_required"]}
        cutover = self._safe(
            lambda: SovereignCutoverManager(self.workspace, self.policy, self.registry).plan(app_id),
            {"ready_for_local_cutover_validation": False, "blockers": ["managed_real_source_required"]},
        ) if managed else {"ready_for_local_cutover_validation": False, "blockers": ["managed_real_source_required"]}
        supply = verify_supply_chain_evidence(self.workspace / "apps" / app_id) if managed else {"valid": False}

        blockers: list[str] = []
        def add(value: str) -> None:
            if value not in blockers:
                blockers.append(value)

        if not workstation.get("initialized"):
            add("workstation_not_initialized")
        elif not workstation.get("state_integrity_valid"):
            add("workstation_evidence_invalid")
        if not managed:
            if repository.get("ready_for_governed_import"):
                add("repository_staged_not_imported")
            else:
                add("real_repository_not_admitted")
        if managed and not supply.get("valid"):
            add("supply_chain_integrity_invalid")
        if managed:
            for b in migration.get("blockers", []):
                add(str(b))
        runner_images = runner.get("images") or {}
        runner_ready = bool(runner.get("engine_found")) and bool(runner_images) and all(bool(v) for v in runner_images.values())
        if not runner_ready:
            add("isolated_runner_not_ready")
        if not service_health.get("ready"):
            add("service_fabric_not_healthy")
        if not backend_health.get("ready"):
            add("backend_runtime_not_healthy")

        next_action = "admit_real_repository"
        if repository.get("ready_for_governed_import") and not managed:
            next_action = "import_staged_repository"
        elif managed and not migration.get("ready_for_local_validation"):
            next_action = "prepare_or_execute_supported_migration"
        elif managed and migration.get("ready_for_local_validation") and blockers:
            next_action = "start_local_runtime_and_run_regression_preview"
        elif managed and not blockers:
            next_action = "attempt_local_cutover_certification"

        return {
            "schema": "resonance-first-real-execution-readiness/v1",
            "generated_at": utc_now(), "release": RELEASE, "app_id": app_id,
            "state": "ready_for_local_certification" if not blockers else "blocked",
            "next_action": next_action,
            "blockers": blockers,
            "workstation": workstation,
            "repository": repository,
            "source": source,
            "migration": migration,
            "cutover": cutover,
            "runner": runner,
            "service_fabric": service_health,
            "backend_runtime": backend_health,
            "supply_chain": supply,
            "production_cutover_allowed": False,
            "network_used": False,
            "external_ai_used": False,
        }

    def write_readiness_report(self, app_id: str, *, confirmed: bool = False) -> dict[str, Any]:
        if self.require_confirmation and not confirmed:
            raise GovernanceViolation("Writing a first-real-execution report requires confirmed=true.")
        report = self.readiness(app_id)
        evidence = self._write_record(app_id, "readiness", report)
        return {**report, "evidence": evidence}

    def _write_record(self, app_id: str, kind: str, payload: dict[str, Any]) -> dict[str, Any]:
        root = self.runtime_root / app_id / kind
        root.mkdir(parents=True, exist_ok=True)
        stamped = {**payload}
        stamped["record_sha256"] = _sha256_json(stamped)
        name = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".json"
        path = root / name
        path.write_text(json.dumps(stamped, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        latest = self.runtime_root / app_id / "latest.json"
        latest.parent.mkdir(parents=True, exist_ok=True)
        latest.write_text(json.dumps({"kind": kind, "path": str(path.relative_to(self.workspace)).replace("\\", "/"), "record_sha256": stamped["record_sha256"]}, indent=2) + "\n", encoding="utf-8")
        return {"kind": kind, "path": str(path.relative_to(self.workspace)).replace("\\", "/"), "record_sha256": stamped["record_sha256"]}

    def verify_evidence(self, app_id: str) -> dict[str, Any]:
        self._validate_app_id(app_id)
        root = self.runtime_root / app_id
        mismatches: list[str] = []
        checked = 0
        if not root.is_dir():
            return {"schema": "resonance-first-real-execution-evidence-verification/v1", "app_id": app_id, "valid": True, "checked": 0, "mismatches": []}
        for path in sorted(root.glob("*/*.json")):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                mismatches.append(str(path.relative_to(self.workspace)).replace("\\", "/"))
                continue
            digest = data.get("record_sha256")
            base = {k: v for k, v in data.items() if k != "record_sha256"}
            checked += 1
            if digest != _sha256_json(base):
                mismatches.append(str(path.relative_to(self.workspace)).replace("\\", "/"))
        return {
            "schema": "resonance-first-real-execution-evidence-verification/v1",
            "release": RELEASE, "app_id": app_id,
            "valid": not mismatches, "checked": checked, "mismatches": mismatches,
        }
