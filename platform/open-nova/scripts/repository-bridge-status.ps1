param([Parameter(Mandatory=$true)][string]$AppId)
$ErrorActionPreference = "Stop"
$port = if ($env:FOUNDRY_PORT) { $env:FOUNDRY_PORT } else { "8787" }
$escaped = [System.Uri]::EscapeDataString($AppId)
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$port/v1/repository-bridge/$escaped/status" | ConvertTo-Json -Depth 20
