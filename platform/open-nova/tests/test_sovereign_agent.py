from pathlib import Path

import pytest

from foundry_controller.app.agent import GovernanceViolation, SovereignWorkspace, deterministic_scaffold


@pytest.fixture
def policy():
    return {
        "execution": {"max_file_bytes": 10000, "max_command_seconds": 5},
        "protected_paths": ["governance/", ".env.sovereign", "runtime/receipts/"],
        "allowed_tasks": {"status": {"command": ["git", "status", "--short"]}},
    }


def test_protected_path_denied(tmp_path: Path, policy):
    ws = SovereignWorkspace(tmp_path, policy)
    with pytest.raises(GovernanceViolation):
        ws.write_file("governance/policy.yaml", "bad")


def test_path_escape_denied(tmp_path: Path, policy):
    ws = SovereignWorkspace(tmp_path, policy)
    with pytest.raises(GovernanceViolation):
        ws.write_file("../escape.txt", "bad")


def test_overwrite_requires_confirmation(tmp_path: Path, policy):
    ws = SovereignWorkspace(tmp_path, policy)
    ws.write_file("apps/demo/a.txt", "one")
    with pytest.raises(GovernanceViolation):
        ws.write_file("apps/demo/a.txt", "two", overwrite=True, confirmed=False)
    result = ws.write_file("apps/demo/a.txt", "two", overwrite=True, confirmed=True)
    assert result["overwritten"] is True


def test_deterministic_scaffold_needs_no_external_ai():
    files = deterministic_scaffold("Create a small inventory API", "Inventory Demo")
    assert "apps/inventory-demo/app.py" in files
    assert '"external_ai_required": false' in files["apps/inventory-demo/APP_SPEC.json"]
