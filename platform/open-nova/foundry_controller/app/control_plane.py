from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .backend_runtime import SovereignBackendRuntime
from .registry import AppRegistry
from .runner import IsolatedRunner
from .service_fabric import SovereignServiceFabric
from .sovereignty import SovereigntyEvaluator
from .suite_control import SuiteControlCentre
from .local_deployment import LocalDeploymentManager
from .cutover import SovereignCutoverManager


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SovereignControlPlane:
    def __init__(self, workspace_root: Path, policy: dict[str, Any], registry: AppRegistry):
        self.workspace = workspace_root.resolve()
        self.policy = policy
        self.registry = registry

    def snapshot(self) -> dict[str, Any]:
        suite = SuiteControlCentre(self.workspace, self.policy, self.registry).overview()
        service_health = SovereignServiceFabric(self.workspace, self.policy, self.registry).health()
        backend = SovereignBackendRuntime(self.workspace, self.policy, self.registry)
        backend_health = backend.health()
        runner = IsolatedRunner(self.workspace, self.policy).preflight()
        evaluator = SovereigntyEvaluator(self.workspace, self.policy, self.registry)
        platform = evaluator.platform_score(
            backend_health=backend_health,
            service_health=service_health,
            runner_preflight=runner,
        )
        managed = [a for a in suite["apps"] if a.get("managed_project")]
        app_scores: list[dict[str, Any]] = []
        cutover_states: list[dict[str, Any]] = []
        for app in managed:
            app_scores.append(evaluator.app_score(app["app_id"], backend_health=backend_health))
            try:
                cutover_states.append(SovereignCutoverManager(self.workspace, self.policy, self.registry).plan(app["app_id"]))
            except Exception as exc:
                cutover_states.append({"app_id": app["app_id"], "ready_for_local_cutover_validation": False, "blockers": [f"cutover_plan_error:{type(exc).__name__}"]})
        deployment = LocalDeploymentManager(self.workspace, self.policy, self.registry)
        deployment_preflight = deployment.preflight()
        deployment_evidence = deployment.verify_evidence_chain()
        return {
            "schema": "resonance-open-nova-control-plane/v1",
            "generated_at": utc_now(),
            "release": "1.5.0-rc1",
            "mode": "zero-credit",
            "external_ai_allowed": self.policy.get("providers", {}).get("external", {}).get("allowed", True),
            "platform_sovereignty": platform,
            "suite": suite,
            "app_scores": app_scores,
            "cutover_states": cutover_states,
            "backend_health": backend_health,
            "service_fabric_health": service_health,
            "runner_preflight": runner,
            "local_deployment_preflight": deployment_preflight,
            "deployment_evidence_integrity": deployment_evidence,
            "registry_integrity": self.registry.verify_chain(),
            "secret_values_exposed": False,
        }
