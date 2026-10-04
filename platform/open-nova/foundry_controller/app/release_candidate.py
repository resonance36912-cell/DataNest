from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from .agent import GovernanceViolation
from .registry import APP_ID_RE, AppRegistry


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


class ReleaseCertifier:
    """Issues controller-owned, hash-chained local certification records.

    RC certification proves static platform integrity. Operational certification
    additionally requires runtime evidence supplied by the control plane.
    """

    def __init__(self, workspace_root: Path, policy: dict[str, Any], registry: AppRegistry):
        self.workspace = workspace_root.resolve()
        self.policy = policy
        self.registry = registry
        release_path = self.workspace / "governance" / "release.yaml"
        if not release_path.is_file():
            raise GovernanceViolation("Release governance is missing.")
        self.release = yaml.safe_load(release_path.read_text(encoding="utf-8")) or {}
        root = self.release.get("certification", {}).get("record_root", "runtime/certifications")
        self.root = (self.workspace / str(root)).resolve()
        self.root.relative_to(self.workspace)

    def _static_files(self) -> list[Path]:
        required = [
            self.workspace / "governance" / "policy.yaml",
            self.workspace / "governance" / "release.yaml",
            self.workspace / "governance" / "backend-runtime.yaml",
            self.workspace / "governance" / "service-fabric.yaml",
            self.workspace / "foundry_controller" / "app" / "main.py",
        ]
        return required

    def rc_preflight(self) -> dict[str, Any]:
        missing = [str(p.relative_to(self.workspace)) for p in self._static_files() if not p.is_file()]
        external_denied = self.policy.get("providers", {}).get("external", {}).get("allowed", True) is False
        local_first = self.policy.get("principles", {}).get("local_first") is True
        registry = self.registry.verify_chain()
        checks = {
            "required_files_present": not missing,
            "external_ai_denied": external_denied,
            "local_first": local_first,
            "registry_chain_valid": bool(registry.get("valid")),
        }
        return {
            "schema": "resonance-release-preflight/v1",
            "release": "1.5.8",
            "checks": checks,
            "missing": missing,
            "passed": all(checks.values()),
            "operational_runtime_verified": False,
            "external_ai_required": False,
        }

    def _last_hash(self, path: Path) -> str | None:
        if not path.exists():
            return None
        lines = [line for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
        if not lines:
            return None
        try:
            return json.loads(lines[-1]).get("sha256")
        except json.JSONDecodeError as exc:
            raise GovernanceViolation("Certification ledger is corrupt.") from exc

    def _append(self, path: Path, record: dict[str, Any]) -> dict[str, Any]:
        path.parent.mkdir(parents=True, exist_ok=True)
        base = {**record, "previous_sha256": self._last_hash(path)}
        canonical = json.dumps(base, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        final = {**base, "sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest()}
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(final, ensure_ascii=False) + "\n")
        return final

    def certify_release_candidate(self, *, confirmed: bool) -> dict[str, Any]:
        if self.release.get("certification", {}).get("require_confirmation", True) and not confirmed:
            raise GovernanceViolation("Release certification requires confirmed=true.")
        preflight = self.rc_preflight()
        if not preflight["passed"]:
            raise GovernanceViolation("Release candidate preflight failed; refusing certification.")
        file_hashes = {
            str(p.relative_to(self.workspace)).replace("\\", "/"): sha256_file(p)
            for p in self._static_files()
        }
        record = self._append(self.root / "release-candidate.jsonl", {
            "schema": "resonance-release-certification/v1",
            "timestamp": utc_now(),
            "release": "1.5.8",
            "level": "release_candidate_integrity",
            "operational_runtime_verified": False,
            "file_hashes": file_hashes,
            "external_ai_used": False,
        })
        return record

    def certify_app_operational(self, app_id: str, score: dict[str, Any], *, confirmed: bool) -> dict[str, Any]:
        if not APP_ID_RE.fullmatch(app_id):
            raise GovernanceViolation("Invalid application id.")
        if self.release.get("certification", {}).get("require_confirmation", True) and not confirmed:
            raise GovernanceViolation("Operational certification requires confirmed=true.")
        threshold = int(self.release.get("minimum_app_score", 90))
        if not score.get("operationally_sovereign") or int(score.get("score", 0)) < threshold:
            raise GovernanceViolation("Application has not satisfied operational sovereignty gates.")
        record = self._append(self.root / "applications" / f"{app_id}.jsonl", {
            "schema": "resonance-app-operational-certification/v1",
            "timestamp": utc_now(),
            "app_id": app_id,
            "level": "operational_sovereignty",
            "score": score.get("score"),
            "critical_blockers": [],
            "external_ai_used": False,
        })
        self.registry.append(app_id, "operational_sovereignty_certified", {
            "status": "operationally_sovereign",
            "sovereignty_score": score.get("score"),
            "certification_sha256": record["sha256"],
        })
        return record
