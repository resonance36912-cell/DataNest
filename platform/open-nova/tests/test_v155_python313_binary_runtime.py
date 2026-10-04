from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


def test_v155_release_declares_python313_binary_only_runtime():
    release = json.loads((ROOT / "RELEASE.json").read_text(encoding="utf-8"))
    assert release["version"] == "1.5.8"
    assert release["previous"] == "1.5.7-resume1"
    assert release["provisioning"]["supported_python"] == "3.13"
    assert release["provisioning"]["binary_wheels_only"] is True
    assert release["provisioning"]["source_builds_allowed"] is False


def test_v155_provisioning_forces_python313_and_binary_wheels():
    text = (ROOT / "scripts" / "provision-open-nova-once.ps1").read_text(encoding="ascii")
    assert '$requiredPython = "3.13"' in text
    assert '@("-3.13")' in text
    assert "--only-binary=:all:" in text
    assert "wheelhouse-download-staging" in text
    assert "Do not disable Smart App Control" in text


def test_v155_one_click_rejects_wrong_or_incomplete_venv():
    text = (ROOT / "scripts" / "one-click-first-real.ps1").read_text(encoding="ascii")
    assert '$runtimeVersion -eq "3.13"' in text
    assert "import fastapi, uvicorn, httpx, pydantic, yaml, pytest" in text
    assert "if (-not $runtimeReady)" in text


def test_v155_repair_launcher_is_ascii_and_no_security_disable():
    path = ROOT / "REPAIR-OPEN-NOVA-RUNTIME.cmd"
    text = path.read_text(encoding="ascii")
    assert "provision-open-nova-once.ps1" in text
    assert "Smart App Control was not disabled" in text
    assert "Set-MpPreference" not in text
