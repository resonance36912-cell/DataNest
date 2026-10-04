[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RuntimeRoot = if ($env:DATANEST_RONSAS_RUNTIME_ROOT) {
    [System.IO.Path]::GetFullPath($env:DATANEST_RONSAS_RUNTIME_ROOT)
} else {
    Join-Path $env:LOCALAPPDATA 'Resonance\DataNest-RONSAS'
}
$StatePath = Join-Path $RuntimeRoot 'ronsas-state.json'
if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) {
    Write-Host '[RONSAS] No DataNest-owned runtime state exists; nothing will be stopped.'
    exit 0
}

$state = Get-Content -Raw -LiteralPath $StatePath | ConvertFrom-Json
if ([string]$state.schema -ne 'datanest.ronsas.runtime-state.v1') {
    throw "Refusing to stop processes from an unknown state schema: $($state.schema)"
}
if ([string]$state.repository -ne 'DataNest-Supository/DataNest') {
    throw 'Refusing to stop processes not owned by the DataNest RONSAS runtime.'
}

$stopped = @()
foreach ($entry in @($state.processes | Where-Object { $_.owned -and $_.pid })) {
    $pidValue = [int]$entry.pid
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$pidValue" -ErrorAction SilentlyContinue
    if (-not $process) { continue }

    $commandLine = [string]$process.CommandLine
    $launcher = [string]$entry.launcher
    if ([string]::IsNullOrWhiteSpace($launcher) -or -not $commandLine -or $commandLine -notmatch [regex]::Escape($launcher)) {
        Write-Warning "PID $pidValue no longer carries its DataNest launcher marker; refusing to stop it."
        continue
    }

    & taskkill.exe /PID $pidValue /T /F | Out-Null
    $stopped += [string]$entry.id
}

Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
if ($stopped.Count) {
    Write-Host ('[RONSAS] Stopped DataNest-owned modules: ' + ($stopped -join ', ')) -ForegroundColor Green
} else {
    Write-Host '[RONSAS] No DataNest-owned module process required stopping.'
}
