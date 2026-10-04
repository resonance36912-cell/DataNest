$ErrorActionPreference = "Stop"

if (-not (Test-Path ".env.sovereign")) {
  Copy-Item ".env.sovereign.example" ".env.sovereign"
  Write-Host "Created .env.sovereign with Zero-Credit defaults."
}
New-Item -ItemType Directory -Force -Path "runtime/receipts" | Out-Null
New-Item -ItemType Directory -Force -Path "runtime/registry" | Out-Null

if (Get-Command podman -ErrorAction SilentlyContinue) {
  $engine = "podman"
} elseif (Get-Command docker -ErrorAction SilentlyContinue) {
  $engine = "docker"
} else {
  throw "Install Podman (preferred) or Docker before isolated execution."
}
(Get-Content ".env.sovereign") -replace '^CONTAINER_ENGINE=.*$', "CONTAINER_ENGINE=$engine" | Set-Content ".env.sovereign"
$env:CONTAINER_ENGINE = $engine

& powershell -ExecutionPolicy Bypass -File .\scripts\build-runner-images.ps1

if (-not (Test-Path ".resonance-venv/Scripts/python.exe")) {
  py -3 -m venv .resonance-venv
  & .\.resonance-venv\Scripts\python.exe -m pip install --upgrade pip
  & .\.resonance-venv\Scripts\python.exe -m pip install -r foundry_controller\requirements.txt
}

$modelLine = Get-Content ".env.sovereign" | Where-Object { $_ -match '^SOVEREIGN_MODEL=' } | Select-Object -First 1
$model = $modelLine -replace '^SOVEREIGN_MODEL=', ''
if (-not $model) { $model = "qwen3-coder:30b" }

if (Get-Command ollama -ErrorAction SilentlyContinue) {
  Write-Host "Ensuring native Ollama model is present:" $model
  ollama pull $model
} elseif ($engine -eq "docker") {
  Write-Host "Native Ollama not found; starting local Ollama container."
  docker compose -f docker-compose.sovereign.yml up -d ollama
  docker exec resonance-ollama ollama pull $model
} elseif ($engine -eq "podman") {
  Write-Host "Native Ollama not found; starting local Ollama container with Podman."
  $exists = podman container exists resonance-ollama; $existsCode = $LASTEXITCODE
  if ($existsCode -eq 0) {
    podman start resonance-ollama | Out-Null
  } else {
    podman run -d --name resonance-ollama -p 11434:11434 -v resonance_ollama:/root/.ollama docker.io/ollama/ollama:latest | Out-Null
  }
  podman exec resonance-ollama ollama pull $model
}

Write-Host "Bootstrap complete."
Write-Host "Start controller: powershell -ExecutionPolicy Bypass -File .\scripts\run-foundry-host.ps1"
Write-Host "Then verify: powershell -ExecutionPolicy Bypass -File .\scripts\verify-zero-credit.ps1"
