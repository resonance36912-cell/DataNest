$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$engine = if (Get-Command podman -ErrorAction SilentlyContinue) {"podman"} elseif (Get-Command docker -ErrorAction SilentlyContinue) {"docker"} else {throw "Podman or Docker is required."}
$wheels = Get-ChildItem "services/wheelhouse" -File -ErrorAction SilentlyContinue | Where-Object {$_.Extension -eq ".whl"}
if (!$wheels) { throw "Offline wheelhouse is empty. Provision wheels explicitly before building backend services." }
$required = @("python:3.12.10-slim","postgres:16.6-alpine")
foreach ($img in $required) { & $engine image inspect $img *> $null; if ($LASTEXITCODE -ne 0) { throw "Required local base image missing: $img. No automatic pull performed." } }
& $engine build --pull=false -f services/auth/Containerfile -t resonance-service-auth:0.9 .
if ($LASTEXITCODE -ne 0) { throw "Auth image build failed." }
& $engine build --pull=false -f services/storage/Containerfile -t resonance-service-storage:0.9 .
if ($LASTEXITCODE -ne 0) { throw "Storage image build failed." }
& $engine build --pull=false -f services/gateway/Containerfile -t resonance-service-gateway:0.9 .
if ($LASTEXITCODE -ne 0) { throw "Gateway image build failed." }
Write-Host "Sovereign backend images built locally."
