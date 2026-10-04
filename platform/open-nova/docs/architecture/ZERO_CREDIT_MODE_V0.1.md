# ADR / Architecture Note — Zero-Credit Mode v0.1

## Status
Accepted for bootstrap into ResonanceAppDev.

## Decision
ResonanceAppDev shall implement a sovereign local execution path in which core development capability does not depend on paid third-party AI credits.

## Invariants

1. Local inference is the default execution path.
2. External AI is denied in Zero-Credit Mode.
3. Governance policy is loaded before model execution.
4. Model calls produce append-only receipts.
5. High-impact actions remain human-gated.
6. Projects must remain portable as ordinary source code and data.
7. Governance files are protected from silent autonomous modification.
8. Failure of an external provider must never prevent local project access, source editing, testing, or export.

## v0.1 Boundary

Included:
- local model runtime
- local controller API
- governance preflight
- execution receipts
- zero-credit verification

Not yet included:
- autonomous filesystem mutation
- coding-agent sandbox
- test runner orchestration
- Git commit automation
- database provisioning
- deployment controller
- GUI builder

Those enter v0.2+ only after v0.1 passes locally.
