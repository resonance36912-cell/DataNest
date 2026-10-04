# RONSAS Sovereign Launcher

Date: 2026-09-15
Status: governed workstation enforcement layer

## Purpose

The launcher makes the Resonance Sovereignty Governance Protocol executable at workstation entry points for Ealiophin, Weed, Spider, GitHub, Dropbox, and governed browser/account access.

The GitHub control repository remains canonical. Dropbox remains audit/evidence authority. Worker copies remain subordinate execution and validation nodes.

## Enforced invariants

Every governed launch verifies the authority manifest, canonical owner `resonance36912-cell`, control repository `resonance36912-cell/RONSAS`, review-branch-only promotion, preserved independent history, and force-rewrite prohibition.

It also verifies the canonical Git remote, enables `.githooks`, fetches/prunes safely, refuses dirty or ahead-of-origin `main`, and only fast-forwards behind-only `main` with `git pull --ff-only`.

Required topology paths and repositories are checked against the local topology manifest. Required remotes must match. Dropbox audit authority must be available and rooted in Dropbox or a junction resolving into Dropbox.

Review branches are never auto-merged, rebased, reset, force-pushed, or promoted.

## One-click, startup, and browser-process entry points

`Install-RonsasSovereignShortcuts.ps1` copies the active guard and browser watcher to `%LOCALAPPDATA%\Resonance\RONSAS\Launcher` so repository refreshes cannot break installed enforcement.

It creates `RONSAS Sovereign Start`, `RONSAS Web - Default`, profile-specific Chrome and Firefox shortcuts, an Edge shortcut when installed, `RONSAS Sovereignty Guard`, and `RONSAS Browser Process Guard` in the Windows Startup folder.
Each browser/profile shortcut runs the sovereignty preflight before opening GitHub, Dropbox audit authority, and the Resonance governance page. Existing browser credentials, cookies, and account data are neither read nor copied.

The profile-specific shortcuts preserve separate signed-in account contexts for multi-browser and multi-account operation. They do not attempt to merge browser identities.

`Watch-RonsasBrowserProcesses.ps1` runs hidden at sign-in, detects new Chrome, Firefox, and Edge processes, and re-runs the same sovereignty preflight with debounce protection. It records pass/block results locally but does not terminate unrelated browser sessions or inspect browser content.

## Dropbox propagation evidence

On 2026-09-15 Ealiophin wrote a 193-byte verification marker into the governed Dropbox audit root. Weed and Spider independently received the same marker with SHA-256 `32505AD00D2FBE87FAE3FB275A2E80F7770DAF85EE22EE3F9700335381EC4BF3`, establishing end-to-end cross-device Dropbox propagation for that evidence object.

This is stronger than merely observing a local Dropbox folder or process, but it is a point-in-time verification rather than a guarantee about every future object.

## Execution boundary

Shortcuts and watcher use process-scoped `-ExecutionPolicy Bypass`. No machine-wide or user-wide PowerShell execution policy is changed.

Guard invocations log under `%LOCALAPPDATA%\Resonance\RONSAS\sovereignty-guard.log`; watcher events log under `%LOCALAPPDATA%\Resonance\RONSAS\browser-process-guard.log`. Secrets, tokens, cookies, and browser credentials are not logged.

Arbitrary web navigation inside an already-running unrelated browser is not intercepted. Full URL-level enforcement would require browser enterprise policy, an extension, or a governed network/proxy layer and remains outside this workstation launcher layer.
