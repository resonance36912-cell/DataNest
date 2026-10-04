from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .agent import GovernanceViolation


@dataclass
class IsolatedTaskResult:
    task: str
    engine: str
    image: str
    command: list[str]
    returncode: int
    stdout: str
    stderr: str


class DependencyGuard:
    """Static dependency-policy checks. No registry/network calls are made."""

    def __init__(self, policy: dict[str, Any]):
        self.policy = policy.get("dependency_policy", {})
        self.require_exact_python = bool(self.policy.get("require_exact_python_versions", True))
        self.require_node_lockfile = bool(self.policy.get("require_node_lockfile", True))
        self.deny_remote_sources = bool(self.policy.get("deny_remote_sources", True))

    def check(self, project: Path) -> dict[str, Any]:
        violations: list[str] = []
        checked: list[str] = []

        requirements = project / "requirements.txt"
        if requirements.exists():
            checked.append("requirements.txt")
            for number, raw in enumerate(requirements.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                lower = line.lower()
                if self.deny_remote_sources and (
                    "http://" in lower
                    or "https://" in lower
                    or "git+" in lower
                    or lower.startswith("-e ")
                    or lower.startswith("--index-url")
                    or lower.startswith("--extra-index-url")
                    or lower.startswith("--trusted-host")
                ):
                    violations.append(f"requirements.txt:{number}: remote/VCS dependency source denied")
                    continue
                if self.require_exact_python and not line.startswith("-") and "==" not in line:
                    violations.append(f"requirements.txt:{number}: dependency must be exactly pinned with ==")

        package_json = project / "package.json"
        if package_json.exists():
            checked.append("package.json")
            try:
                data = json.loads(package_json.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                violations.append(f"package.json: invalid JSON: {exc.msg}")
                data = {}
            if self.require_node_lockfile and not ((project / "package-lock.json").exists() or (project / "npm-shrinkwrap.json").exists()):
                violations.append("package.json: package-lock.json or npm-shrinkwrap.json required")
            for section in ("dependencies", "devDependencies", "optionalDependencies"):
                deps = data.get(section, {})
                if not isinstance(deps, dict):
                    continue
                for name, version in deps.items():
                    value = str(version).strip().lower()
                    if self.deny_remote_sources and any(marker in value for marker in ("http://", "https://", "git+", "github:", "gitlab:", "bitbucket:")):
                        violations.append(f"package.json: {section}.{name}: remote/VCS dependency source denied")
                    if value in {"*", "latest", "next"}:
                        violations.append(f"package.json: {section}.{name}: floating dependency version denied")

        return {"passed": not violations, "checked": checked, "violations": violations}


class StaticSecurityScanner:
    """Small local baseline scanner. It is intentionally dependency-free and offline."""

    TEXT_SUFFIXES = {
        ".py", ".js", ".jsx", ".ts", ".tsx", ".json", ".yaml", ".yml", ".toml",
        ".ini", ".cfg", ".md", ".txt", ".sh", ".ps1", ".html", ".css", ".env",
    }

    RULES: tuple[tuple[str, re.Pattern[str], str], ...] = (
        ("private_key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"), "critical"),
        ("openai_style_secret", re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"), "critical"),
        ("github_pat", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"), "critical"),
        ("shell_true", re.compile(r"subprocess\.(?:run|Popen|call)\s*\([^\n]{0,300}shell\s*=\s*True", re.I), "high"),
        ("os_system", re.compile(r"\bos\.system\s*\("), "high"),
        ("dynamic_eval", re.compile(r"\b(?:eval|exec)\s*\("), "medium"),
    )

    def __init__(self, policy: dict[str, Any]):
        scan = policy.get("security_scan", {})
        self.max_file_bytes = int(scan.get("max_file_bytes", 512_000))
        self.block_severities = set(scan.get("block_severities", ["critical", "high"]))
        self.max_files = int(scan.get("max_files", 500))

    def scan(self, project: Path) -> dict[str, Any]:
        findings: list[dict[str, Any]] = []
        files_scanned = 0
        ignored_dirs = {".git", "node_modules", ".venv", "venv", "dist", "build", "__pycache__"}

        for path in project.rglob("*"):
            if files_scanned >= self.max_files:
                findings.append({"rule": "scan_limit", "severity": "medium", "path": ".", "line": 0, "message": "File scan limit reached"})
                break
            if path.is_dir() or any(part in ignored_dirs for part in path.parts):
                continue
            if path.name.startswith(".env") and path.name not in {".env.example", ".env.sample", ".env.template"}:
                findings.append({"rule": "env_file", "severity": "high", "path": str(path.relative_to(project)), "line": 1, "message": "Environment/secret file present inside generated project"})
            if path.suffix.lower() not in self.TEXT_SUFFIXES and not path.name.startswith(".env"):
                continue
            try:
                if path.stat().st_size > self.max_file_bytes:
                    continue
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            files_scanned += 1
            for rule, pattern, severity in self.RULES:
                for match in pattern.finditer(text):
                    line = text.count("\n", 0, match.start()) + 1
                    findings.append({
                        "rule": rule,
                        "severity": severity,
                        "path": str(path.relative_to(project)).replace("\\", "/"),
                        "line": line,
                        "message": f"Local security rule matched: {rule}",
                    })

        blocking = [item for item in findings if item["severity"] in self.block_severities]
        return {"passed": not blocking, "files_scanned": files_scanned, "findings": findings, "blocking_findings": blocking}


class IsolatedRunner:
    def __init__(self, workspace_root: Path, policy: dict[str, Any], engine: str | None = None):
        self.workspace_root = workspace_root.resolve()
        self.policy = policy
        spec = policy.get("isolated_runner", {})
        self.engine = (engine or os.getenv("CONTAINER_ENGINE") or spec.get("engine") or "podman").strip()
        self.tasks = spec.get("tasks", {})
        self.max_seconds = int(spec.get("max_seconds", 180))
        self.allowed_prefixes = [str(x).strip("/\\") for x in spec.get("allowed_project_prefixes", ["apps"])]
        self.memory = str(spec.get("memory", "768m"))
        self.cpus = str(spec.get("cpus", "1.0"))
        self.pids_limit = str(spec.get("pids_limit", 128))
        self.user = str(spec.get("user", "1000:1000"))

    def resolve_project(self, relative: str) -> Path:
        if not relative or relative.startswith(("/", "\\")):
            raise GovernanceViolation("Project path must be repository-relative.")
        normalized = relative.replace("\\", "/").strip("/")
        if not any(normalized == prefix or normalized.startswith(prefix + "/") for prefix in self.allowed_prefixes):
            raise GovernanceViolation("Project path is outside isolated-runner allowed prefixes.")
        path = (self.workspace_root / normalized).resolve()
        try:
            path.relative_to(self.workspace_root)
        except ValueError as exc:
            raise GovernanceViolation("Project path escapes governed workspace.") from exc
        if not path.exists() or not path.is_dir():
            raise GovernanceViolation(f"Project directory does not exist: {normalized}")
        return path

    def _task(self, task_name: str) -> tuple[str, list[str]]:
        spec = self.tasks.get(task_name)
        if not isinstance(spec, dict):
            raise GovernanceViolation(f"Isolated task is not governance-allowlisted: {task_name}")
        image = spec.get("image")
        command = spec.get("command")
        if not isinstance(image, str) or not image or not isinstance(command, list) or not command or not all(isinstance(x, str) for x in command):
            raise GovernanceViolation(f"Invalid isolated task policy: {task_name}")
        return image, command

    def build_command(self, task_name: str, project_relative: str) -> list[str]:
        project = self.resolve_project(project_relative)
        image, command = self._task(task_name)
        return [
            self.engine, "run", "--rm", "--pull=never", "--network=none", "--read-only",
            "--cap-drop=ALL", "--security-opt=no-new-privileges", "--pids-limit", self.pids_limit,
            "--memory", self.memory, "--cpus", self.cpus, "--user", self.user,
            "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
            "--mount", f"type=bind,src={project},dst=/workspace,rw",
            "--workdir", "/workspace", image, *command,
        ]

    def preflight(self) -> dict[str, Any]:
        engine_path = shutil.which(self.engine)
        images: dict[str, bool] = {}
        if engine_path:
            for task_name, task in self.tasks.items():
                image = task.get("image") if isinstance(task, dict) else None
                if not image or image in images:
                    continue
                proc = subprocess.run([self.engine, "image", "inspect", image], capture_output=True, text=True, shell=False, timeout=20, check=False)
                images[image] = proc.returncode == 0
        return {
            "engine": self.engine,
            "engine_found": bool(engine_path),
            "images": images,
            "network_mode": "none",
            "pull_policy": "never",
            "no_new_privileges": True,
        }

    def run(self, task_name: str, project_relative: str) -> IsolatedTaskResult:
        image, _ = self._task(task_name)
        command = self.build_command(task_name, project_relative)
        if not shutil.which(self.engine):
            raise GovernanceViolation(f"Container engine not found: {self.engine}")
        try:
            proc = subprocess.run(
                command,
                cwd=self.workspace_root,
                capture_output=True,
                text=True,
                timeout=self.max_seconds,
                shell=False,
                check=False,
                env={"PATH": os.environ.get("PATH", "")},
            )
        except subprocess.TimeoutExpired as exc:
            raise GovernanceViolation(f"Isolated task exceeded {self.max_seconds}s timeout.") from exc
        return IsolatedTaskResult(
            task=task_name,
            engine=self.engine,
            image=image,
            command=command,
            returncode=proc.returncode,
            stdout=proc.stdout[-30000:],
            stderr=proc.stderr[-30000:],
        )
