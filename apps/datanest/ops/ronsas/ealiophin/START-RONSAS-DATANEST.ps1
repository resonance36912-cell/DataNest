[CmdletBinding()]
param(
    [switch]$RefreshDependencies,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$RegistryPath = Join-Path $PSScriptRoot 'RONSAS-MODULES.json'
$Registry = Get-Content -Raw -LiteralPath $RegistryPath | ConvertFrom-Json
if ([string]$Registry.schema -ne 'datanest.ronsas.module-registry.v2') {
    throw "Unsupported RONSAS registry schema: $($Registry.schema)"
}
if ([string]$Registry.repository -ne 'DataNest-Supository/DataNest') {
    throw 'RONSAS control authority must be DataNest-Supository/DataNest.'
}

$RuntimeRoot = if ($env:DATANEST_RONSAS_RUNTIME_ROOT) {
    [System.IO.Path]::GetFullPath($env:DATANEST_RONSAS_RUNTIME_ROOT)
} else {
    Join-Path $env:LOCALAPPDATA 'Resonance\DataNest-RONSAS'
}
$LogRoot = Join-Path $RuntimeRoot 'logs'
$StatePath = Join-Path $RuntimeRoot 'ronsas-state.json'
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null

$priorState = $null
if (Test-Path -LiteralPath $StatePath -PathType Leaf) {
    try {
        $candidate = Get-Content -Raw -LiteralPath $StatePath | ConvertFrom-Json
        if ([string]$candidate.schema -eq 'datanest.ronsas.runtime-state.v1' -and [string]$candidate.repository -eq 'DataNest-Supository/DataNest') {
            $priorState = $candidate
        }
    } catch {
        Write-Warning "[RONSAS] Existing runtime state could not be parsed; ownership will be rebuilt conservatively."
    }
}

function Get-PriorOwnedEntry([string]$Id) {
    if ($null -eq $priorState) { return $null }
    return @($priorState.processes | Where-Object { [string]$_.id -eq $Id -and [bool]$_.owned -and $_.pid } | Select-Object -First 1)[0]
}

function Test-Health([string]$Uri) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 4
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
    } catch {
        return $false
    }
}

function Wait-Health([string]$Uri, [int]$TimeoutSeconds = 60) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        if (Test-Health $Uri) { return $true }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    return $false
}

function Invoke-Checked([string]$FilePath, [string[]]$ArgumentList, [string]$WorkingDirectory, [string]$Label) {
    Write-Host "[RONSAS] $Label" -ForegroundColor Cyan
    $process = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $WorkingDirectory -Wait -PassThru -NoNewWindow
    if ($process.ExitCode -ne 0) {
        throw "$Label failed with exit code $($process.ExitCode)."
    }
}

$state = [ordered]@{
    schema = 'datanest.ronsas.runtime-state.v1'
    repository = 'DataNest-Supository/DataNest'
    repoRoot = $RepoRoot
    startedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    processes = @()
}

foreach ($module in @($Registry.modules | Where-Object { $_.kind -eq 'web-app' })) {
    $source = Join-Path $RepoRoot ([string]$module.source)
    if (-not (Test-Path -LiteralPath (Join-Path $source 'package.json') -PathType Leaf)) {
        throw "RONSAS module source is missing from DataNest: $($module.id) -> $source"
    }

    if (Test-Health ([string]$module.health)) {
        Write-Host "[RONSAS] $($module.displayName) already healthy at $($module.health)." -ForegroundColor Green
        $prior = Get-PriorOwnedEntry ([string]$module.id)
        if ($prior) {
            $state.processes += [ordered]@{
                id = [string]$module.id
                pid = [int]$prior.pid
                owned = $true
                source = [string]$module.source
                health = [string]$module.health
                launcher = [string]$prior.launcher
                startedAtUtc = [string]$prior.startedAtUtc
            }
        } else {
            $state.processes += [ordered]@{
                id = [string]$module.id
                pid = $null
                owned = $false
                source = [string]$module.source
                health = [string]$module.health
            }
        }
        continue
    }

    $manager = [string]$module.packageManager
    if ($manager -eq 'npm') {
        $tool = (Get-Command npm.cmd -ErrorAction Stop).Source
        if ($RefreshDependencies -or -not (Test-Path -LiteralPath (Join-Path $source 'node_modules') -PathType Container)) {
            Invoke-Checked $tool @('ci') $source "$($module.displayName): npm ci"
        }
        if (-not $SkipBuild) {
            Invoke-Checked $tool @('run','build') $source "$($module.displayName): build"
        }
        $launchArgs = @('run','preview','--','--host','127.0.0.1','--port',[string]$module.port)
    } elseif ($manager -eq 'bun') {
        $tool = (Get-Command bun -ErrorAction Stop).Source
        if ($RefreshDependencies -or -not (Test-Path -LiteralPath (Join-Path $source 'node_modules') -PathType Container)) {
            Invoke-Checked $tool @('install','--frozen-lockfile') $source "$($module.displayName): bun install"
        }
        if (-not $SkipBuild) {
            Invoke-Checked $tool @('run','build') $source "$($module.displayName): build"
        }
        $launchArgs = @('run','preview','--','--host','127.0.0.1','--port',[string]$module.port)
    } else {
        throw "Unsupported package manager '$manager' for $($module.id)."
    }

    $launcherPath = Join-Path $RuntimeRoot ("launch-$($module.id).ps1")
    $escapedSource = $source.Replace("'","''")
    $escapedTool = $tool.Replace("'","''")
    $argumentSource = ($launchArgs | ForEach-Object { "'" + ([string]$_).Replace("'","''") + "'" }) -join ','
    $launcher = @"
Set-Location -LiteralPath '$escapedSource'
& '$escapedTool' @($argumentSource)
exit `$LASTEXITCODE
"@
    Set-Content -LiteralPath $launcherPath -Value $launcher -Encoding UTF8

    $stdout = Join-Path $LogRoot ("$($module.id).out.log")
    $stderr = Join-Path $LogRoot ("$($module.id).err.log")
    $process = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$launcherPath) -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr

    if (-not (Wait-Health ([string]$module.health) 75)) {
        try { & taskkill.exe /PID $process.Id /T /F | Out-Null } catch {}
        throw "$($module.displayName) did not become healthy at $($module.health). See $stderr"
    }

    Write-Host "[RONSAS] $($module.displayName) healthy (PID $($process.Id))." -ForegroundColor Green
    $state.processes += [ordered]@{
        id = [string]$module.id
        pid = [int]$process.Id
        owned = $true
        source = [string]$module.source
        health = [string]$module.health
        launcher = $launcherPath
        startedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    }
}

foreach ($module in @($Registry.modules | Where-Object { $_.kind -eq 'python-service' })) {
    $source = Join-Path $RepoRoot ([string]$module.source)
    $launcher = Join-Path $RepoRoot ([string]$module.launcher)
    $serviceState = Join-Path $RuntimeRoot ([string]$module.state)

    if (Test-Health ([string]$module.health)) {
        Write-Host "[RONSAS] $($module.displayName) already healthy at $($module.health)." -ForegroundColor Green
        $prior = Get-PriorOwnedEntry ([string]$module.id)
        if ($prior) {
            $state.processes += [ordered]@{
                id = [string]$module.id
                pid = [int]$prior.pid
                owned = $true
                source = [string]$module.source
                health = [string]$module.health
                launcher = [string]$prior.launcher
                startedAtUtc = [string]$prior.startedAtUtc
            }
        } else {
            $state.processes += [ordered]@{
                id = [string]$module.id
                pid = $null
                owned = $false
                source = [string]$module.source
                health = [string]$module.health
            }
        }
        continue
    }

    $missing = @()
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { $missing += "source=$source" }
    if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { $missing += "launcher=$launcher" }
    if (-not (Test-Path -LiteralPath $serviceState -PathType Leaf)) { $missing += "state=$serviceState" }
    if ($missing.Count -gt 0) {
        $message = "$($module.displayName) prerequisites are not present: $($missing -join ', ')"
        if ([bool]$module.required) { throw $message }
        Write-Warning "[RONSAS] $message. Optional service will not be started."
        continue
    }

    $stdout = Join-Path $LogRoot ("$($module.id).out.log")
    $stderr = Join-Path $LogRoot ("$($module.id).err.log")
    $process = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$launcher) -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr

    if (-not (Wait-Health ([string]$module.health) 45)) {
        try { & taskkill.exe /PID $process.Id /T /F | Out-Null } catch {}
        $message = "$($module.displayName) did not become healthy at $($module.health). See $stderr"
        if ([bool]$module.required) { throw $message }
        Write-Warning "[RONSAS] $message"
        continue
    }

    Write-Host "[RONSAS] $($module.displayName) healthy (PID $($process.Id))." -ForegroundColor Green
    $state.processes += [ordered]@{
        id = [string]$module.id
        pid = [int]$process.Id
        owned = $true
        source = [string]$module.source
        health = [string]$module.health
        launcher = $launcher
        startedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    }
}

$state | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $StatePath -Encoding UTF8
Write-Host "[RONSAS] DataNest runtime state: $StatePath" -ForegroundColor DarkGray
Write-Host '[RONSAS] DataNest web application suite is ready.' -ForegroundColor Green
