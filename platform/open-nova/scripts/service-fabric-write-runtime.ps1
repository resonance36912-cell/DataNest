$ErrorActionPreference = "Stop"
$Base = if ($env:FOUNDRY_URL) { $env:FOUNDRY_URL.TrimEnd('/') } else { "http://127.0.0.1:8787" }
$body = @{ confirmed = $true } | ConvertTo-Json
$result = Invoke-RestMethod -Uri "$Base/v1/service-fabric/runtime/compose" -Method Post -ContentType "application/json" -Body $body
$result | ConvertTo-Json -Depth 12
Write-Host "Runtime file generated locally. No image pull or service start was performed."
