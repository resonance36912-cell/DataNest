param([switch]$Start)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$body = @{confirmed=$true} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8787/v1/backend/secrets/init" -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 8
$r = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8787/v1/backend/runtime/write" -ContentType "application/json" -Body $body
$r | ConvertTo-Json -Depth 8
if ($Start) {
  $engine = if (Get-Command podman -ErrorAction SilentlyContinue) {"podman"} elseif (Get-Command docker -ErrorAction SilentlyContinue) {"docker"} else {throw "Podman or Docker is required."}
  & $engine compose -f $r.path up -d
}
