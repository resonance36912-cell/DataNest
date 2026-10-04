param([Parameter(Mandatory=$true)][string]$AppId)
$base = if ($env:FOUNDRY_URL) { $env:FOUNDRY_URL.TrimEnd('/') } else { 'http://127.0.0.1:8787' }
Invoke-RestMethod -Method Get -Uri "$base/v1/adapters/$AppId/assess" | ConvertTo-Json -Depth 12
