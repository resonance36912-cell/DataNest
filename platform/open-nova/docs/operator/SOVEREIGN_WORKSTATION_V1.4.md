# Sovereign Workstation Operator Guide v1.4

## 1. Place Open Nova on the local PC

Extract the v1.4 package into a local folder owned by the Resonance operator. Do not place secrets inside the source tree.

## 2. Prepare offline prerequisites

The strict runtime expects Git and OpenSSL. Podman or Docker is required for isolated service/runtime certification. Ollama is optional for deterministic mode and required only when local-AI generation is requested.

If the Python virtual environment is not already present, the governed local wheelhouse must exist before strict offline startup. Open Nova will not fall back to the internet.

## 3. Start Open Nova

```powershell
.\scripts\open-nova-workstation.ps1 -OpenBrowser
```

Optional local-AI requirement:

```powershell
.\scripts\open-nova-workstation.ps1 -OpenBrowser -RequireLocalAI
```

## 4. Initialize workstation evidence

```powershell
.\scripts\workstation-initialize.ps1
.\scripts\workstation-status.ps1
```

## 5. Prepare the source repository

Before staging:

```powershell
git status
```

Commit or intentionally remove every pending/untracked change. The v1.4 bridge refuses a dirty worktree so the staged source can be tied to one Git commit.

Do not track `.env*`, private keys or certificate private material. Automatic staging also refuses Git submodules, tracked symlinks/reparse points and Git LFS until manually reviewed.

## 6. Stage the real repository

```powershell
.\scripts\repository-bridge-stage.ps1 `
  -SourcePath "C:\path\to\repository" `
  -AppId "reson8-life"
```

The script first calls the read-only assessment endpoint and only stages if that assessment passes.

## 7. Verify the staged snapshot

```powershell
.\scripts\repository-bridge-status.ps1 -AppId "reson8-life"
.\scripts\repository-bridge-verify.ps1 -AppId "reson8-life"
```

Do not continue if `valid` is false.

## 8. Enter the governed migration chain

```powershell
.\scripts\source-import-governed.ps1 -AppId "reson8-life"
.\scripts\migration-execution-prepare.ps1 -AppId "reson8-life"
.\scripts\migration-execution-run-supported.ps1 -AppId "reson8-life"
.\scripts\migration-execution-verify.ps1 -AppId "reson8-life"
```

Only deterministic provider rewrites are automatic. Unsupported semantics remain blockers.

## 9. Validate before any cutover

Continue with the existing isolated regression, loopback preview, backend/service health and local sovereignty certification steps. Production cutover is not automatic in v1.4.
