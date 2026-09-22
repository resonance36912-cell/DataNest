[CmdletBinding()]
param(
    [string]$Repository = 'resonance36912-cell/RONSAS',
    [string]$Image = 'localhost/ronsas-actions-runner:2.337.0-r2',
    [string]$Container = 'ronsas-actions-ealiophin',
    [string]$RunnerName = 'Ealiophin-RONSAS-Linux-2',
    [string]$Network = 'ronsas-ci',
    [string]$Proxy = 'ronsas-podman-api',
    [string]$Volume = 'ronsas-actions-work',
    [switch]$ForceRecycle
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$podman = (Get-Command podman.exe -ErrorAction Stop).Source
$gh = (Get-Command gh.exe -ErrorAction Stop).Source

function Get-RegisteredRunner {
    $runnerRaw = @(& $gh api "repos/$Repository/actions/runners")
    if ($LASTEXITCODE -ne 0) { throw 'Unable to query GitHub runner registrations.' }
    $payload = ($runnerRaw -join "`n") | ConvertFrom-Json
    return @($payload.runners | Where-Object { $_.name -eq $RunnerName }) | Select-Object -First 1
}

function Test-ContainerExists([string]$Name) {
    & $podman container exists $Name
    return ($LASTEXITCODE -eq 0)
}

function Get-RunnerProcessState([string]$Name) {
    $top = @(& $podman top $Name 2>$null)
    if ($LASTEXITCODE -ne 0) {
        return [pscustomobject]@{ listener = $false; worker = $false }
    }
    $joined = $top -join "`n"
    return [pscustomobject]@{
        listener = ($joined -match 'Runner\.Listener')
        worker = ($joined -match 'Runner\.Worker')
    }
}

function Get-OtherInProgressWorkflowRuns {
    $raw = @(& $gh api "repos/$Repository/actions/runs?status=in_progress&per_page=100")
    if ($LASTEXITCODE -ne 0) { throw 'Unable to query in-progress GitHub workflow runs.' }
    $payload = ($raw -join "`n") | ConvertFrom-Json
    $currentRunId = 0L
    if ($env:GITHUB_RUN_ID) {
        [void][long]::TryParse([string]$env:GITHUB_RUN_ID, [ref]$currentRunId)
    }
    return @($payload.workflow_runs | Where-Object {
        $currentRunId -eq 0L -or [long]$_.id -ne $currentRunId
    })
}

function Ensure-RunnerLabels($Runner) {
    if (-not $Runner) { return }
    $present = @($Runner.labels | ForEach-Object { [string]$_.name })
    $missing = @('ronsas','ealiophin','sovereign' | Where-Object { $present -notcontains $_ })
    if ($missing.Count -eq 0) { return }
    $args = @('api','-X','POST',"repos/$Repository/actions/runners/$($Runner.id)/labels")
    foreach ($label in $missing) { $args += @('-f',"labels[]=$label") }
    & $gh @args | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to restore required GitHub runner labels.' }
}

& $podman network inspect $Network *> $null
if ($LASTEXITCODE -ne 0) { throw "Required CI network is missing: $Network" }
& $podman image inspect $Image *> $null
if ($LASTEXITCODE -ne 0) { throw "Required runner image is missing: $Image" }
if (-not (Test-ContainerExists $Proxy)) { throw "Governed Podman API proxy is missing: $Proxy" }

$proxyInfo = (& $podman inspect $Proxy | ConvertFrom-Json)[0]
if (-not $proxyInfo.State.Running) {
    & $podman start $Proxy | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to start governed Podman API proxy: $Proxy" }
    $proxyInfo = (& $podman inspect $Proxy | ConvertFrom-Json)[0]
}
if (-not ($proxyInfo.NetworkSettings.Networks.PSObject.Properties.Name -contains $Network)) {
    & $podman network connect $Network $Proxy
    if ($LASTEXITCODE -ne 0) { throw "$Proxy could not be attached to $Network" }
}

$registered = Get-RegisteredRunner
$containerReady = $false
if (Test-ContainerExists $Container) {
    $info = (& $podman inspect $Container | ConvertFrom-Json)[0]
    $attached = ($info.NetworkSettings.PSObject.Properties.Name -contains 'Networks') -and ($info.NetworkSettings.Networks.PSObject.Properties.Name -contains $Network)
    if ($info.State.Running -and $attached) {
        & $podman exec $Container podman --remote version *> $null
        $engineReady = ($LASTEXITCODE -eq 0)
        $runnerState = Get-RunnerProcessState $Container

        if ($engineReady -and -not $runnerState.listener) {
            if ($runnerState.worker) {
                Write-Host 'Runner.Listener is absent while Runner.Worker is still active; preserving the in-flight assignment and deferring recovery.' -ForegroundColor Yellow
                exit 0
            }

            Write-Host 'Runner.Listener is absent with no Runner.Worker; restarting the existing governed runner container once.' -ForegroundColor Yellow
            & $podman restart $Container | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Failed to restart governed runner container: $Container" }
            Start-Sleep -Seconds 5

            $info = (& $podman inspect $Container | ConvertFrom-Json)[0]
            $attached = ($info.NetworkSettings.PSObject.Properties.Name -contains 'Networks') -and ($info.NetworkSettings.Networks.PSObject.Properties.Name -contains $Network)
            & $podman exec $Container podman --remote version *> $null
            $engineReady = ($LASTEXITCODE -eq 0)
            $runnerState = Get-RunnerProcessState $Container
        }

        $containerReady = ($info.State.Running -and $attached -and $engineReady -and $runnerState.listener)
    }
}

if ($containerReady -and $registered -and $registered.status -eq 'online' -and -not $ForceRecycle) {
    Ensure-RunnerLabels $registered
    Write-Host 'RONSAS Actions runner already healthy on governed CI network.' -ForegroundColor Green
    exit 0
}

if ($registered -and [bool]$registered.busy -and [string]$registered.status -eq 'online' -and -not $ForceRecycle) {
    throw 'RONSAS Actions runner is online and busy; refusing unguarded replacement of an active runner.'
}
if ($registered -and [bool]$registered.busy -and [string]$registered.status -eq 'online' -and $ForceRecycle) {
    $otherInProgress = @(Get-OtherInProgressWorkflowRuns)
    if ($otherInProgress.Count -gt 0) {
        $summary = ($otherInProgress | Select-Object -First 10 | ForEach-Object {
            "$($_.id):$($_.name):$($_.head_branch)"
        }) -join ', '
        Write-Host "ForceRecycle deferred because GitHub reports $($otherInProgress.Count) in-progress workflow run(s): $summary" -ForegroundColor Yellow
        exit 0
    }

    Write-Host "ForceRecycle was authorized and no other workflow is in progress, but GitHub still reports busy=True. Waiting for assignment finalization." -ForegroundColor Yellow
    for ($settleAttempt = 1; $settleAttempt -le 18; $settleAttempt++) {
        Start-Sleep -Seconds 5
        $otherInProgress = @(Get-OtherInProgressWorkflowRuns)
        if ($otherInProgress.Count -gt 0) {
            $summary = ($otherInProgress | Select-Object -First 10 | ForEach-Object {
                "$($_.id):$($_.name):$($_.head_branch)"
            }) -join ', '
            Write-Host "ForceRecycle deferred during settle window because new in-progress workflow work appeared: $summary" -ForegroundColor Yellow
            exit 0
        }

        $registered = Get-RegisteredRunner
        if (-not $registered) {
            Write-Host 'Runner registration disappeared during settle window; proceeding with fresh registration.' -ForegroundColor Yellow
            break
        }
        if (-not [bool]$registered.busy) {
            Write-Host "Runner busy state cleared after settle attempt $settleAttempt/18." -ForegroundColor Green
            break
        }
        Write-Host "Runner remains busy during settle attempt $settleAttempt/18; preserving assignment." -ForegroundColor Yellow
    }

    if ($registered -and [bool]$registered.busy) {
        Write-Warning 'Runner remained busy throughout the bounded settle window. Deferring recycle rather than deleting an assigned runner.'
        exit 0
    }
} elseif ($registered -and [bool]$registered.busy -and [string]$registered.status -ne 'online') {
    Write-Host "Runner registration is $($registered.status) but busy=True; treating busy state as stale and allowing governed recycle." -ForegroundColor Yellow
}

if ($registered -and ($registered.status -ne 'online' -or $ForceRecycle)) {
    $reason = if ($ForceRecycle) { 'guarded recycle' } else { 'stale offline registration' }
    Write-Host "Removing GitHub runner registration for ${reason}: $RunnerName (id=$($registered.id))" -ForegroundColor Yellow

    $deleted = $false
    for ($deleteAttempt = 1; $deleteAttempt -le 3; $deleteAttempt++) {
        $deleteOutput = @(& $gh api -X DELETE "repos/$Repository/actions/runners/$($registered.id)" 2>&1)
        $deleteExit = $LASTEXITCODE
        if ($deleteExit -eq 0) {
            $deleted = $true
            break
        }

        $deleteText = ($deleteOutput -join [Environment]::NewLine)
        if ($deleteText -match 'currently running a job' -or $deleteText -match 'HTTP 422') {
            Write-Warning "GitHub still considers the runner assigned during delete attempt $deleteAttempt/3; waiting before retry."
            Start-Sleep -Seconds 5
            $otherInProgress = @(Get-OtherInProgressWorkflowRuns)
            if ($otherInProgress.Count -gt 0) {
                $summary = ($otherInProgress | Select-Object -First 10 | ForEach-Object {
                    "$($_.id):$($_.name):$($_.head_branch)"
                }) -join ', '
                Write-Host "Runner deletion retry deferred because workflow work became active: $summary" -ForegroundColor Yellow
                exit 0
            }
            $registered = Get-RegisteredRunner
            if (-not $registered) {
                $deleted = $true
                break
            }
            continue
        }

        throw "Failed to remove GitHub runner registration: $deleteText"
    }

    if (-not $deleted) {
        Write-Warning 'GitHub continued to reject runner deletion as assigned. Deferring recycle safely; a later guarded pass can retry.'
        exit 0
    }
    $registered = $null
}

$token = (& $gh api -X POST "repos/$Repository/actions/runners/registration-token" --jq .token).Trim()
if ([string]::IsNullOrWhiteSpace($token)) { throw 'Unable to obtain an ephemeral GitHub runner registration token.' }

if (Test-ContainerExists $Container) { & $podman rm -f $Container | Out-Null }
& $podman volume exists $Volume
if ($LASTEXITCODE -ne 0) { & $podman volume create $Volume | Out-Null }

# The persistent work volume may have been created by an older runner image
# with a different UID/GID. Normalize it before registering the replacement
# so GitHub Actions can write _PipelineMapping and checkout metadata.
& $podman run --rm --user root -v "${Volume}:/work" --entrypoint sh $Image -lc 'chown -R 1000:1000 /work'
if ($LASTEXITCODE -ne 0) { throw 'Failed to normalize runner work-volume ownership.' }

$repoUrl = "https://github.com/$Repository"
$apiUrl = "tcp://$Proxy`:2375"
$args = @('run','-d','--name',$Container,'--restart','unless-stopped','--network',$Network,
    '-e',"REPO_URL=$repoUrl",'-e',"RUNNER_TOKEN=$token",'-e',"RUNNER_NAME=$RunnerName",
    '-e','RUNNER_LABELS=ronsas,ealiophin,sovereign','-e',"DOCKER_HOST=$apiUrl",'-e',"CONTAINER_HOST=$apiUrl",
    '-v',"${Volume}:/home/runner/_work",$Image)
& $podman @args | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to start RONSAS Actions runner container.' }
$token = $null

$online = $false
for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 1
    $registered = Get-RegisteredRunner
    if ($registered -and $registered.status -eq 'online') { $online = $true; break }
}
if (-not $online) { throw 'RONSAS Actions runner did not become online.' }
Ensure-RunnerLabels $registered

& $podman exec $Container podman --remote version *> $null
if ($LASTEXITCODE -ne 0) { throw 'Runner cannot reach governed Podman API proxy.' }

Write-Host "RONSAS Actions runner online: $RunnerName on $Network" -ForegroundColor Green
Write-Host "Container: $Container | Image: $Image | Proxy: $Proxy"
