# ChatGPT Sites / GitLab Pages Hybrid Deployment Runbook

## Purpose
This runbook maps the consolidated Resonance-AppDev / DataNest-Supository architecture to cloud-hosted public-web targets while preserving the governance strategy previously enforced through GitHub Pages, protected-main promotion, Mirror/R&D validation, Supabase services, separate sovereign runtimes, immutable build evidence and human review.

## Canonical source authority
- Canonical consolidated repository: `DataNest-Supository-CANONICAL-STAGING` pending final GitLab promotion.
- Current Weed canonical path: `C:\Users\iamas\Resonance\DataNest-Supository-CANONICAL-STAGING`.
- Ealiophin canonical history and subsequent runtime fixes are preserved in the Weed Git graph.
- `C:\resonance-hub` is not recreated as a second source authority; Resonance Hub is governed at `apps/hub` inside the monorepo.
- ChatGPT Sites, GitLab Pages, Cloudflare and Railway are deployment/runtime targets, not Git source-of-truth systems.

## Current governed integration state
- Historical Ealiophin canonical parent: `de53274100ae1202cae9f1b212b54fff592d2ec9`.
- Historical Weed staging parent: `e9b09aff76a365a3a3c78d30d66f4b83f0bcb445`.
- Governed two-parent merge: `b9dfb45f80299d7c32b009779fbc32e3dfad742b`.
- Merge evidence commit: `b62a7d1d2f10410a2710b1db108e35c067f2e280`.
- Windows/Node 24 RONSAS static-packaging portability fix: `ec75ecef116511f8a1e2d2cacb2e6d53468a726d`.
- RONSAS history reconciliation: `db7bb5a1922a1ba794abdcabc140e71f257054a7`.
- Open Nova sealed-manifest repair source: `93803e8e78b430e31c035307c11b48d8e75377cb`.
- Open Nova repair reconciled into Weed: `3c6b4bb0889b53f8d25ab2897e453c980c25ab7b`.
- Migration documentation/CI commits after `3c6b4bb0` are governance-only successors and must be included in the final export bundle.

## Recommended deployment topology

### 1. DataNest public governance surface
Use the existing static-export contract as the primary static hosting candidate.

Build contract:
- `DATANEST_STATIC_EXPORT=true`.
- `NEXT_PUBLIC_BASE_PATH=/DataNest` for compatibility with the former GitHub Pages route during migration testing.
- Before root-domain publication, rebuild with the actual served base path; do not reuse a build generated for a different route.
- Static export excludes server-only AiPI handlers by design.
- Supabase remains the governed state/auth/database/function provider for the public DataNest surface.

Eligible static targets:
- GitLab Pages after the canonical GitLab project exists and CI passes.
- ChatGPT Sites only when the account/project exposes a supported stable origin and required custom-domain behavior.
- Another governed static CDN/origin if it meets the same evidence, TLS and rollback controls.

Target role:
- public governance pages;
- assurance, legal, architecture, transparency and discovery artifacts;
- public runtime configuration;
- static RONSAS application bundles that pass build and release gates.

### 2. Resonance Hub
The Hub is not a purely static site. It is TanStack Start + Nitro and builds a Cloudflare-module server bundle.

Recommended role split:
- `reson8.life`: canonical Hub/runtime front door.
- Cloudflare Worker/Nitro or another supported server runtime: Hub SSR, server functions, API routes, MCP endpoints and authenticated runtime behavior.
- Static hosts: only static presentation assets where explicitly designed for that role.
- Railway: governed fallback/runtime target where required by existing contracts.

Do not flatten Hub server functions into static assets merely to fit a hosting surface.

### 3. Sovereign and stateful services
Keep these outside the public static hosting layer:
- `services/sovereign-backend`;
- Python gateway/auth/storage services;
- RONSAS orchestration/workers;
- Open Nova runtime services;
- long-running jobs, queues, watchers and workstation-bound operations;
- Supabase database/auth/storage/Edge Functions.

These services should be addressed by stable service endpoints and governed contracts from the public web layer.

## Forge strategy
The target forge is GitLab with canonical project identity `Resonance-AppDev/DataNest-Supository` when the account/group/project is created.

The root `.gitlab-ci.yml` preserves the important automated gates:
- canonical traceability validation;
- Open Nova sealed-manifest verification;
- DataNest tests/checks/audit/static build plus seven RONSAS bundles;
- Hub governance/security/commercial-mode checks and Nitro build;
- manual GitLab Pages candidate publication from the default branch.

GitLab Free supports protected branches and review workflows. Required approval-count rules are not available on Free, so human-review enforcement remains a combination of protected-main permissions, successful CI, recorded review evidence and explicit release approval. Do not equate technical mergeability with governance authorization.

## Mirror / R&D strategy
After canonical GitLab import is certified, recreate `Mirror-DataNest` as a fork or secondary R&D project derived from canonical `main`.

- R&D may remain comparatively ungated for controlled experimentation.
- R&D is never production authority.
- Candidate changes return through audited merge requests to canonical `DataNest-Supository`.
- Production artifacts are produced only from protected canonical `main`.

## Custom-domain strategy
The canonical Hub brand domain remains `reson8.life`.

Preferred DNS model:
1. Keep DNS authority in the existing managed DNS layer; Cloudflare is already represented throughout the platform architecture.
2. Keep `reson8.life` / `www.reson8.life` mapped to the Hub-capable server runtime, not directly to a static-only host.
3. For direct DataNest static hosting, prefer a dedicated hostname such as `datanest.reson8.life` if using GitLab Pages/custom-domain binding.
4. If governance requires DataNest at `reson8.life/DataNest`, retain Cloudflare/public ingress and path-route that prefix to the certified static origin while the Hub owns the root runtime.
5. Keep app/spoke domains independently mapped where already governed, for example `creative.reson8.life` and `epublisher.reson8.life`.
6. Update Supabase Auth redirect allowlists, OAuth redirect URLs, CSP/CORS allowlists, canonical metadata, robots/sitemap origins and service manifests as one governed DNS/configuration cutover.

No DNS cutover is authorized until the target deployment has a stable provider-issued origin, TLS is verified, and release evidence is approved.

## Scalability model
- Static DataNest assets: CDN/cache scaling at the hosting edge.
- Hub SSR/API: horizontally scalable serverless/worker runtime; current Nitro Cloudflare-module output is the preferred existing contract.
- Database/auth/storage: Supabase remains independently scalable and isolated from presentation hosting.
- Backend services: scale by service/container independently instead of coupling them to the web frontend.
- RONSAS and Open Nova: scale by governed worker/node topology, not by public-site replicas.
- Public assets remain immutable per release and should be content-hashed wherever supported.

## GitHub-strategy parity after migration
Preserve the same logical gates even though GitHub is no longer the forge:
1. R&D / Mirror candidate is ungated for controlled experimentation but is never production authority.
2. Candidate build emits visual/functional evidence and release hashes.
3. Audit Optimizer / automated governance gates validate candidate output.
4. Human reviewer approves synchronization to canonical main.
5. Canonical main is the only source permitted to create a production release candidate.
6. Production deploy is immutable and identified by exact commit plus artifact hashes.
7. Post-deploy probes verify public routes, health/discovery files, runtime configuration and governed app routes.
8. Rollback points to the previously certified artifact/commit, never to an ad-hoc workstation tree.

## Required release gates
### Passing now
- Canonical traceability suite: 35 passed, 0 failed.
- Open Nova sealed build manifest: 261 files verified after repair/reconciliation.
- Hub commercial-mode/public-audit/security verification: passed on the previous candidate build.
- Hub production build: passed on the previous candidate build.
- DataNest Next static build: passed on the previous candidate build.
- Governed Weed/Ealiophin Git-history merge: completed.
- Full 7-app RONSAS static aggregation: passed on Windows Node 24 using the committed launcher fix.
- DataNest static candidate artifact sealed: SHA-256 `27D8DB7277F46855A59961C438EDF829579E8D6D0DFDB31B84A1F7F23CD24489`.
- Resonance Hub Nitro/Cloudflare candidate artifact sealed: SHA-256 `AB2386960A51C8FCDE37444FEE69ECE91E87C5D5510749A4361688302201E374`.

### Remaining findings / maintenance
- All deployable artifacts must be rebuilt from the final clean migration head because repository history advanced after the earlier candidate artifacts were generated.
- Hub build reports Vite 7.3.6 while the Nitro Vite builder warns that Vite 8 is expected.
- Several TanStack server functions still use deprecated `inputValidator()` and should migrate to `validator()`.
- DataNest CSS contains two autoprefixer warnings for `end`; use `flex-end` for broader compatibility.
- RONSAS aggregation passes; remaining warnings include oversized JavaScript chunks and dependency deprecations/allow-scripts notices that require maintenance review.

## Production cutover checklist
- [x] Local canonical consolidation completed.
- [x] Canonical traceability passes 35/35.
- [x] Open Nova sealed manifest verifies 261 files.
- [ ] New GitLab forge/project authority established and protected.
- [ ] Final migration bundle generated from a clean committed head and hash recorded.
- [ ] Fresh clone from GitLab matches the migration/export SHA exactly.
- [ ] All public/static and Hub artifacts rebuilt from that fresh remote-authority clone.
- [ ] DataNest and Hub candidate builds pass in GitLab CI or an approved equivalent runner.
- [ ] Static-site origin/custom-domain binding verified where used.
- [ ] TLS verified for every canonical hostname.
- [ ] Supabase Auth/OAuth redirect allowlists updated.
- [ ] CSP/CORS/service manifests updated.
- [ ] `robots.txt`, sitemap and canonical metadata updated from former GitHub Pages origins.
- [ ] Health, legal, governance, assurance and app routes probed after deployment.
- [ ] Release manifest stores commit SHA plus SHA-256 of deployable artifacts.
- [ ] Human governance approval recorded before DNS promotion.

## Rollback
Maintain the prior certified public artifact and DNS target until the new origin passes post-deployment verification. Rollback must restore both the prior frontend artifact and its matching runtime/domain configuration; do not mix release generations.
