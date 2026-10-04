# RONSAS ChatGPT GitHub CI Monitoring Protocol

Status: governed operating protocol for Ealiophin.
Control repository: `resonance36912-cell/RONSAS`.
Canonical local checkout: `C:\Users\Ashley\Documents\GitHub\rons-sovereign-codebase`.

## Identity and authority

ChatGPT operating on Ealiophin must verify the active GitHub CLI identity before reading or changing RONSAS:

```powershell
gh api user --jq .login
git -C C:\Users\Ashley\Documents\GitHub\rons-sovereign-codebase remote get-url origin
```

Required identity: `resonance36912-cell`.
Required origin: `https://github.com/resonance36912-cell/RONSAS.git`.

If either value differs, stop all GitHub writes. Do not switch repository visibility, billing, secrets, or authentication automatically.

## Direct-main safety

The repository uses a sovereign local guard because GitHub branch protection and repository rulesets are unavailable for this private repository on the current plan.

ChatGPT must verify:
- `git config --get core.hooksPath` returns `.githooks`.
- `.githooks/pre-push` blocks `refs/heads/main`.
- `RONSAS_ALLOW_MAIN_PUSH` is never enabled automatically.
If the hook is missing or disabled, restore it with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Enable-RonsasGitGuards.ps1
```

## Monitoring policy

Use `scripts\Watch-RonsasGitHubCI.ps1` as the machine-local signal source. The watcher is read-only: it verifies identity and authority, checks current `main` and open pull-request head SHAs, and records only failures that still apply to those current heads.

Historical failures for superseded commits are not actionable.

The watcher writes:
- `%LOCALAPPDATA%\Resonance\RONSAS\github-ci-monitor.json`
- `%LOCALAPPDATA%\Resonance\RONSAS\github-ci-monitor.log`

Exit codes:
- `0`: current heads are green or have no completed failures.
- `2`: one or more current workflow runs failed.
- `3`: GitHub identity, origin, hook, or CLI preflight failed.

## ChatGPT repair policy

When exit code `2` or the JSON state reports failures, ChatGPT must inspect the affected workflow run, jobs, steps, and logs before deciding on any change.

Retry once only when evidence indicates a transient runner, network, rate-limit, or infrastructure failure.

For deterministic low-risk code or CI defects:
1. Create an isolated worktree or fresh checkout from the affected current head.
2. Create `ronsas/autofix-<run-id>`.
3. Make the smallest safe change.
4. Run the targeted failing check and the relevant RONSAS verification/prebuild checks.
5. Push the repair branch and open a reviewable pull request.
Never:
- force-push;
- commit directly to `main`;
- auto-merge;
- overwrite a dirty working tree;
- enable `RONSAS_ALLOW_MAIN_PUSH`;
- change secrets, auth, billing, destructive data operations, or repository visibility automatically.

If the cause is ambiguous or the fix crosses those boundaries, create a diagnostic issue or pull request with evidence instead of performing the risky change.

## Gmail signal

Connected Gmail may be searched for GitHub notifications concerning `resonance36912-cell/RONSAS` as a secondary signal. GitHub Actions run data and logs remain authoritative. Email alone is not sufficient evidence for a repair.

## Handoff to another ChatGPT session

A ChatGPT session resuming RONSAS on Ealiophin should:
1. Read this protocol.
2. Run the sovereignty guard.
3. Run `scripts\Watch-RonsasGitHubCI.ps1`.
4. Inspect `github-ci-monitor.json`.
5. If failures are current, execute the repair policy above.
6. If green, leave Git state unchanged and continue normal RONSAS work.

This protocol complements the repository governance manifests and does not supersede `.ronsas\github-authority.json`.
