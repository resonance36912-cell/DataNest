[CmdletBinding()]
param(
    [string]$RepoRoot = 'C:\Users\Ashley\Documents\GitHub\rons-sovereign-codebase',
    [string]$Repository = 'resonance36912-cell/RONSAS',
    [int]$RunLimit = 100,
    [switch]$AutoRemediate,
    [string]$RemediatorPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExpectedAccount = 'resonance36912-cell'
$ExpectedOrigin = 'https://github.com/resonance36912-cell/RONSAS.git'
$StateDir = Join-Path $env:LOCALAPPDATA 'Resonance\RONSAS'
$StatePath = Join-Path $StateDir 'github-ci-monitor.json'
$LogPath = Join-Path $StateDir 'github-ci-monitor.log'
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

function Write-MonitorLog {
    param([string]$Message)
    Add-Content -LiteralPath $LogPath -Value ('{0} [{1}] {2}' -f (Get-Date).ToString('o'), $env:COMPUTERNAME, $Message)
}

function Invoke-GhJson {
    param([string[]]$Arguments)
    $raw = & gh @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "gh $($Arguments -join ' ') failed: $($raw -join ' ')" }
    return (($raw | Out-String).Trim())
}
try {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) is not available.' }
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot '.git'))) { throw "RONSAS checkout missing: $RepoRoot" }

    $account = (Invoke-GhJson -Arguments @('api','user','--jq','.login')).Trim()
    if ($account -ne $ExpectedAccount) { throw "Wrong GitHub account: '$account'; expected '$ExpectedAccount'." }

    $origin = (& git -C $RepoRoot remote get-url origin 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { throw "Unable to read RONSAS origin: $origin" }
    if ($origin.TrimEnd('/') -ne $ExpectedOrigin.TrimEnd('/')) { throw "Wrong RONSAS origin: '$origin'." }

    $hooksPath = (& git -C $RepoRoot config --get core.hooksPath 2>&1 | Out-String).Trim()
    if ($hooksPath -ne '.githooks') { throw "RONSAS Git guard disabled: core.hooksPath='$hooksPath'." }
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot '.githooks\pre-push'))) { throw 'RONSAS pre-push guard is missing.' }

    $mainSha = (Invoke-GhJson -Arguments @('api',"repos/$Repository/git/ref/heads/main",'--jq','.object.sha')).Trim()
    $prsRaw = Invoke-GhJson -Arguments @('pr','list','--repo',$Repository,'--state','open','--limit','100','--json','number,title,headRefName,headRefOid,url')
    $runsRaw = Invoke-GhJson -Arguments @('run','list','--repo',$Repository,'--limit',[string]$RunLimit,'--json','databaseId,name,displayTitle,event,status,conclusion,headBranch,headSha,createdAt,updatedAt,url')

    $prs = if ([string]::IsNullOrWhiteSpace($prsRaw)) { @() } else { @($prsRaw | ConvertFrom-Json) }
    $runs = if ([string]::IsNullOrWhiteSpace($runsRaw)) { @() } else { @($runsRaw | ConvertFrom-Json) }

    $currentHeads = @{}
    $currentHeads[$mainSha] = [pscustomobject]@{ kind='main'; number=$null; branch='main' }
    foreach ($pr in $prs) {
        if ($pr.headRefOid) { $currentHeads[[string]$pr.headRefOid] = [pscustomobject]@{ kind='pull_request'; number=$pr.number; branch=$pr.headRefName } }
    }
    $failureConclusions = @('failure','timed_out','action_required','startup_failure')
    $currentRuns = @(
        $runs | Where-Object { $currentHeads.ContainsKey([string]$_.headSha) } |
        Sort-Object -Property createdAt -Descending
    )
    $latestRuns = @()
    $seenRunKeys = @{}
    foreach ($run in $currentRuns) {
        $key = '{0}|{1}|{2}' -f $run.headSha, $run.name, $run.event
        if ($seenRunKeys.ContainsKey($key)) { continue }
        $seenRunKeys[$key] = $true
        $latestRuns += $run
    }

    $currentFailures = @(
        $latestRuns | Where-Object {
            $_.status -eq 'completed' -and
            $failureConclusions -contains [string]$_.conclusion
        } | ForEach-Object {
            $scope = $currentHeads[[string]$_.headSha]
            [pscustomobject]@{
                run_id = $_.databaseId
                workflow = $_.name
                title = $_.displayTitle
                event = $_.event
                conclusion = $_.conclusion
                head_branch = $_.headBranch
                head_sha = $_.headSha
                scope = $scope.kind
                pull_request = $scope.number
                created_at = $_.createdAt
                updated_at = $_.updatedAt
                url = $_.url
            }
        }
    )

    $currentPending = @($latestRuns | Where-Object { $_.status -ne 'completed' })

    $state = [ordered]@{
        schema = 'ronsas-github-ci-monitor/v1'
        checked_at = (Get-Date).ToString('o')
        host = [Environment]::MachineName
        github_account = $account
        repository = $Repository
        origin = $origin
        hooks_path = $hooksPath
        main_sha = $mainSha
        open_pull_requests = @($prs)
        current_failure_count = $currentFailures.Count
        current_failures = $currentFailures
        current_pending_count = $currentPending.Count
        current_pending = $currentPending
    }
    $state | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $StatePath -Encoding UTF8

    if ($AutoRemediate) {
        if ([string]::IsNullOrWhiteSpace($RemediatorPath)) {
            $RemediatorPath = Join-Path $RepoRoot 'scripts\Invoke-RonsasCiAutofix.ps1'
        }
        if (-not (Test-Path -LiteralPath $RemediatorPath -PathType Leaf)) {
            throw "RONSAS CI remediator missing: $RemediatorPath"
        }
        Write-MonitorLog "AUTO-REMEDIATE invoking $RemediatorPath"
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $RemediatorPath -RepoRoot $RepoRoot -Repository $Repository -MonitorStatePath $StatePath
        $remediationExit = $LASTEXITCODE
        Write-MonitorLog "AUTO-REMEDIATE completed exit=$remediationExit"
    }

    if ($currentFailures.Count -gt 0) {
        Write-MonitorLog ("CURRENT FAILURE count={0}; account={1}; main={2}" -f $currentFailures.Count, $account, $mainSha)
        foreach ($failure in $currentFailures) {
            Write-MonitorLog ("run={0} workflow='{1}' branch='{2}' sha={3} conclusion={4}" -f $failure.run_id, $failure.workflow, $failure.head_branch, $failure.head_sha, $failure.conclusion)
        }
        Write-Output "RONSAS CI: $($currentFailures.Count) current failure(s). State: $StatePath"
        exit 2
    }

    Write-MonitorLog ("GREEN current heads; pending={0}; account={1}; main={2}" -f $currentPending.Count, $account, $mainSha)
    Write-Output "RONSAS CI: current heads green; pending=$($currentPending.Count). State: $StatePath"
    exit 0
}
catch {
    $message = $_.Exception.Message
    Write-MonitorLog ("PREFLIGHT FAILURE: $message")
    $errorState = [ordered]@{
        schema = 'ronsas-github-ci-monitor/v1'
        checked_at = (Get-Date).ToString('o')
        host = $env:COMPUTERNAME
        status = 'preflight_failure'
        error = $message
    }
    $errorState | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $StatePath -Encoding UTF8
    [Console]::Error.WriteLine("RONSAS CI monitor preflight failed: $message")
    exit 3
}
