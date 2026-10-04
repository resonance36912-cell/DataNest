# DataNest → Resonance-AppDev consolidation plan

Status: **PREPARED / NO TRANSFERS EXECUTED**  
Prepared: 2026-10-04  
Target ownership boundary: `Resonance-AppDev`

## Objective

Consolidate the Resonance application and DataNest repository estate under the `Resonance-AppDev` GitHub organization without collapsing distinct runtime, governance, and R&D responsibilities into one repository.

The target operating model is:

- `Resonance-AppDev/resonance-hub` — product/runtime repository and public Hub application.
- `Resonance-AppDev/DataNest` — governance, registry, certification, audit, and control-plane repository.
- `Resonance-AppDev/Mirror-DataNest` — R&D/test-mode mirror used for visual and functional validation before governed promotion.
- Any additional repositories owned by `DataNest-Supository` — inventory after source-account access is restored, classify by authority domain, then transfer individually under `Resonance-AppDev` unless an explicit exception is approved.

This is an **organization consolidation**, not a source-tree merge or monorepo conversion. Domain-level authority is defined by `REPOSITORY_AUTHORITY_MATRIX.md`.

## Current verified state

- `Resonance-AppDev/resonance-hub` is accessible with administrative permissions through the active Resonance identity.
- Hub default branch: `main`.
- Hub `main` at preparation: `aa2adacb1dfef869f8e011528ad5ed9bfeabb38a`.
- The Hub currently has CODEOWNERS-based governance, but its `main` branch is not protected at the GitHub branch level at preparation time.
- The `DataNest-Supository` GitHub identity is currently suspended/invalid for API access, so a complete source-repository inventory and transfer cannot yet be executed.
- Known source repositories include `DataNest-Supository/DataNest` and `DataNest-Supository/Mirror-DataNest`.
- Last verified DataNest refs before this preparation: `main` = `afd2ce44e9150eceb0b6b254bec58aa4476e81d5`; PR #469 head = `c581e0393aad6b3825e5c86eca749eacbc88669e` and remains a governance item to reconcile before canonical transfer.

## Transfer strategy

Use **GitHub native repository transfer** as the primary migration method once source access is restored. Do not replace it with a plain clone/push migration unless GitHub Support makes native transfer impossible.

Native transfer is preferred because it preserves repository history and supported GitHub repository metadata. **Pages/domains, authentication-bound configuration, workflows, organization policy, deployments, and external integrations require explicit post-transfer revalidation.** Existing repository URLs may redirect after transfer, but redirect behavior must not be treated as a substitute for integration testing, and GitHub Pages/custom-domain behavior requires separate verification.

### Transfer order

1. Approve this governance model through PR #144.
2. Restore `DataNest-Supository` access through GitHub appeal/reinstatement.
3. Inventory **every** repository owned by `DataNest-Supository`; capture exact repository identity, visibility, default branch and HEAD SHA, and freeze the inventory in `repository-transfer-manifest.yaml`.
4. Capture deployment/configuration dependencies and rollback checkpoints for every source repository before any transfer.
5. Validate `Resonance-AppDev` target permissions, repository-name availability, organization policies, billing/plan implications, Pages/custom-domain ownership, and Actions/security settings.
6. Create independent backup evidence for every source repository: default-branch SHA, all refs/tags, releases, open PRs/issues, branch/ruleset settings, Pages/custom-domain settings, Actions/environment names, webhook/deploy-key presence, and repository visibility.
7. **Enable and verify protected-main governance on `Resonance-AppDev/resonance-hub` before the Mirror rehearsal.** Required reviews/checks must be defined and tested; CODEOWNERS alone is not sufficient.
8. Transfer `Mirror-DataNest` first as the rehearsal only after all machine-readable pre-transfer hard stops are clear.
9. Validate redirects, workflows, Pages/custom-domain behavior, permissions, governance, R&D Test Mode integration, deployment dependencies, and rollback evidence.
10. Reconcile PR #469 and all other outstanding DataNest governance items. Any head drift, stale approval, or unresolved material review finding must be handled before canonical transfer.
11. Transfer `DataNest` only after the Mirror rehearsal passes and canonical-transfer gates are clear.
12. Rebind repository references, remotes, badges, workflows, deployment integrations, Pages/custom domains, authentication/integration dependencies, and cross-repository links to `Resonance-AppDev/*`.
13. Apply/verify transferred-repository branch/ruleset governance and required review/check policies.
14. Run end-to-end acceptance: Hub ↔ DataNest registration, Mirror R&D mode, Audit Optimizer, human approval, version certification, Pages/public routes, and canonical-to-Mirror synchronization.

## Non-negotiable governance rules

- Do not delete or archive the source repositories before successful transfer validation.
- Do not recreate repositories at the old `DataNest-Supository/<name>` locations during redirect/rollback validation.
- Do not force-push or rewrite protected/canonical history as part of consolidation.
- Do not merge DataNest runtime/governance code into `resonance-hub` merely to reduce repository count.
- Preserve DataNest as the governance/certification authority and Mirror-DataNest as the R&D validation surface.
- Preserve human-review approval for production synchronization.
- Any head change to an in-flight governance PR invalidates prior check/approval freshness and must be revalidated.
- No repository transfer may proceed while a machine-readable hard-stop condition in `repository-transfer-manifest.yaml` is false or incomplete.

## Readiness gates

A first/rehearsal transfer may proceed only when all of the following are true:

- Source GitHub access is restored and source administrator authority is verified.
- Target `Resonance-AppDev` ownership/admin authority and repository-creation/transfer permissions are verified.
- Complete DataNest repository inventory is captured with exact HEAD/default-branch SHAs.
- Authority-domain classification exists for every source repository.
- Deployment/configuration dependencies are mapped.
- Rollback checkpoints/evidence are captured.
- Target repository names are verified available.
- Backup/ref evidence is captured for every source repository.
- Open PRs/issues and unresolved review threads are inventoried.
- Pages/custom-domain and deployment dependencies are mapped.
- Actions secrets/environment names are inventoried without copying secret values into repository documentation.
- `resonance-hub/main` protected-main governance and required review/check policy are enabled and verified.
- Machine-readable transfer hard stops are all clear.

Canonical `DataNest` transfer additionally requires a successful Mirror rehearsal and reconciliation of outstanding DataNest governance items.

## Rollback posture

The consolidation is **staged, checkpointed, and operationally reversible within a controlled rollback window**. Transfer back may be technically possible, but rollback is not assumed to be trivial: redirects, Pages/domains, organization policy, application installations, environment authorization, external OAuth callbacks, workflows, deployments, and automation references may require explicit restoration. No old-location repository may be recreated during the validation window.

## Immediate blocker

The hard blocker to source-side execution is restoration of administrative access to `DataNest-Supository`. Preparation under `Resonance-AppDev` may continue while the appeal is pending, but no source transfer should be attempted through alternate identities or history-copy workarounds that would bypass repository governance/state.
