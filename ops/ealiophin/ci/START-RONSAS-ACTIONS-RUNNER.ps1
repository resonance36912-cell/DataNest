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
    $payload = & $gh api "repos/$Repository/actions/runners" | ConvertFrom-Json
    return @($payload.runners | Where-Object { $_.name -eq $RunnerName }) | Select-Object -First 1
}

function Test-ContainerExists([string]$Name) {
    & $podman container exists $Name
    return ($LASTEXITCODE -eq 0)
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
        $containerReady = ($LASTEXITCODE -eq 0)
    }
}

if ($containerReady -and $registered -and $registered.status -eq 'online' -and -not $ForceRecycle) {
    Ensure-RunnerLabels $registered
    Write-Host 'RONSAS Actions runner already healthy on governed CI network.' -ForegroundColor Green
    exit 0
}

if ($registered -and [bool]$registered.busy) {
    throw 'RONSAS Actions runner is busy; refusing to replace an active runner.'
}

if ($registered -and ($registered.status -ne 'online' -or $ForceRecycle)) {
    $reason = if ($ForceRecycle) { 'guarded recycle' } else { 'stale offline registration' }
    Write-Host "Removing GitHub runner registration for ${reason}: $RunnerName (id=$($registered.id))" -ForegroundColor Yellow
    & $gh api -X DELETE "repos/$Repository/actions/runners/$($registered.id)"
    if ($LASTEXITCODE -ne 0) { throw 'Failed to remove GitHub runner registration.' }
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
