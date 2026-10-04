from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from foundry_controller.app.local_handoff import (  # noqa: E402
    RepoCandidate,
    default_search_roots,
    discover_git_repositories,
    repository_provenance,
    select_repository,
    score_name,
)


def api_json(method: str, url: str, body: dict | None = None, timeout: float = 15.0) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = resp.read().decode("utf-8")
        return json.loads(payload) if payload else {}


def choose_repo(explicit: str | None, roots: list[str]) -> RepoCandidate:
    if explicit:
        repo, commit = repository_provenance(Path(explicit))
        return RepoCandidate(repo, repo.name, score_name(repo.name), commit)
    search_roots = [Path(r) for r in roots] if roots else default_search_roots()
    return select_repository(discover_git_repositories(search_roots))


def main() -> int:
    p = argparse.ArgumentParser(description="Resonance Open Nova first-real local execution handoff")
    p.add_argument("--repository-path")
    p.add_argument("--search-root", action="append", default=[])
    p.add_argument("--app-id", default="reson8-life")
    p.add_argument("--api-base", default="http://127.0.0.1:8787")
    p.add_argument("--assess-only", action="store_true")
    p.add_argument("--execute-supported-migration", action="store_true")
    p.add_argument("--report-path")
    args = p.parse_args()

    try:
        api_json("GET", f"{args.api_base}/health", timeout=2.0)
    except Exception as exc:
        print(f"Open Nova control plane is not reachable at {args.api_base}: {exc}", file=sys.stderr)
        return 3

    try:
        candidate = choose_repo(args.repository_path, args.search_root)
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 4

    base = f"{args.api_base}/v1/real-execution/{args.app_id}"
    print(f"Selected repository: {candidate.name}")
    print(f"Git commit: {candidate.commit_sha}")
    print("Original repository will remain untouched.")

    try:
        assessment = api_json("POST", f"{base}/assess-repository", {
            "source_path": str(candidate.path),
            "confirmed": False,
        })
        if not assessment.get("ready_for_admission"):
            print(json.dumps(assessment, indent=2))
            print("Repository admission is blocked by the assessment.", file=sys.stderr)
            return 5

        result: dict = {"assessment": assessment}
        if not args.assess_only:
            result["admission"] = api_json("POST", f"{base}/admit-repository", {
                "source_path": str(candidate.path),
                "confirmed": True,
            })
            result["preparation"] = api_json("POST", f"{base}/prepare", {"confirmed": True})

            if args.execute_supported_migration:
                result["migration"] = api_json("POST", f"{base}/execute-supported", {"confirmed": True})

        readiness = api_json("GET", f"{base}/readiness")
        result["readiness"] = readiness
        if not args.assess_only:
            result["persisted_readiness"] = api_json(
                "POST", f"{base}/readiness-report", {"confirmed": True}
            )

        report = {
            "schema": "resonance-local-execution-handoff/v1",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "app_id": args.app_id,
            "repository_name": candidate.name,
            "git_commit_sha": candidate.commit_sha,
            "absolute_repository_path_recorded": False,
            "remote_url_recorded": False,
            "original_repository_modified": False,
            "supported_migration_executed": bool(args.execute_supported_migration),
            "result": result,
        }
        report_path = Path(args.report_path) if args.report_path else (
            ROOT / "exports" / "operator-reports" / f"{args.app_id}-local-handoff.json"
        )
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

        print(json.dumps(readiness, indent=2))
        print(f"Handoff report written to: {report_path}")
        print(f"Next action: {readiness.get('next_action', 'inspect_readiness')}")
        return 0
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        print(f"Open Nova rejected the operation: HTTP {exc.code}\n{body}", file=sys.stderr)
        return 6
    except Exception as exc:
        print(f"Local execution handoff failed: {exc}", file=sys.stderr)
        return 7


if __name__ == "__main__":
    raise SystemExit(main())
