# CP-20261004 — DataNest consolidation into Resonance-AppDev

Status: PREPARED / WAITING FOR SOURCE ACCESS RESTORATION

## Canonical resume trigger

`Resonance-AppDev/resonance-hub → PR #144 governance charter → restore DataNest-Supository access → complete ALL source inventory + exact HEAD SHAs → capture dependencies + rollback checkpoints → protect resonance-hub/main + verify required reviews/checks → clear machine-readable pre-transfer hard stops → transfer Mirror-DataNest rehearsal → validate → reconcile DataNest PR/governance state → clear canonical hard stops → transfer DataNest → rebind integrations/domains → verify transferred-repo governance → acceptance certification`

## Prepared artifacts

- `docs/consolidation/datanest-resonance-appdev-consolidation-plan.md`
- `docs/consolidation/repository-transfer-manifest.yaml`
- `docs/consolidation/REPOSITORY_AUTHORITY_MATRIX.md`

## Verified target state at preparation

- Target organization: `Resonance-AppDev`
- Existing target repository: `Resonance-AppDev/resonance-hub`
- Active Resonance identity has admin/push authority on `resonance-hub`.
- `resonance-hub/main` at preparation: `aa2adacb1dfef869f8e011528ad5ed9bfeabb38a`.
- Main branch was not branch-protected at preparation time; CODEOWNERS ownership exists and must not be treated as equivalent to protected-main enforcement.
- Protected `resonance-hub/main` with required reviews/checks is now a **hard pre-transfer gate before the Mirror rehearsal**.

## Known source state

- `DataNest-Supository` API/admin access is currently unavailable because the source identity is suspended/invalid.
- Known source repositories:
  - `DataNest-Supository/DataNest`
  - `DataNest-Supository/Mirror-DataNest`
- Known DataNest main ref before preparation: `afd2ce44e9150eceb0b6b254bec58aa4476e81d5`.
- Known PR #469 head: `c581e0393aad6b3825e5c86eca749eacbc88669e`; live approval/thread state must be re-read after source access is restored.

## Transfer semantics

Native GitHub repository transfer is the preferred migration mechanism because it preserves repository history and supported GitHub repository metadata. It does **not** remove the need for explicit revalidation of Pages/custom domains, authentication-bound configuration, workflows, organization policy, deployments/environments, external integrations/webhooks, OAuth callbacks, and hard-coded repository references.

The rollback posture is **staged, checkpointed, and operationally reversible within a controlled rollback window**; rollback must not be assumed trivial because external relationships may require explicit restoration.

## Required next actions after access restoration

1. List **all** repositories owned by `DataNest-Supository`; update the transfer manifest with every repository, exact repository identity, visibility, authority classification, and exact default-branch/HEAD SHA.
2. Inventory open PRs/issues, unresolved review threads, tags/releases, branch protections/rulesets, Pages/custom domains, Actions environments, integrations and deployment dependencies.
3. Capture rollback checkpoints and backup/ref evidence before any repository transfer.
4. Do not record secret values; record only names/dependencies needed for migration.
5. Verify `Resonance-AppDev/<repo>` target names are free and organization transfer policy permits the move.
6. Enable and verify protected-main governance on `Resonance-AppDev/resonance-hub`, including required reviews/checks, **before** transferring Mirror-DataNest.
7. Update machine-readable hard-stop fields in `repository-transfer-manifest.yaml` only when supported by evidence. A false or missing required hard stop blocks transfer.
8. Transfer `Mirror-DataNest` only when every pre-transfer hard stop is true; validate redirects, workflows, R&D Test Mode, Pages/custom domain, permissions, governance, integrations, and rollback evidence.
9. Re-read PR #469 and any other DataNest governance work. Do not transfer/merge around stale approvals, head drift, or unresolved material review findings.
10. Transfer canonical `DataNest` only after Mirror validation passes and every canonical-transfer hard stop is true.
11. Update cross-repository links/remotes, Pages/custom-domain configuration, badges, workflows, authentication/integration dependencies and deployments to the `Resonance-AppDev` namespace.
12. Apply/verify branch/ruleset governance on transferred repositories.
13. Run end-to-end governance acceptance and record certification evidence.

## Machine-readable hard stop

`docs/consolidation/repository-transfer-manifest.yaml` is the transfer-control source for automated or scripted checks.

At this checkpoint:

- `any_transfer_allowed: false`
- `mirror_transfer_allowed: false`
- `datanest_transfer_allowed: false`

These values must remain false while any required hard-stop field is false or missing.

## Stop conditions

Stop and require explicit governance review if:

- source access is not restored with verified administrator authority,
- complete source inventory with exact HEAD/default-branch SHAs is missing,
- any source repository lacks an authority-domain classification,
- deployment/configuration dependencies or rollback checkpoints are incomplete,
- `resonance-hub/main` is not protected with required reviews/checks before Mirror rehearsal,
- source history or refs do not match the frozen inventory,
- repository-name collisions exist,
- transfer would alter repository visibility or billing unexpectedly,
- Pages/custom-domain ownership cannot be safely rebound,
- any critical workflow/integration cannot be mapped,
- an in-flight governance PR has a new head or unresolved material review finding,
- any machine-readable required hard stop is false or missing,
- GitHub Support requires a migration route other than native transfer.

No repository transfer, deletion, archival, history rewrite, production deployment, or PR #144 merge was performed by this checkpoint.
