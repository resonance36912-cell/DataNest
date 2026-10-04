# DataNest local baseline validation — 2026-10-04

Baseline: `afd2ce44e9150eceb0b6b254bec58aa4476e81d5`
Governance worktree: `C:\Users\Ashley\Documents\GitHub\_worktrees\DataNest-local-alignment-20261004`
Governance branch: `governance/local-consolidation-alignment-20261004`

## Result

State: `LOCAL_SOURCE_VALIDATED_WITH_BASELINE_DRIFT`

This validation is evidence for consolidation planning only. It does not certify the source for transfer and clears no hard-stop gate.

## Passing controls

- `npm.cmd run check:contracts` — PASS. Canonical production contract validated.
- `npm.cmd run check:hub-alignment` — PASS. Resonance Hub ↔ DataNest authority alignment validated.
- `npm.cmd run branch-protection:verify` — PASS. Repository branch-protection tree definition validated locally.
- Targeted governance/Pages/owner/evidence unit set — **21/21 PASS**.

The first npm invocation through PowerShell was blocked by the local PowerShell execution policy because `npm.ps1` cannot run. Validation was rerun through `npm.cmd` without changing system policy; the project checks above then passed.

## Full unit-suite baseline drift

The full local unit suite is not completely green on this Windows checkout. A focused rerun of the failing files produced **35 tests: 24 pass, 11 fail**.

Failing expectations:

1. `CONDUCTOR coordinate and timeframe jobs share the same bounded trigger policy`
2. `Development Command production runtime fix restores service-role memory access and avoids ambiguous contribution ids`
3. `native protection reconciliation is isolated to manual execution`
4. `send-job-invite remains canonical, authenticated, and validated`
5. `production Pages release is environment-gated and no longer requires manual evidence IDs`
6. `Pages production does not embed Owner Test Mode authorization logic`
7. `Pages production uses the protected environment instead of Owner Test Mode checks`
8. `file worker production deployment is bound to an exact SHA and protected environment`
9. `governed Edge Function deployment treats timeframe as advisory`
10. `Pages workflow has a simple protected-main release path`
11. `Pages release verification uses the canonical database contract and current main SHA`

## Failure classification

Most workflow-source failures are consistent with cross-platform line-ending brittleness: tests match LF-only regex patterns while the Windows checkout supplies CRLF workflow text. The actual workflow output shown by the assertions contains the expected structural elements in several of these cases.

Two failures require separate source review rather than being assumed to be line-ending-only:

- Development Command runtime expectation: expected contribution-ID SQL shape does not match the frozen baseline source.
- CONDUCTOR trigger-policy expectation: the test received an empty source string for the expected workflow/source input.

These are pre-existing baseline validation findings. They MUST NOT be silently repaired inside the repository-transfer documentation branch.

## Consolidation consequence

- The local frozen source is sufficient for dependency inventory, history comparison, authority mapping and deterministic rebind planning.
- It is not sufficient by itself for migration certification.
- No failed baseline assertion is attributed to the migration because no migration code has been applied.
- Baseline drift must be reconciled in a separately governed remediation change or proven irrelevant/stale against restored live GitHub state before canonical transfer certification.
- Mirror source remains unavailable locally, so Mirror rehearsal evidence is still missing.

## Hard-stop state

- `any_transfer_allowed: false`
- `mirror_transfer_allowed: false`
- `datanest_transfer_allowed: false`

## Next evidence trigger

Restore verified source GitHub administration and inventory the live source estate; compare live source HEAD and workflow state against this frozen local baseline; reconcile baseline drift and PR #469 governance; then proceed to Mirror rehearsal only after all pre-transfer gates are evidenced true.
