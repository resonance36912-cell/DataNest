# GitHub CI monitoring and guarded autofix

## Purpose

Ealiophin is the sovereign CI-control host for the canonical resonance36912-cell/RONSAS repository. The monitor records the health of current main and open pull-request heads, while the remediation layer handles failures without bypassing RONSAS review and sovereignty controls.

## Safety boundary

The remediation process always verifies the authenticated GitHub account is resonance36912-cell, the origin is the canonical RONSAS repository, and .githooks remains active. It never force-pushes, never pushes directly to main, never uses an admin merge bypass, and never changes production runtime, database, DNS, Cloudflare, or secrets.

Automatic code mutation is deliberately narrow:

- timed_out and startup_failure runs may have their failed jobs rerun once.
- A current-main failure whose failed step is exactly Prettier format check may be repaired in an isolated worktree. Only files changed by the failing commit with supported text extensions are formatted. The resulting branch must pass prebuild, unit tests, TypeScript, and git diff --check, then it is submitted as a pull request.
- All other current-head failures are diagnosed and escalated to a GitHub issue containing the run URL, SHA, failed step names, and disposition. Raw CI logs are intentionally not copied into issues.

The remediation history prevents repeated action on the same run ID.

## Ealiophin scheduling

Run:

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\Install-RonsasCiAutofixTask.ps1

The installer verifies the canonical GitHub account and origin, then creates the Windows scheduled task RONSAS GitHub CI Monitor at a 15-minute cadence and invokes:

Watch-RonsasGitHubCI.ps1 -AutoRemediate

State and logs remain local under:

%LOCALAPPDATA%\Resonance\RONSAS

Key files:

- github-ci-monitor.json
- github-ci-monitor.log
- github-ci-remediation.json
- github-ci-remediation.log

## Operating interpretation

A green monitor state means the latest known runs for current main and open pull-request heads have no completed failure conclusions. Pending runs remain pending; they are not treated as failures.

A remediation PR is still subject to the repository's normal protected checks and review/merge rules. This feature repairs safe mechanical failures and accelerates diagnosis; it does not grant autonomous authority to rewrite or deploy production.
