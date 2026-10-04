param([string]$AppId = "reson8-life")
$ErrorActionPreference = "Stop"
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8787/v1/real-execution/$AppId/readiness" | ConvertTo-Json -Depth 20
