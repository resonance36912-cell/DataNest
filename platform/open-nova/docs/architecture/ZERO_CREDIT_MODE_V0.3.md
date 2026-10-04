# Zero-Credit Mode v0.3 — Isolated Sovereign Execution Runner

## Objective

Separate **AI proposal authority** from **execution authority**. Generated or repaired code is never executed directly by the model. The governed controller validates the request and launches only an allowlisted task inside a constrained local container.

## Execution chain

`Intent → Governance Preflight → Dependency Guard → Security Scan → Isolated Build/Test → Local Repair Proposal → Governed Write → Re-scan → Re-test → Project-scoped Commit`

If all repair attempts fail:

`Failure → Restore Transaction Snapshot → Receipt → No Commit`

## Isolation controls

- Project paths limited to `apps/...`.
- No arbitrary shell endpoint.
- Exact task commands live in `governance/policy.yaml`.
- Container network is `none`.
- Image pulling at task runtime is `never`.
- Container root filesystem is read-only.
- All Linux capabilities are dropped.
- `no-new-privileges` is enforced.
- CPU, memory and PID limits are set.
- Only the selected project directory is bind-mounted writable.
- No host secrets are passed into the child process environment.
- The Foundry Controller is intentionally not given an unrestricted Docker socket.

## Repair governance

The local model must return JSON with a maximum of 12 complete file replacements per attempt. Deletes are denied in v0.3. The controller resolves every path through the governed workspace, protects governance/receipt paths, snapshots originals and restores model changes if the cycle does not achieve a passing state.

## Dependency governance

Python requirements are required to use exact `==` pins. Remote URL/VCS sources are denied. Node projects require a lockfile and floating versions such as `*` or `latest` are denied. No dependency installation occurs during isolated execution.

## Security scan

The baseline local scanner detects selected high-risk patterns including embedded private keys, common API-token shapes, `shell=True` subprocess execution and `os.system`. High/critical findings block execution. This is intentionally small and offline; broader SAST/SCA is a future hardening layer.

## Rootless preference

Podman rootless is the preferred engine. Docker remains supported where required, but v0.3 never solves container access by handing an AI-facing controller unrestricted access to the Docker daemon socket.
