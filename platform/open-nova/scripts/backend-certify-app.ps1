param([Parameter(Mandatory=$true)][string]$AppId)
$ErrorActionPreference = "Stop"
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8787/v1/backend/apps/$AppId/certify" | ConvertTo-Json -Depth 12
