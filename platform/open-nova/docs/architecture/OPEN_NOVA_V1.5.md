# Resonance Open Nova v1.5 — First Real Repository Execution

v1.5 consolidates the workstation bridge, real-source ingestion, deterministic provider migration and cutover evidence into a single governed execution layer.

## Core flow

`Local Git repo -> assess -> clean tracked snapshot -> governed admission -> SBOM/integrity -> baseline -> rollback checkpoint -> supported deterministic migration -> runtime/regression/preview gates -> local certification`

## Hard boundaries

- Original repository is never modified.
- Admission is copy-only and never overwrites an existing staged or managed app.
- Dirty worktrees, tracked secrets, symlinks/reparse points, submodules and unresolved Git LFS block automatic admission.
- Absolute repository paths and remote URLs are not persisted.
- Network access and external AI are denied in the v1.5 real-execution policy.
- Provider rewrites require a current baseline and verified rollback checkpoint.
- Unsupported provider semantics are blockers, not model guesses.
- Production cutover is not available from the v1.5 execution pack.
- Operational certification depends on real local runner, backend, service, regression and preview evidence.

## Evidence

The execution pack writes controller-owned evidence under `runtime/real-execution/<app-id>/`. Each record includes a canonical SHA-256 integrity hash and may be re-verified through the API or operator script.
