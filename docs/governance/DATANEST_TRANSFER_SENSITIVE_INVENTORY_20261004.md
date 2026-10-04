# DataNest transfer-sensitive inventory — 2026-10-04

Baseline: `afd2ce44e9150eceb0b6b254bec58aa4476e81d5`
Local governance branch: `governance/local-consolidation-alignment-20261004`
Target owner: `Resonance-AppDev`
Target repository: `Resonance-AppDev/DataNest`

## Purpose

This inventory separates transfer-sensitive live references from immutable historical provenance. It is preparation evidence only; it does not authorize repository transfer, merge, owner rewrite, Pages cutover, or secret/integration mutation.

A local content scan of the frozen baseline found **471 matches** for `DataNest-Supository`. These matches MUST NOT be bulk-replaced.

## Classification

### A — Rebind after native transfer

Live owner/repository/routing references that must be revalidated and, where required, changed to `Resonance-AppDev` after the native repository transfer succeeds:

- `.github/CODEOWNERS` ownership entries.
- `.github/workflows/pages.yml` live GitHub Pages verification URLs, sitemap, robots, health, runtime-config and release-manifest checks.
- `.github/workflows/mirror-production-import.yml` Mirror repository URLs, Git remote, Actions evidence URLs and API repository paths.
- `.github/workflows/notify-mirror-canonical.yml` Mirror repository-dispatch destination.
- `.github/workflows/ui-owner-test-mode-expiry.yml` owner-bound public URL.
- `config/production-contract.json` owner/public-delivery identity.
- `config/repository-boundary.json` repository ownership boundary.
- `config/resonance-hub-integration.json` DataNest/Hub integration identity.
- `config/supository.catalog.json` current repository/catalog ownership records.
- RONSAS source-authority files under `apps/ronsas/**/RONSAS-SOURCE-AUTHORITY.json` where the value represents the current live repository rather than historical provenance.
- Tests that intentionally assert current owner, repository or Pages routing and must move with the runtime/config change.

### B — Revalidate; do not mechanically rewrite

External/auth-bound configuration that may remain logically identical but must be checked after owner transfer:

- GitHub Actions environments and environment approvals.
- Repository rulesets / classic branch protection and CODEOWNERS enforcement.
- GitHub App/installations, webhooks, repository dispatch permissions and OAuth callbacks.
- Pages build/deployment settings and the resulting `github.io` origin.
- Supabase project linkage and deployment bindings.
- Named secrets such as `DATANEST_GITHUB_ADMIN_TOKEN` and Mirror synchronization credentials. Record names/dependencies only; never copy secret values into governance evidence.
- Vercel/Railway/other retained integration metadata where present, even when deployment-disabled.

### C — Preserve immutable provenance

Do NOT rewrite owner names/URLs when they are evidence of what actually existed at the time:

- `.datanest/coordination/checkpoints/**` historical checkpoints.
- `evidence/**` signed/audit/release evidence and prior-run references.
- historical import snapshots and dated registry/source material.
- old release or workflow evidence URLs whose evidentiary meaning depends on the original repository owner.
- documentation passages that explicitly describe historical state rather than current routing.

If current-state documentation and historical evidence share a file, change only the current-state statements and preserve the historical record.

### D — Mirror hard stop

The local workspace currently contains `DataNest` and `DataNest-ci-check`, but no local `Mirror-DataNest` repository. DataNest contains active Mirror coupling in `mirror-production-import.yml` and `notify-mirror-canonical.yml`.

Therefore Mirror transfer/rebind validation cannot be certified from the local source estate yet. `mirror_transfer_allowed` and `datanest_transfer_allowed` remain false.

## PR #469 separation

Frozen canonical baseline: `afd2ce44e9150eceb0b6b254bec58aa4476e81d5`.

Pending PR #469/local candidate: `c581e0393aad6b3825e5c86eca749eacbc88669e`, five commits ahead of the frozen baseline. Its local commit lineage is accessibility/focus-boundary implementation, tests and coordination evidence. It is treated as pending product/governance work, not as migration machinery.

Do not merge, squash, rebase or silently absorb PR #469 merely to perform repository consolidation. Re-read its live review/approval/thread state after source GitHub access is restored.

## Deterministic post-transfer order

1. Verify source HEAD/history against the frozen inventory immediately before transfer.
2. Transfer `Mirror-DataNest` first only after its source is inventoried and its gates are true.
3. Validate Mirror redirects, Actions, Pages/public route, R&D Test Mode, permissions, dispatch/auth dependencies and rollback evidence.
4. Reconcile DataNest governance including PR #469 against the exact live head.
5. Transfer canonical `DataNest` only after canonical gates are true.
6. Rebind category A references in one governed change set.
7. Revalidate category B integrations without recording secret values.
8. Leave category C provenance intact.
9. Run owner/routing/unit/Pages/governance tests and capture evidence.
10. Certify the transferred repository only after the evidence set is complete.

## Current hard-stop result

- `any_transfer_allowed: false`
- `mirror_transfer_allowed: false`
- `datanest_transfer_allowed: false`

This inventory improves migration determinism but clears no transfer gate by itself.

## Frozen-baseline scan counts

The following counts were measured from tracked content at the local frozen baseline/worktree and are evidence for migration scope, not automatic replacement counts:

- `DataNest-Supository`: **471** matches.
- `DataNest-Supository/Mirror-DataNest`: **31** matches.
- `datanest-supository.github.io`: **121** matches.
- `Resonance-AppDev/resonance-hub`: **7** matches.
- `DATANEST_GITHUB_ADMIN_TOKEN`: **7** named dependency references.
- `MIRROR_SYNC_TOKEN`: **4** named dependency references.
- Supabase project identifier `sgqdmfgjbprsoqsmgigi`: **63** references; treat as external-service identity requiring validation, not an owner rename.

## PR #469 exact delta from frozen canonical baseline

`afd2ce44..c581e039` changes 6 files with 258 insertions and 8 deletions:

- adds `.datanest/coordination/checkpoints/CP-PR469-POST-466-A11Y.md`;
- modifies `.github/workflows/pr-verification.yml`;
- modifies `src/app/layout.tsx`;
- modifies `src/components/DataNestApp.tsx`;
- adds `src/components/platform/MobileNavigationA11yGuard.tsx`;
- modifies `tests/browser/navigation-reconciliation.spec.ts`.

This confirms PR #469 is separable accessibility/governance work and should remain outside the repository-transfer mechanics until its live GitHub review state can be verified.
