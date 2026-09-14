# Resonance Open Nova Sovereign Application Suite (RONSAS)

## Superepository architecture and workflow

Snapshot date: 2026-09-14  
Host: Ealiophin  
Pattern: manifest-driven superepository (meta-repository), not a Dropbox-synced monorepo

## Decision

Use `C:\Users\Ashley\Documents\GitHub\rons-sovereign-codebase` as the RONSAS superepository control root.

Keep the live source, runtime, models, logs, secrets, release installations, and Dropbox audit vault at their existing paths. The superepository maps those paths through `.ronsas\topology.local.json`; it does not duplicate or junction them into Git. This preserves all current launch paths and prevents Git and Dropbox from competing over one working tree.

The present system does not yet have one reconciled Git source of truth. Three Hub lines exist and must be merged deliberately:

| Line | Path | Observed state | Authority now |
| --- | --- | --- | --- |
| Consolidated RONS candidate | `C:\Users\Ashley\Documents\GitHub\rons-sovereign-codebase` | `main` at `db2817e`; clean before this mapping; no remote | Target superepository/control root |
| GitHub-linked developer Hub | `C:\Users\Ashley\Documents\GitHub\resonance-hub` | `main` at `a8c8a6d`; 3 commits ahead of cached `origin/main`; 11 working-tree changes | Developer history; upstream currently inaccessible |
| Production Hub source | `C:\Resonance\Sources\resonance-hub-sanitized` | `rons/ealiophin-production-20260907` at `a09723b`; 25 working-tree changes; no remote | Local production source |
| Runtime Hub stage | `C:\Users\Ashley\Resonance\OpenNova\runtime\hub-sovereign-stage` | Same base commit `a09723b`; 34 working-tree changes; origin is the local production source | Runtime staging only |

Do not copy one of these trees over another. Reconciliation must be commit- and diff-based.

## Authority model

```text
                                  reviewed commits/tags
        Local development  -------------------------------->  GitHub
        (source authority)                                    (history + CI)
               |                                                    |
               | governed promotion                                 | release tag
               v                                                    v
        Ealiophin production  ----------------------------->  sealed artifacts
        (runtime authority)                                  + SHA-256 manifests
               |                                                    |
               | status, logs, receipts                             | operator upload
               v                                                    v
        machine-local state                                  Dropbox audit vault
        (never cloud-synced)                                 (evidence authority)
```

Authority is separated by concern:

- Git/GitHub owns source history, review, CI, tags, and release metadata.
- `C:\Resonance\Sources\resonance-hub-sanitized` plus `C:\Users\Ashley\Resonance\OpenNova` own the currently running Ealiophin installation.
- `C:\Users\Ashley\AppData\Local\Resonance\RONS-ControlCenter` owns machine-local orchestration.
- Dropbox owns immutable audit evidence and distributable release bundles, not editable source history.
- Runtime data, caches, models, logs, credentials, `.env` files, private keys, and databases remain outside Git and outside audit packages unless explicitly sanitized.

## Canonical local layout

```text
C:\Users\Ashley\Documents\GitHub\rons-sovereign-codebase\    <- RONSAS control root
|-- .git\
|-- .ronsas\
|   |-- topology.example.json        <- portable, safe to commit
|   |-- topology.local.json          <- exact Ealiophin paths; Git-ignored
|   `-- state\                       <- generated status; Git-ignored
|-- docs\architecture\
|   `-- RONSAS-SUPEREPOSITORY.md
|-- scripts\
|   `-- Test-RonsasTopology.ps1      <- read-only path/Git/port audit
|-- recovered-integrations\         <- existing recovered source material
|-- src\, public\, supabase\, ...   <- existing consolidated Hub source
`-- RONSAS-WORKSPACE.md              <- operator entry point

C:\Resonance\
|-- Sources\resonance-hub-sanitized\ <- production Hub source
|-- OpenNova\                         <- legacy v1.5.3 tree; non-canonical
`-- Sovereign Resonance AppDev\       <- incomplete/legacy Git shell

C:\Users\Ashley\Resonance\OpenNova\ <- live suite root
|-- apps\
|   |-- epublisher-sovereign-local-v0.1\
|   |-- creative-studio-sovereign-local-v0.1\
|   `-- sync-vision-sovereign-local-v0.1\
|-- integrations\
|-- engines\musetalk-0a89dec45a01\
|-- ResonanceAppDev_ZeroCredit_v1.5.8\ <- sealed Foundry release
|-- runtime\youtube-optimizer-stage\
|-- runtime\hub-sovereign-stage\
|-- runtime\models\, logs\, secrets\  <- local only
`-- audit\RONS-RGP-SYSTEM-BLUEPRINT-v1.0.0-20260912\

C:\Users\Ashley\AppData\Local\Resonance\RONS-ControlCenter\ <- machine-local control

C:\Users\Ashley\Dropbox\RONS-Audit\RONS-AI-AUDIT-REPOSITORY\ <- Dropbox local mirror
/RONS-Audit/RONS-AI-AUDIT-REPOSITORY                           <- Dropbox cloud path
```

## Component and service map

| Component | Local source/runtime path | Endpoint | Evidence path inside blueprint 17 |
| --- | --- | --- | --- |
| RONS Hub | `C:\Resonance\Sources\resonance-hub-sanitized` | `http://127.0.0.1:4173/` | `04-SOURCE-BUNDLES/RONS-Hub-SOURCE-v1.0.0.zip` |
| ePublisher | `C:\Users\Ashley\Resonance\OpenNova\apps\epublisher-sovereign-local-v0.1` | `http://127.0.0.1:3101/` | `04-SOURCE-BUNDLES/ePublisher-SOURCE-v1.0.0.zip` |
| Creative Studio | `C:\Users\Ashley\Resonance\OpenNova\apps\creative-studio-sovereign-local-v0.1` | `http://127.0.0.1:3201/studio` | `04-SOURCE-BUNDLES/Creative-Studio-SOURCE-v1.0.0.zip` |
| SyncVision | `C:\Users\Ashley\Resonance\OpenNova\apps\sync-vision-sovereign-local-v0.1` | `http://127.0.0.1:3301/` | `04-SOURCE-BUNDLES/SyncVision-SOURCE-v1.0.0.zip` |
| YouTube Optimizer | `C:\Users\Ashley\Resonance\OpenNova\runtime\youtube-optimizer-stage` | `http://127.0.0.1:3401/` | `04-SOURCE-BUNDLES/YouTube-Optimizer-SOURCE-v1.0.0.zip` |
| MuseTalk bridge | `C:\Users\Ashley\Resonance\OpenNova\integrations\musetalk-syncvision-bridge` | `http://127.0.0.1:7863/health` | included in integrations/source bundles |
| Local speech-to-text | `C:\Users\Ashley\Resonance\OpenNova\runtime` + `runtime\models\whisper-small` | `http://127.0.0.1:7864/health` | status and sanitized evidence only |
| Local image service | `C:\Users\Ashley\Resonance\OpenNova\runtime` | `http://127.0.0.1:7865/health` | status and sanitized evidence only |
| Local LLM | `C:\Users\Ashley\Resonance\OpenNova\runtime` | `http://127.0.0.1:7866/health` | status and sanitized evidence only |
| Creative source | `C:\Users\Ashley\Resonance\OpenNova\runtime` | `http://127.0.0.1:7867/health` | status and sanitized evidence only |
| RONS AI broker | `C:\Users\Ashley\Resonance\OpenNova\runtime\ai-broker` | `http://127.0.0.1:7868/health` | status and sanitized evidence only |
| AppDev Foundry | `C:\Users\Ashley\Resonance\OpenNova\ResonanceAppDev_ZeroCredit_v1.5.8` | `http://127.0.0.1:8787/v1/apps` | `04-SOURCE-BUNDLES/AppDev-Foundry-SOURCE-v1.0.0.zip` |
| Sovereign gateway | Foundry-managed local service | `http://127.0.0.1:8787/v1/backend/health` | validation/receipts; direct port 58600 remains loopback-controlled |
| Ollama | `C:\Users\Ashley\AppData\Local\Programs\Ollama` | `http://127.0.0.1:11434/` | model metadata only; no model blobs |

All declared service listener ports except the intentionally indirect gateway port were observed listening on 2026-09-14. The last packaged control status, generated 2026-09-12, reported 14 up, 0 down, and 0 required down.

## GitHub map

| Repository | Local path | Configured remote | State |
| --- | --- | --- | --- |
| RCGF | `C:\Users\Ashley\Documents\GitHub\RCGF` | `https://github.com/resonance36912-cell/RCGF.git` | clean; cached `main` aligned |
| Resonance Hub | `C:\Users\Ashley\Documents\GitHub\resonance-hub` | `https://github.com/resonance36912-cell/resonance-hub.git` | local branch ahead 3; remote lookup returned repository not found while unauthenticated |
| RONS sovereign codebase | `C:\Users\Ashley\Documents\GitHub\rons-sovereign-codebase` | none | local consolidated candidate; target control root |

The GitHub CLI is not authenticated and the connected GitHub account returned no visible repositories. Therefore GitHub cloud state, protected branches, PRs, and remote heads cannot currently be certified. Do not push until the account connection is restored and the exact destination repository is confirmed.

## Dropbox map

Canonical audit root:

- Local sync path: `C:\Users\Ashley\Dropbox\RONS-Audit\RONS-AI-AUDIT-REPOSITORY`
- Cloud path: `/RONS-Audit/RONS-AI-AUDIT-REPOSITORY`
- Current source-of-truth entry point: `00-START-HERE/SOURCE-OF-TRUTH-INDEX.md`
- Current architecture bundle: `17-RONS-RGP-SYSTEM-BLUEPRINT-v1.0.0-20260912`
- Current source handoff: `18-RONS-SOURCE-AUDIT-HANDOFF-v1.0.0-20260912`
- Current launcher remediation: `19-RONS-LAUNCHER-OWNERSHIP-REMEDIATION-20260912`

Dropbox is evidence/release authority only. Never place `.git`, live databases, mutable runtime state, model caches, secrets, or active Node/Python environments under the Dropbox root.

## Operating workflow

### 1. Inspect

Run from the superepository control root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-RonsasTopology.ps1
```

The verifier checks required paths, Git branch/head/remote/dirty counts, and declared local service listeners without changing state.

### 2. Reconcile source

1. Freeze promotion; do not copy directories wholesale.
2. Capture patches from the developer Hub, production Hub source, and runtime Hub stage.
3. Compare all three against their recorded base commits.
4. Apply reviewed changes to a branch in the superepository candidate.
5. Run unit, build, security, sovereignty, and manifest gates.
6. Keep runtime-only files, `.env`, caches, logs, models, secrets, and generated output excluded.

### 3. GitHub promotion

1. Restore authenticated visibility to the `resonance36912-cell` account/organization.
2. Confirm or create the exact private RONSAS destination repository.
3. Add the remote to `rons-sovereign-codebase` only after that check.
4. Push a review branch such as `ronsas/topology-20260914`.
5. Merge through a protected pull request after required CI passes.
6. Tag a release; never deploy directly from an uncommitted working tree.

### 4. Local promotion

1. Resolve a reviewed Git tag/commit into a clean staging directory.
2. Build and validate there.
3. Generate `BUILD_MANIFEST.json` plus SHA-256 checksums.
4. Back up the current installation to a dated local rollback directory.
5. Promote atomically through the existing RONS Control Center.
6. Run `FINAL-RONS-ACCEPTANCE.ps1` and capture a status snapshot.

### 5. Dropbox publication

1. Package only sanitized source bundles, release artifacts, manifests, validation reports, SBOM/dependency inventories, and operator documentation.
2. Generate a SHA-256 companion for every archive.
3. Upload to a new monotonically numbered snapshot folder; never overwrite prior evidence.
4. Verify cloud metadata and checksum after sync.
5. Update `00-START-HERE/SOURCE-OF-TRUTH-INDEX.md` last, so incomplete uploads never become authoritative.

### 6. Restore

1. Select a Git tag for source restoration and a matching Dropbox evidence bundle.
2. Verify the bundle checksum before extraction.
3. Restore into staging, never over the live root.
4. Validate, promote atomically, and record the rollback receipt.

## Sync contract

| Data class | GitHub | Dropbox | Local-only |
| --- | --- | --- | --- |
| Application source, tests, docs, workflows | canonical | sanitized snapshots only | working copies |
| Release ZIPs, SHA-256, validation evidence | release metadata/link | canonical immutable files | build staging/cache |
| `.env`, tokens, keys, credentials | never | never | yes |
| Runtime databases and mutable state | never | sanitized export only | yes |
| Models, `node_modules`, virtual environments, caches | never | never | yes |
| Logs | selected redacted reports | selected immutable evidence | full operational logs |
| Control scripts | sanitized portable subset | audit snapshot | live machine-local control plane |

## Known drift and cleanup candidates

- `C:\Resonance\OpenNova\ResonanceAppDev_ZeroCredit_v1.5.3` is a 1.08 GB legacy tree and is not canonical.
- `C:\Users\Ashley\RONS-v1.5.8-RC-TEMP` is a release-candidate staging copy, not the installed v1.5.8 authority.
- `C:\Resonance\Sovereign Resonance AppDev\Resonance` is an incomplete Git repository with no commits.
- `C:\Users\Ashley\Resonance\OpenNova` contains v1.5.5, v1.5.7, v1.5.8-dev, and current v1.5.8 lines; they need an explicit retention/archive decision.
- The production Hub source, developer Hub, and runtime Hub stage all contain different uncommitted changes.
- The GitHub-linked developer Hub contains a local `.env` file. It is ignored, but it must remain excluded from commits and audit packages.

No legacy tree should be deleted or moved until its hash, unique-file delta, rollback value, and target archive path are reviewed.

## Proposed cloud mutation plan (not yet executed)

After explicit confirmation, create:

`/RONS-Audit/RONS-AI-AUDIT-REPOSITORY/20-RONSAS-SUPEREPOSITORY-MAP-20260914/`

Upload/copy into it:

- `RONSAS-SUPEREPOSITORY.md`
- a sanitized topology manifest with no credentials
- a read-only topology status report
- a SHA-256 manifest covering those files

Expected result: a new immutable evidence snapshot; no existing Dropbox item is moved, renamed, overwritten, or deleted.

Separately, after GitHub authentication and destination confirmation, add the verified remote to the local superepository, commit only the portable topology/documentation/verifier, and open a review branch. The exact GitHub destination remains intentionally unset until it can be verified.
