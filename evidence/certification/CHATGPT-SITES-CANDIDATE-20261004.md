# ChatGPT Sites / Hybrid Hosting Candidate Evidence — 2026-10-04

## Canonical repository
- Weed canonical path: `C:\Users\iamas\Resonance\DataNest-Supository-CANONICAL-STAGING`
- Reconciled canonical head at evidence capture: `db7bb5a1922a1ba794abdcabc140e71f257054a7`
- Historical governed merge includes Ealiophin canonical and Weed staging ancestry.
- Current Ealiophin runtime history is reconciled into Weed main.

## Validation
- Resonance traceability: **35 passed, 0 failed**.
- Hub commercial-mode / public-audit / security checks: **passed**.
- Hub TanStack Start + Nitro production build: **passed**.
- DataNest Next.js static export: **passed**, 21 static routes.
- RONSAS aggregate static build: **passed**, 7 applications bundled.
- DataNest aggregate candidate size before ZIP: 676 files, 61,495,869 bytes.

## Candidate artifacts
1. `DataNest-Sites-static-candidate-20261004.zip`
   - SHA-256: `27D8DB7277F46855A59961C438EDF829579E8D6D0DFDB31B84A1F7F23CD24489`
   - ZIP bytes: `28,790,705`
   - Scope: DataNest static export plus seven RONSAS public application bundles.

2. `Resonance-Hub-Nitro-cloudflare-candidate-20261004.zip`
   - SHA-256: `AB2386960A51C8FCDE37444FEE69ECE91E87C5D5510749A4361688302201E374`
   - ZIP bytes: `3,375,476`
   - Scope: Hub Nitro Cloudflare-module server/public build.

## Component provenance
- Hub subtree did not differ between Ealiophin build source and the reconciled Weed source during comparison.
- DataNest source differed only by `apps/datanest/scripts/build-ronsas-pages.mjs`; the successful aggregate test used the same Windows/Node 24 launcher behavior committed in Weed.

## Open certification gates
- Open Nova sealed-package manifest byte-size verification remains failing; no Open Nova launcher was executed.
- Hub warns that the Nitro Vite builder expects Vite 8 while the Hub currently pins Vite 7.3.6.
- TanStack server-function `inputValidator()` deprecations remain.
- DataNest has two autoprefixer compatibility warnings (`end` should be `flex-end`).
- RONSAS builds contain oversized-chunk and dependency-deprecation/allow-scripts warnings requiring maintenance review.

## Production authority
These artifacts are **candidates only**. They do not authorize DNS cutover or production promotion. Human governance approval, final clean-checkout rebuild, target-origin verification, TLS/custom-domain verification, and post-deploy probes remain required.
