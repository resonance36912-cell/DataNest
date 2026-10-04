# CP-RECONCILE-DATANEST-UX-20261003

## Purpose

Resume the October 3 DataNest workspace UX work from current protected `main` after the original stacked commercial branch was retired.

## Canonical base

- Repository: `DataNest-Supository/DataNest`
- Base branch: `main`
- Base commit: `66cc6ae19df375321772656c0cab12a7db341a03`
- Continuation branch: `work/reconcile-supository-ux-20261003`
- Review PR: #465
- Historical sources: PR #443 and PR #444
- Retired source: PR #442 was closed without merge and is not an authority for this continuation.
- Candidate head immediately before this checkpoint refresh: `337092f8fb4d507b300a1feb1596e51d87df9c09`.
- For resumption, use the branch tip / PR #465 head containing this checkpoint rather than assuming the preceding SHA is still current.

## Current identity boundary

Preserve the hierarchy already integrated on `main`:

- Resonance Sole Proprietorship — business/legal identity.
- Resonance AppDev — master brand.
- DataNest — governed operating/control platform.
- `RONSAS` and `Supository` remain technical/legacy identifiers only where retained by existing repository paths or implementation names.

This continuation does not reintroduce the retired public-commercial-root proposal. Current `main` keeps the authenticated DataNest root unless a separate, reviewed product decision changes that boundary.

## Compatibility method

Carry historical UX changes only when the current `main` blob is byte-for-byte equal to the historical pre-change blob, or when the change is a small current-main edit that can be reviewed directly. This prevents older PR content from overwriting newer DataNest capabilities.

## Safe carry-forward in this candidate

- `src/components/platform/GlobalNavigation.tsx`
  - restore the working workspace finder callback;
  - add group descriptions and clearer disclosure affordances;
  - add explicit button types.
- `src/components/platform/PlatformShell.tsx`
  - retain the optional `navigationOpen` accessibility hook without changing default behavior.
- `src/components/AdminRndModeToggle.tsx`
  - improve R&D Test Mode busy-state handling and live status announcements.
- `src/components/AdminRndModeToggle.module.css`
  - improve touch targets, status readability and focus visibility.
- `src/app/supository-ux.css`
  - retain responsive/navigation accessibility overrides as an internal legacy-named stylesheet.
- `src/app/layout.tsx`
  - load the UX override stylesheet after the current cinematic shell styles while preserving all current metadata and runtime configuration.
- `tests/browser/navigation-reconciliation.spec.ts`
  - verify the current authenticated-root workspace finder / deep-link flow;
  - verify R&D Test Mode busy-state and live failure announcement behavior without depending on the retired `/workspace/` route.
- `.github/workflows/pr-verification.yml`
  - include the reconciliation regression in protected-main browser verification.

## Explicitly not carried forward yet

`src/components/DataNestApp.tsx` has materially evolved since the historical branch. Do not replace it with the old blob. The remaining mobile navigation dialog/focus-trap/focus-restoration delta requires a surgical reconciliation against the current file.

The old PR #444 browser specification is not transplanted because it was adapted to the retired `/workspace/` route boundary. The replacement regression in this candidate targets the current authenticated-root architecture and intentionally excludes the still-pending mobile-dialog assertions.

## Verification and promotion

This checkpoint is a continuation trigger, not release authority.

Before merge to `main`:

1. Run protected-main PR verification against the exact candidate head.
2. Confirm TypeScript/build/unit/browser checks, including `navigation-reconciliation.spec.ts`.
3. Review failures against the exact head rather than retrying stale workflow runs.
4. Complete the remaining `DataNestApp` mobile accessibility reconciliation or explicitly scope it to a follow-up checkpoint.
5. Preserve Mirror-DataNest evidence/certification requirements where applicable.
6. Require human review and repository governance before protected-main synchronization.

## Resume instruction

Resume from PR #465 and its current branch tip. Inspect exact-head workflow results first. If the safe carry-forward and current-root regression pass, reconcile only the remaining mobile navigation accessibility hunks in the current `DataNestApp.tsx`; do not revive PR #442 or its retired route assumptions. If that surgical reconciliation is deferred, leave PR #465 scoped to the verified safe carry-forward and create the next checkpoint from its exact reviewed head.
