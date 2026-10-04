param(
  [Parameter(Mandatory=$true)][string]$SourcePath,
  [string]$AppId = "reson8-life",
  [switch]$Confirm
)
$ErrorActionPreference = "Stop"
if (-not $Confirm) { throw "Admission is copy-only but still requires -Confirm." }
$body = @{ source_path = $SourcePath; confirmed = $true } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8787/v1/real-execution/$AppId/admit-repository" -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 20
