from pathlib import Path

import pytest
import yaml

from foundry_controller.app.agent import GovernanceViolation
from foundry_controller.app.registry import AppRegistry
from foundry_controller.app.release_candidate import ReleaseCertifier
from foundry_controller.app.sovereignty import SovereigntyEvaluator
from foundry_controller.app.supply_chain import write_supply_chain_evidence


def policy() -> dict:
    return yaml.safe_load(Path("governance/policy.yaml").read_text(encoding="utf-8"))


def make_project(tmp_path: Path, app_id: str = "demo") -> tuple[Path, AppRegistry]:
    app = tmp_path / "apps" / app_id
    (app / ".open-nova").mkdir(parents=True)
    (app / "open-nova-adapters").mkdir()
    (app / "app.py").write_text('print("sovereign")\n', encoding="utf-8")
    (app / ".open-nova" / "service-bindings.json").write_text("{}\n", encoding="utf-8")
    write_supply_chain_evidence(app, app_id)
    registry = AppRegistry(tmp_path / "runtime/registry/apps.jsonl")
    registry.append(app_id, "app_registered", {"status": "active", "project_dir": f"apps/{app_id}"})
    return app, registry


def test_app_score_requires_runtime_health(tmp_path: Path):
    _, registry = make_project(tmp_path)
    score = SovereigntyEvaluator(tmp_path, policy(), registry).app_score("demo", backend_health={"ready": False})
    assert score["operationally_sovereign"] is False
    assert "backend_runtime_healthy" in score["critical_blockers"]


def test_app_score_can_reach_operational_threshold_without_optional_signature(tmp_path: Path):
    _, registry = make_project(tmp_path)
    score = SovereigntyEvaluator(tmp_path, policy(), registry).app_score("demo", backend_health={"ready": True})
    assert score["score"] == 90
    assert score["operationally_sovereign"] is True
    sig = next(g for g in score["gates"] if g["gate"] == "artifact_signature")
    assert sig["critical"] is False and sig["passed"] is False


def test_external_ai_policy_is_critical(tmp_path: Path):
    _, registry = make_project(tmp_path)
    p = policy(); p["providers"]["external"]["allowed"] = True
    score = SovereigntyEvaluator(tmp_path, p, registry).app_score("demo", backend_health={"ready": True})
    assert score["operationally_sovereign"] is False
    assert "external_ai_denied" in score["critical_blockers"]


def test_platform_score_reports_runtime_blockers(tmp_path: Path):
    registry = AppRegistry(tmp_path / "runtime/registry/apps.jsonl")
    evaluator = SovereigntyEvaluator(tmp_path, policy(), registry)
    result = evaluator.platform_score(
        backend_health={"ready": False},
        service_health={"ready": False},
        runner_preflight={"engine_found": False, "images": {}},
    )
    assert result["operationally_sovereign"] is False
    assert set(["isolated_runner_ready", "service_fabric_healthy", "backend_runtime_healthy"]).issubset(result["critical_blockers"])


def copy_release_files(tmp_path: Path):
    for rel in [
        "governance/policy.yaml", "governance/release.yaml", "governance/backend-runtime.yaml",
        "governance/service-fabric.yaml", "foundry_controller/app/main.py",
    ]:
        src = Path(rel); dst = tmp_path / rel; dst.parent.mkdir(parents=True, exist_ok=True); dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")


def test_release_preflight_distinguishes_static_from_runtime(tmp_path: Path):
    copy_release_files(tmp_path)
    registry = AppRegistry(tmp_path / "runtime/registry/apps.jsonl")
    certifier = ReleaseCertifier(tmp_path, policy(), registry)
    result = certifier.rc_preflight()
    assert result["passed"] is True
    assert result["operational_runtime_verified"] is False


def test_release_certification_requires_confirmation(tmp_path: Path):
    copy_release_files(tmp_path)
    certifier = ReleaseCertifier(tmp_path, policy(), AppRegistry(tmp_path / "runtime/registry/apps.jsonl"))
    with pytest.raises(GovernanceViolation):
        certifier.certify_release_candidate(confirmed=False)


def test_release_certification_is_hash_chained(tmp_path: Path):
    copy_release_files(tmp_path)
    certifier = ReleaseCertifier(tmp_path, policy(), AppRegistry(tmp_path / "runtime/registry/apps.jsonl"))
    first = certifier.certify_release_candidate(confirmed=True)
    second = certifier.certify_release_candidate(confirmed=True)
    assert second["previous_sha256"] == first["sha256"]
    assert first["operational_runtime_verified"] is False


def test_operational_certification_rejects_low_score(tmp_path: Path):
    copy_release_files(tmp_path)
    registry = AppRegistry(tmp_path / "runtime/registry/apps.jsonl")
    certifier = ReleaseCertifier(tmp_path, policy(), registry)
    with pytest.raises(GovernanceViolation):
        certifier.certify_app_operational("demo", {"score": 80, "operationally_sovereign": False}, confirmed=True)


def test_operational_certification_records_registry_event(tmp_path: Path):
    copy_release_files(tmp_path)
    registry = AppRegistry(tmp_path / "runtime/registry/apps.jsonl")
    registry.append("demo", "app_registered", {"status": "active"})
    certifier = ReleaseCertifier(tmp_path, policy(), registry)
    result = certifier.certify_app_operational("demo", {"score": 90, "operationally_sovereign": True}, confirmed=True)
    assert result["level"] == "operational_sovereignty"
    assert registry.state("demo")["status"] == "operationally_sovereign"
