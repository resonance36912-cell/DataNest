param(
  [switch]$OpenBrowser,
  [switch]$RequireLocalAI
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "Resonance Open Nova v1.5.8 - One-Click Sovereign Workstation"
Write-Host "Mode: strict local / Zero-Credit / external AI denied"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "Git is required and was not found on PATH." }
if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) { Write-Warning "OpenSSL is not installed. Core builder/runtime can start, but local artifact signing/attestation remains unavailable until OpenSSL is provisioned." }
if (-not (Get-Command podman -ErrorAction SilentlyContinue) -and -not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Warning "No Podman/Docker engine found. Builder/control plane can run, but isolated runtime certification will remain blocked."
}

if (-not (Test-Path ".resonance-venv/Scripts/python.exe")) {
  $wheelhouse = Join-Path $root "runtime/supply-chain/wheelhouse"
  if (-not (Test-Path $wheelhouse)) {
    throw "Offline Python environment is absent and no governed local wheelhouse exists. Run prepare-offline-wheelhouse during provisioning first."
  }
  py -3 -m venv .resonance-venv
  & .\.resonance-venv\Scripts\python.exe -m pip install --no-index --find-links $wheelhouse -r foundry_controller\requirements.txt
  if ($LASTEXITCODE -ne 0) { throw "Offline dependency installation failed. No network fallback was attempted." }
}

if ($RequireLocalAI) {
  if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) { throw "Local AI requested but Ollama is not installed locally." }
  $model = if ($env:SOVEREIGN_MODEL) { $env:SOVEREIGN_MODEL } else { "qwen3-coder:30b" }
  $models = (& ollama list 2>$null | Out-String)
  if ($LASTEXITCODE -ne 0 -or $models -notmatch [regex]::Escape(($model -split ':')[0])) {
    throw "Local AI requested but governed model '$model' is not present. No model download will be attempted."
  }
}

$env:ALLOW_EXTERNAL_AI = "false"
$env:WORKSPACE_ROOT = $root
$port = if ($env:FOUNDRY_PORT) { $env:FOUNDRY_PORT } else { "8787" }
$url = "http://127.0.0.1:$port/builder"
if ($OpenBrowser) { Start-Process $url }
Write-Host "Starting sovereign control plane at $url"
& .\.resonance-venv\Scripts\python.exe -m uvicorn foundry_controller.app.main:app --host 127.0.0.1 --port $port
