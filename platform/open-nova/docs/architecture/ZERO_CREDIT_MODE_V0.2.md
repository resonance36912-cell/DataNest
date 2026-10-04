# Zero-Credit Mode v0.2 — Sovereign Coding Agent

## Purpose

v0.2 moves ResonanceAppDev from local AI planning to governed local development actions while preserving the rule that no third-party AI credit is required for core development.

## Trust boundary

The local model has **proposal authority**, not unrestricted machine authority. Only the Foundry Controller may perform governed filesystem writes, allowlisted tasks, Git commits, or Git reverts.

## Capabilities

- Repository-relative filesystem writes with traversal protection.
- Protected governance paths that the coding agent cannot modify.
- Overwrite confirmation gate.
- File-size limits.
- Allowlisted task execution without a shell.
- Execution timeout controls.
- Git commits with receipts.
- Reversible rollback through `git revert` rather than history rewriting.
- Deterministic natural-language application scaffolding that needs no external AI.
- Chained SHA-256 execution receipts for tamper evidence.

## API surface

- `POST /v1/plan` — local-model proposal.
- `POST /v1/files/write` — governed write.
- `POST /v1/tasks/run` — governance-allowlisted task.
- `POST /v1/git/commit` — reversible checkpoint.
- `POST /v1/git/revert` — explicit confirmed rollback.
- `POST /v1/scaffold` — deterministic app scaffold from an intent.
- `GET /v1/zero-credit-test` — verifies local runtime + external-provider denial.

## Security position

The controller runs inside Docker with `no-new-privileges`. It receives the repository as `/workspace`, governance policy read-only, and does not use `shell=True`. Arbitrary shell commands are not exposed through the API.

This is a development sandbox boundary, not yet a hardened multi-tenant execution environment. Untrusted third-party code should not be executed until a dedicated isolated runner is added in v0.3.
