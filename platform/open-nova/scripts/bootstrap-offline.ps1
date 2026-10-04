param(
  [switch]$RequireLocalAI
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path ".env.sovereign")) { Copy-Item ".env.sovereign.example" ".env.sovereign" }
Get-Content ".env.sovereign" | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
    $parts = $line.Split("=", 2)
    [Environment]::SetEnvironmentVariable($parts[0], $parts[1], "Process")
  }
}

if (Get-Command podman -ErrorAction SilentlyContinue) { $engine = "podman" }
elseif (Get-Command docker -ErrorAction SilentlyContinue) { $engine = "docker" }
else { throw "Strict offline mode requires an already-installed Podman or Docker engine." }

foreach ($image in @("resonance-runner-python:0.3", "resonance-runner-node:0.3")) {
  & $engine image inspect $image *> $null
  if ($LASTEXITCODE -ne 0) { throw "Strict offline mode: required cached runner image is missing: $image" }
}

if ($RequireLocalAI) {
  if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    throw "Local-AI offline mode requires native Ollama to already be installed. Deterministic Zero-Credit mode does not."
  }
  $model = if ($env:SOVEREIGN_MODEL) { $env:SOVEREIGN_MODEL } else { "qwen3-coder:30b" }
  $models = (& ollama list 2>$null | Out-String)
  if ($LASTEXITCODE -ne 0 -or $models -notmatch [regex]::Escape(($model -split ':')[0])) { throw "Local-AI offline mode: governed local model is not cached: $model" }
}

if (-not (Test-Path ".resonance-venv/Scripts/python.exe")) {
  $wheelhouse = Join-Path $root "runtime/supply-chain/wheelhouse"
  if (-not (Test-Path $wheelhouse)) { throw "Strict offline mode: Python environment missing and no local wheelhouse exists." }
  py -3 -m venv .resonance-venv
  & .\.resonance-venv\Scripts\python.exe -m pip install --no-index --find-links $wheelhouse -r foundry_controller\requirements.txt
  if ($LASTEXITCODE -ne 0) { throw "Offline Python dependency installation failed. Ensure every transitive wheel is cached." }
}

Write-Host "PASS: strict offline bootstrap prerequisites verified for Resonance Open Nova v1.4 RC."
Write-Host "No model pull, package download, image pull, or remote API was requested by this script."
Write-Host "Start controller: powershell -ExecutionPolicy Bypass -File .\scripts\run-foundry-host.ps1"
