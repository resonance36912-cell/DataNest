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
## One-click and startup entry points

`Install-RonsasSovereignShortcuts.ps1` copies the active guard to `%LOCALAPPDATA%\Resonance\RONSAS\Launcher` so repository refreshes cannot break installed shortcuts.

It creates `RONSAS Sovereign Start`, `RONSAS Web - Default`, profile-specific Chrome and Firefox shortcuts, an Edge shortcut when installed, and `RONSAS Sovereignty Guard` in the Windows Startup folder.

Each browser/profile shortcut runs the same sovereignty preflight before opening GitHub, Dropbox audit authority, and the Resonance governance page. Existing browser credentials, cookies, and account data are neither read nor copied.

The profile-specific shortcuts preserve separate signed-in account contexts for multi-browser and multi-account operation. They do not attempt to merge browser identities.

## Execution boundary

Shortcuts use process-scoped `-ExecutionPolicy Bypass`. No machine-wide or user-wide PowerShell execution policy is changed.

Each invocation logs success or blocking reasons under `%LOCALAPPDATA%\Resonance\RONSAS\sovereignty-guard.log`; secrets, tokens, cookies, and browser credentials are not logged.

Arbitrary web navigation outside the governed RONSAS shortcuts is not intercepted. Enforcing every unrelated browser URL would require browser enterprise policy or network enforcement and is intentionally outside this launcher layer.
