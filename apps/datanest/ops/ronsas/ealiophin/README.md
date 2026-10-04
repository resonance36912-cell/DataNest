# DataNest RONSAS Control Plane

This directory is the active source authority for launching and inspecting RONSAS applications that have been consolidated into `DataNest-Supository/DataNest`.

## Authority

- Application source is read only from `apps/ronsas/*` in this repository.
- Runtime state and logs are written outside Git under `%LOCALAPPDATA%\Resonance\DataNest-RONSAS` by default.
- This workstation control plane is for execution and controlled testing only; Ealiophin and other local PCs are not backup hosts or continuity authorities.
- Dropbox `/DataNest-AI-Backups` is the governed backup-artifact host for release/recovery material.
- Historical RONSAS/Open Nova repositories remain evidence and recovery sources only; they are not runtime authority.
- The current commercial state is free promotion. This control plane does not activate pricing or paid checkout behavior.

## Commands

From the DataNest repository root on Ealiophin:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\ops\ronsas\ealiophin\START-RONSAS-DATANEST.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\ops\ronsas\ealiophin\STATUS-RONSAS-DATANEST.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\ops\ronsas\ealiophin\STOP-RONSAS-DATANEST.ps1
```

The start command installs dependencies only when an app has no `node_modules` directory, builds each imported web app, starts its preview server on the governed loopback port, waits for health, and records only processes it owns. These processes are not backup hosting; governed continuity artifacts belong in Dropbox.

Use `-RefreshDependencies` to force a clean dependency refresh or `-SkipBuild` only when a previously validated build is intentionally being reused.

## Modules

The registry currently launches ePublisher, Creative Studio, SyncVision, and YouTube Optimizer directly from their DataNest paths. Sovereign Backend source is also in DataNest, but its containers and secrets remain machine-local and are therefore reported as an optional backend service rather than being started implicitly.

Career Compass, SovereignForge, LyricSync Studio, and Scene Song Spark remain explicit source-recovery items until complete source is located. Logos or test fixtures are not treated as application source.

## Migration provenance

The operational model was recovered from historical RONSAS branch `ronsas/resonance-appdev-integration-20260924` at commit `058e5a347be0dd5313c7e53fb3611653d26494ac`. Legacy absolute paths and standalone repository authority were intentionally not carried forward.

## SyncVision MuseTalk

SyncVision's recovered MuseTalk 1.5 bridge now lives inside DataNest at `apps/ronsas/syncvision/runtime/musetalk/musetalk_bridge.py`. The governed launcher is `ops/ronsas/ealiophin/START-SYNCVISION-MUSETALK.ps1` and binds only to `127.0.0.1:7863` with network-runtime offline controls preserved.

The bridge is optional because the MuseTalk engine, pinned model files, Python environment, and FFmpeg remain machine-local assets. Their state belongs in `%LOCALAPPDATA%\\Resonance\\DataNest-RONSAS\\r5-local-ai.json`; source authority remains DataNest. Existing installations may still carry the historical local-state schema identifier during migration, but no OpenNova repository or path is used as runtime source authority.

`START-RONSAS-DATANEST.ps1` starts the bridge automatically only when its DataNest source, launcher, and machine-local state are present. `STATUS-RONSAS-DATANEST.ps1` always reports it, and `STOP-RONSAS-DATANEST.ps1` stops it only when the DataNest runtime owns the process.

## Supervisor

`RONSAS-SUPERVISOR.ps1` monitors only modules marked `required: true` in the DataNest registry. When a required source or health endpoint is unavailable, it invokes `START-RONSAS-DATANEST.ps1` with bounded exponential backoff. It does not start Desktop Commander, old OpenNova launchers, or standalone-repository recovery code.

To register it at logon on Ealiophin:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\ops\ronsas\ealiophin\INSTALL-RONSAS-SUPERVISOR.ps1 -StartNow
```

The scheduled task runs with the current user at limited privilege, uses a single-instance mutex, and writes its log under the DataNest RONSAS runtime root.
