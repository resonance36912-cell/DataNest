$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$compose = "runtime/backend-runtime/compose.backend.yml"
if (!(Test-Path $compose)) { throw "Backend compose file not generated." }
$engine = if (Get-Command podman -ErrorAction SilentlyContinue) {"podman"} elseif (Get-Command docker -ErrorAction SilentlyContinue) {"docker"} else {throw "Podman or Docker is required."}
& $engine compose -f $compose down
