param(
  [Parameter(Mandatory=$true)][string]$AppId,
  [string]$BaseUrl = "http://127.0.0.1:8787"
)
$ErrorActionPreference = "Stop"
$body = @{ confirmed = $true } | ConvertTo-Json
$result = Invoke-RestMethod -Method Post -Uri "$BaseUrl/v1/suite/$AppId/export" -ContentType "application/json" -Body $body
$result | ConvertTo-Json -Depth 10
