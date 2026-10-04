param(
  [string]$BaseUrl = "http://127.0.0.1:8787"
)
$ErrorActionPreference = "Stop"
$result = Invoke-RestMethod -Method Get -Uri "$BaseUrl/v1/suite"
$result | ConvertTo-Json -Depth 12
