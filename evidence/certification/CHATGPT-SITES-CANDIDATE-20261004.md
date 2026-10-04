# ChatGPT Sites / GitLab Pages Hybrid Candidate Evidence — 2026-10-04

## Canonical repository
- Weed canonical path: `C:\Users\iamas\Resonance\DataNest-Supository-CANONICAL-STAGING`.
- Reconciled application/runtime head before migration-document updates: `3c6b4bb0889b53f8d25ab2897e453c980c25ab7b`.
- Historical governed merge includes Ealiophin canonical and Weed staging ancestry.
- Ealiophin RONSAS runtime fixes and Open Nova sealed-manifest repair are reconciled into Weed main.
- Target forge identity: `Resonance-AppDev/DataNest-Supository` on GitLab, pending account/group/project creation.

## Validation
- Resonance traceability: **35 passed, 0 failed** after Open Nova reconciliation.
- Open Nova sealed build manifest: **261 files verified** by `platform/open-nova/scripts/verify-build-manifest.ps1`.
- Hub commercial-mode / public-audit / security checks: **passed** on the prior candidate build source.
- Hub TanStack Start + Nitro production build: **passed** on the prior candidate build source.
- DataNest Next.js static export: **passed**, 21 static routes.
- RONSAS aggregate static build: **passed**, 7 applications bundled.
- DataNest aggregate candidate size before ZIP: 676 files, 61,495,869 bytes.

## Candidate artifacts
1. `DataNest-Sites-static-candidate-20261004.zip`
   - SHA-256: `27D8DB7277F46855A59961C438EDF829579E8D6D0DFDB31B84A1F7F23CD24489`
   - ZIP bytes: `28,790,705`
   - Scope: DataNest static export plus seven RONSAS public application bundles.
   - Status: historical candidate; rebuild required from final clean GitLab migration head before production.

2. `Resonance-Hub-Nitro-cloudflare-candidate-20261004.zip`
   - SHA-256: `AB2386960A51C8FCDE37444FEE69ECE91E87C5D5510749A4361688302201E374`
   - ZIP bytes: `3,375,476`
   - Scope: Hub Nitro Cloudflare-module server/public build.
   - Status: historical candidate; rebuild required from final clean GitLab migration head before production.

## Component provenance
- Hub subtree did not differ between the Ealiophin build source and the reconciled Weed source during the original candidate comparison.
- DataNest source differed only by `apps/datanest/scripts/build-ronsas-pages.mjs`; the successful aggregate test used the same Windows/Node 24 launcher behavior committed in Weed.
- Open Nova repair commit `93803e8e78b430e31c035307c11b48d8e75377cb` was verified on Ealiophin and then merged into Weed by `3c6b4bb0889b53f8d25ab2897e453c980c25ab7b`.

## Forge migration controls added after reconciliation
- Root GitLab CI contract: `.gitlab-ci.yml`.
- Deterministic migration exporter: `ops/forge/Export-CanonicalForge.ps1`.
- Migration runbook: `docs/deployment/GITLAB-FORGE-MIGRATION-RUNBOOK.md`.
- Static publication remains manual; importing the repository does not authorize production publication or DNS cutover.

## Resolved certification gate
The previous Open Nova byte-size/SHA manifest failure is resolved for the reconciled canonical tree. The verifier reports 261 files valid. This removes the Open Nova manifest failure as a hard migration blocker, but it does not by itself certify a production release.

## Remaining findings
- Final deployable artifacts must be rebuilt from a clean checkout of the exact post-migration GitLab `main` SHA.
- Hub warns that the Nitro Vite builder expects Vite 8 while the Hub currently pins Vite 7.3.6.
- TanStack server-function `inputValidator()` deprecations remain.
- DataNest has two autoprefixer compatibility warnings (`end` should be `flex-end`).
- RONSAS builds contain oversized-chunk and dependency-deprecation/allow-scripts warnings requiring maintenance review.

## Production authority
These artifacts remain **candidates only**. Production promotion still requires final forge establishment, protected `main`, a fresh-clone rebuild, target-origin/TLS verification, controlled domain/configuration cutover, post-deploy probes and recorded human governance approval.
