# RONSAS desktop startup

Date: 2026-09-23

## Objective

The desktop entry point must start RONSAS without leaving a stack of Vite, Python, Ollama, broker, or health-check consoles on screen.

## Control model

`RONS - ALL.lnk` is a thin user-interface alias only. It launches the copied `Start-RonsasDesktop.ps1` helper hidden. That helper delegates exclusively to the canonical registry-driven controls under `integrations\rons-cluster`:

- `START-RONSAS-ECOSYSTEM.ps1`
- `STATUS-RONSAS-ECOSYSTEM.ps1`
- `STOP-RONSAS-ECOSYSTEM.ps1`

The helper does not start individual modules itself. Separate processes and ports remain fault-isolation boundaries behind the single RONSAS control plane.

The shortcut installer also copies a topology-preserving control bundle into `%LOCALAPPDATA%\Resonance\RONSAS\Launcher\Control\ops\ealiophin`. The desktop helper prefers that installer-copied bundle when it contains all three canonical controls, `RONSAS-MODULES.json`, and the runtime source files required by the supervisor. It then considers a complete live bundle and, finally, the governed source checkout at `%USERPROFILE%\Documents\GitHub\rons-sovereign-codebase\ops\ealiophin\cluster`. It never mixes controls across directories. The repository remains the source authority; the LocalAppData bundle is a stable execution copy refreshed by the installer. This protects startup from the partial live-control and stale-checkout drift found on Ealiophin on 2026-09-23.

## Window and log behavior

The desktop helper starts its child PowerShell control process with `-WindowStyle Hidden` and redirects standard output and standard error to:

`%LOCALAPPDATA%\Resonance\RONSAS\logs\desktop-control`

The last operation receipt is:

`%LOCALAPPDATA%\Resonance\RONSAS\logs\desktop-control\last-operation.txt`

The canonical ecosystem supervisor already starts Vite, Node, Python, Ollama, and media services hidden with service-specific logs. The desktop helper therefore removes the remaining interactive parent-console layer without changing service ownership or recovery semantics.

## Duplicate protection

A named `Local\RONSAS_Desktop_Control` mutex makes repeated double-clicks idempotent at the desktop-control layer. The canonical supervisor retains its own port identity and safe-reuse checks.

## Installation

Run `scripts\Install-RonsasSovereignShortcuts.ps1`. It copies the desktop helper into the local RONSAS launcher directory and creates or refreshes `RONS - ALL.lnk` as the hidden one-click entry point.

This change does not alter billing, pricing, entitlements, public deployment, or provider-authorization policy.
