# Spider Node Readiness Evidence — 2026-10-04

## Canonical identity
- Node: `RSN-NODE-SPIDER-DR-01`.
- Machine alias: `Spider`.
- Environment: disaster recovery / support worker.
- Production promotion authority: **false**.
- Desktop Commander device: `36b21a2a-f70e-4efb-8773-4ac5f0454417`.

## Direct observation status
At the resumed consolidation checkpoint, Spider is registered in Desktop Commander but offline. No current filesystem, Git, process, listener or Dropbox assertions are made from stale evidence.

The canonical traceability index already includes Spider, and RONSAS contains dedicated Spider worker controls at `platform/ronsas/ops/workers/spider`.

## Governance disposition
- Spider is included in the canonical three-node topology alongside Ealiophin and Weed.
- Spider remains a support/DR worker and cannot promote directly to production.
- Spider being offline does **not** block creation/import of the non-destructive GitLab canonical repository.
- Full topology/DR certification remains pending until Spider is directly observed again.
- No production role may be inferred from historical Spider evidence.

## Required re-entry audit when Spider reconnects
1. Verify the connected device ID and machine identity.
2. Inventory relevant repository roots and capture branch, HEAD, remotes, worktree status and local changes.
3. Preserve divergent or dirty work as Git bundles/patches before any reconciliation.
4. Compare Spider RONSAS worker controls with the canonical `platform/ronsas/ops/workers/spider` source.
5. Verify node-local authority/configuration remains machine-local and no credentials, secrets or mutable runtime state are promoted into Git.
6. Inventory Resonance/RONSAS processes and listeners and confirm Spider is operating only in its governed worker/DR role.
7. Verify Dropbox is evidence/handoff transport rather than editable source authority.
8. Record hashes/results in the audit repository and only then update Spider's `currentObservation` in `ops/index/TRACEABILITY-INDEX.json`.

## Current result
**Included — pending fresh audit.** GitLab forge import may proceed once the canonical source/export gates pass, but the overall three-node topology must remain marked partially observed until Spider reconnects and completes this checklist.
