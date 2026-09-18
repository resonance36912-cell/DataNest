#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import shlex
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API = os.environ.get("PODMAN_API_URL", "http://ronsas-podman-api:2375").rstrip("/")
API_V = f"{API}/v1.40"
IMAGE = "docker.io/library/postgres:17-alpine"
MARKER = "GOVERNANCE_RUNTIME_VERIFY=PASS"


def request(method: str, path: str, payload: object | None = None, timeout: int = 120) -> bytes:
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = Request(f"{API_V}{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Podman API {method} {path} failed: HTTP {exc.code}: {body}"
        ) from exc
    except URLError as exc:
        raise RuntimeError(f"Podman API unavailable for {method} {path}: {exc}") from exc


def get_json(path: str) -> dict:
    raw = request("GET", path)
    return json.loads(raw.decode("utf-8"))


def logs(container: str) -> str:
    raw = request(
        "GET",
        f"/containers/{container}/logs?stdout=true&stderr=true&tail=all",
    )
    return raw.decode("utf-8", errors="replace").replace("\x00", "")


def main() -> int:
    workspace = os.environ.get("GITHUB_WORKSPACE")
    runner_container = os.environ.get("HOSTNAME") or os.environ.get(
        "RUNNER_CONTAINER_NAME"
    )
    if not workspace or not runner_container:
        raise RuntimeError(
            "GITHUB_WORKSPACE and runner container identity are required"
        )
    if not workspace.startswith("/runner-work/"):
        raise RuntimeError(f"unexpected sovereign workspace path: {workspace}")

    runner = get_json(f"/containers/{runner_container}/json")
    work_mount = next(
        (
            mount
            for mount in runner.get("Mounts", [])
            if mount.get("Destination") == "/runner-work"
        ),
        None,
    )
    if not work_mount or not work_mount.get("Name"):
        raise RuntimeError("sovereign runner /runner-work named volume was not found")
    work_volume = work_mount["Name"]

    run_id = re.sub(
        r"[^A-Za-z0-9_.-]", "-", os.environ.get("GITHUB_RUN_ID", "local")
    )
    attempt = re.sub(
        r"[^A-Za-z0-9_.-]", "-", os.environ.get("GITHUB_RUN_ATTEMPT", "1")
    )
    name = f"ronsas-governance-{run_id}-{attempt}"

    prep = f"""
set -eu
INIT=/docker-entrypoint-initdb.d
WORKSPACE={shlex.quote(workspace)}
mkdir -p "$INIT"
cp "$WORKSPACE/scripts/verify-governance-bootstrap.sql" "$INIT/01-bootstrap.sql"
cp "$WORKSPACE/supabase/migrations/20260916090000_governance_workspace_core.sql" "$INIT/02-governance-core.sql"
cp "$WORKSPACE/supabase/migrations/20260916114000_harden_governance_client_grants.sql" "$INIT/03-governance-hardening.sql"
cat > "$INIT/04-migration-history.sql" <<'SQL'
INSERT INTO supabase_migrations.schema_migrations(version)
VALUES ('20260916090000'), ('20260916114000')
ON CONFLICT (version) DO NOTHING;
SQL
cp "$WORKSPACE/scripts/verify-governance-db.sql" "$INIT/05-verify-governance.sql"
printf '%s\n' '\\echo GOVERNANCE_RUNTIME_VERIFY=PASS' > "$INIT/06-pass.sql"
exec /usr/local/bin/docker-entrypoint.sh postgres
"""

    pull_qs = urlencode(
        {"fromImage": "docker.io/library/postgres", "tag": "17-alpine"}
    )
    request("POST", f"/images/create?{pull_qs}", timeout=300)

    try:
        request("DELETE", f"/containers/{name}?force=true&v=true", timeout=30)
    except RuntimeError as exc:
        if "404" not in str(exc):
            raise

    body = {
        "Image": IMAGE,
        "Env": ["POSTGRES_PASSWORD=postgres", "POSTGRES_DB=postgres"],
        "Entrypoint": ["/bin/sh", "-lc"],
        "Cmd": [prep],
        "HostConfig": {"Binds": [f"{work_volume}:/runner-work:rw"]},
    }
    create_qs = urlencode({"name": name})
    created = json.loads(
        request("POST", f"/containers/create?{create_qs}", body).decode("utf-8")
    )
    container_id = created["Id"]

    try:
        request("POST", f"/containers/{container_id}/start")
        deadline = time.time() + 150
        last_logs = ""
        while time.time() < deadline:
            state = get_json(f"/containers/{container_id}/json").get("State", {})
            last_logs = logs(container_id)
            if MARKER in last_logs:
                print(MARKER)
                return 0
            if not state.get("Running", False):
                exit_code = state.get("ExitCode")
                print(last_logs[-12000:])
                raise RuntimeError(
                    "governance database container exited before verification "
                    f"marker (exit={exit_code})"
                )
            time.sleep(2)

        print(last_logs[-12000:])
        raise RuntimeError("timed out waiting for governance verification marker")
    finally:
        try:
            request(
                "DELETE",
                f"/containers/{container_id}?force=true&v=true",
                timeout=30,
            )
        except Exception as cleanup_error:
            print(
                f"warning: governance container cleanup failed: {cleanup_error}",
                file=sys.stderr,
            )


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"GOVERNANCE_RUNTIME_VERIFY=FAIL {exc}", file=sys.stderr)
        raise SystemExit(1)
