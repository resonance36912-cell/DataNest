# RONSAS application consolidation into DataNest

Authoritative repository: `DataNest-Supository/DataNest`.

RONSAS is a DataNest Product. All RONSAS application source, runtime configuration, tests, CI/security gates, and release controls must ultimately live and run from this repository. Historical repositories are migration sources only and must not remain operational authorities after their application is absorbed.

## Migration map

| Application / component | Historical source | DataNest target | Status |
| --- | --- | --- | --- |
| Sovereign backend | `resonance36912-cell/rons-sovereign-backend-source` | `apps/ronsas/sovereign-backend` | Imported: 48 files |
| ePublisher | `resonance36912-cell/rons-epublisher-sovereign-source` | `apps/ronsas/epublisher` | Imported from `2c10a27b4311e89ff3ea6cc4384aa05a15a1b621`; source tree `0eedd2378e3055e40e7a1bc54ee56953fae71993` |
| Creative Studio | `resonance36912-cell/rons-creative-studio-sovereign-source` | `apps/ronsas/creative-studio` | Imported from `c7e0ac7ab341369ed26483eac3df4e83c1de6b6d`; exact source tree `17bc265d00ddd7413046a1f8c567925fa7ba9e21` (297 blobs) |
| SyncVision | `resonance36912-cell/rons-sync-vision-sovereign-source` | `apps/ronsas/syncvision` | Imported source; FFmpeg runtime migrated to exact locked `@ffmpeg/core` 0.12.10 vendoring; historical missing branding assets replaced with governed in-suite fallbacks |
| YouTube Optimizer | `resonance36912-cell/rons-youtube-optimizer-sovereign-source` | `apps/ronsas/youtube-optimizer` | Imported: 236 files |
| Career Compass | Historical executable source unavailable | `apps/ronsas/career-compass` | Reconstructed as DataNest-native application; validated from DataNest source |
| SovereignForge | Historical executable source unavailable | `apps/ronsas/sovereign-forge` | Reconstructed as DataNest-native application; validated from DataNest source |
| LyricSync Studio | Historical executable source unavailable | `apps/ronsas/lyricsync-studio` | Reconstructed as DataNest-native application; validated from DataNest source |
| Scene Song Spark | Historical executable source unavailable | `apps/ronsas/scene-song-spark` | Reconstructed as DataNest-native application; validated from DataNest source |
| RONS Control Center / Open Nova operations | Historical RONSAS control-plane sources | `ops/ronsas/ealiophin` plus app-local runtime source | Reconciled into DataNest-native start/status/stop, supervisor, and optional SyncVision MuseTalk controls |

## SyncVision runtime integrity

The historical repository exposed four binary files that the GitHub connector could not transfer safely. DataNest now handles them explicitly rather than preserving zero-byte placeholders:

- FFmpeg is pinned to `@ffmpeg/core` 0.12.10 with its exact npm package integrity in SyncVision's lockfile.
- `scripts/vendor-ffmpeg-core.mjs` copies the package's local ESM `ffmpeg-core.js` and `ffmpeg-core.wasm` into `public/ffmpeg-core` before development or production builds.
- `public/og-v2.png` and `public/og-v3.png` use the already-governed RONSAS OG image fallback from YouTube Optimizer.
- `src/assets/resonance-app-dev-logo.png` uses the already-governed Resonance logo from the imported suite.
- The root import-contract gate verifies the exact FFmpeg package version/resolution/integrity, required vendor script, and exact fallback asset sizes.

This is an explicit DataNest runtime migration. It does not claim that the unavailable historical binaries were recovered byte-for-byte.

## Backup-host policy

Dropbox `/DataNest-AI-Backups` is the governed backup-artifact host for DataNest/RONSAS continuity material. Local PCs are no longer backup hosts or continuity authorities. They may still run development, controlled tests, and hardware-bound optional services, but recovery artifacts and release backups are governed in Dropbox.

Dropbox is backup/recovery storage rather than a production web origin. GitHub Pages is the canonical public DataNest delivery target. Railway is not required by DataNest.

## DataNest-native local execution control plane

The local RONSAS execution control plane under `ops/ronsas/ealiophin` reads application source only from this repository. It is not backup-host authority.

- `RONSAS-MODULES.json` declares DataNest as the single repository authority, Dropbox as the backup-artifact host, disables local-PC backup hosting, and preserves `free-promotion` / `paidCheckoutActive: false`.
- `START-RONSAS-DATANEST.ps1`, `STATUS-RONSAS-DATANEST.ps1`, and `STOP-RONSAS-DATANEST.ps1` govern the local suite and track only DataNest-owned process state.
- `RONSAS-SUPERVISOR.ps1` performs bounded recovery for required modules without Open Nova paths, Desktop Commander, or the historical standalone repository.
- SyncVision's recovered MuseTalk 1.5 bridge now lives at `apps/ronsas/syncvision/runtime/musetalk/musetalk_bridge.py` and is registered as an optional localhost-only service at `127.0.0.1:7863` because its model/Python/FFmpeg assets remain machine-local.
- ePublisher already contains the recovered local STT server byte-for-byte inside its DataNest source, so no duplicate external STT runtime is required.

Historical runner-recovery scripts were not copied wholesale because they are hard-bound to `resonance36912-cell/RONSAS`, old runner identities, and old local paths. They remain evidence only until a DataNest-scoped runner-management design is implemented.

## Source-recovery conclusion

Connected GitHub repositories, RONSAS branches/commit history, and the Dropbox RONS audit mirror were searched for the four unresolved applications. No executable source was found. They have therefore been reconstructed as **new DataNest-native development**, not mislabeled as recovered source. Career Compass provides a local 30/60/90-day career-planning workflow; SovereignForge generates governed DataNest project manifests; LyricSync Studio produces deterministic LRC timing; Scene Song Spark creates timed scene sequences. All four are self-contained, billing-free, and governed by the same DataNest control plane.

## Reconstructed DataNest-native applications

The following applications are new DataNest development because their historical executable source could not be recovered:

- `apps/ronsas/career-compass` — Career Compass, port 3501
- `apps/ronsas/sovereign-forge` — SovereignForge, port 3601
- `apps/ronsas/lyricsync-studio` — LyricSync Studio, port 3701
- `apps/ronsas/scene-song-spark` — Scene Song Spark, port 3801

Each package contains local logic, tests, a deterministic build, and a DataNest-controlled preview server. They are registered as required web applications in `ops/ronsas/ealiophin/RONSAS-MODULES.json`.

## DataNest application validation

The permanent root workflow `.github/workflows/ronsas-app-validation.yml` validates each imported executable component from its DataNest path. Initial run `36353945388` passed all five jobs:

- ePublisher — `npm ci`, tests, type build, production build: **pass**
- Creative Studio — `npm ci`, tests, production build: **pass**
- SyncVision — `npm ci`, TypeScript checks, tests, production build: **pass**
- YouTube Optimizer — frozen Bun install, type-check, tests, production build: **pass**
- Sovereign Backend — Python 3.12 dependency install/check and pytest: **pass**

This proves the imported application source is executable from DataNest. SyncVision source validation passed. Its binary runtime is now governed through deterministic FFmpeg package vendoring and explicit in-suite branding fallbacks rather than unrecoverable historical placeholders.

## Validation boundaries

- Root DataNest TypeScript validation covers the root Next.js application and excludes standalone packages under `apps/ronsas`.
- RONSAS imports have their own integrity gate and must additionally build/test from their DataNest paths before historical sources are retired.
- Imported historical source may contain old pricing/checkout implementation, but it must not become active while the free-promotion directive remains in force.

## Rules

1. DataNest is the sole active source authority after migration.
2. Do not use Git submodules or runtime dependencies on the historical RONSAS repositories as a substitute for migration.
3. Preserve executable source, required assets, tests, migrations, runtime configuration, and still-valid operational controls.
4. Do not carry forward obsolete paid-checkout behavior while the free-promotion directive remains active.
5. Historical CI, diagnostics, runner-recovery branches, and duplicated deployment experiments are evidence only unless still required by the DataNest runtime.
6. Each imported application must build and test from its DataNest path before its historical repository is treated as retired.
7. External services may remain dependencies, but repository/source authority and release control must originate in DataNest.


### Reconstruction validation

RONSAS Application Validation run `36355180181` passed all nine DataNest application/component jobs on cleaned migration head `8674bc20b964f654d2b4829c6e4ebf09965ba30e`, including Career Compass, SovereignForge, LyricSync Studio, and Scene Song Spark.

The same cleaned head also passed root CI run `36355180189`, PR Verification run `36355180156` (611 unit tests and 61 Playwright browser tests), and DataNest AI Certification run `36355180231`.
