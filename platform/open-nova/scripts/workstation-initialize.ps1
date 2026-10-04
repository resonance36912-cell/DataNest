$ErrorActionPreference = "Stop"
$port = if ($env:FOUNDRY_PORT) { $env:FOUNDRY_PORT } else { "8787" }
$body = @{ confirmed = $true } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$port/v1/workstation/initialize" -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 20
