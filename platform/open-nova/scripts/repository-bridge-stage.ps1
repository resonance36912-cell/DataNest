param(
  [Parameter(Mandatory=$true)][string]$SourcePath,
  [Parameter(Mandatory=$true)][string]$AppId
)
$ErrorActionPreference = "Stop"
$port = if ($env:FOUNDRY_PORT) { $env:FOUNDRY_PORT } else { "8787" }
$escaped = [System.Uri]::EscapeDataString($AppId)
$assessBody = @{ source_path = $SourcePath; confirmed = $false } | ConvertTo-Json
$assessment = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$port/v1/repository-bridge/$escaped/assess" -ContentType "application/json" -Body $assessBody
$assessment | ConvertTo-Json -Depth 20
if (-not $assessment.ready_to_stage) { throw "Repository assessment did not pass; staging refused." }
$stageBody = @{ source_path = $SourcePath; confirmed = $true } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$port/v1/repository-bridge/$escaped/stage" -ContentType "application/json" -Body $stageBody | ConvertTo-Json -Depth 20
