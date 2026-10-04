param([Parameter(Mandatory=$true)][string]$AppId,[switch]$Confirm)
$ErrorActionPreference = "Stop"
if (-not $Confirm) { throw "Operational sovereignty certification requires explicit -Confirm." }
$body = @{confirmed=$true} | ConvertTo-Json
$r = Invoke-RestMethod -Method Post -Uri ("http://127.0.0.1:8787/v1/sovereignty/apps/" + [uri]::EscapeDataString($AppId) + "/certify") -ContentType "application/json" -Body $body
$r | ConvertTo-Json -Depth 14
