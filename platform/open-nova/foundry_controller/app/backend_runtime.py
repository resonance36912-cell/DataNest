from __future__ import annotations

import json
import os
import re
import secrets
import shutil
import socket
import subprocess
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import yaml

from .agent import GovernanceViolation
from .registry import APP_ID_RE, AppRegistry

SQL_DESTRUCTIVE = re.compile(r"\b(DROP\s+(TABLE|SCHEMA|DATABASE)|TRUNCATE\s+TABLE|ALTER\s+TABLE\s+\S+\s+DROP\s+COLUMN)\b", re.I)
SQL_TRANSACTION_BANNED = re.compile(r"\b(COMMIT|ROLLBACK|BEGIN|START\s+TRANSACTION)\b", re.I)
SQL_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
SQL_LINE_COMMENT = re.compile(r"--[^\r\n]*")
SQL_SINGLE_QUOTED = re.compile(r"'(?:''|[^'])*'", re.S)
SQL_DOLLAR_START = re.compile(r"\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$")
MIGRATION_NAME = re.compile(r"^[0-9]{3,6}_[a-z0-9][a-z0-9_-]*\.sql$")

def sql_top_level_text(raw: str) -> str:
    parts=[]; pos=0
    for match in SQL_DOLLAR_START.finditer(raw):
        if match.start() < pos: continue
        delim=match.group(0); end=raw.find(delim,match.end())
        if end < 0: return raw
        parts.append(raw[pos:match.start()]); parts.append(" "); pos=end+len(delim)
    parts.append(raw[pos:]); text="".join(parts)
    text=SQL_BLOCK_COMMENT.sub(" ",text); text=SQL_LINE_COMMENT.sub(" ",text); text=SQL_SINGLE_QUOTED.sub(" ",text)
    return text
LOOPBACK = {"127.0.0.1", "localhost", "::1"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class MigrationFile:
    path: str
    destructive: bool
    bytes: int


class SovereignBackendRuntime:
    """Governed runtime for local database/auth/storage/gateway/AI services.

    It never downloads dependencies, never returns secret values, and never executes
    destructive schema migrations automatically. Runtime launch is delegated to the
    local operator/container engine; this controller generates and verifies evidence.
    """

    def __init__(self, workspace_root: Path, policy: dict[str, Any], registry: AppRegistry | None = None):
        self.workspace = workspace_root.resolve()
        cfg = policy.get("backend_runtime", {})
        self.manifest = (self.workspace / str(cfg.get("manifest", "governance/backend-runtime.yaml"))).resolve()
        self.apps_root = (self.workspace / str(cfg.get("apps_root", "apps"))).resolve()
        self.runtime_root = (self.workspace / str(cfg.get("runtime_root", "runtime/backend-runtime"))).resolve()
        self.secrets_root = (self.workspace / str(cfg.get("secrets_root", "runtime/secrets"))).resolve()
        self.require_confirmation = bool(cfg.get("require_confirmation", True))
        self.registry = registry

    def _config(self) -> dict[str, Any]:
        if not self.manifest.exists():
            raise GovernanceViolation("Backend-runtime manifest missing.")
        data = yaml.safe_load(self.manifest.read_text(encoding="utf-8")) or {}
        if not isinstance(data, dict):
            raise GovernanceViolation("Backend-runtime manifest must be a mapping.")
        return data

    def validate(self) -> dict[str, Any]:
        cfg = self._config()
        errors: list[str] = []
        services = cfg.get("services") or {}
        required = {"postgres", "auth", "storage", "gateway"}
        if not isinstance(services, dict):
            errors.append("services must be a mapping")
            services = {}
        missing = sorted(required - set(services))
        if missing:
            errors.append("missing required services: " + ", ".join(missing))
        for sid, raw in services.items():
            if not APP_ID_RE.fullmatch(str(sid)) or not isinstance(raw, dict):
                errors.append(f"invalid service definition: {sid}")
                continue
            host = str(raw.get("host", "127.0.0.1"))
            if host not in LOOPBACK:
                errors.append(f"{sid}: host must be loopback")
            image = raw.get("image")
            if image and (not isinstance(image, str) or ":" not in image or image.endswith(":latest")):
                errors.append(f"{sid}: image must have an explicit non-latest tag")
            port = raw.get("port")
            if not isinstance(port, int) or not 1 <= port <= 65535:
                errors.append(f"{sid}: invalid port")
        if cfg.get("network", {}).get("external") is not False:
            errors.append("backend runtime external network must be disabled")
        if cfg.get("pull_policy") != "never":
            errors.append("backend runtime pull_policy must be never")
        return {"valid": not errors, "errors": errors, "services": services, "external_ai_required": False}

    def initialize_secrets(self, *, confirmed: bool = False) -> dict[str, Any]:
        if self.require_confirmation and not confirmed:
            raise GovernanceViolation("Local backend secret initialization requires confirmed=true.")
        self.secrets_root.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(self.secrets_root, 0o700)
        except OSError:
            pass
        names = ["postgres-password", "auth-signing-key", "auth-exchange-key", "gateway-procedure-key", "storage-access-key", "storage-secret-key"]
        created: list[str] = []
        existing: list[str] = []
        for name in names:
            path = (self.secrets_root / name).resolve()
            path.relative_to(self.secrets_root)
            if path.exists():
                existing.append(f"runtime/secrets/{name}")
                continue
            path.write_text(secrets.token_urlsafe(48), encoding="utf-8")
            try:
                os.chmod(path, 0o600)
            except OSError:
                pass
            created.append(f"runtime/secrets/{name}")
        return {"initialized": True, "created_secret_refs": created, "existing_secret_refs": existing, "secret_values_returned": False}

    def render_compose(self) -> str:
        valid = self.validate()
        if not valid["valid"]:
            raise GovernanceViolation("Invalid backend runtime manifest: " + "; ".join(valid["errors"]))
        services = valid["services"]
        lines = ["name: resonance-sovereign-backend", "services:"]
        for sid in ("postgres", "auth", "storage", "gateway"):
            raw = services[sid]
            lines += [f"  {sid}:", f"    image: {raw['image']}", "    pull_policy: never", "    restart: unless-stopped", "    security_opt:", "      - no-new-privileges:true"]
            if sid != "postgres":
                lines += ["    read_only: true", "    tmpfs:", "      - /tmp:rw,noexec,nosuid,size=64m"]
            lines += [f"    ports:", f"      - \"127.0.0.1:{raw['port']}:{raw['container_port']}\"", "    networks:", "      - sovereign-internal"]
            if sid == "postgres":
                lines += ["    environment:", "      POSTGRES_DB: resonance", "      POSTGRES_USER: resonance", "      POSTGRES_PASSWORD_FILE: /run/secrets/postgres-password", "    volumes:", "      - resonance-postgres-data:/var/lib/postgresql/data", "    secrets:", "      - postgres-password"]
            elif sid == "auth":
                lines += ["    environment:", "      DATABASE_URL: postgresql://resonance@postgres:5432/resonance", "      AUTH_SIGNING_KEY_FILE: /run/secrets/auth-signing-key", "      AUTH_EXCHANGE_KEY_FILE: /run/secrets/auth-exchange-key", "      AUTH_DB: /data/auth.db", "    volumes:", "      - resonance-auth-data:/data", "    secrets:", "      - auth-signing-key", "      - auth-exchange-key", "    depends_on:", "      - postgres"]
            elif sid == "storage":
                lines += ["    environment:", "      STORAGE_ROOT: /data", "      STORAGE_ACCESS_KEY_FILE: /run/secrets/storage-access-key", "      STORAGE_SECRET_KEY_FILE: /run/secrets/storage-secret-key", "    volumes:", "      - resonance-object-data:/data", "    secrets:", "      - storage-access-key", "      - storage-secret-key"]
            elif sid == "gateway":
                lines += ["    environment:", "      DATABASE_URL: postgresql://resonance@postgres:5432/resonance", "      POSTGRES_PASSWORD_FILE: /run/secrets/postgres-password", "      AUTH_URL: http://auth:8080", "      STORAGE_URL: http://storage:9000", "      OLLAMA_URL: http://host.containers.internal:11434", "      GATEWAY_PROCEDURE_KEY_FILE: /run/secrets/gateway-procedure-key", "    secrets:", "      - postgres-password", "      - gateway-procedure-key", "    depends_on:", "      - postgres", "      - auth", "      - storage"]
        lines += ["networks:", "  sovereign-internal:", "    internal: true", "volumes:", "  resonance-postgres-data:", "  resonance-auth-data:", "  resonance-object-data:", "secrets:"]
        for name in ("postgres-password", "auth-signing-key", "auth-exchange-key", "gateway-procedure-key", "storage-access-key", "storage-secret-key"):
            lines += [f"  {name}:", f"    file: ../../runtime/secrets/{name}"]
        return "\n".join(lines) + "\n"

    def write_runtime(self, *, confirmed: bool = False) -> dict[str, Any]:
        if self.require_confirmation and not confirmed:
            raise GovernanceViolation("Writing sovereign backend runtime requires confirmed=true.")
        text = self.render_compose()
        self.runtime_root.mkdir(parents=True, exist_ok=True)
        path = self.runtime_root / "compose.backend.yml"
        path.write_text(text, encoding="utf-8")
        return {"written": True, "path": str(path.relative_to(self.workspace)).replace("\\", "/"), "network_external": False, "pull_policy": "never"}

    def _app(self, app_id: str) -> Path:
        if not APP_ID_RE.fullmatch(app_id):
            raise GovernanceViolation("Invalid application id.")
        app = (self.apps_root / app_id).resolve()
        app.relative_to(self.apps_root)
        if not app.is_dir():
            raise GovernanceViolation("Managed application not found.")
        return app

    def migration_plan(self, app_id: str) -> dict[str, Any]:
        app = self._app(app_id)
        candidates = [p for p in app.rglob("*.sql") if ".open-nova" not in p.parts and "node_modules" not in p.parts]
        files: list[MigrationFile] = []
        blockers: list[str] = []
        for p in sorted(candidates):
            rel = p.relative_to(app).as_posix()
            if not MIGRATION_NAME.fullmatch(p.name):
                blockers.append(f"migration_filename_not_ordered:{rel}")
            raw = p.read_text(encoding="utf-8", errors="replace")
            destructive = bool(SQL_DESTRUCTIVE.search(raw))
            if SQL_TRANSACTION_BANNED.search(sql_top_level_text(raw)):
                blockers.append(f"transaction_control_not_allowed:{rel}")
            if destructive:
                blockers.append(f"destructive_sql_requires_approval:{rel}")
            files.append(MigrationFile(rel, destructive, p.stat().st_size))
        return {
            "schema": "resonance-backend-migration-plan/v1",
            "app_id": app_id,
            "created_at": utc_now(),
            "migrations": [f.__dict__ for f in files],
            "blockers": sorted(set(blockers)),
            "ready_for_non_destructive_execution": bool(files) and not blockers,
            "external_ai_required": False,
        }

    def execute_migrations(self, app_id: str, *, confirmed: bool = False, runner: Callable[..., Any] = subprocess.run) -> dict[str, Any]:
        if self.require_confirmation and not confirmed:
            raise GovernanceViolation("Database migration execution requires confirmed=true.")
        app = self._app(app_id)
        plan = self.migration_plan(app_id)
        if plan["blockers"]:
            raise GovernanceViolation("Migration execution blocked: " + "; ".join(plan["blockers"]))
        if not plan["migrations"]:
            raise GovernanceViolation("No ordered SQL migrations found.")
        password_path = self.secrets_root / "postgres-password"
        if not password_path.exists():
            raise GovernanceViolation("Postgres secret is not initialized.")
        env = os.environ.copy()
        env["PGPASSWORD"] = password_path.read_text(encoding="utf-8").strip()
        host_psql = shutil.which("psql")
        container_engine = None
        postgres_container = None
        if not host_psql:
            container_engine = shutil.which("podman") or shutil.which("docker")
            if not container_engine:
                raise GovernanceViolation("No host psql or local container engine is available for migration execution.")
            discover = runner(
                [container_engine, "ps", "--filter", "label=com.docker.compose.service=postgres", "--format", "{{.Names}}"],
                capture_output=True, text=True, timeout=20, shell=False,
            )
            if getattr(discover, "returncode", 1) != 0:
                raise GovernanceViolation("Unable to discover the local Postgres container.")
            names = [line.strip() for line in getattr(discover, "stdout", "").splitlines() if line.strip()]
            if len(names) != 1:
                raise GovernanceViolation(f"Expected one local Postgres container, found {len(names)}.")
            postgres_container = names[0]
        executed: list[str] = []
        for item in plan["migrations"]:
            migration = (app / item["path"]).resolve()
            migration.relative_to(app)
            if host_psql:
                command = [host_psql, "--host", "127.0.0.1", "--port", "55432", "--username", "resonance", "--dbname", "resonance", "--set", "ON_ERROR_STOP=1", "--single-transaction", "--file", str(migration)]
                result = runner(command, env=env, capture_output=True, text=True, timeout=120, shell=False)
            else:
                command = [container_engine, "exec", "-i", postgres_container, "psql", "--username", "resonance", "--dbname", "resonance", "--set", "ON_ERROR_STOP=1", "--single-transaction"]
                result = runner(command, input=migration.read_text(encoding="utf-8"), capture_output=True, text=True, timeout=120, shell=False)
            if getattr(result, "returncode", 1) != 0:
                raise GovernanceViolation(f"Migration failed at {item['path']}: {getattr(result, 'stderr', '')[-500:]}")
            executed.append(item["path"])
        event = self.registry.append(app_id, "backend_schema_migrated", {"status": "backend_schema_migrated", "migration_count": len(executed)}) if self.registry else None
        return {"app_id": app_id, "executed": executed, "single_transaction_per_file": True, "shell_used": False, "registry_event": event}

    def health(self) -> dict[str, Any]:
        valid = self.validate()
        results: list[dict[str, Any]] = []
        if not valid["valid"]:
            return {"ready": False, "services": [], "errors": valid["errors"]}
        items = list(valid["services"].items())
        def probe(item):
            sid, raw = item
            reachable = False
            try:
                with socket.create_connection((raw["host"], raw["port"]), timeout=0.25): reachable = True
            except OSError: pass
            return {"service_id": sid, "host": raw["host"], "port": raw["port"], "required": bool(raw.get("required", True)), "reachable": reachable}
        with ThreadPoolExecutor(max_workers=max(1, min(8, len(items)))) as pool:
            results = list(pool.map(probe, items))
        required = [r for r in results if r["required"]]
        return {"ready": bool(required) and all(r["reachable"] for r in required), "services": results, "network_scope": "loopback_only"}

    def certify(self, app_id: str) -> dict[str, Any]:
        app = self._app(app_id)
        blockers: list[str] = []
        health = self.health()
        if not health["ready"]:
            blockers.append("required_local_services_not_healthy")
        for rel in (".open-nova/service-bindings.json", "open-nova-adapters/supabase-compat.ts"):
            if not (app / rel).exists():
                blockers.append(f"missing:{rel}")
        plan = self.migration_plan(app_id)
        blockers.extend(plan["blockers"])
        certification = {
            "schema": "resonance-sovereignty-certification/v1",
            "app_id": app_id,
            "created_at": utc_now(),
            "backend_ready": not blockers,
            "blockers": sorted(set(blockers)),
            "health": health,
            "external_ai_required": False,
        }
        evidence = app / ".open-nova" / "backend-certification.json"
        evidence.parent.mkdir(parents=True, exist_ok=True)
        evidence.write_text(json.dumps(certification, indent=2) + "\n", encoding="utf-8")
        if self.registry:
            self.registry.append(app_id, "backend_certification_checked", {"status": "backend_ready" if not blockers else "backend_blocked", "blockers": certification["blockers"]})
        return certification
