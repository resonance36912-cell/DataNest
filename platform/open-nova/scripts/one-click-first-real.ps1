param(
  [string]$RepositoryPath,
  [string]$AppId = "reson8-life",
  [switch]$AllowNetworkProvisioning,
  [switch]$ExecuteSupportedMigration,
  [switch]$OpenBrowser
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "============================================================"
Write-Host " Resonance Open Nova v1.5.5 - ONE-CLICK REAL EXECUTION"
Write-Host " Zero-Credit | original repo read-only | production disabled"
Write-Host "============================================================"

$venvPython = Join-Path $root ".resonance-venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
  $prov = Join-Path $PSScriptRoot "provision-open-nova-once.ps1"
  if ($AllowNetworkProvisioning) { & $prov -AllowNetworkProvisioning }
  else { & $prov }
}

$runner = Join-Path $PSScriptRoot "run-and-package-first-real.ps1"
$args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $runner, "-AppId", $AppId)
if ($RepositoryPath) { $args += @("-RepositoryPath", $RepositoryPath) }
if ($ExecuteSupportedMigration) { $args += "-ExecuteSupportedMigration" }
if ($OpenBrowser) { $args += "-OpenBrowser" }
& powershell.exe @args
if ($LASTEXITCODE -ne 0) { throw "Open Nova real execution stopped with exit code $LASTEXITCODE." }

$bundle = Join-Path $root "exports\evidence-bundles\$AppId-real-execution-evidence.zip"
if (-not (Test-Path $bundle)) { throw "Expected evidence bundle was not produced: $bundle" }
$sha = (Get-FileHash -Algorithm SHA256 -Path $bundle).Hash.ToLowerInvariant()
Write-Host ""
Write-Host "SUCCESS: governed evidence bundle created"
Write-Host "Bundle: $bundle"
Write-Host "SHA-256: $sha"
Write-Host "Upload this ZIP to ChatGPT for analysis of the real migration evidence."
