# Resonance Open Nova Sovereign Application Suite (RONSAS)

## Superepository architecture and workflow

Snapshot date: 2026-09-16
Host: Ealiophin  
Pattern: manifest-driven superepository (meta-repository), not a Dropbox-synced monorepo

## Decision

Use `C:\Users\Ashley\Documents\GitHub\rons-sovereign-codebase` as the RONSAS superepository control root.

Keep the live source, runtime, models, logs, secrets, release installations, and Dropbox audit vault at their existing paths. The superepository maps those paths through `.ronsas\topology.local.json`; it does not duplicate or junction them into Git. This preserves all current launch paths and prevents Git and Dropbox from competing over one working tree.

Hub authority is intentionally split by role. These trees are preserved independently and must be reconciled deliberately rather than copied over one another:

| Line | Path | Observed state | Authority now |
| --- | --- | --- | --- |
| RONSAS control root | `C:\Users\Ashley\Documents\GitHub\rons-sovereign-codebase` | `main` promoted through PR and CI | Superepository/control authority |
| GitHub-linked developer Hub | `C:\Users\Ashley\Documents\GitHub\resonance-hub` | Independent development history | Semantic reconciliation source; not production authority |
| Canonical production Hub | `C:\Resonance\Sources\ronsas-hub-canonical` | `rons/ealiophin-production-20260907` at `36a1dc6`; tag `ronsas-public-2026-09-16` | Current production source |
| Retired production Hub evidence | `C:\Resonance\Quarantine\resonance-hub-sanitized-retired-20260916-0950` | Base `a09723b`; preserved working-tree drift | Quarantine evidence only; never overwrite |
| Runtime Hub stage | `C:\Users\Ashley\Resonance\OpenNova\runtime\hub-sovereign-stage` | Independent working-tree drift on the retired base | Runtime staging only; origin must follow the canonical production source |

Do not copy one of these trees over another. Reconciliation must be commit- and diff-based.

Since the 2026-09-16 cutover, the canonical production Hub source is `C:\Resonance\Sources\ronsas-hub-canonical` at `36a1dc6`, tagged `ronsas-public-2026-09-16`. The retired pre-cutover tree remains preserved in quarantine at its original `a09723b` base with local drift intact.

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
- `C:\Resonance\Sources\ronsas-hub-canonical` plus `C:\Users\Ashley\Resonance\OpenNova` own the currently running Ealiophin installation.
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
|-- Sources\ronsas-hub-canonical\      <- canonical production Hub source
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
| RONS Hub | `C:\Resonance\Sources\ronsas-hub-canonical` | `http://127.0.0.1:4173/` | `04-SOURCE-BUNDLES/RONS-Hub-SOURCE-v1.0.0.zip` |
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
| Resonance Hub | `C:\Users\Ashley\Documents\GitHub\resonance-hub` | `https://github.com/resonance36912-cell/resonance-hub.git` | developer history retained; local working-tree drift remains to reconcile |
| RONS sovereign codebase | `C:\Users\Ashley\Documents\GitHub\rons-sovereign-codebase` | `https://github.com/resonance36912-cell/RONSAS.git` | private GitHub source authority; `main` baseline and reconciliation review branch published |

GitHub CLI authentication is restored as `resonance36912-cell`. The private `resonance36912-cell/RONSAS` repository is the verified source authority, with `main` and the reconciliation review branch published and PR #1 open. Native GitHub branch protection for this private repository is unavailable on the current plan (GitHub returned HTTP 403 requiring Pro or public visibility), so the repository remains private and RONSAS enforces PR-based promotion by policy plus a versioned local pre-push guard that blocks direct `main` pushes on configured workstations.

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

1. Authenticate GitHub as `resonance36912-cell` and verify `https://github.com/resonance36912-cell/RONSAS.git`.
2. Keep the RONSAS repository private; do not make it public merely to obtain branch protection.
3. Enable the repository Git guard on each authorized workstation with `scripts/Enable-RonsasGitGuards.ps1`.
4. Push review branches only; direct `main` pushes are blocked by the local guard unless an explicit emergency override is set.
5. Open a pull request to `main` and merge only after the required CI/validation gates pass and conversations are resolved.
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

GitHub publication is now established at `https://github.com/resonance36912-cell/RONSAS.git`: `main` is the baseline source branch and PR #1 carries the topology/control-plane changes. Dropbox publication remains a separate, one-way audit action and must not mutate existing evidence items.
