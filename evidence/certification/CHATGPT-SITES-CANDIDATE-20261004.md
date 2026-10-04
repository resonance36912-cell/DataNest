# ChatGPT Sites / GitLab Pages Hybrid Candidate Evidence — 2026-10-04

## Canonical repository
- Weed canonical path: `C:\Users\iamas\Resonance\DataNest-Supository-CANONICAL-STAGING`.
- Exact deployable/runtime artifact source: `3c6b4bb0889b53f8d25ab2897e453c980c25ab7b`.
- Later deployment/governance successors do not alter the sealed DataNest, Hub, RONSAS worker or Open Nova runtime bytes used for this local release-candidate cycle.
- Ealiophin Open Nova repair `93803e8e78b430e31c035307c11b48d8e75377cb` is reconciled into the artifact source.
- Spider topology/readiness governance is committed at `7a66e5a2db48c03678123716506217754761f21b`.
- Target forge identity: `Resonance-AppDev/DataNest-Supository` on GitLab, pending account/group/project creation.

## Validation
- Resonance traceability: **35 passed, 0 failed**.
- Open Nova sealed build manifest: **261 files verified** by `platform/open-nova/scripts/verify-build-manifest.ps1` on the reconciled source.
- RONSAS governed worker-manifest validation: **passed** for Spider and Weed via `platform/ronsas/scripts/verify-worker-ops-manifests.ts`.
- Hub commercial-mode / public-audit / security checks: **passed** on the fresh frozen-source build.
- Hub TanStack Start + Nitro production build: **passed**, Cloudflare-module preset, exit code 0.
- DataNest Next.js static export: **passed**, 21 static routes generated/exported.
- RONSAS aggregate static build: **passed**, 7 applications bundled into `out/apps`, exit code 0.

## Sealed source bundle
- `Weed-release-source-3c6b4bb0.bundle`
- SHA-256: `D167AA26B1DE66FBB38AC662B29094C565B745966C5B2EB14A4F1238AE1A0080`
- Bytes: `49,622,948`
- `git bundle verify`: passed; bundle is complete for the governed release source transfer used by Ealiophin.

## Rebuilt release-candidate artifacts
1. `DataNest-Sites-static-release-3c6b4bb0-20261004.zip`
   - SHA-256: `82204DC45B6C38A4C2BE7FD67ACC2349225CBBE45EC35DDB76D6C990A9AB76C9`
   - ZIP bytes: `28,847,538`
   - Scope: fresh DataNest static export plus seven RONSAS public application bundles from the frozen source.
   - Status: governed release candidate; **not production-certified**.

2. `Resonance-Hub-Nitro-cloudflare-release-3c6b4bb0-20261004.zip`
   - SHA-256: `2A0A0719B34DBF89B8FE02254F9765C752A2BF8EFE7C9333E5EFF7012418F371`
   - ZIP bytes: `3,403,414`
   - Scope: fresh Hub Nitro Cloudflare-module server/public build from the same frozen source.
   - Status: governed release candidate; **not production-certified**.

3. `Spider-RONSAS-worker-ops-release-3c6b4bb0-20261004.zip`
   - SHA-256: `A475A9EE2328C2CE98F65A2DA7DC050B3008D1DE5EF3387BE5E6FEBB4453B7A0`
   - ZIP bytes: `4,219`
   - Scope: governed Spider worker manifest plus `Publish-RonsasControlMirror.ps1`, `Start-RonsasWorkerLoop.ps1`, `Sync-RonsasWorker.ps1`, and `Verify-RONSAS.ps1`.
   - Status: sealed worker-control release candidate; fresh Spider audit completed and local worker hashes match canonical. A three-attempt sample found control failing 3/3 and Hub intermittent (2 failures, 1 exact-head success). **Remote DR synchronization remains transport-gated pending stable GitLab remotes after import.**

The older `*-candidate-20261004.zip` files remain historical evidence only and are superseded by the `*-release-3c6b4bb0-20261004.zip` artifacts above for this local release-candidate cycle.

## Spider topology and authority
- Canonical node ID: `RSN-NODE-SPIDER-DR-01`.
- Role: support / disaster-recovery worker.
- Production promotion authority: **false**.
- Governed worker controls: `platform/ronsas/ops/workers/spider`.
- Readiness record: `ops/nodes/SPIDER-READINESS.json`.
- Dedicated readiness evidence: `evidence/certification/SPIDER-NODE-READINESS-20261004.md`.
- Desktop Commander remote device ID: `36b21a2a-f70e-4efb-8773-4ac5f0454417`.
- Current remote registry state: online and directly audited. Spider validated the sealed canonical bundle at 35/35 traceability and 261 Open Nova files; its four governed worker scripts match canonical SHA-256 hashes exactly.
- Spider fresh audit is complete and does **not** block non-destructive GitLab forge import. A three-attempt transport sample found the legacy control origin failing 3/3 and the Hub origin intermittent (2 failures, 1 success at exact governed head `0329aeb42c3f10b26febb638482207468a050332`). Stable fresh GitLab fetches are required after remote repoint before relying on Spider remote DR synchronization.

## ChatGPT Sites domain capability
OpenAI Help Center, checked 2026-10-04, documents custom-domain connection for ChatGPT Sites where the feature is available. The Site owner uses **Site settings > Add domain**, enters an apex domain or subdomain, receives provider-issued DNS records, applies them at the DNS provider, then refreshes status. This establishes platform capability but does not establish availability on this specific account/site and does not authorize DNS changes.

No DNS records were changed during this build/certification cycle.

## Forge migration controls
- Root GitLab CI contract: `.gitlab-ci.yml`.
- CI now includes a governed RONSAS worker-ops audit that verifies the Spider and Weed script bytes against their manifests before certification.
- Deterministic migration exporter: `ops/forge/Export-CanonicalForge.ps1`; it requires a valid Spider readiness record and prevents Spider from holding promotion authority.
- Migration runbook: `docs/deployment/GITLAB-FORGE-MIGRATION-RUNBOOK.md`.
- Static publication remains manual; importing the repository does not authorize production publication or DNS cutover.

## Resolved certification gate
The former Open Nova byte-size/SHA manifest failure is resolved for the reconciled canonical tree. The verifier reports 261 files valid, so that specific hard gate is closed for source `3c6b4bb0`.

## Remaining findings and production gates
- GitLab account/group/project authority is not yet established or protected; a fresh remote-authority clone and CI reproduction remain required before production promotion.
- Spider fresh workstation audit is complete; legacy GitHub transport remains degraded/intermittent, so Spider remote DR synchronization stays gated until post-import GitLab remotes pass stable fresh fetches.
- Target ChatGPT Site/account must expose the Sites feature and, where used, **Add domain**; provider-issued DNS values and TLS status must be captured as evidence before any cutover.
- Supabase Auth/OAuth redirect allowlists, CSP/CORS, canonical metadata, robots/sitemap origins and service manifests must be updated as one governed cutover.
- Hub warns that the Nitro Vite builder expects Vite 8 while the Hub currently pins Vite 7.3.6.
- TanStack server-function `inputValidator()` deprecations remain.
- DataNest has two autoprefixer compatibility warnings (`end` should be `flex-end`).
- RONSAS builds pass; oversized chunks and dependency-deprecation/allow-scripts notices remain maintenance findings.
- Human governance approval is required before production publication or DNS promotion.

## Production authority
These artifacts remain **release candidates only**. Production promotion still requires forge establishment, protected `main`, fresh-clone/CI reproduction, target-origin/domain/TLS verification, controlled configuration cutover, post-deploy probes and recorded human governance approval.
