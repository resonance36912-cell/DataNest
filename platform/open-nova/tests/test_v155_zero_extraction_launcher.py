from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


def test_v155_release_metadata_and_governance_boundary():
    release = json.loads((ROOT / "RELEASE.json").read_text(encoding="ascii"))
    assert release["version"] == "1.5.8"
    assert release["previous"] == "1.5.7-resume1"
    assert release["external_ai_default"] == "denied"
    assert release["production_cutover_automatic"] is False
    assert release["windows_handoff"]["manual_extract_all_required"] is False
    assert release["windows_handoff"]["manifest_verified_before_launch"] is True


def test_v155_start_launcher_supports_zip_view_and_extracted_folder():
    text = (ROOT / "00-START-OPEN-NOVA.cmd").read_text(encoding="ascii")
    assert "scripts\\one-click-first-real.ps1" in text
    assert "Expand-Archive" in text
    assert "System.Windows.Forms.OpenFileDialog" in text
    assert "ResonanceAppDev_ZeroCredit_v1.5.8*.zip" in text
    assert "Start-VerifiedOpenNova" in text
    assert "-ExecuteSupportedMigration" not in text


def test_v155_start_launcher_is_windows_powershell_51_ascii_safe():
    raw = (ROOT / "00-START-OPEN-NOVA.cmd").read_bytes()
    raw.decode("ascii")
    assert b":OPEN_NOVA_POWERSHELL" in raw
    assert b"production cutover disabled" in raw


def test_v155_manifest_verifier_checks_size_and_sha256():
    text = (ROOT / "scripts" / "verify-build-manifest.ps1").read_text(encoding="ascii")
    assert "BUILD_MANIFEST.json" in text
    assert "Get-FileHash" in text
    assert "SHA256" in text
    assert "unexpected size" in text
    assert "package verification failed" in text
