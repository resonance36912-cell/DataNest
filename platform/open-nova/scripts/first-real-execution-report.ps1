param([string]$AppId = "reson8-life", [switch]$Write)
$ErrorActionPreference = "Stop"
if ($Write) {
  $body = @{ confirmed = $true } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8787/v1/real-execution/$AppId/readiness-report" -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 30
} else {
  Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8787/v1/real-execution/$AppId/readiness" | ConvertTo-Json -Depth 30
}
