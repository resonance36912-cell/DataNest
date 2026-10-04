from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from .agent import GovernanceViolation
from .registry import APP_ID_RE, AppRegistry
from .runner import DependencyGuard, StaticSecurityScanner
from .supply_chain import LocalArtifactStore, LocalAttestor, dependency_inventory, verify_supply_chain_evidence


@dataclass(frozen=True)
class Gate:
    gate: str
    weight: int
    passed: bool
    critical: bool
    evidence: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "gate": self.gate,
            "weight": self.weight,
            "passed": self.passed,
            "critical": self.critical,
            "evidence": self.evidence,
        }


class SovereigntyEvaluator:
    """Evidence-based sovereignty scoring. Scores never substitute for critical gates."""

    def __init__(self, workspace_root: Path, policy: dict[str, Any], registry: AppRegistry):
        self.workspace = workspace_root.resolve()
        self.policy = policy
        self.registry = registry
        self.apps_root = (self.workspace / "apps").resolve()

    def _project(self, app_id: str) -> Path:
        if not APP_ID_RE.fullmatch(app_id):
            raise GovernanceViolation("Invalid application id.")
        project = (self.apps_root / app_id).resolve()
        try:
            project.relative_to(self.apps_root)
        except ValueError as exc:
            raise GovernanceViolation("Application path escaped apps root.") from exc
        if not project.is_dir():
            raise GovernanceViolation("Managed application not found.")
        return project

    def app_score(self, app_id: str, *, backend_health: dict[str, Any] | None = None) -> dict[str, Any]:
        project = self._project(app_id)
        external_denied = self.policy.get("providers", {}).get("external", {}).get("allowed", True) is False
        local_first = self.policy.get("principles", {}).get("local_first") is True
        dependency = DependencyGuard(self.policy).check(project)
        security = StaticSecurityScanner(self.policy).scan(project)
        inventory = dependency_inventory(project)
        cache = LocalArtifactStore(self.workspace, self.policy).project_cache_status(project)
        integrity = verify_supply_chain_evidence(project)
        signature = LocalAttestor(self.workspace, self.policy).verify(project)
        bindings = project / ".open-nova" / "service-bindings.json"
        adapter_dir = project / "open-nova-adapters"
        registry_state = self.registry.state(app_id)
        registry_valid = self.registry.verify_chain().get("valid", False)
        backend_ready = bool((backend_health or {}).get("ready", False))

        gates = [
            Gate("governance_local_first", 10, local_first, True, "governance/policy.yaml"),
            Gate("external_ai_denied", 10, external_denied, True, "providers.external.allowed=false"),
            Gate("registry_chain_valid", 10, registry_valid, True, "runtime/registry/apps.jsonl"),
            Gate("dependency_policy", 10, bool(dependency.get("passed")), True, "exact/local dependency rules"),
            Gate("security_scan", 10, bool(security.get("passed")), True, "static security scan"),
            Gate("supply_chain_integrity", 10, bool(integrity.get("valid")), True, "ARTIFACT_MANIFEST.json + SBOM.cdx.json"),
            Gate("artifact_signature", 10, bool(signature.get("valid")), False, "local Ed25519 attestation"),
            Gate("offline_dependency_cache", 10, bool(cache.get("offline_ready")) and bool(inventory.get("offline_ready")), True, "local content-addressed cache"),
            Gate("provider_neutral_bindings", 10, bindings.is_file() and adapter_dir.is_dir(), True, ".open-nova bindings + adapters"),
            Gate("backend_runtime_healthy", 10, backend_ready, True, "local backend health"),
        ]
        score = sum(g.weight for g in gates if g.passed)
        critical_blockers = [g.gate for g in gates if g.critical and not g.passed]
        return {
            "schema": "resonance-sovereignty-score/v1",
            "app_id": app_id,
            "score": score,
            "max_score": sum(g.weight for g in gates),
            "percentage": score,
            "critical_blockers": critical_blockers,
            "operationally_sovereign": not critical_blockers and score >= 90,
            "registry_state_present": registry_state is not None,
            "gates": [g.as_dict() for g in gates],
            "external_ai_required": False,
        }

    def platform_score(self, *, backend_health: dict[str, Any], service_health: dict[str, Any], runner_preflight: dict[str, Any]) -> dict[str, Any]:
        policy_path = self.workspace / "governance" / "policy.yaml"
        release_path = self.workspace / "governance" / "release.yaml"
        external_denied = self.policy.get("providers", {}).get("external", {}).get("allowed", True) is False
        local_first = self.policy.get("principles", {}).get("local_first") is True
        registry_valid = self.registry.verify_chain().get("valid", False)
        engine_ready = bool(runner_preflight.get("engine_found"))
        images = runner_preflight.get("images", {}) or {}
        runner_ready = engine_ready and bool(images) and all(bool(v) for v in images.values())
        gates = [
            Gate("governance_policy_present", 10, policy_path.is_file(), True, "governance/policy.yaml"),
            Gate("release_policy_present", 10, release_path.is_file(), True, "governance/release.yaml"),
            Gate("local_first", 10, local_first, True, "governance principle"),
            Gate("external_ai_denied", 10, external_denied, True, "zero-credit provider policy"),
            Gate("registry_chain_valid", 10, registry_valid, True, "append-only registry"),
            Gate("isolated_runner_ready", 15, runner_ready, True, "local engine + cached runner images"),
            Gate("service_fabric_healthy", 15, bool(service_health.get("ready")), True, "required local service fabric"),
            Gate("backend_runtime_healthy", 20, bool(backend_health.get("ready")), True, "database/auth/storage/gateway"),
        ]
        score = sum(g.weight for g in gates if g.passed)
        blockers = [g.gate for g in gates if g.critical and not g.passed]
        return {
            "schema": "resonance-platform-sovereignty-score/v1",
            "score": score,
            "max_score": 100,
            "percentage": score,
            "critical_blockers": blockers,
            "operationally_sovereign": not blockers,
            "gates": [g.as_dict() for g in gates],
            "external_ai_required": False,
        }
