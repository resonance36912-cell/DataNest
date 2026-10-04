from __future__ import annotations

import hashlib
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class GovernanceViolation(RuntimeError):
    pass


@dataclass
class TaskResult:
    task: str
    command: list[str]
    returncode: int
    stdout: str
    stderr: str


def slugify(value: str, fallback: str = "resonance-app") -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:64] or fallback


class SovereignWorkspace:
    def __init__(self, root: Path, policy: dict[str, Any]):
        self.root = root.resolve()
        self.policy = policy
        execution = policy.get("execution", {})
        self.max_file_bytes = int(execution.get("max_file_bytes", 1_048_576))
        self.max_command_seconds = int(execution.get("max_command_seconds", 120))
        self.protected = [str(p).replace("\\", "/").lstrip("./") for p in policy.get("protected_paths", [])]
        self.protected_segments = {str(p).strip("/\\") for p in policy.get("protected_path_segments", []) if str(p).strip("/\\")}

    def resolve(self, relative: str) -> Path:
        if not relative or relative.startswith(("/", "\\")):
            raise GovernanceViolation("Only repository-relative paths are allowed.")
        candidate = (self.root / relative).resolve()
        try:
            candidate.relative_to(self.root)
        except ValueError as exc:
            raise GovernanceViolation("Path escapes the governed workspace.") from exc
        return candidate

    def is_protected(self, relative: str) -> bool:
        target = self.resolve(relative)
        normalized = str(target.relative_to(self.root)).replace("\\", "/")
        for protected in self.protected:
            p = protected.rstrip("/")
            if normalized == p or normalized.startswith(p + "/"):
                return True
        if self.protected_segments and any(part in self.protected_segments for part in normalized.split("/")):
            return True
        return False

    def write_file(self, relative: str, content: str, *, overwrite: bool = False, confirmed: bool = False) -> dict[str, Any]:
        if self.is_protected(relative):
            raise GovernanceViolation(f"Protected path denied: {relative}")
        encoded = content.encode("utf-8")
        if len(encoded) > self.max_file_bytes:
            raise GovernanceViolation(f"File exceeds governance size limit ({self.max_file_bytes} bytes).")
        target = self.resolve(relative)
        if target.exists() and not overwrite:
            raise GovernanceViolation("Target exists. Set overwrite=true with confirmation to replace it.")
        if target.exists() and overwrite and not confirmed:
            raise GovernanceViolation("Overwrite requires confirmed=true.")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return {
            "path": relative.replace("\\", "/"),
            "bytes": len(encoded),
            "sha256": hashlib.sha256(encoded).hexdigest(),
            "overwritten": bool(overwrite),
        }

    def run_task(self, task_name: str) -> TaskResult:
        tasks = self.policy.get("allowed_tasks", {})
        spec = tasks.get(task_name)
        if not spec:
            raise GovernanceViolation(f"Task is not governance-allowlisted: {task_name}")
        command = spec.get("command")
        if not isinstance(command, list) or not command or not all(isinstance(x, str) for x in command):
            raise GovernanceViolation("Governance task command is invalid.")
        try:
            proc = subprocess.run(
                command,
                cwd=self.root,
                capture_output=True,
                text=True,
                timeout=self.max_command_seconds,
                shell=False,
                check=False,
            )
        except FileNotFoundError as exc:
            raise GovernanceViolation(f"Task runtime missing: {command[0]}") from exc
        except subprocess.TimeoutExpired as exc:
            raise GovernanceViolation(f"Task exceeded {self.max_command_seconds}s timeout.") from exc
        return TaskResult(task_name, command, proc.returncode, proc.stdout[-20000:], proc.stderr[-20000:])

    def git_commit(self, message: str) -> dict[str, str]:
        if len(message.strip()) < 3:
            raise GovernanceViolation("Commit message is too short.")
        self._git(["add", "-A"])
        status = self._git(["status", "--porcelain"]).stdout.strip()
        if not status:
            raise GovernanceViolation("No workspace changes to commit.")
        commit = self._git(["commit", "-m", message.strip()])
        sha = self._git(["rev-parse", "HEAD"]).stdout.strip()
        return {"commit_sha": sha, "output": commit.stdout[-10000:]}

    def git_commit_paths(self, message: str, paths: list[str]) -> dict[str, Any]:
        if len(message.strip()) < 3:
            raise GovernanceViolation("Commit message is too short.")
        if not paths:
            raise GovernanceViolation("At least one repository-relative commit path is required.")
        normalized: list[str] = []
        for path in paths:
            if self.is_protected(path):
                raise GovernanceViolation(f"Protected path cannot be committed by coding agent: {path}")
            target = self.resolve(path)
            normalized.append(str(target.relative_to(self.root)).replace("\\", "/"))
        self._git(["add", "--", *normalized])
        status = self._git(["status", "--porcelain", "--", *normalized]).stdout.strip()
        if not status:
            sha = self._git(["rev-parse", "HEAD"]).stdout.strip()
            return {"commit_sha": sha, "committed": False, "output": "No governed project changes to commit."}
        commit = self._git(["commit", "-m", message.strip(), "--", *normalized])
        sha = self._git(["rev-parse", "HEAD"]).stdout.strip()
        return {"commit_sha": sha, "committed": True, "output": commit.stdout[-10000:]}

    def git_revert(self, commit_sha: str, *, confirmed: bool) -> dict[str, str]:
        if not confirmed:
            raise GovernanceViolation("Commit revert requires confirmed=true.")
        if not re.fullmatch(r"[0-9a-fA-F]{7,40}", commit_sha):
            raise GovernanceViolation("Invalid commit SHA.")
        revert = self._git(["revert", "--no-edit", commit_sha])
        sha = self._git(["rev-parse", "HEAD"]).stdout.strip()
        return {"reverted_commit": commit_sha, "revert_commit_sha": sha, "output": revert.stdout[-10000:]}

    def _git(self, args: list[str]) -> subprocess.CompletedProcess[str]:
        try:
            proc = subprocess.run(
                ["git", *args],
                cwd=self.root,
                capture_output=True,
                text=True,
                timeout=self.max_command_seconds,
                shell=False,
                check=False,
            )
        except FileNotFoundError as exc:
            raise GovernanceViolation("Git is not installed in the controller runtime.") from exc
        if proc.returncode != 0:
            raise GovernanceViolation((proc.stderr or proc.stdout or "Git operation failed.")[-12000:])
        return proc


def deterministic_scaffold(intent: str, app_name: str | None = None) -> dict[str, str]:
    name = slugify(app_name or intent.split(".")[0][:60])
    title = " ".join(part.capitalize() for part in name.split("-")) or "Resonance App"
    safe_intent = intent.strip().replace("\x00", "")[:4000]
    files = {
        f"apps/{name}/README.md": f"# {title}\n\nGenerated by Resonance Sovereign Foundry Zero-Credit Mode.\n\n## Intent\n\n{safe_intent}\n",
        f"apps/{name}/app.py": (
            "from fastapi import FastAPI\n\n"
            f"app = FastAPI(title={title!r})\n\n"
            "@app.get('/health')\n"
            "def health():\n"
            "    return {'status': 'ok', 'runtime': 'resonance-sovereign'}\n"
        ),
        f"apps/{name}/requirements.txt": "fastapi==0.116.1\nuvicorn[standard]==0.35.0\n",
        f"apps/{name}/APP_SPEC.json": json.dumps(
            {
                "name": name,
                "title": title,
                "intent": safe_intent,
                "generated_by": "Resonance Sovereign Foundry deterministic scaffold",
                "external_ai_required": False,
            },
            indent=2,
            ensure_ascii=False,
        ) + "\n",
    }
    return files
