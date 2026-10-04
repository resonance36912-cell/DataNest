from __future__ import annotations

import json
import re
import socket
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import yaml

from .agent import GovernanceViolation
from .migration import EXTERNAL_SIGNALS
from .registry import APP_ID_RE, AppRegistry

LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}
ALLOWED_KINDS = {"database", "auth", "storage", "gateway", "ai", "secrets", "controller"}
SECRET_WORDS = ("password", "secret", "token", "private_key", "api_key", "credential")
SERVICE_MAP = {
    "lovable": ["foundry-controller"],
    "supabase-hosted": ["postgres", "auth", "storage", "gateway"],
    "firebase": ["postgres", "auth", "storage", "gateway"],
    "vercel": ["gateway"],
    "netlify": ["gateway"],
    "openai-api": ["ollama"],
    "anthropic-api": ["ollama"],
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _contains_secret_material(value: Any, path: str = "") -> list[str]:
    findings: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            key_path = f"{path}.{key}" if path else str(key)
            if any(word in str(key).lower() for word in SECRET_WORDS):
                # Secret references and explicit negative metadata are safe; inline material is not.
                key_lower = str(key).lower()
                safe_reference = key_lower.endswith(("_ref", "_refs"))
                safe_negative_flag = isinstance(child, bool) and child is False
                if not safe_reference and not safe_negative_flag and child not in (None, "", "REQUIRED"):
                    findings.append(key_path)
            findings.extend(_contains_secret_material(child, key_path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            findings.extend(_contains_secret_material(child, f"{path}[{index}]"))
    return findings


@dataclass(frozen=True)
class ServiceDefinition:
    service_id: str
    kind: str
    endpoint: str
    image: str | None
    required: bool
    secret_refs: list[str]
    description: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "service_id": self.service_id,
            "kind": self.kind,
            "endpoint": self.endpoint,
            "image": self.image,
            "required": self.required,
            "secret_refs": self.secret_refs,
            "description": self.description,
        }


class SovereignServiceFabric:
    """Controller-owned local service catalogue and application binding manager.

    This layer exposes metadata and loopback health checks only. It never returns
    secret values and never enables public binding on behalf of generated apps.
    """

    def __init__(self, workspace_root: Path, policy: dict[str, Any], registry: AppRegistry | None = None):
        self.workspace = workspace_root.resolve()
        cfg = policy.get("service_fabric", {})
        manifest_rel = str(cfg.get("manifest", "governance/service-fabric.yaml")).strip("/\\")
        self.manifest_path = (self.workspace / manifest_rel).resolve()
        self.runtime_root = (self.workspace / str(cfg.get("runtime_root", "runtime/service-fabric")).strip("/\\")).resolve()
        self.apps_root = (self.workspace / str(cfg.get("apps_root", "apps")).strip("/\\")).resolve()
        self.bindings_dirname = str(cfg.get("bindings_dirname", ".open-nova"))
        self.require_loopback = bool(cfg.get("require_loopback_bind", True))
        self.health_timeout = float(cfg.get("health_timeout_seconds", 0.35))
        self.registry = registry

    def _manifest(self) -> dict[str, Any]:
        if not self.manifest_path.exists():
            raise GovernanceViolation("Service-fabric manifest missing; service binding denied.")
        try:
            data = yaml.safe_load(self.manifest_path.read_text(encoding="utf-8")) or {}
        except Exception as exc:
            raise GovernanceViolation(f"Service-fabric manifest is unreadable: {exc}") from exc
        if not isinstance(data, dict):
            raise GovernanceViolation("Service-fabric manifest must be a mapping.")
        return data

    @staticmethod
    def _validate_endpoint(endpoint: str, *, require_loopback: bool) -> tuple[str | None, int | None]:
        if endpoint.startswith("file://"):
            return None, None
        parsed = urlparse(endpoint)
        if parsed.scheme not in {"http", "https", "postgresql", "tcp"}:
            raise GovernanceViolation(f"Unsupported local service endpoint scheme: {parsed.scheme or 'missing'}.")
        host = parsed.hostname
        port = parsed.port
        if not host:
            raise GovernanceViolation("Service endpoint must include a host.")
        if require_loopback and host not in LOOPBACK_HOSTS:
            raise GovernanceViolation(f"Service endpoint must bind to loopback, not {host}.")
        if port is None:
            default = {"http": 80, "https": 443, "postgresql": 5432}.get(parsed.scheme)
            port = default
        return host, port

    def validate(self) -> dict[str, Any]:
        manifest = self._manifest()
        services = manifest.get("services", [])
        if not isinstance(services, list) or not services:
            raise GovernanceViolation("Service-fabric manifest must declare at least one service.")
        ids: set[str] = set()
        normalized: list[ServiceDefinition] = []
        errors: list[str] = []
        for raw in services:
            if not isinstance(raw, dict):
                errors.append("service entry is not an object")
                continue
            service_id = str(raw.get("service_id", ""))
            kind = str(raw.get("kind", ""))
            endpoint = str(raw.get("endpoint", ""))
            if not APP_ID_RE.fullmatch(service_id):
                errors.append(f"invalid service id: {service_id!r}")
                continue
            if service_id in ids:
                errors.append(f"duplicate service id: {service_id}")
                continue
            ids.add(service_id)
            if kind not in ALLOWED_KINDS:
                errors.append(f"{service_id}: unsupported kind {kind!r}")
                continue
            try:
                self._validate_endpoint(endpoint, require_loopback=self.require_loopback)
            except GovernanceViolation as exc:
                errors.append(f"{service_id}: {exc}")
                continue
            secret_refs = raw.get("secret_refs", []) or []
            if not isinstance(secret_refs, list) or any(not isinstance(x, str) or not x.startswith("runtime/secrets/") for x in secret_refs):
                errors.append(f"{service_id}: secret_refs must point under runtime/secrets/")
                continue
            image = raw.get("image")
            if image is not None and (not isinstance(image, str) or ":" not in image):
                errors.append(f"{service_id}: local image must be explicitly tagged")
                continue
            normalized.append(ServiceDefinition(
                service_id=service_id,
                kind=kind,
                endpoint=endpoint,
                image=image,
                required=bool(raw.get("required", False)),
                secret_refs=list(secret_refs),
                description=str(raw.get("description", "")),
            ))
        leaked = _contains_secret_material({"services": services})
        if leaked:
            errors.append("manifest contains inline secret material at: " + ", ".join(sorted(leaked)))
        return {
            "valid": not errors,
            "version": str(manifest.get("version", "unknown")),
            "mode": manifest.get("mode", "local"),
            "services": [x.as_dict() for x in normalized],
            "errors": errors,
            "external_ai_required": False,
        }

    def services(self) -> list[ServiceDefinition]:
        validation = self.validate()
        if not validation["valid"]:
            raise GovernanceViolation("Invalid service-fabric manifest: " + "; ".join(validation["errors"]))
        return [ServiceDefinition(**item) for item in validation["services"]]

    def health(self) -> dict[str, Any]:
        results: list[dict[str, Any]] = []
        for service in self.services():
            host, port = self._validate_endpoint(service.endpoint, require_loopback=self.require_loopback)
            if host is None or port is None:
                results.append({
                    "service_id": service.service_id,
                    "kind": service.kind,
                    "reachable": True,
                    "check": "local_path_contract",
                    "required": service.required,
                })
                continue
            reachable = False
            try:
                with socket.create_connection((host, port), timeout=self.health_timeout):
                    reachable = True
            except OSError:
                reachable = False
            results.append({
                "service_id": service.service_id,
                "kind": service.kind,
                "reachable": reachable,
                "host": host,
                "port": port,
                "required": service.required,
            })
        required = [x for x in results if x["required"]]
        return {
            "ready": bool(required) and all(x["reachable"] for x in required),
            "services": results,
            "network_scope": "loopback_only" if self.require_loopback else "policy_defined",
        }

    def _resolve_app(self, app_id: str) -> Path:
        if not APP_ID_RE.fullmatch(app_id):
            raise GovernanceViolation("Invalid application id.")
        app = (self.apps_root / app_id).resolve()
        try:
            app.relative_to(self.apps_root)
        except ValueError as exc:
            raise GovernanceViolation("Application path escaped apps directory.") from exc
        if not app.exists() or not app.is_dir():
            raise GovernanceViolation("Managed application source is not present locally.")
        return app

    def _detected_external_services(self, app: Path) -> list[str]:
        found: set[str] = set()
        for path in sorted(app.rglob("*")):
            if path.is_symlink() or not path.is_file() or path.stat().st_size > 512_000:
                continue
            if any(part in {".git", "node_modules", ".venv", "dist", "build"} for part in path.relative_to(app).parts):
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="replace").lower()
            except OSError:
                continue
            for name, markers in EXTERNAL_SIGNALS.items():
                if any(marker.lower() in text for marker in markers):
                    found.add(name)
        return sorted(found)

    def migration_plan(self, app_id: str) -> dict[str, Any]:
        app = self._resolve_app(app_id)
        detected = self._detected_external_services(app)
        required_ids: list[str] = []
        for external in detected:
            for service_id in SERVICE_MAP.get(external, []):
                if service_id not in required_ids:
                    required_ids.append(service_id)
        service_by_id = {service.service_id: service for service in self.services()}
        bindings: list[dict[str, Any]] = []
        missing_services: list[str] = []
        for service_id in required_ids:
            service = service_by_id.get(service_id)
            if not service:
                missing_services.append(service_id)
                continue
            bindings.append({
                "service_id": service.service_id,
                "kind": service.kind,
                "endpoint": service.endpoint,
                "secret_refs": service.secret_refs,
            })
        return {
            "schema": "resonance-service-migration-plan/v1",
            "created_at": utc_now(),
            "app_id": app_id,
            "detected_external_services": detected,
            "required_local_services": required_ids,
            "bindings": bindings,
            "missing_service_definitions": missing_services,
            "ready_to_bind": not missing_services,
            "destructive_actions": False,
            "source_rewrite_performed": False,
            "external_ai_required": False,
        }

    def write_bindings(self, app_id: str, *, confirmed: bool = False) -> dict[str, Any]:
        if not confirmed:
            raise GovernanceViolation("Writing service bindings requires confirmed=true.")
        app = self._resolve_app(app_id)
        plan = self.migration_plan(app_id)
        if not plan["ready_to_bind"]:
            raise GovernanceViolation("Service binding blocked because required local service definitions are missing.")
        binding_dir = (app / self.bindings_dirname).resolve()
        try:
            binding_dir.relative_to(app)
        except ValueError as exc:
            raise GovernanceViolation("Binding path escaped managed application.") from exc
        binding_dir.mkdir(parents=True, exist_ok=True)
        binding_path = binding_dir / "service-bindings.json"
        env_path = app / ".env.sovereign.example"

        payload = {
            "schema": "resonance-service-bindings/v1",
            "created_at": utc_now(),
            "app_id": app_id,
            "network_scope": "loopback_only",
            "bindings": plan["bindings"],
            "contains_secret_values": False,
            "external_ai_required": False,
        }
        leaks = _contains_secret_material(payload)
        if leaks:
            raise GovernanceViolation("Refusing to write service binding containing inline secret material.")
        binding_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

        env_lines = [
            "# Resonance Open Nova — sovereign local service bindings",
            "# Copy values deliberately into a local .env. Never commit secret values.",
        ]
        for binding in plan["bindings"]:
            key = "RESONANCE_" + re.sub(r"[^A-Z0-9]+", "_", binding["service_id"].upper()).strip("_") + "_URL"
            env_lines.append(f"{key}={binding['endpoint']}")
            for ref in binding.get("secret_refs", []):
                ref_key = "RESONANCE_" + re.sub(r"[^A-Z0-9]+", "_", binding["service_id"].upper()).strip("_") + "_SECRET_REF"
                env_lines.append(f"{ref_key}={ref}")
        env_path.write_text("\n".join(env_lines) + "\n", encoding="utf-8")

        event = None
        if self.registry is not None:
            event = self.registry.append(app_id, "service_bindings_generated", {
                "status": "service_bindings_generated",
                "binding_count": len(plan["bindings"]),
                "detected_external_services": plan["detected_external_services"],
                "external_ai_required": False,
            })
        return {
            "app_id": app_id,
            "bindings_path": str(binding_path.relative_to(self.workspace)).replace("\\", "/"),
            "env_example_path": str(env_path.relative_to(self.workspace)).replace("\\", "/"),
            "binding_count": len(plan["bindings"]),
            "registry_event": event,
            "contains_secret_values": False,
        }

    def render_compose(self) -> dict[str, Any]:
        services: dict[str, Any] = {}
        for service in self.services():
            if not service.image:
                continue
            host, port = self._validate_endpoint(service.endpoint, require_loopback=self.require_loopback)
            if host is None or port is None:
                continue
            entry: dict[str, Any] = {
                "image": service.image,
                "pull_policy": "never",
                "restart": "unless-stopped",
                "read_only": True,
                "security_opt": ["no-new-privileges:true"],
                "ports": [f"127.0.0.1:{port}:{port}"],
                "networks": ["resonance-local"],
            }
            if service.secret_refs:
                entry["environment"] = {"RESONANCE_SECRET_MODE": "file-ref-only"}
            services[service.service_id] = entry
        compose = {
            "name": "resonance-sovereign-service-fabric",
            "services": services,
            "networks": {"resonance-local": {"driver": "bridge", "internal": True}},
        }
        text = yaml.safe_dump(compose, sort_keys=False)
        if "0.0.0.0:" in text or "pull_policy: always" in text:
            raise GovernanceViolation("Generated service fabric violated offline/loopback policy.")
        return {"compose": compose, "yaml": text, "external_ai_required": False}

    def write_compose(self, *, confirmed: bool = False) -> dict[str, Any]:
        if not confirmed:
            raise GovernanceViolation("Writing service-fabric runtime configuration requires confirmed=true.")
        rendered = self.render_compose()
        self.runtime_root.mkdir(parents=True, exist_ok=True)
        path = (self.runtime_root / "docker-compose.local.yml").resolve()
        try:
            path.relative_to(self.runtime_root)
        except ValueError as exc:
            raise GovernanceViolation("Service-fabric compose path escaped runtime directory.") from exc
        path.write_text(rendered["yaml"], encoding="utf-8")
        return {
            "path": str(path.relative_to(self.workspace)).replace("\\", "/"),
            "services": sorted(rendered["compose"]["services"]),
            "network_internal": True,
            "pull_policy": "never",
            "loopback_only": True,
        }
