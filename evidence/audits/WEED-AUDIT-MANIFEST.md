# Weed consolidation audit manifest

Date: 2026-10-04
Purpose: evidence-preserving input to the DataNest / Resonance monorepo consolidation.

## Repository state

- `github/control`: clean `main` at `819b773a263c277693031d76c1b4d32542365fd7` (2026-09-26), tracking cached `origin/main`.
- `github/control-worker`: clean `main` at `31af5284ef0690f7079ff278791b90d211ea41f4` (2026-09-18). This commit is the merge-base/ancestor of current control; control is 613 commits ahead, so worker is not a separate source authority.
- `github/resonance-hub`: branch `ronsas/ealiophin-production` at `1cbc8b72f88c210c076c4a9f9edafb40e55414fc` with 8 staged paths and no unstaged working-tree diff.

## Preserved Hub staged paths

- `.gitignore`
- `src/lib/entitlement.functions.ts`
- `src/routes/api/public/updates/atom.ts`
- `src/routes/api/public/updates/rss.ts`
- `src/routes/governance_.workspace.tsx`
- `src/routes/myify.tsx`
- `src/styles.css`
- `vite.local.config.ts`

## Safety artifacts

- `RONSAS-control.bundle` SHA-256 `7672543977E5B9AD04DB84E06889C5D6869362E6BFB1CEE46D03B6D99B405D08`
- `RONSAS-control-worker.bundle` SHA-256 `FEB7BAABAA092FB9D807BB6852C9F51F31EEB40F36FF53F837B87484B66D4042`
- `resonance-hub-Weed.bundle` SHA-256 `6B77D053205DF25742046F2B5F26D1AFF60FBC2CFE19EAC4DE48AE37829780FE`
- `resonance-hub-Weed-staged.patch` SHA-256 `1EA61A7623E2BFD80DC62DF127183D3FD55A388883C6EE47FF0E2EE46E32424C`
- `resonance-hub-Weed-working.patch` is empty (SHA-256 of empty file), confirming no unstaged diff at capture.

## Disposition

Treat the clean control checkout as the current Weed-side RONSAS reference. Do not create a separate monorepo application from `control-worker`; preserve its history as an archival/ref input only. Preserve the Hub staged patch for reconciliation against the authoritative Hub line before any promotion. No checkout, reset, merge, rebase, clean, deletion, or remote rewrite was performed.

## Open Nova verification

- `C:\Users\iamas\Resonance\OpenNova\ResonanceAppDev_ZeroCredit_v1.5.5` is not itself a Git repository.
- `scripts\verify-build-manifest.ps1` was inspected before execution; it only validates paths, sizes and SHA-256 values against `BUILD_MANIFEST.json`.
- Verification completed successfully: **199 files verified**.
- `runtime\secrets` contains only `.gitkeep` on this node at audit time.
- Classify the verified source/config/docs/tests as a `platform/open-nova` candidate; do not import runtime state or future secret material as repository source.
