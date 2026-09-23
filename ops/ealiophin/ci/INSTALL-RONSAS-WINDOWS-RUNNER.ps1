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
$null = (Get-Command git.exe -ErrorAction Stop).Source

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

if ($running) {
    $worker = Get-LocalRunnerWorker
    if ($worker) {
        throw "Runner.Listener exists but GitHub is not online while Runner.Worker PID $($worker.ProcessId) is active; refusing automatic restart."
    }
    $state = if ($registered) { "status=$($registered.status) busy=$($registered.busy) id=$($registered.id)" } else { 'registration=missing' }
    Write-Warning "Runner.Listener PID $($running.ProcessId) is locally alive but GitHub is not online ($state); restarting the idle listener."
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
if (-not (Test-Path -LiteralPath $runnerConfig -PathType Leaf)) {
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
    throw 'RONSAS Windows runner process is running locally but GitHub did not report it online within the bounded verification window.'
}

Write-Host "RONSAS Windows runner online: $RunnerName (PID $($running.ProcessId), GitHub busy=$($registered.busy))" -ForegroundColor Green
Write-Host 'Repository scope: private resonance36912-cell/RONSAS only.'
Write-Host 'Labels: ronsas,ealiophin,production-host'
