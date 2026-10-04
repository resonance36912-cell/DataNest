from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


def test_v156_release_consolidates_zero_extraction_and_python313():
    release = json.loads((ROOT / "RELEASE.json").read_text(encoding="ascii"))
    assert release["version"] == "1.5.8"
    assert release["previous"] == "1.5.7-resume1"
    assert release["external_ai_default"] == "denied"
    assert release["production_cutover_automatic"] is False
    assert release["provisioning"]["supported_python"] == "3.13"
    assert release["provisioning"]["binary_wheels_only"] is True
    assert release["provisioning"]["source_builds_allowed"] is False
    assert release["windows_handoff"]["manual_extract_all_required"] is False
    assert release["windows_handoff"]["diagnostic_transcript_written"] is True


def test_v156_start_launcher_waits_for_real_result_and_logs_failures():
    text = (ROOT / "00-START-OPEN-NOVA.cmd").read_text(encoding="ascii")
    assert 'ResonanceAppDev_ZeroCredit_v1.5.8*.zip' in text
    assert '$releaseVersion = "1.5.8"' in text
    assert "Start-Transcript" in text
    assert "scripts\\verify-build-manifest.ps1" in text
    assert "Expand-Archive" in text
    assert "call \"" in text
    assert "$LASTEXITCODE" in text
    assert "-ExecuteSupportedMigration" not in text
    assert "production cutover is disabled" in text.lower()


def test_v156_package_has_single_clear_start_file_and_offline_followup():
    assert (ROOT / "00-START-OPEN-NOVA.cmd").is_file()
    assert (ROOT / "START-HERE.txt").is_file()
    assert (ROOT / "OPEN-NOVA-FIRST-RUN.cmd").is_file()
    assert (ROOT / "OPEN-NOVA-OFFLINE.cmd").is_file()
    start = (ROOT / "START-HERE.txt").read_text(encoding="ascii")
    assert "00-START-OPEN-NOVA.cmd" in start
    assert "OPEN-NOVA-OFFLINE.cmd" in start


def test_v156_verifier_is_present_and_manifest_is_not_self_hashed():
    verifier = ROOT / "scripts" / "verify-build-manifest.ps1"
    assert verifier.is_file()
    text = verifier.read_text(encoding="ascii")
    assert "Get-FileHash" in text
    manifest = json.loads((ROOT / "BUILD_MANIFEST.json").read_text(encoding="utf-8"))
    paths = {entry["path"] for entry in manifest["files"]}
    assert "BUILD_MANIFEST.json" not in paths
