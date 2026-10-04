$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$Python = Join-Path $Root '.resonance-venv\Scripts\python.exe'
$Verifier = Join-Path $PSScriptRoot 'verify-release-manifest.ps1'
$LogRoot = Join-Path $Root 'runtime\logs\platform-control'

function Get-Json([string]$Uri) {
    $probe = 'import sys,urllib.request; print(urllib.request.urlopen(sys.argv[1],timeout=4).read().decode())'
    try {
        $response = & $Python -c $probe $Uri 2>$null
        if ($LASTEXITCODE -ne 0) { return $null }
        return (($response -join "`n") | ConvertFrom-Json)
    }
    catch { return $null }
}

function Get-LocalPodmanMachineEnvironment {
    $connectionFile = Join-Path $env:APPDATA 'containers\podman-connections.json'
    try {
        if (-not (Test-Path -LiteralPath $connectionFile -PathType Leaf)) { return $null }
        $connectionSet = (Get-Content -Raw -LiteralPath $connectionFile | ConvertFrom-Json).Connection
        $connection = $connectionSet.Connections.($connectionSet.Default)
        $uri = [string]$connection.URI
        $identity = [string]$connection.Identity
        $parsed = [uri]$uri
        if (
            $connection.IsMachine -ne $true -or
            $parsed.Scheme -ne 'ssh' -or
            $parsed.Host -notin @('127.0.0.1', 'localhost', '::1') -or
            -not (Test-Path -LiteralPath $identity -PathType Leaf)
        ) { return $null }
        return @{ CONTAINER_HOST = $uri; CONTAINER_SSHKEY = $identity }
    }
    catch { return $null }
}

if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) {
    throw "Governed Python runtime is missing: $Python"
}
& $Verifier -Root $Root

$foundry = Get-Json 'http://127.0.0.1:8787/v1/apps'
if ($null -eq $foundry) {
    $listener = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
        throw 'Port 8787 is occupied by an unhealthy or unverified process; no process was stopped.'
    }
    New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null
    $outLog = Join-Path $LogRoot 'foundry.out.log'
    $errLog = Join-Path $LogRoot 'foundry.err.log'
    $podmanMachine = Get-LocalPodmanMachineEnvironment
    $previousContainerHost = $env:CONTAINER_HOST
    $previousContainerSshKey = $env:CONTAINER_SSHKEY
    if ($podmanMachine) {
        $env:CONTAINER_HOST = $podmanMachine.CONTAINER_HOST
        $env:CONTAINER_SSHKEY = $podmanMachine.CONTAINER_SSHKEY
    }
    try {
        Start-Process -FilePath $Python -ArgumentList @('-m', 'uvicorn', 'foundry_controller.app.main:app', '--host', '127.0.0.1', '--port', '8787') -WorkingDirectory $Root -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden | Out-Null
    }
    finally {
        if ($null -eq $previousContainerHost) { Remove-Item Env:CONTAINER_HOST -ErrorAction SilentlyContinue } else { $env:CONTAINER_HOST = $previousContainerHost }
        if ($null -eq $previousContainerSshKey) { Remove-Item Env:CONTAINER_SSHKEY -ErrorAction SilentlyContinue } else { $env:CONTAINER_SSHKEY = $previousContainerSshKey }
    }
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        Start-Sleep -Seconds 1
        $foundry = Get-Json 'http://127.0.0.1:8787/v1/apps'
        if ($null -ne $foundry) { break }
    }
    if ($null -eq $foundry) {
        throw "Foundry did not become healthy. Inspect: $errLog"
    }
}

$aurum = Get-Json 'http://127.0.0.1:4345/health'
$registry = Get-Json 'http://127.0.0.1:8787/v1/registry/verify'

Write-Host ''
Write-Host 'SOVEREIGN RESONANCE APPDEV: READY' -ForegroundColor Green
Write-Host 'Foundry: http://127.0.0.1:8787 (controller ready)'
if ($aurum) {
    Write-Host 'Aurum:   http://127.0.0.1:4345 (healthy)'
}
else {
    Write-Host 'Aurum:   not running; use its local launcher when needed.'
}
if ($registry -and $registry.valid) {
    Write-Host "Registry: valid ($($registry.events) events)"
}
else {
    Write-Host 'Registry: unavailable'
}
Write-Host 'External AI: disabled | Production: disabled'
