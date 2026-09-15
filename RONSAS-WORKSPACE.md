# RONSAS workspace

This repository is the manifest-driven control root for the Resonance Open Nova Sovereign Application Suite.

It maps the existing Ealiophin development, production, runtime, control-center, and Dropbox evidence paths without moving those live trees into the repository.

## Start

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-RonsasTopology.ps1
```

## Files

- `.ronsas\topology.example.json` is portable and safe to commit.
- `.ronsas\topology.local.json` contains exact machine paths and is intentionally ignored.
- `docs\architecture\RONSAS-SUPEREPOSITORY.md` defines authority, paths, GitHub/Dropbox boundaries, promotion, publication, and restore workflows.
- `scripts\Test-RonsasTopology.ps1` performs a read-only local topology check.
- `scripts\Capture-RonsasGitReconciliation.ps1` captures local-only reconciliation evidence.
- `docs\architecture\GIT-RECONCILIATION-20260914.md` records patch overlap and import order.

Do not add runtime state, secrets, models, dependencies, build output, or Dropbox evidence bundles to Git.
