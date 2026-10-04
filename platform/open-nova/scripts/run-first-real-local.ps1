param(
  [string]$RepositoryPath,
  [string]$AppId = "reson8-life",
  [switch]$AssessOnly,
  [switch]$ExecuteSupportedMigration,
  [switch]$OpenBrowser
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "Resonance Open Nova v1.5.5 - First Real Local Execution Handoff"
Write-Host "Original repository: read-only | External AI: denied | Production cutover: disabled"

$health = $false
try {
  Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8787/health" -TimeoutSec 2 | Out-Null
  $health = $true
} catch { $health = $false }

if (-not $health) {
  Write-Host "Starting the Open Nova local control plane in a separate window..."
  $launcher = Join-Path $PSScriptRoot "open-nova-workstation.ps1"
  Start-Process powershell.exe -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ('"' + $launcher + '"')
  )
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
      Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8787/health" -TimeoutSec 2 | Out-Null
      $health = $true
      break
    } catch { }
  }
}
if (-not $health) { throw "Open Nova did not become reachable on 127.0.0.1:8787. Check the control-plane window for the exact local prerequisite error." }

$python = Join-Path $root ".resonance-venv\Scripts\python.exe"
if (-not (Test-Path $python)) { throw "Open Nova Python environment is unavailable. Run the workstation provisioning/bootstrap first." }

$argsList = @(
  (Join-Path $PSScriptRoot "local-execution-handoff.py"),
  "--app-id", $AppId
)
if ($RepositoryPath) { $argsList += @("--repository-path", $RepositoryPath) }
if ($AssessOnly) { $argsList += "--assess-only" }
if ($ExecuteSupportedMigration) { $argsList += "--execute-supported-migration" }

& $python @argsList
if ($LASTEXITCODE -ne 0) { throw "First-real local execution handoff stopped with exit code $LASTEXITCODE." }

if ($OpenBrowser) { Start-Process "http://127.0.0.1:8787/builder" }
Write-Host "Local handoff completed. Production cutover was not performed."
