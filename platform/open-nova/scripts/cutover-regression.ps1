param([string]$AppId = "reson8-life", [string[]]$Tasks = @())
$ErrorActionPreference = "Stop"
$id=[System.Uri]::EscapeDataString($AppId)
$body=@{confirmed=$true;tasks=$Tasks}|ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8787/v1/cutover/$id/regression" -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 20
