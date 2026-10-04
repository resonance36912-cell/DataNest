$ErrorActionPreference = "Stop"
$port = if ($env:FOUNDRY_PORT) { $env:FOUNDRY_PORT } else { "8787" }
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$port/v1/workstation/status" | ConvertTo-Json -Depth 20
