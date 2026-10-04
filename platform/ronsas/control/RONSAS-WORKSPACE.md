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
- `docs\operations\CHATGPT-GITHUB-CI-MONITORING-PROTOCOL.md` is the required ChatGPT handoff for RONSAS GitHub CI monitoring and safe repair.
- `scripts\Watch-RonsasGitHubCI.ps1` emits the read-only current-head CI state consumed by that protocol.

Do not add runtime state, secrets, models, dependencies, build output, or Dropbox evidence bundles to Git.

## Unified module authority

All application surfaces and local AI/media helpers are governed RONSAS modules/services. Separate ports are isolation boundaries only; they are not independent runtime authorities. The canonical composition contract is `ops\ealiophin\cluster\RONSAS-MODULES.json`, with operating rules in `docs\architecture\RONSAS-MODULE-CONTROL.md`.

Legacy launcher names must delegate to the canonical RONSAS start/status/stop controls rather than maintaining their own service lists.
