# ChatGPT Sites Hybrid Deployment Runbook

## Purpose
This runbook maps the consolidated Resonance-AppDev / DataNest-Supository architecture to a cloud-hosted public-web model while preserving the existing governance strategy previously enforced through GitHub Pages, protected-main promotion, Mirror/R&D validation, Supabase services, and separate sovereign runtimes.

## Canonical source authority
- Canonical consolidated repository: `DataNest-Supository-CANONICAL-STAGING` pending final forge migration.
- Current Weed canonical path: `C:\Users\iamas\Resonance\DataNest-Supository-CANONICAL-STAGING`.
- Ealiophin canonical source history was merged into Weed with history preservation.
- `C:\resonance-hub` was not recreated because it does not exist on Weed and is not the governed canonical path in current local evidence.
- ChatGPT Sites is a deployment target, not the Git/source-of-truth system.

## Current governed integration state
- Ealiophin canonical parent: `de53274100ae1202cae9f1b212b54fff592d2ec9`.
- Weed canonical staging parent: `e9b09aff76a365a3a3c78d30d66f4b83f0bcb445`.
- Governed two-parent merge: `b9dfb45f80299d7c32b009779fbc32e3dfad742b`.
- Merge evidence commit: `b62a7d1d2f10410a2710b1db108e35c067f2e280`.
- Windows/Node 24 RONSAS static-packaging portability fix: `ec75ecef116511f8a1e2d2cacb2e6d53468a726d`.

## Recommended deployment topology

### 1. DataNest public governance surface
Use the existing static-export contract as the primary ChatGPT Sites candidate.

Build contract:
- `DATANEST_STATIC_EXPORT=true`
- `NEXT_PUBLIC_BASE_PATH=/DataNest` for compatibility with the former GitHub Pages route during migration testing.
- Static export excludes server-only AiPI handlers by design.
- Supabase remains the governed state/auth/database/function provider for the public DataNest surface.

Target role:
- public governance pages
- assurance, legal, architecture, transparency and discovery artifacts
- public runtime configuration
- static RONSAS application bundles that pass build and release gates

### 2. Resonance Hub
The Hub is not a purely static site. It is TanStack Start + Nitro and currently builds a Cloudflare-module server bundle.

Recommended role split:
- ChatGPT Sites: public/static presentation surface when a Sites project is used.
- Cloudflare Worker/Nitro or another supported server runtime: Hub SSR, server functions, API routes, MCP endpoints and authenticated runtime behavior.
- Railway remains an available fallback/runtime target already represented in the Hub build contract where required.

Do not flatten Hub server functions into static assets merely to fit a hosting surface.

### 3. Sovereign and stateful services
Keep these outside the public Sites layer:
- `services/sovereign-backend`
- Python gateway/auth/storage services
- RONSAS orchestration/workers
- Open Nova runtime services
- long-running jobs, queues, watchers and workstation-bound operations
- Supabase database/auth/storage/Edge Functions

These services should be addressed by stable service endpoints and governed contracts from the public web layer.

## Custom-domain strategy
The canonical Hub brand domain remains `reson8.life` according to the current repository contracts.

Preferred DNS model:
1. Keep DNS authority in the existing managed DNS layer (Cloudflare is already represented throughout the platform documentation).
2. Bind `reson8.life` / `www.reson8.life` directly to the selected public deployment target if that target exposes a supported custom-domain binding.
3. If ChatGPT Sites does not expose an eligible direct binding for the account/project, retain Cloudflare as the public ingress and route only to a provider-supported origin. Do not fabricate a CNAME target or proxy an unsupported origin.
4. Keep app/spoke domains independently mapped where already governed, for example `creative.reson8.life`, `epublisher.reson8.life`, and other certified app routes.
5. Update Supabase Auth redirect allowlists, OAuth redirect URLs, CSP/CORS allowlists, canonical metadata, robots/sitemap origins and service manifests as one governed DNS cutover change.

No DNS cutover is authorized until the target deployment has a stable provider-issued origin, TLS is verified, and release evidence is approved.

## Scalability model
- Static DataNest/Sites assets: CDN/cache scaling at the hosting edge.
- Hub SSR/API: horizontally scalable serverless/worker runtime; current Nitro Cloudflare-module output is the preferred existing contract.
- Database/auth/storage: Supabase remains independently scalable and isolated from presentation hosting.
- Backend services: scale by service/container independently instead of coupling them to the web frontend.
- RONSAS and Open Nova: scale by governed worker/node topology, not by public-site replicas.
- Public assets remain immutable per release and should be content-hashed wherever supported.

## GitHub-strategy parity after migration
Preserve the same logical gates even when GitHub is no longer the forge:
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
- Hub commercial-mode/public-audit/security verification: passed.
- Hub production build: passed.
- DataNest Next static build: passed.
- Governed Weed/Ealiophin Git-history merge: completed.
- Full 7-app RONSAS static aggregation: passed on Windows Node 24 using the committed launcher fix.
- DataNest static candidate artifact sealed: SHA-256 `27D8DB7277F46855A59961C438EDF829579E8D6D0DFDB31B84A1F7F23CD24489`.
- Resonance Hub Nitro/Cloudflare candidate artifact sealed: SHA-256 `AB2386960A51C8FCDE37444FEE69ECE91E87C5D5510749A4361688302201E374`.

### Open findings
- Open Nova sealed package manifest byte-size verification fails and remains a hard certification gate.
- Hub build reports Vite 7.3.6 while the Nitro Vite builder warns that Vite 8 is expected.
- Several TanStack server functions still use deprecated `inputValidator()` and should migrate to `validator()`.
- DataNest CSS contains two autoprefixer warnings for `end`; use `flex-end` for broader compatibility.
- RONSAS aggregation now passes; remaining build warnings include oversized JavaScript chunks and dependency deprecation notices that should be remediated as optimization/security maintenance rather than treated as silent success.

## Production cutover checklist
- [ ] New forge/repository authority established and protected.
- [ ] `db7bb5a1922a1ba794abdcabc140e71f257054a7` or a reviewed successor is the exact release source.
- [ ] All public/static artifacts rebuilt from a clean checkout.
- [x] RONSAS static aggregation passes on the validated Windows build path; rerun from the final clean release checkout before production publication.
- [ ] Open Nova certification gate resolved or explicitly excluded from the public release scope by governance.
- [ ] Site origin and custom-domain binding verified.
- [ ] TLS verified for every canonical hostname.
- [ ] Supabase Auth/OAuth redirect allowlists updated.
- [ ] CSP/CORS/service manifests updated.
- [ ] `robots.txt`, sitemap and canonical metadata updated from former GitHub Pages origins.
- [ ] Health, legal, governance, assurance and app routes probed after deployment.
- [ ] Release manifest stores commit SHA plus SHA-256 of deployable artifacts.
- [ ] Human governance approval recorded before DNS promotion.

## Rollback
Maintain the prior certified public artifact and DNS target until the new origin passes post-deployment verification. Rollback must restore both the prior frontend artifact and its matching runtime/domain configuration; do not mix release generations.
