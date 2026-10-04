from __future__ import annotations

import hashlib
import json
import os
import platform
import shutil
import socket
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from .agent import GovernanceViolation
from .registry import APP_ID_RE, AppRegistry
from .suite_control import SuiteControlCentre


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha256_json(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _tool_version(executable: str, args: list[str]) -> str | None:
    path = shutil.which(executable)
    if not path:
        return None
    try:
        proc = subprocess.run([path, *args], capture_output=True, text=True, timeout=4, shell=False, check=False)
    except (OSError, subprocess.SubprocessError):
        return "present"
    out = (proc.stdout or proc.stderr or "").strip().splitlines()
    return out[0][:240] if out else "present"


def _port_state(host: str, port: int, timeout: float = 0.15) -> str:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return "listening"
    except OSError:
        return "closed"


class LocalDeploymentManager:
    """Local-machine deployment evidence and first-app migration orchestration.

    This layer never provisions from the network. It only reports local state,
    writes controller-owned plans/evidence after confirmation, and delegates
    source migration to the existing governed migration pipeline.
    """

    def __init__(self, workspace_root: Path, policy: dict[str, Any], registry: AppRegistry):
        self.workspace = workspace_root.resolve()
        self.policy = policy
        self.registry = registry
        cfg = policy.get("local_deployment", {}) or {}
        self.runtime_root = (self.workspace / str(cfg.get("runtime_root", "runtime/deployment"))).resolve()
        self.plan_root = (self.runtime_root / "plans").resolve()
        self.evidence_path = (self.runtime_root / "evidence.jsonl").resolve()
        self.apps_root = (self.workspace / "apps").resolve()
        self.import_root = (self.workspace / "imports" / "projects").resolve()
        for path in (self.runtime_root, self.plan_root, self.evidence_path.parent):
            path.relative_to(self.workspace)

    def _backend_manifest(self) -> dict[str, Any]:
        path = self.workspace / "governance" / "backend-runtime.yaml"
        if not path.is_file():
            raise GovernanceViolation("Backend runtime governance is missing.")
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        if not isinstance(data, dict):
            raise GovernanceViolation("Backend runtime governance is invalid.")
        return data

    def preflight(self) -> dict[str, Any]:
        container = None
        for candidate in ("podman", "docker"):
            version = _tool_version(candidate, ["--version"])
            if version:
                container = {"engine": candidate, "version": version}
                break
        tools = {
            "python": {"present": True, "version": sys.version.split()[0], "path": sys.executable},
            "git": {"present": shutil.which("git") is not None, "version": _tool_version("git", ["--version"])},
            "ollama": {"present": shutil.which("ollama") is not None, "version": _tool_version("ollama", ["--version"])},
            "container_engine": {"present": container is not None, **(container or {})},
            "openssl": {"present": shutil.which("openssl") is not None, "version": _tool_version("openssl", ["version"])},
        }
        manifest = self._backend_manifest()
        ports: dict[str, Any] = {}
        for service_id, spec in (manifest.get("services") or {}).items():
            if not isinstance(spec, dict):
                continue
            host = str(spec.get("host", "127.0.0.1"))
            port = int(spec.get("port", 0) or 0)
            if port:
                ports[service_id] = {"host": host, "port": port, "state": _port_state(host, port)}
        ports["ollama"] = {"host": "127.0.0.1", "port": 11434, "state": _port_state("127.0.0.1", 11434)}
        ports["foundry_controller"] = {"host": "127.0.0.1", "port": 8787, "state": _port_state("127.0.0.1", 8787)}

        writable_checks = {}
        for name, path in {
            "workspace": self.workspace,
            "apps": self.apps_root,
            "imports": self.import_root,
            "runtime": self.workspace / "runtime",
        }.items():
            path.mkdir(parents=True, exist_ok=True)
            writable_checks[name] = os.access(path, os.W_OK)

        required_tool_gates = {
            "git": tools["git"]["present"],
            "container_engine": tools["container_engine"]["present"],
            "openssl": tools["openssl"]["present"],
        }
        local_ai_optional = tools["ollama"]["present"]
        filesystem_ready = all(writable_checks.values())
        ready_for_offline_runtime = all(required_tool_gates.values()) and filesystem_ready
        blockers = []
        if not tools["git"]["present"]:
            blockers.append("Git is not installed or not visible on PATH.")
        if not tools["container_engine"]["present"]:
            blockers.append("Podman or Docker is required for the isolated local service runtime.")
        if not tools["openssl"]["present"]:
            blockers.append("OpenSSL is required for local artifact attestation and verification.")
        if not filesystem_ready:
            blockers.append("One or more sovereign workspace directories are not writable.")

        return {
            "schema": "resonance-local-deployment-preflight/v1",
            "generated_at": utc_now(),
            "release": "1.5.8",
            "host": {
                "os": platform.system(),
                "os_release": platform.release(),
                "architecture": platform.machine(),
                "hostname_hash": hashlib.sha256(socket.gethostname().encode("utf-8")).hexdigest()[:16],
            },
            "tools": tools,
            "ports": ports,
            "writable": writable_checks,
            "local_ai_optional_ready": local_ai_optional,
            "ready_for_offline_runtime": ready_for_offline_runtime,
            "blockers": blockers,
            "network_provisioning_performed": False,
            "secret_values_exposed": False,
        }

    def write_evidence(self, *, confirmed: bool) -> dict[str, Any]:
        if not confirmed:
            raise GovernanceViolation("Writing deployment evidence requires explicit confirmation.")
        self.runtime_root.mkdir(parents=True, exist_ok=True)
        result = self.preflight()
        previous = None
        if self.evidence_path.is_file():
            lines = [line for line in self.evidence_path.read_text(encoding="utf-8").splitlines() if line.strip()]
            if lines:
                try:
                    previous = json.loads(lines[-1]).get("sha256")
                except json.JSONDecodeError as exc:
                    raise GovernanceViolation("Deployment evidence ledger is invalid; refusing to append.") from exc
        base = {**result, "previous_sha256": previous}
        record = {**base, "sha256": _sha256_json(base)}
        with self.evidence_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        return {
            "schema": "resonance-local-deployment-evidence/v1",
            "path": str(self.evidence_path.relative_to(self.workspace)).replace("\\", "/"),
            "sha256": record["sha256"],
            "ready_for_offline_runtime": result["ready_for_offline_runtime"],
            "blockers": result["blockers"],
            "secret_values_exposed": False,
        }

    def verify_evidence_chain(self) -> dict[str, Any]:
        if not self.evidence_path.exists():
            return {"schema": "resonance-local-deployment-evidence-chain/v1", "valid": True, "records": 0}
        previous = None
        count = 0
        for line in self.evidence_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                return {"schema": "resonance-local-deployment-evidence-chain/v1", "valid": False, "records": count, "reason": "invalid_json"}
            digest = record.get("sha256")
            base = {k: v for k, v in record.items() if k != "sha256"}
            if digest != _sha256_json(base):
                return {"schema": "resonance-local-deployment-evidence-chain/v1", "valid": False, "records": count, "reason": "hash_mismatch"}
            if base.get("previous_sha256") != previous:
                return {"schema": "resonance-local-deployment-evidence-chain/v1", "valid": False, "records": count, "reason": "chain_mismatch"}
            previous = digest
            count += 1
        return {"schema": "resonance-local-deployment-evidence-chain/v1", "valid": True, "records": count, "head_sha256": previous}

    def first_app_plan(self, app_id: str = "reson8-life", *, write: bool = False, confirmed: bool = False) -> dict[str, Any]:
        if not APP_ID_RE.fullmatch(app_id):
            raise GovernanceViolation("Invalid application id.")
        centre = SuiteControlCentre(self.workspace, self.policy, self.registry)
        state = centre.status(app_id)
        remediation = centre.remediation_plan(app_id, write=False)
        stages: list[dict[str, Any]] = []

        stages.append({
            "stage": "01_source_acquisition",
            "passed": bool(state.get("managed_project") or state.get("staged_source")),
            "action": "Place/export the complete application source under imports/projects using an approved migration alias.",
            "destructive": False,
        })
        stages.append({
            "stage": "02_copy_only_import",
            "passed": bool(state.get("managed_project")),
            "action": "Run governed assessment, then import a copy into apps/. Original source remains untouched.",
            "destructive": False,
        })
        stages.append({
            "stage": "03_provider_remediation",
            "passed": bool(state.get("managed_project")) and not bool(state.get("external_dependencies")),
            "action": "Replace hosted/provider-specific calls with Open Nova provider-neutral adapters; ambiguous behavior remains blocked for review.",
            "destructive": False,
        })
        dep = state.get("dependency_inventory") or {}
        cache = state.get("cache_status") or {}
        evidence = state.get("supply_chain_evidence") or {}
        stages.append({
            "stage": "04_offline_supply_chain",
            "passed": bool(dep.get("offline_ready")) and bool(cache.get("offline_ready")) if state.get("managed_project") else False,
            "action": "Pin exact dependencies, ingest required artifacts into the local cache, then regenerate SBOM/integrity evidence.",
            "destructive": False,
        })
        stages.append({
            "stage": "05_integrity_gate",
            "passed": bool(evidence.get("valid")) if state.get("managed_project") else False,
            "action": "Verify source manifest and SBOM; attest locally before runtime cutover.",
            "destructive": False,
        })
        stages.append({
            "stage": "06_local_runtime",
            "passed": False,
            "action": "Start the local service fabric and backend runtime, execute non-destructive schema migrations, then run health checks.",
            "destructive": False,
        })
        stages.append({
            "stage": "07_regression_and_cutover",
            "passed": False,
            "action": "Run isolated regression/build tests, verify adapters, preview on loopback, then certify operational sovereignty before any production cutover.",
            "destructive": False,
        })
        blockers = list(state.get("blockers") or [])
        if not self.preflight().get("ready_for_offline_runtime"):
            blockers.append("Local PC deployment preflight is not yet ready for the offline runtime.")
        plan = {
            "schema": "resonance-first-app-migration-plan/v1",
            "created_at": utc_now(),
            "release": "1.5.8",
            "app_id": app_id,
            "display_name": state.get("display_name", app_id),
            "current_state": state.get("migration_state"),
            "target_state": "operationally_sovereign",
            "stages": stages,
            "remediation_actions": remediation.get("actions", []),
            "blockers": sorted(set(blockers)),
            "automatic_production_cutover": False,
            "source_mutation": False,
            "external_ai_required": False,
        }
        if write:
            if not confirmed:
                raise GovernanceViolation("Writing a first-app migration plan requires explicit confirmation.")
            self.plan_root.mkdir(parents=True, exist_ok=True)
            path = (self.plan_root / f"first-app-{app_id}.json").resolve()
            path.relative_to(self.plan_root)
            path.write_text(json.dumps(plan, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            plan["plan_path"] = str(path.relative_to(self.workspace)).replace("\\", "/")
            plan["plan_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
        return plan
