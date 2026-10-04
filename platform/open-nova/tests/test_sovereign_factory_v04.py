from pathlib import Path

import pytest

from foundry_controller.app.agent import GovernanceViolation, SovereignWorkspace
from foundry_controller.app.app_factory import (
    deterministic_project,
    make_spec,
    parse_project_proposal,
    preview_descriptor,
    static_validate_project,
    write_project,
)
from foundry_controller.app.registry import AppRegistry
from foundry_controller.app.runner import DependencyGuard, StaticSecurityScanner


@pytest.fixture
def policy():
    return {
        "execution": {"max_file_bytes": 1_100_000, "max_command_seconds": 5},
        "protected_paths": ["governance/", "runtime/receipts/", "runtime/registry/", ".env.sovereign"],
        "dependency_policy": {
            "require_exact_python_versions": True,
            "require_node_lockfile": True,
            "deny_remote_sources": True,
        },
        "security_scan": {"block_severities": ["critical", "high"], "max_files": 100, "max_file_bytes": 500000},
    }


def test_factory_deterministic_project_is_portable_and_valid(tmp_path: Path, policy):
    spec = make_spec("Create a sovereign inventory manager", "Inventory Sovereign")
    files = deterministic_project(spec)
    ws = SovereignWorkspace(tmp_path, policy)
    written = write_project(ws, spec, files)
    project = tmp_path / spec.project_dir
    assert len(written) >= 5
    assert DependencyGuard(policy).check(project)["passed"] is True
    assert StaticSecurityScanner(policy).scan(project)["passed"] is True
    assert static_validate_project(project)["passed"] is True
    assert '"external_ai_required": false' in (project / "APP_SPEC.json").read_text()


def test_local_generator_path_escape_is_denied():
    raw = '{"files":[{"path":"../governance/policy.yaml","content":"bad"}]}'
    with pytest.raises(GovernanceViolation):
        parse_project_proposal(raw)


def test_local_generator_env_file_is_denied():
    raw = '{"files":[{"path":".env","content":"SECRET=x"}]}'
    with pytest.raises(GovernanceViolation):
        parse_project_proposal(raw)


def test_local_generator_duplicate_file_is_denied():
    raw = '{"files":[{"path":"app.py","content":"a"},{"path":"app.py","content":"b"}]}'
    with pytest.raises(GovernanceViolation):
        parse_project_proposal(raw)


def test_registry_is_append_only_and_chain_verifies(tmp_path: Path):
    registry = AppRegistry(tmp_path / "runtime" / "registry" / "apps.jsonl")
    registry.append("demo-app", "app_generated", {"status": "generated", "project_dir": "apps/demo-app"})
    registry.append("demo-app", "preview_ready", {"status": "preview_ready", "preview": {"url": "http://127.0.0.1:4310"}})
    assert registry.verify_chain()["valid"] is True
    state = registry.state("demo-app")
    assert state is not None
    assert state["status"] == "preview_ready"
    assert len(state["history"]) == 2


def test_registry_tamper_is_detected(tmp_path: Path):
    path = tmp_path / "apps.jsonl"
    registry = AppRegistry(path)
    registry.append("demo-app", "app_generated", {"status": "generated"})
    text = path.read_text().replace('"generated"', '"tampered"')
    path.write_text(text)
    assert registry.verify_chain()["valid"] is False


def test_preview_is_loopback_only_and_not_auto_started():
    spec = make_spec("Create a demo", "Demo")
    preview = preview_descriptor(spec)
    assert preview["host"] == "127.0.0.1"
    assert preview["url"].startswith("http://127.0.0.1:")
    assert preview["auto_started"] is False
    assert preview["production"] is False


def test_static_web_template_has_no_external_dependencies(tmp_path: Path, policy):
    spec = make_spec("Create a local landing page", "Local Page", "static-web")
    ws = SovereignWorkspace(tmp_path, policy)
    write_project(ws, spec, deterministic_project(spec))
    project = tmp_path / spec.project_dir
    assert (project / "index.html").exists()
    assert DependencyGuard(policy).check(project)["passed"] is True
    assert StaticSecurityScanner(policy).scan(project)["passed"] is True

def test_factory_write_is_transactional_on_mid_write_denial(tmp_path: Path, policy):
    spec = make_spec("Create a demo", "Atomic Demo")
    ws = SovereignWorkspace(tmp_path, policy)
    project = tmp_path / spec.project_dir
    project.mkdir(parents=True)
    (project / "z-existing.txt").write_text("original")
    files = {"a-new.txt": "new", "z-existing.txt": "replacement"}
    with pytest.raises(GovernanceViolation):
        write_project(ws, spec, files, overwrite=False, confirmed=False)
    assert not (project / "a-new.txt").exists()
    assert (project / "z-existing.txt").read_text() == "original"
