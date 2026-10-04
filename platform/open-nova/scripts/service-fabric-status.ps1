$ErrorActionPreference = "Stop"
$Base = if ($env:FOUNDRY_URL) { $env:FOUNDRY_URL.TrimEnd('/') } else { "http://127.0.0.1:8787" }
Write-Host "Resonance Sovereign Service Fabric"
Invoke-RestMethod -Uri "$Base/v1/service-fabric" -Method Get | ConvertTo-Json -Depth 12
Invoke-RestMethod -Uri "$Base/v1/service-fabric/health" -Method Get | ConvertTo-Json -Depth 12
