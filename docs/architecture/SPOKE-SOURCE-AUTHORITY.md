# RONSAS spoke source authority

Snapshot: 2026-09-18

RONSAS uses independent Git repositories for application source history and keeps the private `RONSAS` repository as the orchestration, topology, governance, and promotion authority. Runtime state is never the Git authority.

## Paid spoke repositories

| App | Repository | Ealiophin source path | Production | Verified baseline |
| --- | --- | --- | --- | --- |
| ePublisher | `resonance36912-cell/rons-epublisher-sovereign-source` | `%USERPROFILE%\Resonance\OpenNova\apps\epublisher-sovereign-local-v0.1` | `https://epublisher.reson8.life` | `34f7bbd` |
| Creative Studio | `resonance36912-cell/rons-creative-studio-sovereign-source` | `%USERPROFILE%\Resonance\OpenNova\apps\creative-studio-sovereign-local-v0.1` | `https://creative.reson8.life` | `663b4f7` |
| Sync Vision | `resonance36912-cell/rons-sync-vision-sovereign-source` | `%USERPROFILE%\Resonance\OpenNova\apps\sync-vision-sovereign-local-v0.1` | `https://sync.reson8.life` | `fbb29b3` |
| YouTube Optimizer | `resonance36912-cell/rons-youtube-optimizer-sovereign-source` | `%USERPROFILE%\Resonance\OpenNova\apps\youtube-optimizer-sovereign-local-v0.1` | `https://youtube.reson8.life` | `2290568` |

YouTube Optimizer's live mutable stage remains at `%USERPROFILE%\Resonance\OpenNova\runtime\youtube-optimizer-stage`. It intentionally contains no `.git` directory.

## Repository controls

Each spoke source repository carries:

- a hardened `.gitignore` excluding secrets, `.env` files, dependencies, build output, caches, logs, runtime state, and rollback snapshots;
- `RONSAS-SOURCE-AUTHORITY.json` identifying the source/control relationship;
- `MAINTENANCE.md` defining the review, validation, promotion, and scaling workflow;
- a tracked `.githooks/pre-push` guard that blocks direct pushes to `main` unless an explicit emergency override is supplied;
- a GitHub Actions CI workflow matching the app's local validation gates.

The source import was checked with `git diff --check`, a targeted credential-pattern scan, and a staged large-file check before publication.

## Validation baseline

### ePublisher

GitHub Actions is green. The workflow runs install, TypeScript declaration build, the full Vitest suite, and production build with sovereign-local mode declared explicitly.

### Creative Studio

Local validation passed:

- canonical pricing guard;
- 153 Vitest tests;
- production Vite build.

The initial source import also corrected stale/noncanonical price examples detected by the new pricing guard.

### Sync Vision

Local validation passed:

- TypeScript checks;
- JSON-LD, HTML metadata, locale, Hub canonical, sitemap, and robots checks;
- 8 Vitest tests;
- production Vite build.

The source import restored the missing metadata/canonical validator layer declared by `package.json`. The build currently warns about a roughly 631 kB minified client chunk; code splitting/manual chunking is a scaling follow-up.

### YouTube Optimizer

Local validation passed:

- configuration-key validation;
- escalation configuration validation;
- artifact-retention policy validation;
- TypeScript;
- 9 Vitest tests;
- production build.

## Local cross-repository verification

From the private RONSAS control repository on Ealiophin:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-RonsasSpokeSources.ps1
```

This verifies that every canonical spoke source tree exists, is a clean Git repository on `main`, is synchronized with `origin/main`, points to the expected GitHub remote, carries matching `RONSAS-SOURCE-AUTHORITY.json` metadata, has its declared loopback port listening, and returns HTTP 200 from its public endpoint.

For deeper source validation without mutating production build output:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-RonsasSpokeSources.ps1 -Deep
```

The verifier writes a machine-local JSON status receipt to `.ronsas/state/spoke-source-status.json`, which remains outside source history.

## GitHub Actions infrastructure condition

On 2026-09-18, GitHub refused to allocate hosted runners for the three new private repositories and annotated their runs with an account billing/spending-limit message. No workflow step executed in those runs. Do not classify those runs as source failures.

Until that account condition is resolved, promotion requires the same validation commands to pass locally on Ealiophin and the resulting evidence to be reviewed with the source branch/commit. Once GitHub-hosted Actions are available again, the committed workflows become the cloud gate automatically.

## Promotion workflow

1. Synchronize `main` from the app's source repository.
2. Create a focused `ronsas/*` review branch.
3. Run the app's declared local validation gates.
4. Push the review branch and open a pull request.
5. Require cloud CI when runner allocation is available; otherwise record the GitHub infrastructure block and preserve local validation evidence.
6. Merge reviewed source.
7. Build on Ealiophin.
8. Smoke-test the loopback service.
9. Promote through the governed runtime path.
10. Update RONSAS topology/source-authority records when repository, path, branch, or deployment authority changes.

## Scaling backlog

- Sync Vision: split the oversized client bundle reported by Vite (~631 kB minified) using route-level dynamic imports and/or stable manual chunks.
- Private GitHub Actions: restore hosted-runner eligibility by resolving the account billing/spending-limit condition, or evaluate an approved self-hosted runner without weakening repository isolation.
- Keep mutable model caches, media artifacts, databases, and runtime-generated evidence outside Git; publish only immutable release evidence to the audit authority.
