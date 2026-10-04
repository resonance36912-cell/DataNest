param([string]$AppId = "reson8-life", [switch]$Confirm)
$ErrorActionPreference = "Stop"
if (-not $Confirm) { throw "Preparation creates a baseline and rollback checkpoint; pass -Confirm." }
$body = @{ confirmed = $true } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8787/v1/real-execution/$AppId/prepare" -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 30
