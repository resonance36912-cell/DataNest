from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


def test_v153_release_metadata():
    release = json.loads((ROOT / "RELEASE.json").read_text(encoding="utf-8"))
    assert release["version"] == "1.5.5-oneclick1"
    assert release["previous"] == "1.5.4-hotfix1"
    assert release["external_ai_default"] == "denied"
    assert release["production_cutover_automatic"] is False
    assert release["provisioning"]["network_downloads_silent"] is False
    assert release["provisioning"]["one_time_network_provisioning_requires_explicit_flag"] is True


def test_v153_first_run_launcher_is_explicit_provisioning():
    text = (ROOT / "OPEN-NOVA-FIRST-RUN.cmd").read_text(encoding="utf-8")
    assert "-AllowNetworkProvisioning" in text
    assert "one-click-first-real.ps1" in text


def test_v153_offline_launcher_has_no_network_flag():
    text = (ROOT / "OPEN-NOVA-OFFLINE.cmd").read_text(encoding="utf-8")
    assert "one-click-first-real.ps1" in text
    assert "-AllowNetworkProvisioning" not in text


def test_v153_provisioning_download_requires_explicit_switch():
    text = (ROOT / "scripts" / "provision-open-nova-once.ps1").read_text(encoding="utf-8")
    assert "if (-not $AllowNetworkProvisioning)" in text
    assert "pip download" in text
    assert "--no-index" in text
    assert "wheelhouse-sha256.json" in text


def test_v153_openssl_no_longer_blocks_core_workstation():
    text = (ROOT / "scripts" / "open-nova-workstation.ps1").read_text(encoding="utf-8")
    assert "OpenSSL is not installed" in text
    assert 'throw "OpenSSL is required and was not found on PATH."' not in text
