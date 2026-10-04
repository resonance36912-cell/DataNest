from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .agent import GovernanceViolation, SovereignWorkspace


@dataclass
class OriginalFile:
    relative: str
    existed: bool
    content: bytes | None


def collect_project_context(project: Path, max_files: int = 40, max_total_chars: int = 120_000) -> str:
    ignored = {".git", "node_modules", ".venv", "venv", "dist", "build", "__pycache__"}
    chunks: list[str] = []
    total = 0
    count = 0
    for path in sorted(project.rglob("*")):
        if count >= max_files or total >= max_total_chars:
            break
        if path.is_dir() or any(part in ignored for part in path.parts):
            continue
        try:
            if path.stat().st_size > 100_000:
                continue
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        rel = str(path.relative_to(project)).replace("\\", "/")
        block = f"\n--- FILE: {rel} ---\n{text[:20000]}\n"
        if total + len(block) > max_total_chars:
            break
        chunks.append(block)
        total += len(block)
        count += 1
    return "".join(chunks)


def parse_repair_proposal(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if len(lines) >= 3 and lines[-1].strip() == "```":
            text = "\n".join(lines[1:-1])
            if text.lstrip().startswith("json"):
                text = text.lstrip()[4:].lstrip("\n")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise GovernanceViolation("Local repair model did not return valid JSON.") from exc
    if not isinstance(data, dict) or not isinstance(data.get("changes"), list):
        raise GovernanceViolation("Repair proposal must contain a changes array.")
    if len(data["changes"]) > 12:
        raise GovernanceViolation("Repair proposal exceeds the 12-file change limit.")
    for item in data["changes"]:
        if not isinstance(item, dict) or not isinstance(item.get("path"), str) or not isinstance(item.get("content"), str):
            raise GovernanceViolation("Each repair change must contain string path and content fields.")
    return data


def apply_transactional_repairs(
    ws: SovereignWorkspace,
    project_relative: str,
    proposal: dict[str, Any],
    originals: dict[str, OriginalFile],
) -> list[dict[str, Any]]:
    project_prefix = project_relative.replace("\\", "/").strip("/") + "/"
    project_root = ws.resolve(project_relative)
    applied: list[dict[str, Any]] = []
    for item in proposal["changes"]:
        raw_path = item["path"].replace("\\", "/").lstrip("/")
        relative = raw_path if raw_path.startswith(project_prefix) else project_prefix + raw_path
        target = ws.resolve(relative)
        try:
            target.relative_to(project_root)
        except ValueError as exc:
            raise GovernanceViolation("Repair path escaped the target project.") from exc
        if relative not in originals:
            originals[relative] = OriginalFile(relative, target.exists(), target.read_bytes() if target.exists() else None)
        applied.append(ws.write_file(relative, item["content"], overwrite=target.exists(), confirmed=True))
    return applied


def rollback_transaction(ws: SovereignWorkspace, originals: dict[str, OriginalFile]) -> list[str]:
    restored: list[str] = []
    for relative, original in reversed(list(originals.items())):
        target = ws.resolve(relative)
        if original.existed:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(original.content or b"")
        elif target.exists():
            target.unlink()
        restored.append(relative)
    return restored
