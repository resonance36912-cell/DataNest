from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .agent import GovernanceViolation
from .migration import is_secret_file
from .registry import APP_ID_RE, AppRegistry


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha256_json(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _path_hash(path: Path) -> str:
    return hashlib.sha256(str(path).encode("utf-8")).hexdigest()


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


class SovereignWorkstationBridge:
    """Bridges a local Git repository into Open Nova without network access.

    The bridge stages an exact *clean working-tree snapshot* of Git-tracked files.
    It records the source commit and a hash of the local path, never the absolute path
    itself. Git history is not copied by this operation, which avoids importing historical
    secrets by accident; the original repository remains the history source.
    """

    def __init__(self, workspace_root: Path, policy: dict[str, Any], registry: AppRegistry):
        self.workspace = workspace_root.resolve()
        self.policy = policy
        self.registry = registry
        cfg = policy.get("workstation_bridge", {}) or {}
        self.runtime_root = (self.workspace / str(cfg.get("runtime_root", "runtime/workstation"))).resolve()
        self.stage_root = (self.workspace / str(cfg.get("stage_root", "imports/projects"))).resolve()
        self.apps_root = (self.workspace / str(cfg.get("apps_root", "apps"))).resolve()
        self.source_ingestion_root = (self.workspace / str(cfg.get("source_ingestion_root", "runtime/source-ingestion"))).resolve()
        self.require_clean_repo = bool(cfg.get("require_clean_repo", True))
        self.require_confirmation = bool(cfg.get("require_confirmation", True))
        self.max_files = int(cfg.get("max_files", 10000))
        self.max_total_bytes = int(cfg.get("max_total_bytes", 1_000_000_000))
        for path in (self.runtime_root, self.stage_root, self.apps_root, self.source_ingestion_root):
            path.relative_to(self.workspace)

    def _validate_app_id(self, app_id: str) -> None:
        if not APP_ID_RE.fullmatch(app_id):
            raise GovernanceViolation("Invalid application id.")

    def _git(self, repo: Path, args: list[str], *, allow_nonzero: bool = False) -> subprocess.CompletedProcess[str]:
        try:
            result = subprocess.run(
                ["git", "-C", str(repo), *args],
                capture_output=True,
                text=True,
                shell=False,
                timeout=60,
                check=False,
            )
        except FileNotFoundError as exc:
            raise GovernanceViolation("Git is not installed or not visible on PATH.") from exc
        except subprocess.TimeoutExpired as exc:
            raise GovernanceViolation("Local Git repository inspection timed out.") from exc
        if result.returncode != 0 and not allow_nonzero:
            raise GovernanceViolation((result.stderr or result.stdout or "Git operation failed.")[-8000:])
        return result

    def _repo_root(self, source_path: str) -> Path:
        raw = Path(source_path).expanduser()
        if _is_linklike(raw):
            raise GovernanceViolation("Repository root cannot be a symlink/junction/reparse point.")
        source = raw.resolve()
        if not source.is_dir():
            raise GovernanceViolation("Approved local repository directory does not exist.")
        top = self._git(source, ["rev-parse", "--show-toplevel"]).stdout.strip()
        if not top:
            raise GovernanceViolation("Selected source is not a Git repository.")
        repo = Path(top).resolve()
        if repo != source:
            raise GovernanceViolation("Select the Git repository root itself, not a nested subdirectory.")
        if repo == self.workspace:
            raise GovernanceViolation("The Open Nova workspace itself cannot be staged as an application repository.")
        return repo

    def _tracked_entries(self, repo: Path) -> list[dict[str, Any]]:
        result = self._git(repo, ["ls-files", "--stage", "-z"])
        entries: list[dict[str, Any]] = []
        total = 0
        for raw in result.stdout.split("\x00"):
            if not raw:
                continue
            try:
                meta, rel_text = raw.split("\t", 1)
                mode, blob_sha, stage = meta.split(" ", 2)
            except ValueError as exc:
                raise GovernanceViolation("Git returned an invalid tracked-file record.") from exc
            if stage != "0":
                raise GovernanceViolation(f"Repository has an unresolved index stage for {rel_text}.")
            if mode == "120000":
                raise GovernanceViolation(f"Tracked symlink is not permitted: {rel_text}")
            if mode == "160000":
                raise GovernanceViolation(f"Git submodule is not admitted automatically: {rel_text}")
            rel = Path(rel_text)
            if rel.is_absolute() or ".." in rel.parts:
                raise GovernanceViolation("Git reported an unsafe tracked path.")
            source = (repo / rel).resolve()
            try:
                source.relative_to(repo)
            except ValueError as exc:
                raise GovernanceViolation(f"Tracked path escapes repository root: {rel_text}") from exc
            if _is_linklike(repo / rel):
                raise GovernanceViolation(f"Tracked link/reparse point is not permitted: {rel_text}")
            if not source.is_file():
                raise GovernanceViolation(f"Tracked file is missing from the clean worktree: {rel_text}")
            if is_secret_file(source):
                raise GovernanceViolation(f"Tracked secret-bearing file blocks repository staging: {rel_text}")
            size = source.stat().st_size
            total += size
            if len(entries) + 1 > self.max_files:
                raise GovernanceViolation("Repository exceeds governed tracked-file limit.")
            if total > self.max_total_bytes:
                raise GovernanceViolation("Repository exceeds governed tracked-byte limit.")
            entries.append({
                "path": rel.as_posix(),
                "bytes": size,
                "sha256": _sha256_file(source),
                "git_blob_sha": blob_sha,
                "git_mode": mode,
            })
        if not entries:
            raise GovernanceViolation("Repository contains no tracked files to stage.")
        return entries

    def assess_repository(self, source_path: str) -> dict[str, Any]:
        repo = self._repo_root(source_path)
        commit = self._git(repo, ["rev-parse", "HEAD"]).stdout.strip()
        branch_result = self._git(repo, ["branch", "--show-current"], allow_nonzero=True)
        branch = branch_result.stdout.strip() or None
        dirty_lines = [line for line in self._git(repo, ["status", "--porcelain=v1", "--untracked-files=all"]).stdout.splitlines() if line]
        submodule_result = self._git(repo, ["submodule", "status", "--recursive"], allow_nonzero=True)
        submodules = [line.strip() for line in submodule_result.stdout.splitlines() if line.strip()]
        blockers: list[str] = []
        if self.require_clean_repo and dirty_lines:
            blockers.append("repository_worktree_not_clean")
        if submodules:
            blockers.append("git_submodules_require_manual_admission")
        entries: list[dict[str, Any]] = []
        try:
            entries = self._tracked_entries(repo)
        except GovernanceViolation as exc:
            blockers.append(str(exc))
        attrs = repo / ".gitattributes"
        lfs_detected = False
        if attrs.is_file():
            try:
                lfs_detected = "filter=lfs" in attrs.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                lfs_detected = False
        if lfs_detected:
            blockers.append("git_lfs_requires_content_verification")
        remotes = self._git(repo, ["remote"], allow_nonzero=True).stdout.split()
        return {
            "schema": "resonance-repository-bridge-assessment/v1",
            "release": "1.5.0-rc1",
            "created_at": utc_now(),
            "repository_path_recorded": False,
            "repository_path_sha256": _path_hash(repo),
            "commit_sha": commit,
            "branch": branch,
            "clean": not dirty_lines,
            "dirty_entry_count": len(dirty_lines),
            "remote_config_present": bool(remotes),
            "remote_urls_recorded": False,
            "submodule_count": len(submodules),
            "git_lfs_detected": lfs_detected,
            "tracked_file_count": len(entries),
            "tracked_total_bytes": sum(x["bytes"] for x in entries),
            "blockers": blockers,
            "ready_to_stage": not blockers,
            "network_used": False,
            "external_ai_used": False,
        }

    def stage_repository(self, app_id: str, source_path: str, *, confirmed: bool = False) -> dict[str, Any]:
        self._validate_app_id(app_id)
        if self.require_confirmation and not confirmed:
            raise GovernanceViolation("Repository staging requires confirmed=true.")
        repo = self._repo_root(source_path)
        assessment = self.assess_repository(str(repo))
        if not assessment["ready_to_stage"]:
            raise GovernanceViolation("Repository staging blocked: " + ", ".join(assessment["blockers"]))
        destination = (self.stage_root / app_id).resolve()
        managed = (self.apps_root / app_id).resolve()
        destination.relative_to(self.stage_root)
        managed.relative_to(self.apps_root)
        if destination.exists():
            raise GovernanceViolation("A staged source with this application id already exists; refusing to overwrite.")
        if managed.exists():
            raise GovernanceViolation("A managed application with this id already exists; refusing to stage over it.")
        entries = self._tracked_entries(repo)
        destination.mkdir(parents=True, exist_ok=False)
        try:
            for entry in entries:
                rel = Path(entry["path"])
                src = (repo / rel).resolve()
                target = (destination / rel).resolve()
                target.relative_to(destination)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, target)
        except Exception:
            shutil.rmtree(destination, ignore_errors=True)
            raise

        canonical_entries = [
            {"path": x["path"], "bytes": x["bytes"], "sha256": x["sha256"]}
            for x in entries
        ]
        tree_sha256 = hashlib.sha256(
            json.dumps(canonical_entries, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        ).hexdigest()
        source_record = {
            "schema": "resonance-real-source-ingestion/v1",
            "created_at": utc_now(),
            "release": "1.5.0-rc1",
            "app_id": app_id,
            "source_path_sha256": _path_hash(repo),
            "source_path_recorded": False,
            "source_modified": False,
            "destination": f"imports/projects/{app_id}",
            "file_count": len(canonical_entries),
            "total_bytes": sum(x["bytes"] for x in canonical_entries),
            "tree_sha256": tree_sha256,
            "files": canonical_entries,
            "secrets_copied": False,
            "symlinks_copied": False,
            "network_used": False,
            "external_ai_used": False,
            "source_kind": "clean_local_git_snapshot",
            "source_commit_sha": assessment["commit_sha"],
        }
        source_record["record_sha256"] = _sha256_json(source_record)
        ingest_dir = self.source_ingestion_root / app_id
        ingest_dir.mkdir(parents=True, exist_ok=True)
        (ingest_dir / "latest.json").write_text(json.dumps(source_record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

        bridge_record = {
            "schema": "resonance-repository-bridge-stage/v1",
            "created_at": utc_now(),
            "release": "1.5.0-rc1",
            "app_id": app_id,
            "commit_sha": assessment["commit_sha"],
            "branch": assessment["branch"],
            "repository_path_sha256": assessment["repository_path_sha256"],
            "repository_path_recorded": False,
            "remote_urls_recorded": False,
            "tree_sha256": tree_sha256,
            "tracked_file_count": len(entries),
            "tracked_total_bytes": sum(x["bytes"] for x in entries),
            "source_modified": False,
            "network_used": False,
            "external_ai_used": False,
        }
        bridge_record["record_sha256"] = _sha256_json(bridge_record)
        record_dir = self.runtime_root / "repositories"
        record_dir.mkdir(parents=True, exist_ok=True)
        (record_dir / f"{app_id}.json").write_text(json.dumps(bridge_record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        event = self.registry.append(app_id, "local_git_repository_staged", {
            "status": "local_git_repository_staged",
            "commit_sha": assessment["commit_sha"],
            "tree_sha256": tree_sha256,
            "source_modified": False,
            "network_used": False,
        })
        return {
            "schema": "resonance-repository-bridge-stage-result/v1",
            "app_id": app_id,
            "staged": True,
            "destination": f"imports/projects/{app_id}",
            "commit_sha": assessment["commit_sha"],
            "tree_sha256": tree_sha256,
            "file_count": len(entries),
            "repository_path_recorded": False,
            "source_modified": False,
            "network_used": False,
            "registry_event": event,
        }

    def _bridge_record(self, app_id: str) -> dict[str, Any] | None:
        self._validate_app_id(app_id)
        path = self.runtime_root / "repositories" / f"{app_id}.json"
        if not path.is_file():
            return None
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise GovernanceViolation("Repository-bridge evidence is invalid JSON.") from exc
        digest = record.get("record_sha256")
        base = {k: v for k, v in record.items() if k != "record_sha256"}
        if digest != _sha256_json(base):
            raise GovernanceViolation("Repository-bridge evidence failed integrity verification.")
        return record

    def verify_staged(self, app_id: str) -> dict[str, Any]:
        record = self._bridge_record(app_id)
        if not record:
            return {"schema": "resonance-repository-bridge-verification/v1", "app_id": app_id, "valid": False, "reason": "bridge_evidence_missing"}
        source_record_path = self.source_ingestion_root / app_id / "latest.json"
        staged = self.stage_root / app_id
        if not source_record_path.is_file() or not staged.is_dir():
            return {"schema": "resonance-repository-bridge-verification/v1", "app_id": app_id, "valid": False, "reason": "staged_snapshot_or_ingestion_evidence_missing"}
        try:
            source_record = json.loads(source_record_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {"schema": "resonance-repository-bridge-verification/v1", "app_id": app_id, "valid": False, "reason": "source_ingestion_evidence_invalid_json"}
        digest = source_record.get("record_sha256")
        base = {k: v for k, v in source_record.items() if k != "record_sha256"}
        if digest != _sha256_json(base):
            return {"schema": "resonance-repository-bridge-verification/v1", "app_id": app_id, "valid": False, "reason": "source_ingestion_evidence_hash_mismatch"}
        expected = {x["path"]: x["sha256"] for x in source_record.get("files", [])}
        actual: dict[str, str] = {}
        for path in sorted(staged.rglob("*")):
            if _is_linklike(path):
                return {"schema": "resonance-repository-bridge-verification/v1", "app_id": app_id, "valid": False, "reason": "staged_link_detected"}
            if path.is_file():
                rel = path.relative_to(staged).as_posix()
                actual[rel] = _sha256_file(path)
        if set(actual) != set(expected):
            return {"schema": "resonance-repository-bridge-verification/v1", "app_id": app_id, "valid": False, "reason": "staged_file_set_mismatch"}
        mismatches = [path for path, sha in expected.items() if actual.get(path) != sha]
        valid = not mismatches and source_record.get("tree_sha256") == record.get("tree_sha256")
        return {
            "schema": "resonance-repository-bridge-verification/v1",
            "app_id": app_id,
            "valid": valid,
            "commit_sha": record.get("commit_sha"),
            "tree_sha256": record.get("tree_sha256"),
            "mismatches": mismatches,
            "network_used": False,
        }

    def repository_status(self, app_id: str) -> dict[str, Any]:
        record = self._bridge_record(app_id)
        verification = self.verify_staged(app_id) if record else {"valid": False, "reason": "bridge_evidence_missing"}
        managed = (self.apps_root / app_id).is_dir()
        staged = (self.stage_root / app_id).is_dir()
        blockers: list[str] = []
        if not record:
            blockers.append("repository_snapshot_not_staged")
        elif not verification.get("valid") and not managed:
            blockers.append(str(verification.get("reason", "repository_snapshot_invalid")))
        return {
            "schema": "resonance-repository-bridge-status/v1",
            "release": "1.5.0-rc1",
            "app_id": app_id,
            "staged": staged,
            "managed": managed,
            "commit_sha": record.get("commit_sha") if record else None,
            "snapshot_valid": bool(verification.get("valid")) if staged else bool(managed and record),
            "blockers": blockers,
            "ready_for_governed_import": staged and bool(verification.get("valid")) and not managed,
            "network_used": False,
            "external_ai_used": False,
        }

    def workstation_status(self) -> dict[str, Any]:
        def which(name: str) -> bool:
            return shutil.which(name) is not None

        state_path = self.runtime_root / "state.json"
        state_valid = False
        initialized = False
        if state_path.is_file():
            initialized = True
            try:
                state = json.loads(state_path.read_text(encoding="utf-8"))
                digest = state.get("record_sha256")
                base = {k: v for k, v in state.items() if k != "record_sha256"}
                state_valid = digest == _sha256_json(base)
            except json.JSONDecodeError:
                state_valid = False
        return {
            "schema": "resonance-sovereign-workstation-status/v1",
            "release": "1.5.0-rc1",
            "initialized": initialized,
            "state_integrity_valid": state_valid,
            "workspace_path_recorded": False,
            "workspace_path_sha256": _path_hash(self.workspace),
            "python_version": sys.version.split()[0],
            "tools": {
                "git": which("git"),
                "podman": which("podman"),
                "docker": which("docker"),
                "openssl": which("openssl"),
                "ollama_optional": which("ollama"),
            },
            "external_ai_default": "denied",
            "network_provisioning_default": False,
        }

    def initialize_workstation(self, *, confirmed: bool = False) -> dict[str, Any]:
        if self.require_confirmation and not confirmed:
            raise GovernanceViolation("Sovereign workstation initialization requires confirmed=true.")
        for path in (
            self.runtime_root,
            self.runtime_root / "repositories",
            self.runtime_root / "logs",
            self.stage_root,
            self.apps_root,
            self.workspace / "runtime" / "supply-chain" / "wheelhouse",
        ):
            path.mkdir(parents=True, exist_ok=True)
        state = {
            "schema": "resonance-sovereign-workstation-state/v1",
            "created_at": utc_now(),
            "release": "1.5.0-rc1",
            "workspace_path_recorded": False,
            "workspace_path_sha256": _path_hash(self.workspace),
            "loopback_builder_url": "http://127.0.0.1:8787/builder",
            "external_ai_default": "denied",
            "network_provisioning_performed": False,
            "production_cutover_performed": False,
        }
        state["record_sha256"] = _sha256_json(state)
        (self.runtime_root / "state.json").write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return {**self.workstation_status(), "initialized_now": True}
