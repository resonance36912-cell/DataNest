[CmdletBinding()]
param(
    [string]$Repository = 'resonance36912-cell/RONSAS',
    [string]$RunnerVersion = '2.337.0',
    [string]$RunnerName = 'Ealiophin-RONSAS-Windows-1',
    [string]$RunnerRoot = (Join-Path $env:LOCALAPPDATA 'Resonance\RONS-GitHubRunner-Windows'),
    [string]$TaskName = 'RONSAS GitHub Windows Runner'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($Repository -ne 'resonance36912-cell/RONSAS') {
    throw 'This bootstrap is restricted to the private RONSAS control repository.'
}

$gh = (Get-Command gh.exe -ErrorAction Stop).Source
& $gh auth status *> $null
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI is not authenticated.' }

New-Item -ItemType Directory -Force -Path $RunnerRoot | Out-Null
$runnerExe = Join-Path $RunnerRoot 'bin\Runner.Listener.exe'
$workerExe = Join-Path $RunnerRoot 'bin\Runner.Worker.exe'
$runCmd = Join-Path $RunnerRoot 'run.cmd'
$configCmd = Join-Path $RunnerRoot 'config.cmd'

function Get-LocalRunnerListener {
    return Get-CimInstance Win32_Process -Filter "Name='Runner.Listener.exe'" -ErrorAction SilentlyContinue |
        Where-Object { [string]$_.ExecutablePath -eq $runnerExe } |
        Select-Object -First 1
}

function Get-LocalRunnerWorker {
    return Get-CimInstance Win32_Process -Filter "Name='Runner.Worker.exe'" -ErrorAction SilentlyContinue |
        Where-Object { [string]$_.ExecutablePath -eq $workerExe } |
        Select-Object -First 1
}

function Get-GitHubRunnerRegistration {
    $raw = @(& $gh api "repos/$Repository/actions/runners?per_page=100" 2>&1)
    if ($LASTEXITCODE -ne 0) { throw 'Unable to query GitHub runner registrations.' }
    $payload = ($raw -join [Environment]::NewLine) | ConvertFrom-Json
    $matches = @($payload.runners | Where-Object { [string]$_.name -eq $RunnerName })
    if ($matches.Count -gt 1) { throw "Multiple GitHub runner registrations found for $RunnerName; refusing automatic recovery." }
    return ($matches | Select-Object -First 1)
}

function Get-ActiveRunnerAssignments {
    $runsRaw = @(& $gh api "repos/$Repository/actions/runs?per_page=100" 2>&1)
    if ($LASTEXITCODE -ne 0) { throw 'Unable to query GitHub workflow runs for Windows runner assignment proof.' }
    $runsPayload = ($runsRaw -join [Environment]::NewLine) | ConvertFrom-Json
    $activeRunStates = @('queued','pending','waiting','requested','in_progress')
    $activeJobStates = @('queued','in_progress')
    $assignments = @()

    foreach ($run in @($runsPayload.workflow_runs | Where-Object {
        $activeRunStates -contains [string]$_.status
    })) {
        $jobsRaw = @(& $gh api "repos/$Repository/actions/runs/$($run.id)/jobs?filter=latest&per_page=100" 2>&1)
        if ($LASTEXITCODE -ne 0) { throw "Unable to query jobs for workflow run $($run.id)." }
        $jobsPayload = ($jobsRaw -join [Environment]::NewLine) | ConvertFrom-Json
        foreach ($job in @($jobsPayload.jobs)) {
            if (
                [string]$job.runner_name -eq $RunnerName -and
                $activeJobStates -contains [string]$job.status
            ) {
                $assignments += [pscustomobject]@{
                    run_id = [long]$run.id
                    run_name = [string]$run.name
                    branch = [string]$run.head_branch
                    job_id = [long]$job.id
                    job_name = [string]$job.name
                    job_status = [string]$job.status
                }
            }
        }
    }

    return @($assignments)
}

function Get-RunnerReleaseAsset {
    $tag = "v$RunnerVersion"
    $release = & $gh api "repos/actions/runner/releases/tags/$tag" | ConvertFrom-Json
    $assetName = "actions-runner-win-x64-$RunnerVersion.zip"
    $asset = @($release.assets | Where-Object { $_.name -eq $assetName }) | Select-Object -First 1
    if (-not $asset) { throw "GitHub Actions runner asset not found: $assetName" }
    return $asset
}

function Install-RunnerBits {
    $asset = Get-RunnerReleaseAsset
    $zip = Join-Path $env:TEMP $asset.name
    Invoke-WebRequest -UseBasicParsing -Uri ([string]$asset.browser_download_url) -OutFile $zip
    if ($asset.PSObject.Properties.Name -contains 'digest' -and $asset.digest) {
        $expected = ([string]$asset.digest).Replace('sha256:','').ToLowerInvariant()
        $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant()
        if ($actual -ne $expected) { throw 'GitHub Actions runner package checksum mismatch.' }
    }
    Get-ChildItem -LiteralPath $RunnerRoot -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notin @('_work') } |
        Remove-Item -Recurse -Force -ErrorAction Stop
    Expand-Archive -LiteralPath $zip -DestinationPath $RunnerRoot -Force
    Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path -LiteralPath $runnerExe -PathType Leaf)) {
    Install-RunnerBits
}
if (-not (Test-Path -LiteralPath $configCmd -PathType Leaf)) { throw 'Runner config.cmd is missing.' }
if (-not (Test-Path -LiteralPath $runCmd -PathType Leaf)) { throw 'Runner run.cmd is missing.' }

$running = Get-LocalRunnerListener
$registered = Get-GitHubRunnerRegistration
if ($running -and $registered -and [string]$registered.status -eq 'online') {
    Write-Host "RONSAS Windows runner healthy: PID $($running.ProcessId), GitHub status=online busy=$($registered.busy)" -ForegroundColor Green
    exit 0
}

if (-not $running -and $registered -and [string]$registered.status -eq 'online') {
    $worker = Get-LocalRunnerWorker
    if ($worker) {
        throw "GitHub reports the Windows runner online while local Runner.Listener is absent and Runner.Worker PID $($worker.ProcessId) is active; refusing ambiguous ownership recovery."
    }
    throw "GitHub reports the Windows runner online while the expected local Runner.Listener is absent (busy=$($registered.busy), id=$($registered.id)); refusing automatic restart or replacement until ownership is unambiguous."
}

if ($running) {
    $worker = Get-LocalRunnerWorker
    if ($worker) {
        throw "Runner.Listener exists but GitHub is not online while Runner.Worker PID $($worker.ProcessId) is active; refusing automatic restart."
    }
    if ($registered -and [bool]$registered.busy) {
        throw "Runner.Listener exists while GitHub reports the Windows runner busy=true (status=$($registered.status) id=$($registered.id)); refusing automatic restart."
    }
    $assignments = @(Get-ActiveRunnerAssignments)
    if ($assignments.Count -gt 0) {
        $summary = ($assignments | Select-Object -First 10 | ForEach-Object {
            "$($_.run_id):$($_.run_name):$($_.job_id):$($_.job_name):$($_.job_status)"
        }) -join ', '
        throw "Runner.Listener exists while GitHub reports active assignment(s) for the Windows runner; refusing automatic restart: $summary"
    }
    $state = if ($registered) { "status=$($registered.status) busy=$($registered.busy) id=$($registered.id)" } else { 'registration=missing' }
    Write-Warning "Runner.Listener PID $($running.ProcessId) is locally alive but GitHub is not online ($state); restarting only after Worker, busy, and assignment checks proved idle."
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    $running = Get-LocalRunnerListener
    if ($running) {
        Stop-Process -Id $running.ProcessId -Force -ErrorAction Stop
        Start-Sleep -Seconds 2
    }
}

$runnerConfig = Join-Path $RunnerRoot '.runner'
$migratedRunnerConfig = Join-Path $RunnerRoot '.runner_migrated'
$credentialConfig = Join-Path $RunnerRoot '.credentials'
$migratedCredentialConfig = Join-Path $RunnerRoot '.credentials_migrated'
$rsaCredentialConfig = Join-Path $RunnerRoot '.credentials_rsaparams'
$localRunnerConfigFiles = @(
    $runnerConfig,
    $migratedRunnerConfig,
    $credentialConfig,
    $migratedCredentialConfig,
    $rsaCredentialConfig
)

function Remove-StaleLocalRunnerConfiguration {
    foreach ($path in $localRunnerConfigFiles) {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            Remove-Item -LiteralPath $path -Force -ErrorAction Stop
        }
    }

    $remaining = @($localRunnerConfigFiles | Where-Object {
        Test-Path -LiteralPath $_ -PathType Leaf
    })
    if ($remaining.Count -gt 0) {
        throw "Stale local Windows runner configuration remained after cleanup: $($remaining -join ', ')"
    }
}
$hasLocalRunnerConfig = @($localRunnerConfigFiles | Where-Object {
    Test-Path -LiteralPath $_ -PathType Leaf
}).Count -gt 0
if (-not $registered -and $hasLocalRunnerConfig) {
    $worker = Get-LocalRunnerWorker
    if ($worker) {
        throw "GitHub runner registration is missing while Runner.Worker PID $($worker.ProcessId) is active; refusing local re-registration."
    }

    # actions/runner treats either .runner or .runner_migrated as configured,
    # while normal settings loading reads .runner. Clear the complete local
    # settings/credential set only after server absence and idle state are proven.
    Remove-StaleLocalRunnerConfiguration
    Write-Host 'Cleared stale local primary/migrated runner configuration after GitHub registration was proven missing.' -ForegroundColor Yellow
}

if (
    -not (Test-Path -LiteralPath $runnerConfig -PathType Leaf) -and
    -not (Test-Path -LiteralPath $migratedRunnerConfig -PathType Leaf)
) {
    $token = (& $gh api -X POST "repos/$Repository/actions/runners/registration-token" --jq .token).Trim()
    if ([string]::IsNullOrWhiteSpace($token)) { throw 'Unable to obtain GitHub runner registration token.' }
    try {
        Push-Location $RunnerRoot
        & $configCmd --unattended --url "https://github.com/$Repository" --token $token --name $RunnerName --labels 'ronsas,ealiophin,production-host' --work '_work' --replace
        if ($LASTEXITCODE -ne 0) { throw 'GitHub Actions Windows runner registration failed.' }
    } finally {
        $token = $null
        Pop-Location
    }
}

$userId = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute 'C:\Windows\System32\cmd.exe' -Argument ('/d /c ""' + $runCmd + '""') -WorkingDirectory $RunnerRoot
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$watchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($logonTrigger,$watchdogTrigger) -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 5

$running = Get-LocalRunnerListener
if (-not $running) { throw 'RONSAS Windows runner did not stay running.' }

$online = $false
$registered = $null
for ($attempt = 1; $attempt -le 12; $attempt++) {
    $registered = Get-GitHubRunnerRegistration
    if ($registered -and [string]$registered.status -eq 'online') {
        $online = $true
        break
    }
    Write-Host "Waiting for GitHub runner registration to become online; attempt $attempt/12."
    Start-Sleep -Seconds 5
}
if (-not $online) {
    $worker = Get-LocalRunnerWorker
    if ($worker) {
        throw "Windows runner stayed offline in GitHub while Runner.Worker PID $($worker.ProcessId) became active; refusing further recovery."
    }

    $registered = Get-GitHubRunnerRegistration
    if (-not $registered) {
        throw 'Windows runner failed to come online and its GitHub registration disappeared during verification; refusing automatic recycle without a fresh local pass.'
    }
    if ([string]$registered.status -ne 'offline') {
        throw "Windows runner failed to come online but GitHub registration status is '$($registered.status)'; refusing automatic recycle."
    }
    if ([bool]$registered.busy) {
        throw 'Windows runner failed to come online but GitHub still reports busy=true; refusing automatic recycle.'
    }

    $assignments = @(Get-ActiveRunnerAssignments)
    if ($assignments.Count -gt 0) {
        $summary = ($assignments | Select-Object -First 10 | ForEach-Object {
            "$($_.run_id):$($_.run_name):$($_.job_id):$($_.job_name):$($_.job_status)"
        }) -join ', '
        throw "Windows runner failed to come online but GitHub still reports active assignment(s): $summary"
    }

    Write-Warning "Windows runner remained offline after the bounded restart with no Worker, busy flag, or active assignment. Recycling only the stale offline registration id=$($registered.id)."
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    $running = Get-LocalRunnerListener
    if ($running) {
        Stop-Process -Id $running.ProcessId -Force -ErrorAction Stop
        Start-Sleep -Seconds 2
    }
    $worker = Get-LocalRunnerWorker
    if ($worker) {
        throw "Runner.Worker PID $($worker.ProcessId) appeared before stale offline registration recycle; refusing deletion."
    }
    $assignments = @(Get-ActiveRunnerAssignments)
    if ($assignments.Count -gt 0) {
        throw 'GitHub assigned work to the Windows runner before stale offline registration recycle; refusing deletion.'
    }

    $deleteCandidateId = [long]$registered.id
    $registered = Get-GitHubRunnerRegistration
    if (-not $registered) {
        throw 'Windows runner registration disappeared before guarded stale-offline deletion; refusing to delete by stale ID.'
    }
    if ([long]$registered.id -ne $deleteCandidateId) {
        throw "Windows runner registration identity changed before guarded deletion (expected=$deleteCandidateId actual=$($registered.id)); refusing recovery."
    }
    if ([string]$registered.status -ne 'offline' -or [bool]$registered.busy) {
        throw "Windows runner state changed before guarded deletion (status=$($registered.status) busy=$($registered.busy)); refusing recovery."
    }

    $priorErrorActionPreference = $ErrorActionPreference
    $deleteOutput = @()
    $deleteExit = 1
    try {
        # Windows PowerShell can promote native stderr into a terminating
        # NativeCommandError. Capture it as data so deletion remains fail-closed
        # and the exact GitHub response is preserved in the diagnostic.
        $ErrorActionPreference = 'Continue'
        $deleteOutput = @(& $gh api -X DELETE "repos/$Repository/actions/runners/$($registered.id)" 2>&1)
        $deleteExit = [int]$LASTEXITCODE
    } finally {
        $ErrorActionPreference = $priorErrorActionPreference
    }
    if ($deleteExit -ne 0) {
        throw "Failed to remove proven-idle stale offline Windows runner registration: $($deleteOutput -join [Environment]::NewLine)"
    }

    $registered = $null
    for ($disappearAttempt = 1; $disappearAttempt -le 6; $disappearAttempt++) {
        $registered = Get-GitHubRunnerRegistration
        if (-not $registered) { break }
        Write-Host "Waiting for stale offline Windows runner registration deletion to become visible; attempt $disappearAttempt/6."
        Start-Sleep -Seconds 2
    }
    if ($registered) {
        throw 'Windows runner registration still exists after stale offline deletion; refusing local re-registration.'
    }

    # The server-side registration is now proven absent. Remove the complete
    # local runner settings/credential set, including migrated settings, before
    # attempting exactly one clean re-registration.
    Remove-StaleLocalRunnerConfiguration
    Write-Host 'Cleared stale local primary/migrated runner configuration after guarded GitHub registration deletion.' -ForegroundColor Yellow

    $token = (& $gh api -X POST "repos/$Repository/actions/runners/registration-token" --jq .token).Trim()
    if ([string]::IsNullOrWhiteSpace($token)) { throw 'Unable to obtain GitHub runner registration token after stale offline recycle.' }
    try {
        Push-Location $RunnerRoot
        & $configCmd --unattended --url "https://github.com/$Repository" --token $token --name $RunnerName --labels 'ronsas,ealiophin,production-host' --work '_work' --replace
        if ($LASTEXITCODE -ne 0) { throw 'GitHub Actions Windows runner re-registration failed after stale offline recycle.' }
    } finally {
        $token = $null
        Pop-Location
    }

    Start-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 5
    $running = Get-LocalRunnerListener
    if (-not $running) {
        throw 'RONSAS Windows runner did not stay running after stale offline re-registration.'
    }

    $online = $false
    $registered = $null
    for ($retryAttempt = 1; $retryAttempt -le 12; $retryAttempt++) {
        $registered = Get-GitHubRunnerRegistration
        if ($registered -and [string]$registered.status -eq 'online') {
            $online = $true
            break
        }
        Write-Host "Waiting for re-registered Windows runner to become online; attempt $retryAttempt/12."
        Start-Sleep -Seconds 5
    }
    if (-not $online) {
        $worker = Get-LocalRunnerWorker
        if ($worker) {
            throw "Re-registered Windows runner stayed offline while Runner.Worker PID $($worker.ProcessId) became active; refusing further recovery."
        }
        throw 'RONSAS Windows runner still did not become online after one guarded stale-offline registration recycle.'
    }
}

Write-Host "RONSAS Windows runner online: $RunnerName (PID $($running.ProcessId), GitHub busy=$($registered.busy))" -ForegroundColor Green
Write-Host 'Repository scope: private resonance36912-cell/RONSAS only.'
Write-Host 'Labels: ronsas,ealiophin,production-host'
