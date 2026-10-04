param([string]$AppId = "reson8-life")
$base = if ($env:FOUNDRY_URL) { $env:FOUNDRY_URL.TrimEnd('/') } else { 'http://127.0.0.1:8787' }
$id=[System.Uri]::EscapeDataString($AppId)
Invoke-RestMethod -Method Post -Uri "$base/v1/migration-execution/$id/execute-supported" -ContentType 'application/json' -Body '{"confirmed":true}' | ConvertTo-Json -Depth 30
