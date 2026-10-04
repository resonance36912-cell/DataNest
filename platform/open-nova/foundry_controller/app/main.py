from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import yaml
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from .agent import GovernanceViolation, SovereignWorkspace, deterministic_scaffold
from .build_cycle import apply_transactional_repairs, collect_project_context, parse_repair_proposal, rollback_transaction
from .runner import DependencyGuard, IsolatedRunner, StaticSecurityScanner
from .app_factory import make_spec, deterministic_project, parse_project_proposal, write_project, static_validate_project, preview_descriptor
from .registry import AppRegistry
from .builder_ui import builder_html
from .migration import SovereignMigrator
from .supply_chain import LocalArtifactStore, LocalAttestor, dependency_inventory, write_supply_chain_evidence, verify_supply_chain_evidence
from .suite_control import SuiteControlCentre
from .backup_export import SovereignExporter
from .service_fabric import SovereignServiceFabric
from .adapter_engine import SovereignAdapterEngine
from .backend_runtime import SovereignBackendRuntime
from .control_plane import SovereignControlPlane
from .sovereignty import SovereigntyEvaluator
from .release_candidate import ReleaseCertifier
from .local_deployment import LocalDeploymentManager
from .cutover import SovereignCutoverManager
from .source_execution import RealSourceIngestor, MigrationExecutionManager
from .workstation_bridge import SovereignWorkstationBridge
from .real_execution import FirstRealExecutionPack

APP_NAME = "Resonance Sovereign Foundry Controller"
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
MODEL = os.getenv("SOVEREIGN_MODEL", "qwen3-coder:30b")
ALLOW_EXTERNAL_AI = os.getenv("ALLOW_EXTERNAL_AI", "false").lower() == "true"
POLICY_PATH = Path(os.getenv("GOVERNANCE_POLICY", "governance/policy.yaml"))
RECEIPT_PATH = Path(os.getenv("RECEIPT_PATH", "runtime/receipts/execution.jsonl"))
WORKSPACE_ROOT = Path(os.getenv("WORKSPACE_ROOT", ".")).resolve()
REGISTRY_PATH = Path(os.getenv("APP_REGISTRY_PATH", "runtime/registry/apps.jsonl"))

app = FastAPI(title=APP_NAME, version="1.5.0-rc1")


class PlanRequest(BaseModel):
    intent: str = Field(min_length=3, max_length=12000)
    project: str = "ResonanceAppDev"


class WriteFileRequest(BaseModel):
    path: str = Field(min_length=1, max_length=500)
    content: str = Field(max_length=1_100_000)
    overwrite: bool = False
    confirmed: bool = False


class TaskRequest(BaseModel):
    task: str = Field(min_length=1, max_length=80)


class CommitRequest(BaseModel):
    message: str = Field(min_length=3, max_length=240)


class RevertRequest(BaseModel):
    commit_sha: str = Field(min_length=7, max_length=40)
    confirmed: bool = False


class ScaffoldRequest(BaseModel):
    intent: str = Field(min_length=3, max_length=12000)
    app_name: str | None = Field(default=None, max_length=80)
    overwrite: bool = False
    confirmed: bool = False


class ProjectRequest(BaseModel):
    project_dir: str = Field(min_length=5, max_length=300, examples=["apps/inventory-demo"])


class IsolatedTaskRequest(ProjectRequest):
    task: str = Field(min_length=1, max_length=80)


class BuildCycleRequest(ProjectRequest):
    intent: str = Field(min_length=3, max_length=12000)
    tasks: list[str] = Field(default_factory=lambda: ["python_compile"])
    max_repair_attempts: int = Field(default=2, ge=0, le=3)
    commit_on_success: bool = True
    commit_message: str = Field(default="Sovereign build: governed local repair cycle", min_length=3, max_length=240)


class FactorySpecRequest(BaseModel):
    intent: str = Field(min_length=3, max_length=12000)
    app_name: str | None = Field(default=None, max_length=80)
    template: str = Field(default="python-fastapi", max_length=40)


class FactoryGenerateRequest(FactorySpecRequest):
    strategy: str = Field(default="deterministic", pattern="^(deterministic|local_model)$")
    overwrite: bool = False
    confirmed: bool = False


class LifecycleRequest(BaseModel):
    action: str = Field(pattern="^(archive|reactivate)$")
    confirmed: bool = False


class MigrationAssessRequest(BaseModel):
    source_dir: str = Field(min_length=1, max_length=500, examples=["imports/projects/my-lovable-app"])
    app_name: str | None = Field(default=None, max_length=80)


class MigrationImportRequest(MigrationAssessRequest):
    confirmed: bool = False


class ArtifactIngestRequest(BaseModel):
    source_path: str = Field(min_length=1, max_length=500, examples=["imports/artifacts/package.whl"])
    purl: str | None = Field(default=None, max_length=500, examples=["pkg:pypi/fastapi@0.116.1"])


class ConfirmedProjectRequest(ProjectRequest):
    confirmed: bool = False


class ConfirmRequest(BaseModel):
    confirmed: bool = False


class SuitePlanRequest(BaseModel):
    write: bool = False


class ExportRequest(BaseModel):
    confirmed: bool = False


class ExportVerifyRequest(BaseModel):
    archive: str = Field(min_length=1, max_length=500)


class ServiceFabricWriteRequest(BaseModel):
    confirmed: bool = False


class AdapterWriteRequest(BaseModel):
    confirmed: bool = False


class AdapterRollbackRequest(BaseModel):
    migration_id: str = Field(min_length=10, max_length=40)
    confirmed: bool = False


class CutoverConfirmRequest(BaseModel):
    confirmed: bool = False


class CutoverRegressionRequest(BaseModel):
    tasks: list[str] = Field(default_factory=list, max_length=4)
    confirmed: bool = False


class CutoverPreviewRequest(BaseModel):
    url: str = Field(min_length=10, max_length=300)
    confirmed: bool = False


class RealSourceStageRequest(BaseModel):
    source_path: str = Field(min_length=1, max_length=1200)
    confirmed: bool = False


class MigrationExecutionRequest(BaseModel):
    confirmed: bool = False


class MigrationExecutionRollbackRequest(BaseModel):
    migration_id: str = Field(min_length=10, max_length=40)
    confirmed: bool = False


class RepositoryStageRequest(BaseModel):
    source_path: str = Field(min_length=1, max_length=1200)
    confirmed: bool = False


class WorkstationInitRequest(BaseModel):
    confirmed: bool = False


class RealExecutionRepositoryRequest(BaseModel):
    source_path: str = Field(min_length=1, max_length=1200)
    confirmed: bool = False


class RealExecutionConfirmRequest(BaseModel):
    confirmed: bool = False


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_policy() -> dict[str, Any]:
    if not POLICY_PATH.exists():
        raise HTTPException(status_code=503, detail="Governance policy missing; execution denied.")
    with POLICY_PATH.open("r", encoding="utf-8") as f:
        policy = yaml.safe_load(f) or {}
    if not policy.get("execution", {}).get("require_governance_before_model_call", False):
        raise HTTPException(status_code=503, detail="Governance preflight is not enabled; execution denied.")
    return policy


def workspace(policy: dict[str, Any]) -> SovereignWorkspace:
    configured = str(policy.get("execution", {}).get("workspace_root", ".")).strip()
    env_root = os.getenv("WORKSPACE_ROOT")
    if env_root:
        root = Path(env_root).resolve()
    elif configured and configured != ".":
        root = Path(configured).resolve()
    else:
        root = WORKSPACE_ROOT.resolve()
    root.mkdir(parents=True, exist_ok=True)
    return SovereignWorkspace(root, policy)


def _last_receipt_hash() -> str | None:
    if not RECEIPT_PATH.exists():
        return None
    try:
        lines = [line for line in RECEIPT_PATH.read_text(encoding="utf-8").splitlines() if line.strip()]
        if not lines:
            return None
        return json.loads(lines[-1]).get("sha256")
    except Exception:
        return None


def write_receipt(event: dict[str, Any]) -> dict[str, Any]:
    RECEIPT_PATH.parent.mkdir(parents=True, exist_ok=True)
    chained = {**event, "previous_sha256": _last_receipt_hash()}
    payload = json.dumps(chained, sort_keys=True, ensure_ascii=False)
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    record = {**chained, "sha256": digest}
    with RECEIPT_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
    return record


def governed_error(exc: GovernanceViolation) -> HTTPException:
    write_receipt({
        "timestamp": utc_now(),
        "event": "governance_denial",
        "project": "ResonanceAppDev",
        "reason": str(exc),
        "external_ai_used": False,
    })
    return HTTPException(status_code=403, detail=str(exc))


async def ollama_health() -> bool:
    try:
        async with httpx.AsyncClient(timeout=4) as client:
            r = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            return r.status_code == 200
    except Exception:
        return False


async def local_repair_proposal(intent: str, project: Path, failure: dict[str, Any], policy: dict[str, Any]) -> dict[str, Any]:
    if policy.get("providers", {}).get("local", {}).get("allowed") is not True:
        raise GovernanceViolation("Local AI provider denied by governance policy.")
    if ALLOW_EXTERNAL_AI or policy.get("providers", {}).get("external", {}).get("allowed", False):
        raise GovernanceViolation("Zero-Credit repair cycle refuses to run while external AI is enabled.")

    context = collect_project_context(project)
    system_prompt = (
        "You are the local Resonance Sovereign Foundry repair agent. Return JSON only. "
        "You have proposal authority only. Never propose changes outside the supplied project. "
        "Never change governance, receipts, secrets, CI ownership, or external-provider settings. "
        "Do not delete files. Produce the smallest repair needed. Schema: "
        '{"summary":"...","changes":[{"path":"relative/to/project.ext","content":"complete replacement content"}]}.'
    )
    user_prompt = (
        f"INTENT:\n{intent}\n\nFAILURE:\n{json.dumps(failure, ensure_ascii=False)[:24000]}\n"
        f"\nPROJECT FILES:\n{context}"
    )
    body = {
        "model": MODEL,
        "stream": False,
        "format": "json",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=300) as client:
            response = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=body)
            response.raise_for_status()
            data = response.json()
    except Exception as exc:
        raise GovernanceViolation(f"Local repair model unavailable: {exc}") from exc
    return parse_repair_proposal(data.get("message", {}).get("content", ""))


def project_components(policy: dict[str, Any], project_relative: str):
    ws = workspace(policy)
    runner = IsolatedRunner(ws.root, policy)
    project = runner.resolve_project(project_relative)
    guard = DependencyGuard(policy)
    scanner = StaticSecurityScanner(policy)
    return ws, runner, project, guard, scanner


def app_registry() -> AppRegistry:
    path = REGISTRY_PATH
    if not path.is_absolute():
        path = workspace(load_policy()).root / path
    return AppRegistry(path.resolve())


def suite_control() -> SuiteControlCentre:
    policy = load_policy()
    ws = workspace(policy)
    return SuiteControlCentre(ws.root, policy, app_registry())


def exporter() -> SovereignExporter:
    policy = load_policy()
    ws = workspace(policy)
    return SovereignExporter(ws.root, policy)


def service_fabric() -> SovereignServiceFabric:
    policy = load_policy()
    ws = workspace(policy)
    return SovereignServiceFabric(ws.root, policy, app_registry())


def adapter_engine() -> SovereignAdapterEngine:
    policy = load_policy()
    ws = workspace(policy)
    return SovereignAdapterEngine(ws.root, policy, app_registry())


async def local_project_generation(spec, policy: dict[str, Any]) -> dict[str, str]:
    factory_policy = policy.get("app_factory", {})
    if factory_policy.get("local_model_generation_allowed", False) is not True:
        raise GovernanceViolation("Local-model project generation is disabled by governance.")
    if ALLOW_EXTERNAL_AI or policy.get("providers", {}).get("external", {}).get("allowed", False):
        raise GovernanceViolation("Sovereign App Factory refuses generation while external AI is enabled.")
    system_prompt = (
        "You are the Resonance Sovereign App Factory local code generator. Return JSON only using schema "
        "{\"summary\":\"...\",\"files\":[{\"path\":\"relative/path\",\"content\":\"complete file\"}]}. "
        "Generate portable source code only inside the requested application project. Do not generate .git, .env, secrets, "
        "governance changes, CI ownership changes, remote-provider credentials, destructive scripts, or shell wrappers. "
        "Use exact dependency versions and no remote URL dependencies. The controller, not you, owns writes and execution."
    )
    user_prompt = "APPLICATION SPEC:\n" + json.dumps(spec.as_dict(), ensure_ascii=False, indent=2)
    body = {
        "model": MODEL, "stream": False, "format": "json",
        "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
    }
    try:
        async with httpx.AsyncClient(timeout=300) as client:
            response = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=body)
            response.raise_for_status()
            data = response.json()
    except Exception as exc:
        raise GovernanceViolation(f"Local project generator unavailable: {exc}") from exc
    content = data.get("message", {}).get("content", "")
    return parse_project_proposal(
        content,
        max_files=int(factory_policy.get("max_generated_files", 60)),
        max_total_bytes=int(factory_policy.get("max_generated_total_bytes", 2_500_000)),
    )


@app.get("/builder", response_class=HTMLResponse)
def builder() -> str:
    return builder_html()


@app.get("/health")
async def health() -> dict[str, Any]:
    policy = load_policy()
    local_ok = await ollama_health()
    runner = IsolatedRunner(workspace(policy).root, policy)
    preflight = runner.preflight()
    return {
        "service": APP_NAME,
        "version": "1.5.0-rc1",
        "project": "ResonanceAppDev",
        "mode": policy.get("mode"),
        "local_model": MODEL,
        "ollama_reachable": local_ok,
        "external_ai_allowed": ALLOW_EXTERNAL_AI,
        "workspace_root": str(WORKSPACE_ROOT),
        "coding_agent": "governed",
        "isolated_runner": preflight,
    }


@app.get("/v1/zero-credit-test")
async def zero_credit_test() -> dict[str, Any]:
    policy = load_policy()
    local_ok = await ollama_health()
    external_denied = not ALLOW_EXTERNAL_AI and not policy.get("providers", {}).get("external", {}).get("allowed", True)
    governance_ok = policy.get("principles", {}).get("local_first") is True
    runner = IsolatedRunner(workspace(policy).root, policy).preflight()
    images = runner.get("images", {})
    runner_ready = bool(runner.get("engine_found")) and bool(images) and all(images.values())
    passed = local_ok and external_denied and governance_ok and runner_ready
    event = write_receipt({
        "timestamp": utc_now(),
        "event": "zero_credit_test",
        "project": "ResonanceAppDev",
        "model": MODEL,
        "local_runtime_reachable": local_ok,
        "external_ai_denied": external_denied,
        "governance_loaded": governance_ok,
        "runner_engine_found": runner["engine_found"],
        "runner_images_cached": runner_ready,
        "passed": passed,
    })
    return event


@app.post("/v1/plan")
async def create_plan(req: PlanRequest) -> dict[str, Any]:
    policy = load_policy()
    if policy.get("providers", {}).get("local", {}).get("allowed") is not True:
        raise HTTPException(status_code=403, detail="Local AI provider denied by governance policy.")
    system_prompt = (
        "You are the Resonance Sovereign Foundry local planning agent. Produce a concise implementation plan. "
        "The model has proposal authority only. It may not bypass the governed controller, alter governance, "
        "enable external AI, or claim a file was changed unless the controller performs the write."
    )
    body = {"model": MODEL, "stream": False, "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": req.intent}]}
    try:
        async with httpx.AsyncClient(timeout=300) as client:
            response = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=body)
            response.raise_for_status()
            data = response.json()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Local model unavailable: {exc}") from exc
    content = data.get("message", {}).get("content", "")
    receipt = write_receipt({"timestamp": utc_now(), "event": "local_plan_generated", "project": req.project, "model": MODEL, "provider": "local:ollama", "intent_sha256": hashlib.sha256(req.intent.encode()).hexdigest(), "external_ai_used": False})
    return {"plan": content, "receipt": receipt}


@app.post("/v1/files/write")
def write_file(req: WriteFileRequest) -> dict[str, Any]:
    policy = load_policy()
    try:
        result = workspace(policy).write_file(req.path, req.content, overwrite=req.overwrite, confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({"timestamp": utc_now(), "event": "governed_file_write", "project": "ResonanceAppDev", **result, "external_ai_used": False})
    return {"result": result, "receipt": receipt}


@app.post("/v1/tasks/run")
def run_task(req: TaskRequest) -> dict[str, Any]:
    policy = load_policy()
    try:
        result = workspace(policy).run_task(req.task)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({"timestamp": utc_now(), "event": "governed_task_run", "project": "ResonanceAppDev", "task": result.task, "command": result.command, "returncode": result.returncode, "external_ai_used": False})
    return {"task": result.task, "command": result.command, "returncode": result.returncode, "stdout": result.stdout, "stderr": result.stderr, "receipt": receipt}


@app.post("/v1/git/commit")
def git_commit(req: CommitRequest) -> dict[str, Any]:
    policy = load_policy()
    try:
        result = workspace(policy).git_commit(req.message)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({"timestamp": utc_now(), "event": "governed_git_commit", "project": "ResonanceAppDev", "commit_sha": result["commit_sha"], "external_ai_used": False})
    return {**result, "receipt": receipt}


@app.post("/v1/git/revert")
def git_revert(req: RevertRequest) -> dict[str, Any]:
    policy = load_policy()
    try:
        result = workspace(policy).git_revert(req.commit_sha, confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({"timestamp": utc_now(), "event": "governed_git_revert", "project": "ResonanceAppDev", **result, "external_ai_used": False})
    return {**result, "receipt": receipt}


@app.post("/v1/scaffold")
def scaffold(req: ScaffoldRequest) -> dict[str, Any]:
    policy = load_policy()
    ws = workspace(policy)
    proposed = deterministic_scaffold(req.intent, req.app_name)
    written: list[dict[str, Any]] = []
    try:
        for path, content in proposed.items():
            written.append(ws.write_file(path, content, overwrite=req.overwrite, confirmed=req.confirmed))
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({"timestamp": utc_now(), "event": "deterministic_app_scaffold", "project": "ResonanceAppDev", "intent_sha256": hashlib.sha256(req.intent.encode()).hexdigest(), "files": [item["path"] for item in written], "external_ai_used": False})
    return {"files": written, "receipt": receipt}


@app.post("/v1/factory/spec")
def factory_spec(req: FactorySpecRequest) -> dict[str, Any]:
    policy = load_policy()
    try:
        spec = make_spec(req.intent, req.app_name, req.template)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "app_spec_created", "app_id": spec.app_id,
        "project_dir": spec.project_dir, "template": spec.template,
        "intent_sha256": hashlib.sha256(spec.intent.encode("utf-8")).hexdigest(), "external_ai_used": False,
    })
    return {"spec": spec.as_dict(), "receipt": receipt}


@app.post("/v1/factory/generate")
async def factory_generate(req: FactoryGenerateRequest) -> dict[str, Any]:
    policy = load_policy()
    ws = workspace(policy)
    try:
        spec = make_spec(req.intent, req.app_name, req.template)
        controller_baseline = deterministic_project(spec)
        if req.strategy == "local_model":
            files = await local_project_generation(spec, policy)
            # APP_SPEC is controller-authored evidence, never model-authored authority.
            files["APP_SPEC.json"] = controller_baseline["APP_SPEC.json"]
            files.setdefault("README.md", controller_baseline["README.md"])
            generator = f"local:ollama:{MODEL}"
            local_ai_used = True
        else:
            files = controller_baseline
            generator = "deterministic-template"
            local_ai_used = False
        written = write_project(ws, spec, files, overwrite=req.overwrite, confirmed=req.confirmed)
        project = ws.resolve(spec.project_dir)
        dependency = DependencyGuard(policy).check(project)
        security = StaticSecurityScanner(policy).scan(project)
        syntax = static_validate_project(project)
        validated = dependency["passed"] and security["passed"] and syntax["passed"]
        preview_policy = policy.get("preview", {})
        preview = preview_descriptor(
            spec, int(preview_policy.get("port_min", 4310)), int(preview_policy.get("port_max", 4399))
        ) if validated else None
        registry = app_registry()
        registry.append(spec.app_id, "app_generated", {
            **spec.as_dict(), "status": "validated" if validated else "generated_needs_attention",
            "generator": generator, "files": [item["path"] for item in written],
        })
        if validated and preview:
            registry.append(spec.app_id, "preview_ready", {"status": "preview_ready", "preview": preview})
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "sovereign_app_generated", "app_id": spec.app_id,
        "project_dir": spec.project_dir, "strategy": req.strategy, "generator": generator,
        "files": [item["path"] for item in written], "validated": validated,
        "local_ai_used": local_ai_used, "external_ai_used": False,
    })
    return {
        "spec": spec.as_dict(), "files": written, "validated": validated,
        "checks": {
            "dependencies": dependency,
            "security": {"passed": security["passed"], "blocking_findings": security["blocking_findings"]},
            "static": syntax,
        },
        "preview": preview, "registry": registry.state(spec.app_id), "receipt": receipt,
    }


@app.get("/v1/apps")
def list_apps() -> dict[str, Any]:
    registry = app_registry()
    return {"apps": registry.list_states(), "chain": registry.verify_chain()}


@app.get("/v1/apps/{app_id}")
def get_app(app_id: str) -> dict[str, Any]:
    registry = app_registry()
    try:
        state = registry.state(app_id)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    if state is None:
        raise HTTPException(status_code=404, detail="Application not found in sovereign registry.")
    return {"app": state, "chain": registry.verify_chain()}


@app.get("/v1/apps/{app_id}/preview")
def get_app_preview(app_id: str) -> dict[str, Any]:
    state = app_registry().state(app_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Application not found in sovereign registry.")
    preview = state.get("preview")
    if not preview:
        raise HTTPException(status_code=409, detail="Application has no validated preview descriptor yet.")
    return {"app_id": app_id, "preview": preview}


@app.post("/v1/apps/{app_id}/lifecycle")
def app_lifecycle(app_id: str, req: LifecycleRequest) -> dict[str, Any]:
    if not req.confirmed:
        raise HTTPException(status_code=403, detail="Lifecycle changes require confirmed=true.")
    registry = app_registry()
    current = registry.state(app_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Application not found in sovereign registry.")
    status = "archived" if req.action == "archive" else "active"
    event = registry.append(app_id, f"app_{req.action}d" if req.action == "archive" else "app_reactivated", {"status": status})
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "app_lifecycle_changed", "app_id": app_id,
        "action": req.action, "status": status, "destructive": False, "external_ai_used": False,
    })
    return {"app": registry.state(app_id), "registry_event": event, "receipt": receipt}


@app.get("/v1/registry/verify")
def verify_registry() -> dict[str, Any]:
    return app_registry().verify_chain()


@app.get("/v1/runner/preflight")
def runner_preflight() -> dict[str, Any]:
    policy = load_policy()
    result = IsolatedRunner(workspace(policy).root, policy).preflight()
    return {**result, "receipt": write_receipt({"timestamp": utc_now(), "event": "isolated_runner_preflight", "project": "ResonanceAppDev", **result, "external_ai_used": False})}


@app.post("/v1/migration/assess")
def migration_assess(req: MigrationAssessRequest) -> dict[str, Any]:
    policy = load_policy()
    try:
        result = SovereignMigrator(workspace(policy).root, policy).assess(req.source_dir, req.app_name).as_dict()
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "migration_assessed", "source": req.source_dir,
        "app_id": result["app_id"], "ready_to_import": result["ready_to_import"],
        "external_dependencies": [x["service"] for x in result["external_dependencies"]],
        "external_ai_used": False,
    })
    return {"assessment": result, "receipt": receipt}


@app.post("/v1/migration/import")
def migration_import(req: MigrationImportRequest) -> dict[str, Any]:
    policy = load_policy()
    ws = workspace(policy)
    migrator = SovereignMigrator(ws.root, policy)
    try:
        report = migrator.import_copy(req.source_dir, req.app_name, confirmed=req.confirmed)
        app_id = report["assessment"]["app_id"]
        project_dir = f"apps/{app_id}"
        project = ws.resolve(project_dir)
        app_spec = project / "APP_SPEC.json"
        if not app_spec.exists():
            app_spec.write_text(json.dumps({
                "app_id": app_id,
                "title": " ".join(part.capitalize() for part in app_id.split("-")),
                "intent": "Imported existing application for sovereign migration.",
                "template": "imported-existing",
                "project_dir": project_dir,
                "external_ai_required": False,
                "sovereignty_mode": "migration",
                "migration_source": req.source_dir,
            }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        guard = DependencyGuard(policy).check(project)
        security = StaticSecurityScanner(policy).scan(project)
        evidence = write_supply_chain_evidence(project, app_id)
        status = "migrated_needs_remediation" if not guard["passed"] or not security["passed"] else "migrated_validated"
        event = app_registry().append(app_id, "app_imported", {
            "status": status,
            "project_dir": project_dir,
            "origin": "local_migration",
            "migration_source": req.source_dir,
            "external_services": [x["service"] for x in report["assessment"]["external_dependencies"]],
            "tree_sha256": evidence["tree_sha256"],
        })
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "sovereign_app_imported", "app_id": app_id,
        "project_dir": project_dir, "status": status, "tree_sha256": evidence["tree_sha256"],
        "external_ai_used": False,
    })
    return {"report": report, "dependencies": guard, "security": security, "evidence": evidence, "registry_event": event, "receipt": receipt}


@app.post("/v1/supply-chain/generate")
def supply_chain_generate(req: ProjectRequest) -> dict[str, Any]:
    policy = load_policy()
    try:
        _, runner, project, guard, scanner = project_components(policy, req.project_dir)
        app_id = Path(req.project_dir.replace("\\", "/")).name
        dependencies = guard.check(project)
        security = scanner.scan(project)
        inventory = dependency_inventory(project)
        evidence = write_supply_chain_evidence(project, app_id)
        event = app_registry().append(app_id, "supply_chain_attested", {
            "status": "supply_chain_attested" if dependencies["passed"] and security["passed"] else "supply_chain_needs_remediation",
            "tree_sha256": evidence["tree_sha256"], "component_count": inventory["count"],
            "offline_dependency_metadata_ready": inventory["offline_ready"],
        })
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "supply_chain_evidence_generated", "project_dir": req.project_dir,
        "tree_sha256": evidence["tree_sha256"], "component_count": inventory["count"], "external_ai_used": False,
    })
    return {"inventory": inventory, "dependencies": dependencies, "security": security, "evidence": evidence, "registry_event": event, "receipt": receipt}


@app.post("/v1/supply-chain/verify")
def supply_chain_verify(req: ProjectRequest) -> dict[str, Any]:
    policy = load_policy()
    try:
        _, _, project, _, _ = project_components(policy, req.project_dir)
        result = verify_supply_chain_evidence(project)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "supply_chain_evidence_verified", "project_dir": req.project_dir,
        "valid": result["valid"], "external_ai_used": False,
    })
    return {**result, "receipt": receipt}


@app.post("/v1/supply-chain/artifacts/ingest")
def supply_chain_artifact_ingest(req: ArtifactIngestRequest) -> dict[str, Any]:
    policy = load_policy()
    try:
        artifact = LocalArtifactStore(workspace(policy).root, policy).ingest(req.source_path, purl=req.purl)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    result = {"name": artifact.name, "sha256": artifact.sha256, "bytes": artifact.bytes, "stored_path": artifact.stored_path, "purl": req.purl}
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "local_artifact_ingested", **result, "external_ai_used": False,
    })
    return {"artifact": result, "receipt": receipt}


@app.post("/v1/supply-chain/cache-status")
def supply_chain_cache_status(req: ProjectRequest) -> dict[str, Any]:
    policy = load_policy()
    try:
        _, _, project, _, _ = project_components(policy, req.project_dir)
        result = LocalArtifactStore(workspace(policy).root, policy).project_cache_status(project)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "offline_dependency_cache_checked", "project_dir": req.project_dir,
        "offline_ready": result["offline_ready"], "missing": result["missing"], "external_ai_used": False,
    })
    return {**result, "receipt": receipt}


@app.post("/v1/supply-chain/signing/init")
def supply_chain_signing_init(req: ConfirmRequest) -> dict[str, Any]:
    policy = load_policy()
    try:
        result = LocalAttestor(workspace(policy).root, policy).initialize(confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "local_attestation_identity_created",
        "algorithm": result["algorithm"], "public_key": result["public_key"], "external_ai_used": False,
    })
    return {**result, "receipt": receipt}


@app.post("/v1/supply-chain/sign")
def supply_chain_sign(req: ConfirmedProjectRequest) -> dict[str, Any]:
    policy = load_policy()
    try:
        _, _, project, _, _ = project_components(policy, req.project_dir)
        integrity = verify_supply_chain_evidence(project)
        if not integrity.get("valid"):
            raise GovernanceViolation("Current source does not match the artifact manifest; regenerate evidence before signing.")
        result = LocalAttestor(workspace(policy).root, policy).sign(project, confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "artifact_manifest_signed", "project_dir": req.project_dir,
        "algorithm": result["algorithm"], "signature_sha256": result["signature_sha256"], "external_ai_used": False,
    })
    return {**result, "receipt": receipt}


@app.post("/v1/supply-chain/signature/verify")
def supply_chain_signature_verify(req: ProjectRequest) -> dict[str, Any]:
    policy = load_policy()
    try:
        _, _, project, _, _ = project_components(policy, req.project_dir)
        integrity = verify_supply_chain_evidence(project)
        signature = LocalAttestor(workspace(policy).root, policy).verify(project)
        valid = bool(integrity.get("valid")) and bool(signature.get("valid"))
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "artifact_signature_verified", "project_dir": req.project_dir,
        "valid": valid, "external_ai_used": False,
    })
    return {"valid": valid, "integrity": integrity, "signature": signature, "receipt": receipt}


@app.get("/v1/supply-chain/artifacts/verify")
def supply_chain_artifact_verify() -> dict[str, Any]:
    policy = load_policy()
    result = LocalArtifactStore(workspace(policy).root, policy).verify()
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "local_artifact_store_verified", "valid": result["valid"],
        "checked": result["checked"], "external_ai_used": False,
    })
    return {**result, "receipt": receipt}


@app.get("/v1/suite")
def suite_overview() -> dict[str, Any]:
    try:
        result = suite_control().overview()
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    return result


@app.get("/v1/suite/{app_id}")
def suite_app_status(app_id: str) -> dict[str, Any]:
    try:
        return suite_control().status(app_id)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc


@app.post("/v1/suite/{app_id}/remediation")
def suite_remediation(app_id: str, req: SuitePlanRequest) -> dict[str, Any]:
    try:
        plan = suite_control().remediation_plan(app_id, write=req.write)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "suite_remediation_plan", "app_id": app_id,
        "plan_written": req.write, "actions": len(plan.get("actions", [])), "external_ai_used": False,
    })
    return {"plan": plan, "receipt": receipt}


@app.post("/v1/suite/{app_id}/export")
def suite_export(app_id: str, req: ExportRequest) -> dict[str, Any]:
    try:
        result = exporter().export(app_id, confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "sovereign_app_export", "app_id": app_id,
        "archive": result["archive"], "archive_sha256": result["archive_sha256"],
        "source_modified": False, "external_ai_used": False,
    })
    return {"export": result, "receipt": receipt}


@app.post("/v1/exports/verify")
def verify_export(req: ExportVerifyRequest) -> dict[str, Any]:
    try:
        return exporter().verify_export(req.archive)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc


@app.get("/v1/service-fabric")
def service_fabric_catalog() -> dict[str, Any]:
    try:
        validation = service_fabric().validate()
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "service_fabric_catalog_read",
        "valid": validation["valid"], "service_count": len(validation["services"]), "external_ai_used": False,
    })
    return {**validation, "receipt": receipt}


@app.get("/v1/service-fabric/health")
def service_fabric_health() -> dict[str, Any]:
    try:
        result = service_fabric().health()
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "service_fabric_health_checked",
        "ready": result["ready"], "network_scope": result["network_scope"], "external_ai_used": False,
    })
    return {**result, "receipt": receipt}


@app.get("/v1/service-fabric/{app_id}/migration-plan")
def service_fabric_migration_plan(app_id: str) -> dict[str, Any]:
    try:
        result = service_fabric().migration_plan(app_id)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "service_migration_plan_generated",
        "app_id": app_id, "detected_external_services": result["detected_external_services"],
        "required_local_services": result["required_local_services"], "external_ai_used": False,
    })
    return {**result, "receipt": receipt}


@app.post("/v1/service-fabric/{app_id}/bindings")
def service_fabric_bindings(app_id: str, req: ServiceFabricWriteRequest) -> dict[str, Any]:
    try:
        result = service_fabric().write_bindings(app_id, confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "service_bindings_written",
        "app_id": app_id, "binding_count": result["binding_count"],
        "contains_secret_values": result["contains_secret_values"], "external_ai_used": False,
    })
    return {**result, "receipt": receipt}


@app.get("/v1/service-fabric/runtime/compose")
def service_fabric_compose_preview() -> dict[str, Any]:
    try:
        result = service_fabric().render_compose()
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    return result


@app.post("/v1/service-fabric/runtime/compose")
def service_fabric_compose_write(req: ServiceFabricWriteRequest) -> dict[str, Any]:
    try:
        result = service_fabric().write_compose(confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "service_fabric_runtime_written",
        "services": result["services"], "network_internal": result["network_internal"],
        "pull_policy": result["pull_policy"], "external_ai_used": False,
    })
    return {**result, "receipt": receipt}


@app.get("/v1/adapters/{app_id}/assess")
def adapter_assessment(app_id: str) -> dict[str, Any]:
    try:
        result = adapter_engine().assess(app_id)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "adapter_assessment", "app_id": app_id,
        "providers": result["providers"], "blockers": result["blockers"], "external_ai_used": False,
    })
    return {**result, "receipt": receipt}


@app.post("/v1/adapters/{app_id}/generate")
def adapter_generate(app_id: str, req: AdapterWriteRequest) -> dict[str, Any]:
    try:
        result = adapter_engine().generate(app_id, confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "sovereign_adapters_generated", "app_id": app_id,
        "adapter_file_count": len(result["written"]), "source_rewritten": False, "external_ai_used": False,
    })
    return {**result, "receipt": receipt}


@app.post("/v1/adapters/{app_id}/cutover")
def adapter_cutover(app_id: str, req: AdapterWriteRequest) -> dict[str, Any]:
    try:
        result = adapter_engine().prepare_cutover(app_id, confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "adapter_cutover_prepared", "app_id": app_id,
        "migration_id": result["migration_id"], "changed_files": len(result["changes"]),
        "rollback_available": True, "external_ai_used": False,
    })
    return {**result, "receipt": receipt}


@app.get("/v1/adapters/{app_id}/verify")
def adapter_verify(app_id: str) -> dict[str, Any]:
    try:
        result = adapter_engine().verify_cutover(app_id)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "adapter_cutover_verified", "app_id": app_id,
        "cutover_ready": result["cutover_ready"], "blockers": result["blockers"], "external_ai_used": False,
    })
    return {**result, "receipt": receipt}


@app.post("/v1/adapters/{app_id}/rollback")
def adapter_rollback(app_id: str, req: AdapterRollbackRequest) -> dict[str, Any]:
    try:
        result = adapter_engine().rollback(app_id, req.migration_id, confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "adapter_cutover_rollback", "app_id": app_id,
        "migration_id": req.migration_id, "restored_files": len(result["restored"]), "external_ai_used": False,
    })
    return {**result, "receipt": receipt}


@app.post("/v1/dependencies/check")
def dependency_check(req: ProjectRequest) -> dict[str, Any]:
    policy = load_policy()
    try:
        _, _, project, guard, _ = project_components(policy, req.project_dir)
        result = guard.check(project)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({"timestamp": utc_now(), "event": "dependency_policy_check", "project_dir": req.project_dir, **result, "external_ai_used": False})
    return {**result, "receipt": receipt}


@app.post("/v1/security/scan")
def security_scan(req: ProjectRequest) -> dict[str, Any]:
    policy = load_policy()
    try:
        _, _, project, _, scanner = project_components(policy, req.project_dir)
        result = scanner.scan(project)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({"timestamp": utc_now(), "event": "local_security_scan", "project_dir": req.project_dir, "passed": result["passed"], "files_scanned": result["files_scanned"], "blocking_findings": len(result["blocking_findings"]), "external_ai_used": False})
    return {**result, "receipt": receipt}


@app.post("/v1/runner/task")
def isolated_task(req: IsolatedTaskRequest) -> dict[str, Any]:
    policy = load_policy()
    try:
        _, runner, _, guard, scanner = project_components(policy, req.project_dir)
        dep = guard.check(runner.resolve_project(req.project_dir))
        sec = scanner.scan(runner.resolve_project(req.project_dir))
        if not dep["passed"]:
            raise GovernanceViolation("Dependency policy failed before isolated execution: " + "; ".join(dep["violations"]))
        if not sec["passed"]:
            raise GovernanceViolation("Security scan failed before isolated execution.")
        result = runner.run(req.task, req.project_dir)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({"timestamp": utc_now(), "event": "isolated_task_run", "project_dir": req.project_dir, "task": result.task, "engine": result.engine, "image": result.image, "returncode": result.returncode, "network": "none", "external_ai_used": False})
    return {"task": result.task, "engine": result.engine, "image": result.image, "returncode": result.returncode, "stdout": result.stdout, "stderr": result.stderr, "receipt": receipt}


@app.post("/v1/build-cycle")
async def build_cycle(req: BuildCycleRequest) -> dict[str, Any]:
    policy = load_policy()
    max_policy_repairs = int(policy.get("repair_cycle", {}).get("max_attempts", 2))
    if req.max_repair_attempts > max_policy_repairs:
        raise HTTPException(status_code=403, detail=f"Governance caps repair attempts at {max_policy_repairs}.")

    originals: dict[str, Any] = {}
    history: list[dict[str, Any]] = []
    try:
        ws, runner, project, guard, scanner = project_components(policy, req.project_dir)
        for attempt in range(req.max_repair_attempts + 1):
            dep = guard.check(project)
            sec = scanner.scan(project)
            stage: dict[str, Any] = {"attempt": attempt, "dependencies": dep, "security": {"passed": sec["passed"], "blocking_findings": sec["blocking_findings"]}}
            if not dep["passed"] or not sec["passed"]:
                failure = {"type": "preflight", "dependencies": dep, "security": sec}
            else:
                task_results: list[dict[str, Any]] = []
                failure = None
                for task_name in req.tasks:
                    result = runner.run(task_name, req.project_dir)
                    record = {"task": task_name, "returncode": result.returncode, "stdout": result.stdout, "stderr": result.stderr}
                    task_results.append(record)
                    if result.returncode != 0:
                        failure = {"type": "task", **record}
                        break
                stage["tasks"] = task_results
            history.append(stage)

            if failure is None:
                commit = None
                if req.commit_on_success:
                    commit = ws.git_commit_paths(req.commit_message, [req.project_dir])
                if req.project_dir.replace("\\", "/").startswith("apps/"):
                    app_id = Path(req.project_dir.replace("\\", "/")).name
                    app_registry().append(app_id, "build_passed", {
                        "status": "committed" if commit and commit.get("committed") else "build_passed",
                        "commit_sha": commit.get("commit_sha") if commit else None,
                    })
                receipt = write_receipt({
                    "timestamp": utc_now(), "event": "sovereign_build_cycle", "project_dir": req.project_dir,
                    "status": "passed", "attempts": attempt, "tasks": req.tasks,
                    "commit_sha": commit["commit_sha"] if commit else None, "external_ai_used": False,
                })
                return {"status": "passed", "attempts": attempt, "history": history, "commit": commit, "receipt": receipt}

            if attempt >= req.max_repair_attempts:
                restored = rollback_transaction(ws, originals)
                if req.project_dir.replace("\\", "/").startswith("apps/"):
                    app_id = Path(req.project_dir.replace("\\", "/")).name
                    app_registry().append(app_id, "build_failed_rolled_back", {"status": "generated_needs_attention"})
                receipt = write_receipt({
                    "timestamp": utc_now(), "event": "sovereign_build_cycle", "project_dir": req.project_dir,
                    "status": "failed_rolled_back", "attempts": attempt, "tasks": req.tasks,
                    "restored_files": restored, "external_ai_used": False,
                })
                return {"status": "failed_rolled_back", "attempts": attempt, "history": history, "restored_files": restored, "receipt": receipt}

            proposal = await local_repair_proposal(req.intent, project, failure, policy)
            applied = apply_transactional_repairs(ws, req.project_dir, proposal, originals)
            history[-1]["repair"] = {"summary": proposal.get("summary", ""), "files": [item["path"] for item in applied]}
            write_receipt({
                "timestamp": utc_now(), "event": "local_repair_applied", "project_dir": req.project_dir,
                "attempt": attempt + 1, "files": [item["path"] for item in applied], "model": MODEL,
                "provider": "local:ollama", "local_ai_used": True, "external_ai_used": False,
            })

    except GovernanceViolation as exc:
        try:
            if "ws" in locals():
                rollback_transaction(ws, originals)
        finally:
            raise governed_error(exc) from exc


# v0.9 Sovereign Backend Runtime

def backend_runtime() -> SovereignBackendRuntime:
    policy = load_policy()
    return SovereignBackendRuntime(workspace(policy).root, policy, app_registry())


@app.get("/v1/backend/validate")
def backend_validate() -> dict[str, Any]:
    try:
        result = backend_runtime().validate()
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({"timestamp": utc_now(), "event": "backend_runtime_validated", "valid": result["valid"], "external_ai_used": False})
    return {**result, "receipt": receipt}


@app.post("/v1/backend/secrets/init")
def backend_secrets_init(req: ConfirmRequest) -> dict[str, Any]:
    try:
        result = backend_runtime().initialize_secrets(confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({"timestamp": utc_now(), "event": "backend_secrets_initialized", "created_secret_refs": result["created_secret_refs"], "secret_values_returned": False, "external_ai_used": False})
    return {**result, "receipt": receipt}


@app.post("/v1/backend/runtime/write")
def backend_runtime_write(req: ConfirmRequest) -> dict[str, Any]:
    try:
        result = backend_runtime().write_runtime(confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({"timestamp": utc_now(), "event": "backend_runtime_written", **result, "external_ai_used": False})
    return {**result, "receipt": receipt}


@app.get("/v1/backend/health")
def backend_health() -> dict[str, Any]:
    try:
        result = backend_runtime().health()
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({"timestamp": utc_now(), "event": "backend_health_checked", "ready": result["ready"], "external_ai_used": False})
    return {**result, "receipt": receipt}


@app.get("/v1/backend/apps/{app_id}/migration-plan")
def backend_migration_plan(app_id: str) -> dict[str, Any]:
    try:
        result = backend_runtime().migration_plan(app_id)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({"timestamp": utc_now(), "event": "backend_migration_planned", "app_id": app_id, "migration_count": len(result["migrations"]), "blockers": result["blockers"], "external_ai_used": False})
    return {**result, "receipt": receipt}


@app.post("/v1/backend/apps/{app_id}/migrate")
def backend_migrate(app_id: str, req: ConfirmRequest) -> dict[str, Any]:
    try:
        result = backend_runtime().execute_migrations(app_id, confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({"timestamp": utc_now(), "event": "backend_schema_migration_executed", "app_id": app_id, "migration_count": len(result["executed"]), "shell_used": False, "external_ai_used": False})
    return {**result, "receipt": receipt}


@app.post("/v1/backend/apps/{app_id}/certify")
def backend_certify(app_id: str) -> dict[str, Any]:
    try:
        result = backend_runtime().certify(app_id)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({"timestamp": utc_now(), "event": "backend_sovereignty_certified", "app_id": app_id, "backend_ready": result["backend_ready"], "blockers": result["blockers"], "external_ai_used": False})
    return {**result, "receipt": receipt}


# v1.0 Sovereign Control Plane & Release Certification

def control_plane() -> SovereignControlPlane:
    policy = load_policy()
    ws = workspace(policy)
    return SovereignControlPlane(ws.root, policy, app_registry())


def sovereignty_evaluator() -> SovereigntyEvaluator:
    policy = load_policy()
    ws = workspace(policy)
    return SovereigntyEvaluator(ws.root, policy, app_registry())


def release_certifier() -> ReleaseCertifier:
    policy = load_policy()
    ws = workspace(policy)
    return ReleaseCertifier(ws.root, policy, app_registry())


@app.get("/v1/control-plane")
def control_plane_snapshot() -> dict[str, Any]:
    try:
        result = control_plane().snapshot()
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "control_plane_snapshot",
        "platform_score": result["platform_sovereignty"]["score"],
        "external_ai_used": False,
    })
    return {**result, "receipt": receipt}


@app.get("/v1/sovereignty/apps/{app_id}")
def app_sovereignty_score(app_id: str) -> dict[str, Any]:
    try:
        health = backend_runtime().health()
        result = sovereignty_evaluator().app_score(app_id, backend_health=health)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    receipt = write_receipt({
        "timestamp": utc_now(), "event": "app_sovereignty_scored", "app_id": app_id,
        "score": result["score"], "operationally_sovereign": result["operationally_sovereign"],
        "external_ai_used": False,
    })
    return {**result, "receipt": receipt}


@app.get("/v1/release/preflight")
def release_preflight() -> dict[str, Any]:
    try:
        result = release_certifier().rc_preflight()
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    return {**result, "receipt": write_receipt({
        "timestamp": utc_now(), "event": "release_candidate_preflight",
        "passed": result["passed"], "operational_runtime_verified": False,
        "external_ai_used": False,
    })}


@app.post("/v1/release/certify")
def release_certify(req: ConfirmRequest) -> dict[str, Any]:
    try:
        result = release_certifier().certify_release_candidate(confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    return {**result, "receipt": write_receipt({
        "timestamp": utc_now(), "event": "release_candidate_certified",
        "release": result["release"], "certification_sha256": result["sha256"],
        "operational_runtime_verified": False, "external_ai_used": False,
    })}


@app.post("/v1/sovereignty/apps/{app_id}/certify")
def certify_app_operational(app_id: str, req: ConfirmRequest) -> dict[str, Any]:
    try:
        health = backend_runtime().health()
        score = sovereignty_evaluator().app_score(app_id, backend_health=health)
        result = release_certifier().certify_app_operational(app_id, score, confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc) from exc
    return {"certification": result, "score": score, "receipt": write_receipt({
        "timestamp": utc_now(), "event": "operational_sovereignty_certified",
        "app_id": app_id, "score": score["score"], "certification_sha256": result["sha256"],
        "external_ai_used": False,
    })}


def local_deployment_manager() -> LocalDeploymentManager:
    policy = load_policy()
    return LocalDeploymentManager(workspace(policy).root, policy, app_registry())


@app.get("/v1/deployment/preflight")
def deployment_preflight() -> dict[str, Any]:
    try:
        result = local_deployment_manager().preflight()
    except GovernanceViolation as exc:
        raise governed_error(exc)
    write_receipt({
        "timestamp": utc_now(), "event": "local_deployment_preflight",
        "ready": result["ready_for_offline_runtime"], "external_ai_used": False,
    })
    return result


@app.post("/v1/deployment/evidence")
def deployment_evidence(req: ConfirmRequest) -> dict[str, Any]:
    try:
        result = local_deployment_manager().write_evidence(confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc)
    write_receipt({
        "timestamp": utc_now(), "event": "local_deployment_evidence_written",
        "evidence_sha256": result["sha256"], "ready": result["ready_for_offline_runtime"],
        "external_ai_used": False,
    })
    return result


@app.get("/v1/deployment/evidence/verify")
def deployment_evidence_verify() -> dict[str, Any]:
    try:
        result = local_deployment_manager().verify_evidence_chain()
    except GovernanceViolation as exc:
        raise governed_error(exc)
    return result


@app.get("/v1/deployment/first-app/{app_id}/plan")
def first_app_migration_plan(app_id: str) -> dict[str, Any]:
    try:
        return local_deployment_manager().first_app_plan(app_id)
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.post("/v1/deployment/first-app/{app_id}/plan")
def first_app_migration_plan_write(app_id: str, req: ConfirmRequest) -> dict[str, Any]:
    try:
        result = local_deployment_manager().first_app_plan(app_id, write=True, confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc)
    write_receipt({
        "timestamp": utc_now(), "event": "first_app_migration_plan_written",
        "app_id": app_id, "plan_sha256": result.get("plan_sha256"), "external_ai_used": False,
    })
    return result


@app.get("/v1/cutover/{app_id}/plan")
def cutover_plan(app_id: str):
    try:
        policy = load_policy()
        reg = app_registry()
        return SovereignCutoverManager(workspace(policy).root, policy, reg).plan(app_id)
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.post("/v1/cutover/{app_id}/baseline")
def cutover_baseline(app_id: str, req: CutoverConfirmRequest):
    try:
        policy = load_policy()
        ws = workspace(policy)
        reg = app_registry()
        return SovereignCutoverManager(ws.root, policy, reg).baseline(app_id, confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.get("/v1/cutover/{app_id}/baselines/verify")
def cutover_verify_baselines(app_id: str):
    try:
        policy = load_policy()
        ws = workspace(policy)
        reg = app_registry()
        return SovereignCutoverManager(ws.root, policy, reg).verify_baselines(app_id)
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.post("/v1/cutover/{app_id}/checkpoint")
def cutover_checkpoint(app_id: str, req: CutoverConfirmRequest):
    try:
        policy = load_policy()
        ws = workspace(policy)
        return SovereignCutoverManager(ws.root, policy, app_registry()).checkpoint(app_id, confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.post("/v1/cutover/{app_id}/regression")
def cutover_regression(app_id: str, req: CutoverRegressionRequest):
    try:
        policy = load_policy()
        ws = workspace(policy)
        tasks = req.tasks or None
        return SovereignCutoverManager(ws.root, policy, app_registry()).run_regression(app_id, tasks=tasks, confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.post("/v1/cutover/{app_id}/preview")
def cutover_preview(app_id: str, req: CutoverPreviewRequest):
    try:
        policy = load_policy()
        ws = workspace(policy)
        return SovereignCutoverManager(ws.root, policy, app_registry()).verify_preview(app_id, url=req.url, confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.post("/v1/cutover/{app_id}/certify-local")
def cutover_certify_local(app_id: str, req: CutoverConfirmRequest):
    try:
        policy = load_policy()
        ws = workspace(policy)
        reg = app_registry()
        return SovereignCutoverManager(ws.root, policy, reg).certify_local_cutover(app_id, confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc)

@app.post("/v1/source-ingestion/{app_id}/stage-local")
def source_ingestion_stage_local(app_id: str, req: RealSourceStageRequest):
    try:
        policy = load_policy()
        ws = workspace(policy)
        result = RealSourceIngestor(ws.root, policy, app_registry()).stage_local(app_id, req.source_path, confirmed=req.confirmed)
        write_receipt({"timestamp": utc_now(), "event": "real_source_staged", "app_id": app_id, "tree_sha256": result["tree_sha256"], "external_ai_used": False})
        return result
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.get("/v1/source-ingestion/{app_id}/status")
def source_ingestion_status(app_id: str):
    try:
        policy = load_policy()
        ws = workspace(policy)
        return RealSourceIngestor(ws.root, policy, app_registry()).status(app_id)
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.post("/v1/source-ingestion/{app_id}/import")
def source_ingestion_import(app_id: str, req: MigrationExecutionRequest):
    try:
        policy = load_policy()
        ws = workspace(policy)
        result = RealSourceIngestor(ws.root, policy, app_registry()).import_staged(app_id, confirmed=req.confirmed)
        write_receipt({"timestamp": utc_now(), "event": "real_source_imported", "app_id": app_id, "source_modified": False, "external_ai_used": False})
        return result
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.post("/v1/migration-execution/{app_id}/prepare")
def migration_execution_prepare(app_id: str, req: MigrationExecutionRequest):
    try:
        policy = load_policy()
        ws = workspace(policy)
        return MigrationExecutionManager(ws.root, policy, app_registry()).prepare(app_id, confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.post("/v1/migration-execution/{app_id}/execute-supported")
def migration_execution_execute_supported(app_id: str, req: MigrationExecutionRequest):
    try:
        policy = load_policy()
        ws = workspace(policy)
        result = MigrationExecutionManager(ws.root, policy, app_registry()).execute_supported(app_id, confirmed=req.confirmed)
        write_receipt({"timestamp": utc_now(), "event": "supported_provider_migration_executed", "app_id": app_id, "migration_id": result["migration_id"], "production_cutover_performed": False, "external_ai_used": False})
        return result
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.get("/v1/migration-execution/{app_id}/verify")
def migration_execution_verify(app_id: str):
    try:
        policy = load_policy()
        ws = workspace(policy)
        return MigrationExecutionManager(ws.root, policy, app_registry()).verify(app_id)
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.post("/v1/migration-execution/{app_id}/rollback")
def migration_execution_rollback(app_id: str, req: MigrationExecutionRollbackRequest):
    try:
        policy = load_policy()
        ws = workspace(policy)
        result = MigrationExecutionManager(ws.root, policy, app_registry()).rollback(app_id, req.migration_id, confirmed=req.confirmed)
        write_receipt({"timestamp": utc_now(), "event": "supported_provider_migration_rolled_back", "app_id": app_id, "migration_id": req.migration_id, "external_ai_used": False})
        return result
    except GovernanceViolation as exc:
        raise governed_error(exc)



@app.get("/v1/workstation/status")
def workstation_status():
    try:
        policy = load_policy()
        ws = workspace(policy)
        return SovereignWorkstationBridge(ws.root, policy, app_registry()).workstation_status()
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.post("/v1/workstation/initialize")
def workstation_initialize(req: WorkstationInitRequest):
    try:
        policy = load_policy()
        ws = workspace(policy)
        result = SovereignWorkstationBridge(ws.root, policy, app_registry()).initialize_workstation(confirmed=req.confirmed)
        write_receipt({"timestamp": utc_now(), "event": "sovereign_workstation_initialized", "external_ai_used": False, "network_used": False})
        return result
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.post("/v1/repository-bridge/{app_id}/assess")
def repository_bridge_assess(app_id: str, req: RepositoryStageRequest):
    try:
        policy = load_policy()
        ws = workspace(policy)
        return SovereignWorkstationBridge(ws.root, policy, app_registry()).assess_repository(req.source_path)
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.post("/v1/repository-bridge/{app_id}/stage")
def repository_bridge_stage(app_id: str, req: RepositoryStageRequest):
    try:
        policy = load_policy()
        ws = workspace(policy)
        result = SovereignWorkstationBridge(ws.root, policy, app_registry()).stage_repository(app_id, req.source_path, confirmed=req.confirmed)
        write_receipt({"timestamp": utc_now(), "event": "local_git_repository_staged", "app_id": app_id, "commit_sha": result["commit_sha"], "tree_sha256": result["tree_sha256"], "external_ai_used": False, "network_used": False})
        return result
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.get("/v1/repository-bridge/{app_id}/status")
def repository_bridge_status(app_id: str):
    try:
        policy = load_policy()
        ws = workspace(policy)
        return SovereignWorkstationBridge(ws.root, policy, app_registry()).repository_status(app_id)
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.get("/v1/repository-bridge/{app_id}/verify")
def repository_bridge_verify(app_id: str):
    try:
        policy = load_policy()
        ws = workspace(policy)
        return SovereignWorkstationBridge(ws.root, policy, app_registry()).verify_staged(app_id)
    except GovernanceViolation as exc:
        raise governed_error(exc)

@app.get("/v1/real-execution/{app_id}/readiness")
def real_execution_readiness(app_id: str):
    try:
        policy = load_policy()
        ws = workspace(policy)
        return FirstRealExecutionPack(ws.root, policy, app_registry()).readiness(app_id)
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.post("/v1/real-execution/{app_id}/assess-repository")
def real_execution_assess_repository(app_id: str, req: RealExecutionRepositoryRequest):
    try:
        policy = load_policy()
        ws = workspace(policy)
        return FirstRealExecutionPack(ws.root, policy, app_registry()).assess_repository(app_id, req.source_path)
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.post("/v1/real-execution/{app_id}/admit-repository")
def real_execution_admit_repository(app_id: str, req: RealExecutionRepositoryRequest):
    try:
        policy = load_policy()
        ws = workspace(policy)
        result = FirstRealExecutionPack(ws.root, policy, app_registry()).admit_repository(app_id, req.source_path, confirmed=req.confirmed)
        write_receipt({"timestamp": utc_now(), "event": "first_real_repository_admitted", "app_id": app_id, "source_commit_sha": result.get("source_commit_sha"), "network_used": False, "external_ai_used": False})
        return result
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.post("/v1/real-execution/{app_id}/prepare")
def real_execution_prepare(app_id: str, req: RealExecutionConfirmRequest):
    try:
        policy = load_policy()
        ws = workspace(policy)
        return FirstRealExecutionPack(ws.root, policy, app_registry()).prepare(app_id, confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.post("/v1/real-execution/{app_id}/execute-supported")
def real_execution_execute_supported(app_id: str, req: RealExecutionConfirmRequest):
    try:
        policy = load_policy()
        ws = workspace(policy)
        result = FirstRealExecutionPack(ws.root, policy, app_registry()).execute_supported(app_id, confirmed=req.confirmed)
        write_receipt({"timestamp": utc_now(), "event": "first_real_supported_migration_executed", "app_id": app_id, "migration_id": result.get("migration_id"), "production_cutover_performed": False, "network_used": False, "external_ai_used": False})
        return result
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.post("/v1/real-execution/{app_id}/readiness-report")
def real_execution_write_readiness(app_id: str, req: RealExecutionConfirmRequest):
    try:
        policy = load_policy()
        ws = workspace(policy)
        return FirstRealExecutionPack(ws.root, policy, app_registry()).write_readiness_report(app_id, confirmed=req.confirmed)
    except GovernanceViolation as exc:
        raise governed_error(exc)


@app.get("/v1/real-execution/{app_id}/evidence/verify")
def real_execution_verify_evidence(app_id: str):
    try:
        policy = load_policy()
        ws = workspace(policy)
        return FirstRealExecutionPack(ws.root, policy, app_registry()).verify_evidence(app_id)
    except GovernanceViolation as exc:
        raise governed_error(exc)

