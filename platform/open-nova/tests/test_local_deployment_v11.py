from pathlib import Path

import pytest
import yaml

from foundry_controller.app.agent import GovernanceViolation
from foundry_controller.app.local_deployment import LocalDeploymentManager
from foundry_controller.app.registry import AppRegistry
import foundry_controller.app.local_deployment as deployment_mod


def policy() -> dict:
    return yaml.safe_load(Path("governance/policy.yaml").read_text(encoding="utf-8"))


def copy_controls(tmp_path: Path) -> None:
    gov = tmp_path / "governance"
    gov.mkdir(parents=True, exist_ok=True)
    for name in ("backend-runtime.yaml", "suite.yaml", "local-service-replacements.yaml"):
        gov.joinpath(name).write_text(Path("governance", name).read_text(encoding="utf-8"), encoding="utf-8")


def manager(tmp_path: Path) -> LocalDeploymentManager:
    copy_controls(tmp_path)
    return LocalDeploymentManager(tmp_path, policy(), AppRegistry(tmp_path / "runtime/registry/apps.jsonl"))


def test_preflight_is_evidence_based_and_no_network(tmp_path: Path, monkeypatch):
    mgr = manager(tmp_path)
    monkeypatch.setattr(deployment_mod.shutil, "which", lambda name: f"/bin/{name}" if name in {"git", "podman", "openssl", "ollama"} else None)
    monkeypatch.setattr(deployment_mod, "_tool_version", lambda exe, args: f"{exe} test")
    monkeypatch.setattr(deployment_mod, "_port_state", lambda host, port, timeout=0.15: "closed")
    result = mgr.preflight()
    assert result["ready_for_offline_runtime"] is True
    assert result["network_provisioning_performed"] is False
    assert result["secret_values_exposed"] is False
    assert result["tools"]["container_engine"]["engine"] == "podman"


def test_preflight_blocks_when_container_missing(tmp_path: Path, monkeypatch):
    mgr = manager(tmp_path)
    def which(name):
        return f"/bin/{name}" if name in {"git", "openssl"} else None
    monkeypatch.setattr(deployment_mod.shutil, "which", which)
    monkeypatch.setattr(deployment_mod, "_tool_version", lambda exe, args: f"{exe} test" if which(exe) else None)
    monkeypatch.setattr(deployment_mod, "_port_state", lambda *args, **kwargs: "closed")
    result = mgr.preflight()
    assert result["ready_for_offline_runtime"] is False
    assert any("Podman or Docker" in b for b in result["blockers"])


def test_deployment_evidence_requires_confirmation_and_chains(tmp_path: Path, monkeypatch):
    mgr = manager(tmp_path)
    monkeypatch.setattr(deployment_mod.shutil, "which", lambda name: f"/bin/{name}")
    monkeypatch.setattr(deployment_mod, "_tool_version", lambda exe, args: f"{exe} test")
    monkeypatch.setattr(deployment_mod, "_port_state", lambda *args, **kwargs: "closed")
    with pytest.raises(GovernanceViolation):
        mgr.write_evidence(confirmed=False)
    first = mgr.write_evidence(confirmed=True)
    second = mgr.write_evidence(confirmed=True)
    assert first["sha256"] != second["sha256"]
    verify = mgr.verify_evidence_chain()
    assert verify["valid"] is True and verify["records"] == 2


def test_deployment_evidence_detects_tamper(tmp_path: Path, monkeypatch):
    mgr = manager(tmp_path)
    monkeypatch.setattr(deployment_mod.shutil, "which", lambda name: f"/bin/{name}")
    monkeypatch.setattr(deployment_mod, "_tool_version", lambda exe, args: f"{exe} test")
    monkeypatch.setattr(deployment_mod, "_port_state", lambda *args, **kwargs: "closed")
    mgr.write_evidence(confirmed=True)
    text = mgr.evidence_path.read_text(encoding="utf-8").replace('"ready_for_offline_runtime": true', '"ready_for_offline_runtime": false')
    mgr.evidence_path.write_text(text, encoding="utf-8")
    assert mgr.verify_evidence_chain()["valid"] is False


def test_first_app_plan_stays_non_destructive_when_source_missing(tmp_path: Path, monkeypatch):
    mgr = manager(tmp_path)
    monkeypatch.setattr(deployment_mod.shutil, "which", lambda name: None)
    monkeypatch.setattr(deployment_mod, "_tool_version", lambda exe, args: None)
    monkeypatch.setattr(deployment_mod, "_port_state", lambda *args, **kwargs: "closed")
    plan = mgr.first_app_plan("reson8-life")
    assert plan["app_id"] == "reson8-life"
    assert plan["current_state"] == "source_needed"
    assert plan["automatic_production_cutover"] is False
    assert plan["source_mutation"] is False
    assert plan["stages"][0]["passed"] is False


def test_first_app_plan_write_requires_confirmation(tmp_path: Path, monkeypatch):
    mgr = manager(tmp_path)
    monkeypatch.setattr(deployment_mod.shutil, "which", lambda name: None)
    monkeypatch.setattr(deployment_mod, "_tool_version", lambda exe, args: None)
    monkeypatch.setattr(deployment_mod, "_port_state", lambda *args, **kwargs: "closed")
    with pytest.raises(GovernanceViolation):
        mgr.first_app_plan("reson8-life", write=True, confirmed=False)
    plan = mgr.first_app_plan("reson8-life", write=True, confirmed=True)
    assert Path(tmp_path / plan["plan_path"]).is_file()
    assert len(plan["plan_sha256"]) == 64


def test_runtime_deployment_path_is_controller_protected(tmp_path: Path):
    from foundry_controller.app.agent import SovereignWorkspace
    ws = SovereignWorkspace(tmp_path, policy())
    with pytest.raises(GovernanceViolation):
        ws.write_file("runtime/deployment/evidence.jsonl", "tamper", overwrite=True, confirmed=True)
