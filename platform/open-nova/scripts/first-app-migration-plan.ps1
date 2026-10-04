param(
  [string]$AppId = "reson8-life",
  [switch]$Write
)
$ErrorActionPreference = "Stop"
$encoded = [System.Uri]::EscapeDataString($AppId)
$uri = "http://127.0.0.1:8787/v1/deployment/first-app/$encoded/plan"
if ($Write) {
  $body = @{confirmed=$true} | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri $uri -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 12
} else {
  Invoke-RestMethod -Method Get -Uri $uri | ConvertTo-Json -Depth 12
}
