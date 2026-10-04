param(
  [switch]$AllowNetworkProvisioning,
  [switch]$OpenBrowser
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "Resonance Open Nova v1.5.5 - Explicit One-Time Provisioning"
Write-Host "This script never purchases AI credits and never downloads an AI model."
Write-Host "Network package provisioning occurs only when -AllowNetworkProvisioning is supplied."

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git is required. Install Git for Windows, then re-run this script."
}

$pyLauncher = Get-Command py -ErrorAction SilentlyContinue
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pyLauncher -and -not $pythonCmd) {
  throw "Python 3 is required. Install Python 3, then re-run this script."
}

$venvPython = Join-Path $root ".resonance-venv\Scripts\python.exe"
$wheelhouse = Join-Path $root "runtime\supply-chain\wheelhouse"
$requirements = Join-Path $root "foundry_controller\requirements.txt"

if (-not (Test-Path $venvPython)) {
  if ($pyLauncher) { & py -3 -m venv .resonance-venv }
  else { & python -m venv .resonance-venv }
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $venvPython)) { throw "Unable to create local Python environment." }
}

New-Item -ItemType Directory -Force -Path $wheelhouse | Out-Null
$wheels = @(Get-ChildItem -Path $wheelhouse -File -ErrorAction SilentlyContinue)
if ($wheels.Count -eq 0) {
  if (-not $AllowNetworkProvisioning) {
    throw "The governed Python wheelhouse is empty. Re-run with -AllowNetworkProvisioning for an explicit one-time package download, or populate runtime\supply-chain\wheelhouse manually."
  }
  Write-Host "Downloading only the pinned Python packages into the local governed wheelhouse..."
  & $venvPython -m pip download --requirement $requirements --dest $wheelhouse
  if ($LASTEXITCODE -ne 0) { throw "Pinned dependency download failed. No fallback source was used by Open Nova." }
}

Write-Host "Installing from the local wheelhouse with network access disabled for installation..."
& $venvPython -m pip install --no-index --find-links $wheelhouse -r $requirements
if ($LASTEXITCODE -ne 0) { throw "Offline installation from the governed wheelhouse failed." }

$hashFile = Join-Path $root "runtime\supply-chain\wheelhouse-sha256.json"
$items = @()
Get-ChildItem -Path $wheelhouse -File | Sort-Object Name | ForEach-Object {
  $h = Get-FileHash -Algorithm SHA256 -Path $_.FullName
  $items += [ordered]@{ file = $_.Name; sha256 = $h.Hash.ToLowerInvariant(); bytes = $_.Length }
}
$record = [ordered]@{
  schema = "resonance-wheelhouse/v1"
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  network_provisioning_explicit = [bool]$AllowNetworkProvisioning
  package_count = $items.Count
  packages = $items
}
$record | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $hashFile

Write-Host "Provisioning complete. Future normal runs can use the local environment and wheelhouse."
Write-Host "Wheelhouse integrity record: $hashFile"
if ($OpenBrowser) {
  & (Join-Path $PSScriptRoot "run-and-package-first-real.ps1") -OpenBrowser
}
