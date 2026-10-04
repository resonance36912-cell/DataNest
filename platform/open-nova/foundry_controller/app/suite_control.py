from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from .agent import GovernanceViolation
from .migration import EXTERNAL_SIGNALS, IGNORED_DIRS, is_secret_file
from .registry import AppRegistry
from .supply_chain import LocalArtifactStore, dependency_inventory, verify_supply_chain_evidence


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SuiteControlCentre:
    """Read-heavy control plane for the declared Resonance application suite.

    Generated code cannot mutate the suite catalogue or remediation rules because
    both live under protected governance paths. Controller-owned plan files are
    written only below runtime/migration-control/.
    """

    def __init__(self, workspace_root: Path, policy: dict[str, Any], registry: AppRegistry):
        self.workspace = workspace_root.resolve()
        self.policy = policy
        self.registry = registry
        cfg = policy.get("suite_control", {})
        self.catalog_path = (self.workspace / str(cfg.get("catalog", "governance/suite.yaml"))).resolve()
        self.replacements_path = (self.workspace / str(cfg.get("replacements", "governance/local-service-replacements.yaml"))).resolve()
        self.plan_root = (self.workspace / str(cfg.get("plan_root", "runtime/migration-control/plans"))).resolve()
        self.apps_root = (self.workspace / str(cfg.get("apps_root", "apps"))).resolve()
        self.import_root = (self.workspace / str(cfg.get("import_root", "imports/projects"))).resolve()

    def _yaml(self, path: Path) -> dict[str, Any]:
        if not path.exists():
            raise GovernanceViolation(f"Required sovereign control file missing: {path.name}")
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        if not isinstance(data, dict):
            raise GovernanceViolation(f"Invalid sovereign control file: {path.name}")
        return data

    def catalog(self) -> list[dict[str, Any]]:
        apps = self._yaml(self.catalog_path).get("apps", [])
        if not isinstance(apps, list):
            raise GovernanceViolation("Suite catalogue apps must be a list.")
        seen: set[str] = set()
        result: list[dict[str, Any]] = []
        for raw in apps:
            if not isinstance(raw, dict) or not isinstance(raw.get("app_id"), str):
                raise GovernanceViolation("Suite catalogue contains an invalid app entry.")
            app_id = raw["app_id"].strip()
            if not app_id or app_id in seen or "/" in app_id or "\\" in app_id or ".." in app_id:
                raise GovernanceViolation("Suite catalogue contains an unsafe or duplicate app_id.")
            seen.add(app_id)
            result.append(dict(raw))
        return result

    def replacements(self) -> dict[str, Any]:
        raw = self._yaml(self.replacements_path).get("replacements", {})
        if not isinstance(raw, dict):
            raise GovernanceViolation("Local-service replacement catalogue is invalid.")
        return raw

    def _source_stage(self, app: dict[str, Any]) -> str | None:
        aliases = [app["app_id"], *list(app.get("migration_aliases") or [])]
        for alias in aliases:
            candidate = (self.import_root / str(alias)).resolve()
            try:
                candidate.relative_to(self.import_root)
            except ValueError:
                continue
            if candidate.is_dir():
                return str(candidate.relative_to(self.workspace)).replace("\\", "/")
        return None

    def _external_hits(self, project: Path) -> list[dict[str, Any]]:
        hits: dict[str, set[str]] = {}
        max_files = int(self.policy.get("suite_control", {}).get("max_scan_files", 5000))
        count = 0
        for path in sorted(project.rglob("*")):
            if path.is_dir() or path.is_symlink():
                continue
            try:
                rel = path.relative_to(project)
            except ValueError:
                continue
            if any(part in IGNORED_DIRS for part in rel.parts):
                continue
            if is_secret_file(path):
                continue
            count += 1
            if count > max_files:
                raise GovernanceViolation(f"Suite dependency scan exceeds {max_files} files.")
            if path.stat().st_size > 512_000:
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="replace").lower()
            except OSError:
                continue
            for service, markers in EXTERNAL_SIGNALS.items():
                matched = [m for m in markers if m.lower() in text]
                if matched:
                    hits.setdefault(service, set()).update(matched)
        return [{"service": name, "signals": sorted(values)} for name, values in sorted(hits.items())]

    def status(self, app_id: str) -> dict[str, Any]:
        app = next((a for a in self.catalog() if a["app_id"] == app_id), None)
        if app is None:
            raise GovernanceViolation("Application is not declared in the sovereign suite catalogue.")
        project = (self.apps_root / app_id).resolve()
        try:
            project.relative_to(self.apps_root)
        except ValueError as exc:
            raise GovernanceViolation("Application path escaped apps root.") from exc

        staged_source = self._source_stage(app)
        managed = project.is_dir()
        registry_state = self.registry.state(app_id)
        external: list[dict[str, Any]] = []
        dependency = None
        evidence = None
        cache = None
        if managed:
            external = self._external_hits(project)
            dependency = dependency_inventory(project)
            evidence = verify_supply_chain_evidence(project)
            cache = LocalArtifactStore(self.workspace, self.policy).project_cache_status(project)

        blockers: list[str] = []
        if not managed:
            blockers.append("Application has not been imported/generated into the sovereign apps workspace.")
        if external:
            blockers.append("Hosted/platform-specific dependencies still require remediation.")
        if managed and dependency and not dependency.get("offline_ready", False):
            blockers.append("Dependency declarations are not fully exact/reproducible.")
        if managed and cache and not cache.get("offline_ready", False):
            blockers.append("Required dependency artifacts are not fully present in the local sovereign cache.")
        if managed and evidence and not evidence.get("valid", False):
            blockers.append("Current project tree does not have valid supply-chain evidence.")

        if managed:
            migration_state = "sovereign_ready" if not blockers else "remediation_required"
        elif staged_source:
            migration_state = "staged_for_assessment"
        else:
            migration_state = "source_needed"

        return {
            **app,
            "managed_project": managed,
            "project_dir": f"apps/{app_id}" if managed else None,
            "staged_source": staged_source,
            "migration_state": migration_state,
            "external_dependencies": external,
            "dependency_inventory": dependency,
            "cache_status": cache,
            "supply_chain_evidence": evidence,
            "registry_state": registry_state,
            "blockers": blockers,
            "sovereign_ready": managed and not blockers,
        }

    def overview(self) -> dict[str, Any]:
        states = [self.status(app["app_id"]) for app in self.catalog()]
        counts: dict[str, int] = {}
        for state in states:
            key = state["migration_state"]
            counts[key] = counts.get(key, 0) + 1
        return {
            "schema": "resonance-suite-control/v1",
            "generated_at": utc_now(),
            "zero_credit": True,
            "external_ai_required": False,
            "counts": counts,
            "apps": states,
        }

    def remediation_plan(self, app_id: str, *, write: bool = False) -> dict[str, Any]:
        state = self.status(app_id)
        replacements = self.replacements()
        actions: list[dict[str, Any]] = []
        for dep in state["external_dependencies"]:
            service = dep["service"]
            replacement = replacements.get(service, {})
            actions.append({
                "service": service,
                "signals": dep.get("signals", []),
                "target": replacement.get("target", "Provider-neutral local adapter"),
                "class": replacement.get("class", "integration"),
                "strategy": replacement.get("strategy", "Replace platform-specific calls behind a locally controlled adapter."),
                "gate": "human_review_then_local_implementation",
            })
        if state.get("dependency_inventory") and not state["dependency_inventory"].get("offline_ready", False):
            actions.append({
                "service": "dependency-versioning",
                "target": "Exact reproducible dependency declarations",
                "class": "supply-chain",
                "strategy": "Replace ranges/unresolved declarations with exact validated versions before offline admission.",
                "gate": "dependency_validation",
            })
        if state.get("cache_status") and not state["cache_status"].get("offline_ready", False):
            actions.append({
                "service": "local-artifact-cache",
                "target": "Governed local dependency cache",
                "class": "supply-chain",
                "strategy": "Ingest required dependency artifacts through the local artifact inbox and verify SHA-256 before use.",
                "gate": "local_cache_complete",
            })
        if state.get("supply_chain_evidence") and not state["supply_chain_evidence"].get("valid", False):
            actions.append({
                "service": "artifact-evidence",
                "target": "Valid SBOM + artifact manifest",
                "class": "integrity",
                "strategy": "Regenerate supply-chain evidence after approved remediation and verify it before readiness promotion.",
                "gate": "integrity_verification",
            })
        if not state["managed_project"]:
            actions.insert(0, {
                "service": "source-import",
                "target": "Governed apps workspace",
                "class": "migration",
                "strategy": "Stage source under imports/projects, assess it, then perform copy-only migration with explicit confirmation.",
                "gate": "human_confirmed_import",
            })
        plan = {
            "schema": "resonance-remediation-plan/v1",
            "created_at": utc_now(),
            "app_id": app_id,
            "current_state": state["migration_state"],
            "target_state": "sovereign_ready",
            "actions": actions,
            "destructive_actions": False,
            "external_ai_required": False,
        }
        if write:
            self.plan_root.mkdir(parents=True, exist_ok=True)
            path = (self.plan_root / f"{app_id}.json").resolve()
            try:
                path.relative_to(self.plan_root)
            except ValueError as exc:
                raise GovernanceViolation("Remediation plan path escaped control directory.") from exc
            path.write_text(json.dumps(plan, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            plan["plan_path"] = str(path.relative_to(self.workspace)).replace("\\", "/")
        return plan
