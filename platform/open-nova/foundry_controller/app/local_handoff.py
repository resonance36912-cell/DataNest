from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

PRUNE_DIRS = {
    ".git", "node_modules", ".venv", "venv", ".resonance-venv", "dist", "build",
    ".next", ".cache", "coverage", ".pytest_cache", "__pycache__",
}

@dataclass(frozen=True)
class RepoCandidate:
    path: Path
    name: str
    score: int
    commit_sha: str


def _run_git(repo: Path, *args: str) -> str:
    cp = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        shell=False,
    )
    return cp.stdout.strip()


def repository_root(path: Path) -> Path:
    path = path.expanduser().resolve()
    root = Path(_run_git(path, "rev-parse", "--show-toplevel")).resolve()
    return root


def repository_provenance(path: Path) -> tuple[Path, str]:
    root = repository_root(path)
    commit_sha = _run_git(root, "rev-parse", "HEAD")
    return root, commit_sha


def score_name(name: str) -> int:
    n = name.lower()
    if n == "resonanceappdev":
        return 100
    if n in {"reson8-life", "reson8.life"}:
        return 95
    if "resonanceappdev" in n:
        return 92
    if "reson8" in n:
        return 85
    if "resonance" in n:
        return 80
    return 0


def default_search_roots() -> list[Path]:
    roots: list[Path] = []
    home = Path.home()
    for p in (
        home / "Desktop",
        home / "Documents",
        home / "source",
        home / "repos",
        Path("C:/Projects"),
        Path("C:/Repos"),
        Path("C:/Git"),
    ):
        if p.exists():
            roots.append(p.resolve())
    return roots


def discover_git_repositories(roots: Iterable[Path], max_depth: int = 4) -> list[RepoCandidate]:
    found: dict[Path, RepoCandidate] = {}
    for raw_root in roots:
        root = Path(raw_root).expanduser()
        if not root.exists() or not root.is_dir():
            continue
        root = root.resolve()
        for current, dirs, files in os.walk(root):
            cur = Path(current)
            try:
                rel_parts = cur.relative_to(root).parts
            except ValueError:
                continue
            depth = len(rel_parts)
            dirs[:] = [d for d in dirs if d not in PRUNE_DIRS]
            if depth >= max_depth:
                dirs[:] = []
            is_repo = (cur / ".git").is_dir() or (cur / ".git").is_file()
            if not is_repo:
                continue
            try:
                repo, commit = repository_provenance(cur)
            except Exception:
                dirs[:] = []
                continue
            found[repo] = RepoCandidate(repo, repo.name, score_name(repo.name), commit)
            dirs[:] = []
    return sorted(found.values(), key=lambda c: (-c.score, c.name.lower(), str(c.path).lower()))


def select_repository(candidates: list[RepoCandidate]) -> RepoCandidate:
    if not candidates:
        raise RuntimeError("No local Git repository candidates were found.")
    ranked = sorted(candidates, key=lambda c: (-c.score, c.name.lower(), str(c.path).lower()))
    if len(ranked) == 1:
        return ranked[0]
    top = ranked[0]
    second = ranked[1]
    if top.score > 0 and top.score > second.score:
        return top
    labels = ", ".join(c.name for c in ranked[:8])
    raise RuntimeError(
        "Multiple Git repositories are plausible and no unique Resonance repository can be selected safely. "
        f"Pass an explicit repository path. Candidates: {labels}"
    )
