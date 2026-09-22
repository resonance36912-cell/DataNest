[CmdletBinding()]
param(
    [string]$RepoRoot = 'C:\Users\Ashley\Documents\GitHub\rons-sovereign-codebase',
    [string]$Repository = 'resonance36912-cell/RONSAS',
    [string]$MonitorStatePath = '',
    [int]$MaxActions = 3
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExpectedAccount = 'resonance36912-cell'
$ExpectedOrigin = 'https://github.com/resonance36912-cell/RONSAS.git'
$StateDir = Join-Path $env:LOCALAPPDATA 'Resonance\RONSAS'
$RemediationStatePath = Join-Path $StateDir 'github-ci-remediation.json'
$LogPath = Join-Path $StateDir 'github-ci-remediation.log'
$WorktreeRoot = Join-Path $StateDir 'autofix'
New-Item -ItemType Directory -Force -Path $StateDir,$WorktreeRoot | Out-Null

function Write-RemediationLog {
    param([string]$Message)
    Add-Content -LiteralPath $LogPath -Value ('{0} [{1}] {2}' -f (Get-Date).ToString('o'), $env:COMPUTERNAME, $Message)
}

function Invoke-GhJson {
    param([string[]]$Arguments)
    $raw = & gh @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "gh $($Arguments -join ' ') failed: $($raw -join ' ')" }
    return (($raw | Out-String).Trim())
}

function Get-History {
    if (-not (Test-Path -LiteralPath $RemediationStatePath)) { return @() }
    try {
        $state = Get-Content -Raw -LiteralPath $RemediationStatePath | ConvertFrom-Json
        return @($state.history)
    } catch {
        Write-RemediationLog ('Ignoring unreadable remediation state: ' + $_.Exception.Message)
        return @()
    }
}

function Save-History {
    param([object[]]$History)
    [ordered]@{
        schema = 'ronsas-github-ci-remediation/v1'
        updated_at = (Get-Date).ToString('o')
        host = [Environment]::MachineName
        repository = $Repository
        history = @($History | Select-Object -Last 200)
    } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $RemediationStatePath -Encoding UTF8
}

function Get-FailedStepNames {
    param([long]$RunId)
    $runRaw = Invoke-GhJson -Arguments @('run','view',[string]$RunId,'--repo',$Repository,'--json','jobs')
    $run = $runRaw | ConvertFrom-Json
    return @(
        $run.jobs |
        ForEach-Object { @($_.steps) } |
        Where-Object { $_.conclusion -eq 'failure' } |
        ForEach-Object { [string]$_.name }
    )
}

function Ensure-TriageIssue {
    param(
        [object]$Failure,
        [string[]]$FailedSteps,
        [string]$Disposition
    )
    $branch = if ($Failure.head_branch) { [string]$Failure.head_branch } else { 'unknown' }
    $title = "[RONSAS CI] $($Failure.workflow) failure on $branch"
    $issuesRaw = Invoke-GhJson -Arguments @('issue','list','--repo',$Repository,'--state','open','--limit','100','--json','number,title,url')
    $issues = if ([string]::IsNullOrWhiteSpace($issuesRaw)) { @() } else { @($issuesRaw | ConvertFrom-Json) }
    $existing = @($issues | Where-Object { $_.title -eq $title } | Select-Object -First 1)

    $stepText = if ($FailedSteps.Count) { ($FailedSteps | ForEach-Object { "- $_" }) -join [Environment]::NewLine } else { '- Failed step detail unavailable' }
    $body = @"
Automated RONSAS CI monitor detected a current-head failure.

- Run: $($Failure.url)
- Run ID: $($Failure.run_id)
- Workflow: $($Failure.workflow)
- Branch: $branch
- SHA: $($Failure.head_sha)
- Conclusion: $($Failure.conclusion)
- Automated disposition: $Disposition

Failed steps:
$stepText

The monitor does not paste raw CI logs into issues, to avoid propagating secrets or sensitive runtime output. Use the linked GitHub run for full evidence.
"@

    if ($existing.Count -eq 1) {
        & gh issue comment ([string]$existing[0].number) --repo $Repository --body $body | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Unable to comment on CI triage issue #$($existing[0].number)." }
        return [pscustomobject]@{ number=$existing[0].number; url=$existing[0].url; created=$false }
    }

    $url = (& gh issue create --repo $Repository --title $title --body $body 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { throw "Unable to create CI triage issue: $url" }
    return [pscustomobject]@{ number=$null; url=$url; created=$true }
}

function Resolve-StaleTriageIssues {
    param([object[]]$CurrentFailures)

    $activeTitles = @{}
    foreach ($failure in @($CurrentFailures)) {
        $branch = if ($failure.head_branch) { [string]$failure.head_branch } else { 'unknown' }
        $title = "[RONSAS CI] $($failure.workflow) failure on $branch"
        $activeTitles[$title] = $true
    }

    $issuesRaw = Invoke-GhJson -Arguments @('issue','list','--repo',$Repository,'--state','open','--limit','200','--json','number,title,url')
    $issues = if ([string]::IsNullOrWhiteSpace($issuesRaw)) { @() } else { @($issuesRaw | ConvertFrom-Json) }
    $staleIssues = @(
        $issues | Where-Object {
            ([string]$_.title).StartsWith('[RONSAS CI] ') -and
            -not $activeTitles.ContainsKey([string]$_.title)
        }
    )

    foreach ($issue in $staleIssues) {
        $resolution = 'Automated RONSAS CI monitor resolved this alert because it is no longer present in the authoritative current-head failure set. Historical run evidence remains above.'
        & gh issue close ([string]$issue.number) --repo $Repository --reason completed --comment $resolution | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Unable to close resolved CI triage issue #$($issue.number)." }
        Write-RemediationLog "closed stale CI triage issue #$($issue.number): $($issue.title)"
    }
}

function Invoke-TransientRerun {
    param([object]$Failure)
    & gh run rerun ([string]$Failure.run_id) --repo $Repository --failed 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to rerun transient CI failure $($Failure.run_id)." }
    return 'rerun_failed_jobs'
}

function Invoke-FormattingAutofix {
    param([object]$Failure)

    if ([string]$Failure.scope -ne 'main') {
        return [pscustomobject]@{ success=$false; disposition='format_failure_on_non_main_not_mutated'; pr_url=$null }
    }

    $runId = [string]$Failure.run_id
    $sha = [string]$Failure.head_sha
    $branch = "ronsas/ci-autofix-$runId"
    $worktree = Join-Path $WorktreeRoot $runId

    & git -C $RepoRoot fetch origin --prune 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to fetch canonical RONSAS origin for formatting repair.' }

    $commitSpec = $sha + '^{commit}'
    & git -C $RepoRoot cat-file -e $commitSpec 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failure SHA $sha is not present in the canonical checkout." }

    $changed = @(& git -C $RepoRoot diff-tree --no-commit-id --name-only -r $sha 2>$null)
    $formatFiles = @(
        $changed |
        Where-Object { $_ -match '\.(ts|tsx|js|jsx|json|md|yml|yaml|css|scss)$' } |
        Where-Object { $_ -notmatch '(^|/)(bun\.lock|package-lock\.json|yarn\.lock)$' }
    )
    if (-not $formatFiles.Count) {
        return [pscustomobject]@{ success=$false; disposition='no_safe_format_targets'; pr_url=$null }
    }

    if (Test-Path -LiteralPath $worktree) {
        & git -C $RepoRoot worktree remove --force $worktree 2>&1 | Out-Null
    }
    & git -C $RepoRoot show-ref --verify --quiet "refs/heads/$branch"
    if ($LASTEXITCODE -eq 0) {
        return [pscustomobject]@{ success=$false; disposition='autofix_branch_already_exists'; pr_url=$null }
    }

    try {
        & git -C $RepoRoot worktree add -b $branch $worktree $sha 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Unable to create isolated autofix worktree for run $runId." }

        Push-Location $worktree
        try {
            & bun install --frozen-lockfile
            if ($LASTEXITCODE -ne 0) { throw 'Frozen dependency install failed during formatting autofix.' }

            & bun x prettier --write @formatFiles
            if ($LASTEXITCODE -ne 0) { throw 'Prettier failed during formatting autofix.' }

            $dirty = (& git status --porcelain | Out-String).Trim()
            if ([string]::IsNullOrWhiteSpace($dirty)) {
                return [pscustomobject]@{ success=$false; disposition='formatter_produced_no_change'; pr_url=$null }
            }

            & git diff --check
            if ($LASTEXITCODE -ne 0) { throw 'git diff --check failed after formatting autofix.' }
            & bun run prebuild
            if ($LASTEXITCODE -ne 0) { throw 'Prebuild failed after formatting autofix.' }
            & bun test
            if ($LASTEXITCODE -ne 0) { throw 'Tests failed after formatting autofix.' }
            & bun x tsc --noEmit
            if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed after formatting autofix.' }

            & git add -- @formatFiles
            & git commit -m "ci: autofix formatting from run $runId"
            if ($LASTEXITCODE -ne 0) { throw 'Unable to commit formatting autofix.' }
            & git push -u origin $branch
            if ($LASTEXITCODE -ne 0) { throw 'Unable to push formatting autofix review branch.' }

            $prUrl = (& gh pr create --repo $Repository --base main --head $branch --title "CI autofix: formatting from run $runId" --body "Automated low-risk formatting repair for failed CI run $($Failure.url). The repair was produced in an isolated worktree and passed prebuild, unit tests, typecheck, and git diff --check. No direct push to main is permitted." 2>&1 | Out-String).Trim()
            if ($LASTEXITCODE -ne 0) { throw "Unable to create formatting autofix PR: $prUrl" }
            return [pscustomobject]@{ success=$true; disposition='formatting_pr_created'; pr_url=$prUrl }
        }
        finally {
            Pop-Location
        }
    }
    finally {
        if (Test-Path -LiteralPath $worktree) {
            & git -C $RepoRoot worktree remove --force $worktree 2>&1 | Out-Null
        }
        & git -C $RepoRoot worktree prune 2>&1 | Out-Null
    }
}

$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\RONSAS_CI_Autofix', [ref]$created)
if (-not $created) {
    Write-Output 'RONSAS CI autofix is already running; skipping duplicate invocation.'
    exit 0
}

try {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) is not available.' }
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot '.git'))) { throw "RONSAS checkout missing: $RepoRoot" }

    $account = (Invoke-GhJson -Arguments @('api','user','--jq','.login')).Trim()
    if ($account -ne $ExpectedAccount) { throw "Wrong GitHub account: '$account'; expected '$ExpectedAccount'." }

    $origin = (& git -C $RepoRoot remote get-url origin 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $origin.TrimEnd('/') -ne $ExpectedOrigin.TrimEnd('/')) { throw "Wrong RONSAS origin: '$origin'." }

    $hooksPath = (& git -C $RepoRoot config --get core.hooksPath 2>&1 | Out-String).Trim()
    if ($hooksPath -ne '.githooks') { throw "RONSAS Git guard disabled: core.hooksPath='$hooksPath'." }

    if ([string]::IsNullOrWhiteSpace($MonitorStatePath)) {
        $MonitorStatePath = Join-Path $StateDir 'github-ci-monitor.json'
    }
    if (-not (Test-Path -LiteralPath $MonitorStatePath)) { throw "CI monitor state missing: $MonitorStatePath" }

    $monitor = Get-Content -Raw -LiteralPath $MonitorStatePath | ConvertFrom-Json
    $failures = @($monitor.current_failures)
    Resolve-StaleTriageIssues -CurrentFailures $failures
    if (-not $failures.Count) {
        Write-RemediationLog 'No current CI failures; no remediation required.'
        Write-Output 'RONSAS CI autofix: no current failures.'
        exit 0
    }

    $history = @(Get-History)
    $actions = 0

    foreach ($failure in $failures) {
        if ($actions -ge $MaxActions) { break }
        $already = @($history | Where-Object { [string]$_.run_id -eq [string]$failure.run_id })
        if ($already.Count) { continue }

        $failedSteps = @(Get-FailedStepNames -RunId ([long]$failure.run_id))
        $record = [ordered]@{
            run_id = [string]$failure.run_id
            observed_at = (Get-Date).ToString('o')
            workflow = [string]$failure.workflow
            branch = [string]$failure.head_branch
            sha = [string]$failure.head_sha
            conclusion = [string]$failure.conclusion
            action = ''
            artifact = $null
        }

        try {
            if (@('timed_out','startup_failure') -contains [string]$failure.conclusion) {
                $record.action = Invoke-TransientRerun -Failure $failure
                Write-RemediationLog "run=$($failure.run_id) transient failure rerun requested."
            }
            elseif ($failedSteps -contains 'Prettier format check') {
                $result = Invoke-FormattingAutofix -Failure $failure
                $record.action = $result.disposition
                $record.artifact = $result.pr_url
                if (-not $result.success) {
                    $issue = Ensure-TriageIssue -Failure $failure -FailedSteps $failedSteps -Disposition $result.disposition
                    $record.artifact = $issue.url
                }
                Write-RemediationLog "run=$($failure.run_id) formatting disposition=$($record.action)."
            }
            else {
                $issue = Ensure-TriageIssue -Failure $failure -FailedSteps $failedSteps -Disposition 'diagnosed_and_escalated_no_safe_recipe'
                $record.action = 'triage_issue_created_or_updated'
                $record.artifact = $issue.url
                Write-RemediationLog "run=$($failure.run_id) no safe recipe; triage issue recorded."
            }
        }
        catch {
            $record.action = 'remediation_error'
            $record.artifact = $_.Exception.Message
            Write-RemediationLog "run=$($failure.run_id) remediation error: $($_.Exception.Message)"
        }

        $history += [pscustomobject]$record
        $actions++
    }

    Save-History -History $history
    Write-Output "RONSAS CI autofix: processed $actions current failure(s). State: $RemediationStatePath"
    exit 0
}
catch {
    Write-RemediationLog ('PREFLIGHT FAILURE: ' + $_.Exception.Message)
    [Console]::Error.WriteLine('RONSAS CI autofix preflight failed: ' + $_.Exception.Message)
    exit 3
}
finally {
    if ($mutex) { $mutex.ReleaseMutex(); $mutex.Dispose() }
}
