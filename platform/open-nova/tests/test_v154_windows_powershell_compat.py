from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _windows_launchers():
    yield from sorted((ROOT / "scripts").glob("*.ps1"))
    yield from sorted(ROOT.glob("*.cmd"))


def test_windows_launchers_are_ascii_safe_for_windows_powershell_51():
    files = list(_windows_launchers())
    assert files, "expected Windows launcher files"
    for path in files:
        raw = path.read_bytes()
        try:
            raw.decode("ascii")
        except UnicodeDecodeError as exc:
            raise AssertionError(f"{path.relative_to(ROOT)} is not ASCII-safe: {exc}") from exc


def test_one_click_launcher_has_no_smart_quote_or_dash_bytes():
    path = ROOT / "scripts" / "one-click-first-real.ps1"
    text = path.read_text(encoding="ascii")
    forbidden = ("\u2014", "\u2013", "\u2018", "\u2019", "\u201c", "\u201d")
    assert not any(ch in text for ch in forbidden)
    assert 'Upload this ZIP to ChatGPT for analysis of the real migration evidence.' in text
