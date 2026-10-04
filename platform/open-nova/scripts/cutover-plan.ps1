param([string]$AppId = "reson8-life")
$ErrorActionPreference = "Stop"
$id=[System.Uri]::EscapeDataString($AppId)
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8787/v1/cutover/$id/plan" | ConvertTo-Json -Depth 20
