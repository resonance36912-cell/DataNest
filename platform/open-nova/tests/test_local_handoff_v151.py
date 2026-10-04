from pathlib import Path
import subprocess

import pytest

from foundry_controller.app.local_handoff import (
    RepoCandidate,
    discover_git_repositories,
    repository_provenance,
    select_repository,
)


def init_repo(path: Path, filename: str = "README.md") -> str:
    path.mkdir(parents=True)
    subprocess.run(["git", "init", "-q", str(path)], check=True)
    subprocess.run(["git", "-C", str(path), "config", "user.email", "test@example.invalid"], check=True)
    subprocess.run(["git", "-C", str(path), "config", "user.name", "Test"], check=True)
    (path / filename).write_text("ok\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(path), "add", filename], check=True)
    subprocess.run(["git", "-C", str(path), "commit", "-qm", "init"], check=True)
    return subprocess.check_output(["git", "-C", str(path), "rev-parse", "HEAD"], text=True).strip()


def test_repository_provenance_uses_repo_root(tmp_path):
    repo = tmp_path / "ResonanceAppDev"
    sha = init_repo(repo)
    nested = repo / "src" / "deep"
    nested.mkdir(parents=True)
    root, commit = repository_provenance(nested)
    assert root == repo.resolve()
    assert commit == sha


def test_discovery_prefers_resonanceappdev(tmp_path):
    init_repo(tmp_path / "misc")
    target = tmp_path / "ResonanceAppDev"
    init_repo(target)
    candidates = discover_git_repositories([tmp_path], max_depth=3)
    selected = select_repository(candidates)
    assert selected.path == target.resolve()
    assert selected.score == 100


def test_discovery_prunes_nested_build_noise(tmp_path):
    target = tmp_path / "reson8-life"
    init_repo(target)
    noise = tmp_path / "node_modules" / "fake"
    init_repo(noise)
    candidates = discover_git_repositories([tmp_path], max_depth=4)
    names = {c.name for c in candidates}
    assert "reson8-life" in names
    assert "fake" not in names


def test_selection_rejects_ambiguous_equal_candidates(tmp_path):
    a = RepoCandidate(tmp_path / "a", "alpha", 0, "a" * 40)
    b = RepoCandidate(tmp_path / "b", "beta", 0, "b" * 40)
    with pytest.raises(RuntimeError, match="Multiple Git repositories"):
        select_repository([a, b])


def test_selection_accepts_single_generic_candidate(tmp_path):
    c = RepoCandidate(tmp_path / "only", "only", 0, "c" * 40)
    assert select_repository([c]) == c
