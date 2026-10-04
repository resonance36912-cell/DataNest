from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


def test_v157_release_declares_runtime_resume_guards():
    release = json.loads((ROOT / "RELEASE.json").read_text(encoding="ascii"))
    assert release["version"] == "1.5.8"
    assert release["previous"] == "1.5.7-resume1"
    provisioning = release["provisioning"]
    assert provisioning["python_auto_install_via_winget"] is True
    assert provisioning["git_auto_install_via_winget"] is True
    assert provisioning["windowsapps_alias_rejected"] is True
    assert release["external_ai_default"] == "denied"
    assert release["production_cutover_automatic"] is False


def test_v157_provisioner_uses_exact_python_and_safe_winget_install():
    text = (ROOT / "scripts" / "provision-open-nova-once.ps1").read_text(encoding="ascii")
    assert "Python.Python.3.13" in text
    assert "Git.Git" in text
    assert "WindowsApps" in text
    assert "--only-binary=:all:" in text
    assert "--no-index" in text
    assert "source build" in text.lower()
    assert "https://www.python.org/downloads/release/python-31315/" in text
    assert "-ExecuteSupportedMigration" not in text


def test_v157_windows_scripts_are_ascii_safe():
    for pattern in ("*.ps1", "*.cmd"):
        for path in ROOT.rglob(pattern):
            path.read_text(encoding="ascii")
