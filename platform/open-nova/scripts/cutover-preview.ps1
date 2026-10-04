param([string]$AppId = "reson8-life", [Parameter(Mandatory=$true)][string]$Url)
$ErrorActionPreference = "Stop"
$id=[System.Uri]::EscapeDataString($AppId)
$body=@{confirmed=$true;url=$Url}|ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8787/v1/cutover/$id/preview" -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 20
