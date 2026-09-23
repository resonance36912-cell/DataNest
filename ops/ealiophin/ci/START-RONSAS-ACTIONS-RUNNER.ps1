[CmdletBinding()]
param(
    [string]$Repository = 'resonance36912-cell/RONSAS',
    [string]$Image = 'localhost/ronsas-actions-runner:2.337.0-r2',
    [string]$Container = 'ronsas-actions-ealiophin',
    [string]$RunnerName = 'Ealiophin-RONSAS-Linux-2',
    [string]$RunnerLabels = 'ronsas,ealiophin,sovereign',
    [string]$Network = 'ronsas-ci',
    [string]$Proxy = 'ronsas-podman-api',
    [string]$Volume = 'ronsas-actions-work',
    [string]$PodmanMachine = 'podman-machine-default',
    [switch]$ForceRecycle
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$podman = (Get-Command podman.exe -ErrorAction Stop).Source
$gh = (Get-Command gh.exe -ErrorAction Stop).Source

function Ensure-PodmanMachineReady {
    $priorErrorActionPreference = $ErrorActionPreference
    $machineRaw = @()
    $machineExit = 1
    try {
        $ErrorActionPreference = 'Continue'
        $machineRaw = @(& $podman machine list --format json 2>&1)
        $machineExit = [int]$LASTEXITCODE
    } finally {
        $ErrorActionPreference = $priorErrorActionPreference
    }
    if ($machineExit -ne 0) {
        throw 'Unable to inspect Podman machine state before governed runner recovery.'
    }

    try {
        $machines = @(($machineRaw -join [Environment]::NewLine) | ConvertFrom-Json)
    } catch {
        throw "Unable to parse Podman machine state before governed runner recovery: $($_.Exception.Message)"
    }
    $machine = @($machines | Where-Object { [string]$_.Name -eq $PodmanMachine }) | Select-Object -First 1
    if (-not $machine) {
        throw "Required existing Podman machine is missing: $PodmanMachine"
    }

    if (-not [bool]$machine.Running) {
        Write-Host "Podman machine is stopped; starting the existing machine once: $PodmanMachine" -ForegroundColor Yellow
        $trackingWasPresent = Test-Path Env:RUNNER_TRACKING_ID
        $trackingValue = if ($trackingWasPresent) { [string]$env:RUNNER_TRACKING_ID } else { $null }
        try {
            Remove-Item Env:RUNNER_TRACKING_ID -ErrorAction SilentlyContinue
            & $podman machine start $PodmanMachine
            if ($LASTEXITCODE -ne 0) { throw "Failed to start existing Podman machine: $PodmanMachine" }
        } finally {
            if ($trackingWasPresent) {
                $env:RUNNER_TRACKING_ID = $trackingValue
            } else {
                Remove-Item Env:RUNNER_TRACKING_ID -ErrorAction SilentlyContinue
            }
        }
    }

    for ($attempt = 1; $attempt -le 30; $attempt++) {
        $infoExit = 1
        try {
            $ErrorActionPreference = 'Continue'
            & $podman info *> $null
            $infoExit = [int]$LASTEXITCODE
        } finally {
            $ErrorActionPreference = $priorErrorActionPreference
        }
        if ($infoExit -eq 0) {
            Write-Host "Podman machine ready for governed runner recovery after attempt $attempt/30." -ForegroundColor Green
            return
        }
        Start-Sleep -Seconds 2
    }

    throw "Existing Podman machine did not become ready within the bounded wait: $PodmanMachine"
}


function Test-PodmanVmHttps {
    $priorErrorActionPreference = $ErrorActionPreference
    $exitCode = 1
    try {
        $ErrorActionPreference = 'Continue'
        & wsl.exe -d $PodmanMachine -u root -- sh -lc 'curl -4 -fsSIL --connect-timeout 5 --max-time 15 https://github.com >/dev/null && curl -4 -fsSIL --connect-timeout 5 --max-time 15 https://api.github.com >/dev/null' 2>$null
        $exitCode = [int]$LASTEXITCODE
    } finally {
        $ErrorActionPreference = $priorErrorActionPreference
    }
    return ($exitCode -eq 0)
}

function Test-PodmanVmInterfaceHttps([string]$Interface) {
    if ($Interface -notmatch '^eth[0-9]+$') { return $false }

    $priorErrorActionPreference = $ErrorActionPreference
    $exitCode = 1
    try {
        $ErrorActionPreference = 'Continue'
        $probe = "curl -4 -fsSIL --interface '$Interface' --connect-timeout 5 --max-time 15 https://github.com >/dev/null && curl -4 -fsSIL --interface '$Interface' --connect-timeout 5 --max-time 15 https://api.github.com >/dev/null"
        & wsl.exe -d $PodmanMachine -u root -- sh -lc $probe 2>$null
        $exitCode = [int]$LASTEXITCODE
    } finally {
        $ErrorActionPreference = $priorErrorActionPreference
    }
    return ($exitCode -eq 0)
}

function Ensure-PodmanVmEgress {
    if (Test-PodmanVmHttps) {
        Write-Host 'Podman VM HTTPS egress is already healthy.' -ForegroundColor Green
        return
    }

    try {
        $hostProbe = Invoke-WebRequest -UseBasicParsing -Method Head -Uri 'https://github.com' -TimeoutSec 10
        if ($hostProbe.StatusCode -lt 200 -or $hostProbe.StatusCode -ge 400) {
            throw "Unexpected host HTTPS status: $($hostProbe.StatusCode)"
        }
    } catch {
        throw "Windows host HTTPS is unavailable; refusing Podman VM route mutation: $($_.Exception.Message)"
    }

    $routes = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop |
        Where-Object { [string]$_.State -ne 'Dead' } |
        Sort-Object RouteMetric, InterfaceMetric)

    foreach ($route in $routes) {
        $gateway = [string]$route.NextHop
        $alias = [string]$route.InterfaceAlias
        if ([string]::IsNullOrWhiteSpace($gateway) -or $gateway -eq '0.0.0.0') { continue }

        $hostAddress = @(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias $alias -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -and $_.IPAddress -notlike '169.254.*' } |
            Select-Object -First 1).IPAddress
        if ([string]::IsNullOrWhiteSpace([string]$hostAddress)) { continue }

        $iface = (& wsl.exe -d $PodmanMachine -u root -- sh -lc "ip -o -4 addr show | grep -F ' $hostAddress/' | head -n 1 | cut -d' ' -f2").Trim()
        if ($iface -notmatch '^eth[0-9]+$') { continue }

        $healthy = Test-PodmanVmInterfaceHttps $iface
        Write-Host "Podman mirrored route probe: host=$alias address=$hostAddress gateway=$gateway guest=$iface healthy=$healthy"
        if (-not $healthy) { continue }

        $existingPreferred = @(& wsl.exe -d $PodmanMachine -u root -- sh -lc "ip -4 route show default | grep -F 'via $gateway dev $iface metric 5'" 2>$null)
        $addedPreferredRoute = ($LASTEXITCODE -ne 0 -or $existingPreferred.Count -eq 0)
        if ($addedPreferredRoute) {
            & wsl.exe -d $PodmanMachine -u root -- sh -lc "ip route replace default via $gateway dev $iface metric 5"
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to prefer proven healthy mirrored Podman VM route via $iface."
            }
        }

        Start-Sleep -Seconds 2
        if (Test-PodmanVmHttps) {
            Write-Host "Podman VM HTTPS egress restored through mirrored route $iface metric 5." -ForegroundColor Green
            return
        }

        if ($addedPreferredRoute) {
            $priorErrorActionPreference = $ErrorActionPreference
            try {
                $ErrorActionPreference = 'Continue'
                & wsl.exe -d $PodmanMachine -u root -- sh -lc "ip route del default via $gateway dev $iface metric 5" 2>$null
            } finally {
                $ErrorActionPreference = $priorErrorActionPreference
            }
        }
    }

    throw 'Podman VM HTTPS egress remains unavailable after testing existing non-dead mirrored host routes; refusing broader adapter, firewall, VPN, or WSL mutation.'
}

function Test-CiHttpsEgress {
    $priorErrorActionPreference = $ErrorActionPreference
    $exitCode = 1
    try {
        $ErrorActionPreference = 'Continue'
        & $podman run --rm --network $Network --entrypoint sh $Image -lc 'curl -4 -fsSIL --connect-timeout 5 --max-time 15 https://github.com >/dev/null && curl -4 -fsSIL --connect-timeout 5 --max-time 15 https://api.github.com >/dev/null' 2>$null
        $exitCode = [int]$LASTEXITCODE
    } finally {
        $ErrorActionPreference = $priorErrorActionPreference
    }
    return ($exitCode -eq 0)
}

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
    $priorErrorActionPreference = $ErrorActionPreference
    $top = @()
    $exitCode = 1
    try {
        $ErrorActionPreference = 'Continue'
        $top = @(& $podman top $Name 2>$null)
        $exitCode = [int]$LASTEXITCODE
    } finally {
        $ErrorActionPreference = $priorErrorActionPreference
    }
    if ($exitCode -ne 0) {
        return [pscustomobject]@{ observed = $false; listener = $false; worker = $false }
    }
    $joined = $top -join "`n"
    return [pscustomobject]@{
        observed = $true
        listener = ($joined -match 'Runner\.Listener')
        worker = ($joined -match 'Runner\.Worker')
    }
}

function Test-GovernedPodmanProxyConnectivity([string]$Name) {
    $priorErrorActionPreference = $ErrorActionPreference
    $exitCode = 1
    try {
        # Windows PowerShell 5.1 can promote transient native stderr into a
        # terminating NativeCommandError while the replacement container is
        # still transitioning. Treat that as a retryable readiness signal.
        $ErrorActionPreference = 'Continue'
        & $podman exec $Name podman --remote version *> $null
        $exitCode = [int]$LASTEXITCODE
    } finally {
        $ErrorActionPreference = $priorErrorActionPreference
    }
    return ($exitCode -eq 0)
}

function Wait-RunnerContainerReady([string]$Name, [int]$MaxAttempts = 30, [int]$DelaySeconds = 2) {
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        if (Test-ContainerExists $Name) {
            $info = (& $podman inspect $Name | ConvertFrom-Json)[0]
            if ($info.State.Running) {
                $runnerState = Get-RunnerProcessState $Name
                if ($runnerState.listener) {
                    Write-Host "Runner container ready after attempt $attempt/$MaxAttempts." -ForegroundColor Green
                    return $true
                }
            }
        }
        Write-Host "Runner container not fully ready yet; attempt $attempt/$MaxAttempts." -ForegroundColor Yellow
        Start-Sleep -Seconds $DelaySeconds
    }
    return $false
}

function Wait-GovernedPodmanProxyConnectivity([string]$Name, [int]$MaxAttempts = 30, [int]$DelaySeconds = 2) {
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        if (Test-GovernedPodmanProxyConnectivity $Name) {
            Write-Host "Governed Podman connectivity ready after attempt $attempt/$MaxAttempts." -ForegroundColor Green
            return $true
        }
        Write-Host "Governed Podman connectivity not ready yet; attempt $attempt/$MaxAttempts." -ForegroundColor Yellow
        Start-Sleep -Seconds $DelaySeconds
    }
    return $false
}

function Get-OtherInProgressWorkflowRuns {
    $currentRunId = 0L
    if ($env:GITHUB_RUN_ID) {
        [void][long]::TryParse([string]$env:GITHUB_RUN_ID, [ref]$currentRunId)
    }

    $active = @()
    $seen = @{}
    foreach ($status in @('in_progress','queued','waiting','pending','requested')) {
        $raw = @(& $gh api "repos/$Repository/actions/runs?status=$status&per_page=100")
        if ($LASTEXITCODE -ne 0) { throw "Unable to query GitHub workflow runs for status=$status." }
        $payload = ($raw -join "`n") | ConvertFrom-Json

        foreach ($run in @($payload.workflow_runs)) {
            if ($currentRunId -ne 0L -and [long]$run.id -eq $currentRunId) { continue }
            if ($seen.ContainsKey([string]$run.id)) { continue }

            $jobsRaw = @(& $gh api "repos/$Repository/actions/runs/$($run.id)/jobs?filter=latest&per_page=100")
            if ($LASTEXITCODE -ne 0) {
                throw "Unable to inspect jobs for workflow run $($run.id) while proving runner ownership."
            }
            $jobsPayload = ($jobsRaw -join "`n") | ConvertFrom-Json
            $owned = @($jobsPayload.jobs | Where-Object {
                [string]$_.runner_name -eq $RunnerName -and
                ([string]$_.status -eq 'queued' -or [string]$_.status -eq 'in_progress')
            }).Count -gt 0

            if ($owned) {
                $seen[[string]$run.id] = $true
                $active += $run
            }
        }
    }
    return @($active)
}

function Get-ActiveRunnerAssignments {
    $runsRaw = @(& $gh api "repos/$Repository/actions/runs?per_page=100")
    if ($LASTEXITCODE -ne 0) { throw 'Unable to query GitHub workflow runs for runner assignment proof.' }
    $runsPayload = ($runsRaw -join "`n") | ConvertFrom-Json
    $activeRunStates = @('queued','pending','waiting','requested','in_progress')
    $activeJobStates = @('queued','in_progress')
    $currentRunId = 0L
    if ($env:GITHUB_RUN_ID) {
        [void][long]::TryParse([string]$env:GITHUB_RUN_ID, [ref]$currentRunId)
    }

    $assignments = @()
    foreach ($run in @($runsPayload.workflow_runs | Where-Object {
        $activeRunStates -contains [string]$_.status -and
        ($currentRunId -eq 0L -or [long]$_.id -ne $currentRunId)
    })) {
        $jobsRaw = @(& $gh api "repos/$Repository/actions/runs/$($run.id)/jobs?filter=latest&per_page=100")
        if ($LASTEXITCODE -ne 0) { throw "Unable to query jobs for workflow run $($run.id)." }
        $jobsPayload = ($jobsRaw -join "`n") | ConvertFrom-Json
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

function Restore-PreservedRunnerContainer {
    if (-not (Test-ContainerExists $Container)) {
        throw "Preserved runner container disappeared during guarded recycle: $Container"
    }

    $info = (& $podman inspect $Container | ConvertFrom-Json)[0]
    if (-not $info.State.Running) {
        & $podman start $Container | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Failed to restart preserved runner container: $Container" }
    }

    if (-not (Wait-RunnerContainerReady $Container 30 2)) {
        throw 'Preserved runner container did not restore Runner.Listener before guarded recycle returned.'
    }
    if (-not (Wait-GovernedPodmanProxyConnectivity $Container 30 2)) {
        throw 'Preserved runner container did not restore governed Podman connectivity before guarded recycle returned.'
    }
    Write-Host 'Preserved runner container restored and verified before guarded recycle deferral.' -ForegroundColor Green
}

function Ensure-RunnerLabels($Runner) {
    if (-not $Runner) { return }
    $present = @($Runner.labels | ForEach-Object { [string]$_.name })
    $required = @($RunnerLabels -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $missing = @($required | Where-Object { $present -notcontains $_ })
    if ($missing.Count -eq 0) { return }
    $args = @('api','-X','POST',"repos/$Repository/actions/runners/$($Runner.id)/labels")
    foreach ($label in $missing) { $args += @('-f',"labels[]=$label") }
    & $gh @args | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to restore required GitHub runner labels.' }
}

Ensure-PodmanMachineReady
Ensure-PodmanVmEgress

& $podman network inspect $Network *> $null
if ($LASTEXITCODE -ne 0) { throw "Required CI network is missing: $Network" }
& $podman image inspect $Image *> $null
if ($LASTEXITCODE -ne 0) { throw "Required runner image is missing: $Image" }
if (-not (Test-CiHttpsEgress)) {
    throw 'Governed ronsas-ci HTTPS egress is unavailable before runner mutation.'
}
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
        $engineReady = Test-GovernedPodmanProxyConnectivity $Container
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
            $engineReady = Test-GovernedPodmanProxyConnectivity $Container
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

$staleBusyProven = $false
$forceRecycleDeleteReady = $false
if ($registered -and [bool]$registered.busy -and [string]$registered.status -eq 'online' -and $ForceRecycle) {
    $otherInProgress = @(Get-OtherInProgressWorkflowRuns)
    if ($otherInProgress.Count -gt 0) {
        $summary = ($otherInProgress | Select-Object -First 10 | ForEach-Object {
            "$($_.id):$($_.name):$($_.head_branch)"
        }) -join ', '
        Write-Host "ForceRecycle deferred because GitHub reports $($otherInProgress.Count) in-progress workflow run(s): $summary" -ForegroundColor Yellow
        exit 0
    }

    $activeAssignments = @(Get-ActiveRunnerAssignments)
    if ($activeAssignments.Count -gt 0) {
        $summary = ($activeAssignments | Select-Object -First 10 | ForEach-Object {
            "$($_.run_id):$($_.run_name):$($_.job_id):$($_.job_name):$($_.job_status)"
        }) -join ', '
        Write-Host "ForceRecycle deferred because GitHub reports active job assignment(s) on ${RunnerName}: $summary" -ForegroundColor Yellow
        exit 0
    }

    $runnerState = Get-RunnerProcessState $Container
    if (-not $runnerState.observed) {
        Write-Host 'ForceRecycle deferred because the local runner process state could not be observed safely.' -ForegroundColor Yellow
        exit 0
    }
    if ($runnerState.worker) {
        Write-Host 'ForceRecycle deferred because local Runner.Worker is active even though the repository workflow query is idle.' -ForegroundColor Yellow
        exit 0
    }

    Write-Host "ForceRecycle was authorized; GitHub reports busy=True while repository workflows are idle and no local Runner.Worker is active. Building a sustained stale-busy proof before recycle." -ForegroundColor Yellow
    $idleProofAttempts = 0
    for ($settleAttempt = 1; $settleAttempt -le 18; $settleAttempt++) {
        Start-Sleep -Seconds 5
        $otherInProgress = @(Get-OtherInProgressWorkflowRuns)
        if ($otherInProgress.Count -gt 0) {
            $summary = ($otherInProgress | Select-Object -First 10 | ForEach-Object {
                "$($_.id):$($_.name):$($_.head_branch)"
            }) -join ', '
            Write-Host "ForceRecycle deferred during stale-busy proof because new in-progress workflow work appeared: $summary" -ForegroundColor Yellow
            exit 0
        }

        $activeAssignments = @(Get-ActiveRunnerAssignments)
        if ($activeAssignments.Count -gt 0) {
            $summary = ($activeAssignments | Select-Object -First 10 | ForEach-Object {
                "$($_.run_id):$($_.run_name):$($_.job_id):$($_.job_name):$($_.job_status)"
            }) -join ', '
            Write-Host "ForceRecycle deferred during stale-busy proof because GitHub assigned work to ${RunnerName}: $summary" -ForegroundColor Yellow
            exit 0
        }

        $runnerState = Get-RunnerProcessState $Container
        if (-not $runnerState.observed) {
            Write-Host "ForceRecycle deferred during stale-busy proof because local runner process state became unobservable on attempt $settleAttempt/18." -ForegroundColor Yellow
            exit 0
        }
        if ($runnerState.worker) {
            Write-Host "ForceRecycle deferred during stale-busy proof because Runner.Worker became active on attempt $settleAttempt/18." -ForegroundColor Yellow
            exit 0
        }

        $activeAssignments = @(Get-ActiveRunnerAssignments)
        if ($activeAssignments.Count -gt 0) {
            Write-Warning 'GitHub assigned work to the production runner while it was disconnected; restoring the preserved runner container and deferring recycle.'
            Restore-PreservedRunnerContainer
            exit 0
        }

        $registered = Get-RegisteredRunner
        if (-not $registered) {
            Write-Host 'Runner registration disappeared during stale-busy proof; proceeding with fresh registration.' -ForegroundColor Yellow
            break
        }
        if (-not [bool]$registered.busy) {
            Write-Host "Runner busy state cleared after settle attempt $settleAttempt/18." -ForegroundColor Green
            break
        }

        $idleProofAttempts++
        Write-Host "Runner remains busy, but repository workflows are idle and no Runner.Worker is active; stale-busy proof $idleProofAttempts/18." -ForegroundColor Yellow
    }

    if ($registered -and [bool]$registered.busy) {
        if ($idleProofAttempts -lt 18) {
            Write-Warning 'Runner remained busy without a complete stale-busy proof. Deferring recycle rather than deleting an assigned runner.'
            exit 0
        }
        Write-Warning 'Runner remained busy for the full bounded proof window while repository workflows stayed idle and no Runner.Worker was observed. Treating the GitHub busy flag as stale and proceeding with guarded recycle.'
        $staleBusyProven = $true
    }

    if ($registered -and [string]$registered.status -eq 'online' -and -not [bool]$registered.busy) {
        Write-Host 'Runner busy state self-cleared during stale-busy proof; preserving the healthy online runner without recycle.' -ForegroundColor Green
        exit 0
    }
} elseif ($registered -and [bool]$registered.busy -and [string]$registered.status -ne 'online') {
    Write-Host "Runner registration is $($registered.status) but busy=True; treating busy state as stale and allowing governed recycle." -ForegroundColor Yellow
}

if ($staleBusyProven -and $registered -and [bool]$registered.busy -and [string]$registered.status -eq 'online') {
    $runnerState = Get-RunnerProcessState $Container
    if (-not $runnerState.observed -or $runnerState.worker) {
        Write-Warning 'Stale-busy proof cannot transition to disconnect because local runner state is no longer safely idle.'
        exit 0
    }

    $otherInProgress = @(Get-OtherInProgressWorkflowRuns)
    if ($otherInProgress.Count -gt 0) {
        Write-Host 'Stale-busy disconnect deferred because workflow work became active after the proof window.' -ForegroundColor Yellow
        exit 0
    }
    $activeAssignments = @(Get-ActiveRunnerAssignments)
    if ($activeAssignments.Count -gt 0) {
        Write-Host 'Stale-busy disconnect deferred because GitHub assigned work to the production runner after the proof window.' -ForegroundColor Yellow
        exit 0
    }

    Write-Host 'Stopping the proven-idle runner container so GitHub can release the stale assignment before registration deletion.' -ForegroundColor Yellow
    & $podman stop --time 10 $Container | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to stop proven-idle runner container: $Container" }

    for ($disconnectAttempt = 1; $disconnectAttempt -le 12; $disconnectAttempt++) {
        Start-Sleep -Seconds 5
        $otherInProgress = @(Get-OtherInProgressWorkflowRuns)
        if ($otherInProgress.Count -gt 0) {
            Write-Warning 'Workflow work appeared while waiting for the stale assignment to clear; restoring the preserved runner container and deferring recycle.'
            Restore-PreservedRunnerContainer
            exit 0
        }

        $registered = Get-RegisteredRunner
        if (-not $registered) {
            Write-Host "Runner registration disappeared after proven-idle disconnect on attempt $disconnectAttempt/12." -ForegroundColor Green
            break
        }
        if (-not [bool]$registered.busy -or [string]$registered.status -ne 'online') {
            Write-Host "GitHub released the stale assignment after proven-idle disconnect on attempt $disconnectAttempt/12." -ForegroundColor Green
            $forceRecycleDeleteReady = $true
            break
        }
        Write-Host "Waiting for GitHub to release the stale assignment after proven-idle disconnect; attempt $disconnectAttempt/12." -ForegroundColor Yellow
    }

    if ($registered -and [bool]$registered.busy -and [string]$registered.status -eq 'online') {
        Write-Warning 'GitHub did not release the stale assignment within the bounded disconnect window; restoring the preserved runner container and deferring recycle.'
        Restore-PreservedRunnerContainer
        exit 0
    }
}

if ($ForceRecycle -and $registered -and [string]$registered.status -eq 'online' -and -not $forceRecycleDeleteReady) {
    Write-Host 'ForceRecycle deferred because online runner registration deletion was not proven safe.' -ForegroundColor Yellow
    exit 0
}

if ($registered -and ($registered.status -ne 'online' -or $forceRecycleDeleteReady)) {
    $reason = if ($forceRecycleDeleteReady) { 'guarded recycle' } else { 'stale offline registration' }
    Write-Host "Removing GitHub runner registration for ${reason}: $RunnerName (id=$($registered.id))" -ForegroundColor Yellow

    $deleted = $false
    for ($deleteAttempt = 1; $deleteAttempt -le 3; $deleteAttempt++) {
        $priorErrorActionPreference = $ErrorActionPreference
        $deleteOutput = @()
        $deleteExit = 1
        try {
            # Windows PowerShell can promote native stderr (including GitHub's
            # expected HTTP 422 assigned-runner response) into a terminating
            # NativeCommandError. Capture it as data so the guarded retry logic
            # below can fail closed instead of escaping the recovery path.
            $ErrorActionPreference = 'Continue'
            $deleteOutput = @(& $gh api -X DELETE "repos/$Repository/actions/runners/$($registered.id)" 2>&1)
            $deleteExit = [int]$LASTEXITCODE
        } finally {
            $ErrorActionPreference = $priorErrorActionPreference
        }
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
                Restore-PreservedRunnerContainer
                exit 0
            }
            $activeAssignments = @(Get-ActiveRunnerAssignments)
            if ($activeAssignments.Count -gt 0) {
                Write-Host 'Runner deletion retry deferred because GitHub assigned work to the production runner.' -ForegroundColor Yellow
                Restore-PreservedRunnerContainer
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
        Write-Warning 'GitHub continued to reject runner deletion as assigned. Restoring the preserved runner before deferring; a later guarded pass can retry.'
        Restore-PreservedRunnerContainer
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
    '-e',"RUNNER_LABELS=$RunnerLabels",'-e',"DOCKER_HOST=$apiUrl",'-e',"CONTAINER_HOST=$apiUrl",
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

if (-not (Wait-RunnerContainerReady $Container 30 2)) {
    throw 'Replacement runner container did not become running with Runner.Listener active within the bounded readiness window.'
}
if (-not (Wait-GovernedPodmanProxyConnectivity $Container 30 2)) {
    throw 'Runner cannot reach governed Podman API proxy after the bounded readiness window.'
}
if (-not (Test-PodmanVmHttps)) {
    throw 'Podman VM HTTPS egress was lost after runner startup.'
}
if (-not (Test-CiHttpsEgress)) {
    throw 'Governed ronsas-ci HTTPS egress was lost after runner startup.'
}

Write-Host "RONSAS Actions runner online: $RunnerName on $Network" -ForegroundColor Green
Write-Host "Container: $Container | Image: $Image | Proxy: $Proxy"
