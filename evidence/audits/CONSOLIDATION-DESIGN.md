# DataNest / Resonance canonical monorepo consolidation design

Date: 2026-10-04
Status: audit-approved design; source consolidation must be executed on Ealiophin from preserved local repositories/bundles.

## Governing decision

Create one canonical repository while preserving functional authority boundaries:

- `apps/datanest`: governance/control plane, governed knowledge, certification, audit/transparency workflows.
- `apps/hub`: Resonance runtime/commercial front door and customer-facing application orchestration.
- `platform/ronsas`: sovereign runtime/control/operations, topology, workers, deployment and recovery controls; do not retain a second duplicate Hub application tree here.
- `platform/open-nova`: provider-neutral/zero-credit development and migration tooling; production cutover remains governed.
- `governance/rcgf`: constitutional governance framework, schemas, standards and templates.
- `packages/`: shared schemas/contracts/policy/UI only after exact duplicates are proven and extracted with tests.
- `ops/`: environment- and node-specific operators grouped by role; secrets/runtime state excluded.
- `evidence/`: migration manifests, source hashes, certification records and review artifacts; no credentials or production data.

## Source authority rules

1. Hub remains runtime/commercial authority.
2. DataNest remains governance authority; its database/RPC and privileged-function trust boundaries remain intact.
3. RONSAS control is reviewed as platform/control input, not as permission to overwrite Hub application source.
4. RCGF is governance policy/reference authority and must not be silently weakened by application code.
5. Worker nodes are not production authority and cannot promote directly.
6. External AI/model output remains evidence until validated/certified.
7. Existing dirty/staged branches, worktrees and optimization copies are review inputs, not automatic production merges.

## Canonical repository shape

```text
DataNest-Supository/
  apps/
    datanest/
    hub/
  platform/
    ronsas/
    open-nova/
  governance/
    rcgf/
    policies/
  packages/
    contracts/
    schemas/
    policy-engine/
    ui/
  ops/
    ealiophin/
    workers/
    deployment/
  evidence/
    migrations/
    audits/
    releases/
  docs/
    architecture/
    business/
    governance/
    operations/
  tests/
    integration/
    governance/
    topology/
  .gitlab-ci.yml
  package.json
  README.md
```

## Content that must not be copied as canonical source

- `.git` directories from nested repositories/worktrees.
- `node_modules`, `.next`, `.output`, `dist`, coverage/caches and generated dependency trees.
- `.env` files, private keys, tokens, Cloudflare tunnel credentials, local auth material or database contents.
- runtime logs, process state, ephemeral receipts and machine caches except redacted evidence explicitly admitted by governance.
- duplicate worktree folders as separate applications.
- stale worker mirrors as production source.

## Evidence-preserving treatment

- Preserve each original repository's complete history under namespaced legacy refs/bundles.
- Preserve uncommitted/staged work as binary patches and review branches.
- Preserve optimization/partial copies until content hashes and semantic diffs prove whether they contain unique work.
- Never reset, clean, force-push, rebase or overwrite the original source checkouts during consolidation.

## Promotion workflow

`feature/recovery input -> component tests -> cross-component contracts -> security/secret scan -> governance/audit optimizer -> human approval -> canonical main -> provider deployment`

Production deployment must remain separable from repository hosting. CI migration may translate GitHub workflow intent but must not weaken gates simply to obtain green status.

## Validation gates before GitLab export

1. Exact source/branch/ref inventory and SHA-256 evidence complete.
2. Dirty/staged changes reconciled or quarantined with owners/disposition.
3. DataNest unit/type/contract/build tests pass from `apps/datanest`.
4. Hub lint/test/build/commercial verification passes from `apps/hub`.
5. RONSAS topology/security/worker controls pass from `platform/ronsas` without duplicating Hub runtime authority.
6. Open Nova tests/manifest verification pass; production cutover remains disabled unless separately approved.
7. Governance schema/RLS/RPC boundaries and certification semantics are unchanged or explicitly re-certified.
8. Cross-app URLs, entitlements, billing, updates feeds and public app registry pass.
9. No secrets or local absolute paths are tracked.
10. Clean monorepo clone can build from lockfiles without dependency junctions to legacy trees.
11. Migration evidence and rollback bundles are independently verifiable.
12. Human reviewer signs the final export manifest before GitLab push.

## Weed disposition observed 2026-10-04

- `github/control` clean at `819b773a263c277693031d76c1b4d32542365fd7`.
- `github/control-worker` at `31af5284ef0690f7079ff278791b90d211ea41f4` is an ancestor; clean control is 613 commits ahead. Preserve worker history, do not create a separate app.
- Weed Hub has 8 staged paths (216 insertions / 470 deletions); patch preserved for review.
- Open Nova v1.5.5 is a small non-Git sovereign development platform installation; its source/config/tests are candidate `platform/open-nova`, while runtime state/secrets are excluded.

No source authority was changed by creating this design.

## Public-operating plane amendment — 2026-10-04

Public assets are now part of the operating architecture. `apps/datanest/public/ops` and `apps/hub/public/ops` publish sanitized release, environment, catalog, health and canonical-traceability metadata. These files are operational inputs for public UX/status/transparency but never runtime authority and never contain internal topology, credentials, local paths or privileged service details.

The internal machine-readable source is `ops/index/TRACEABILITY-INDEX.json`. Public manifests are an allowlisted projection of that internal index. This creates one-way publication: **internal governed registry → sanitization/validation → public operational assets**. Public files must never be used to reconstruct or override the private service registry.

## Nomenclature amendment — 2026-10-04

All platforms, applications, systems, governance frameworks, environments, nodes, services, public assets, packages, operations and evidence artifacts receive stable `RSN-*` canonical IDs. Historical names remain aliases. Directory names stay readable and are not used as sole identity. Canonical ID uniqueness is enforced by `ops/validation/Test-ResonanceTraceability.ps1`.

## Node/service alignment amendment — 2026-10-04

- Ealiophin: `RSN-NODE-EALIOPHIN-PRD-01`, production runtime authority once freshly re-observed.
- Weed: `RSN-NODE-WEED-DR-01`, recovery/support; no production listeners observed during this audit, aligned with its role.
- Spider: `RSN-NODE-SPIDER-DR-01`, recovery/support; requires fresh observation before any synchronization decision.
- Service identity is independent of port identity. Ports may change without changing canonical service IDs.
- Worker synchronization remains evidence-preserving and refuses dirty source rather than resetting it.
