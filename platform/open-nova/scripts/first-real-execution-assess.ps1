param(
  [Parameter(Mandatory=$true)][string]$SourcePath,
  [string]$AppId = "reson8-life"
)
$ErrorActionPreference = "Stop"
$body = @{ source_path = $SourcePath; confirmed = $false } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8787/v1/real-execution/$AppId/assess-repository" -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 20
