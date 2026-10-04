param([switch]$AllowNetwork)
$ErrorActionPreference = "Stop"
if (!$AllowNetwork) { throw "Provisioning may access package/container registries. Re-run with -AllowNetwork for an explicit one-time provisioning action." }
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
python -m pip download --dest services/wheelhouse -r services/auth/requirements.txt -r services/storage/requirements.txt -r services/gateway/requirements.txt
$engine = if (Get-Command podman -ErrorAction SilentlyContinue) {"podman"} elseif (Get-Command docker -ErrorAction SilentlyContinue) {"docker"} else {throw "Podman or Docker is required."}
& $engine pull python:3.12.10-slim
& $engine pull postgres:16.6-alpine
Write-Host "Provisioning complete. Strict offline build can now use the local cache."
