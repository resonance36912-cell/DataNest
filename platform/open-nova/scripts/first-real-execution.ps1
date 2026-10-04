param(
  [Parameter(Mandatory=$true)][string]$SourcePath,
  [string]$AppId = "reson8-life",
  [switch]$Admit,
  [switch]$Prepare,
  [switch]$ExecuteSupportedMigration
)
$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:8787/v1/real-execution/$AppId"
function PostJson($url, $obj) {
  $body = $obj | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri $url -ContentType "application/json" -Body $body
}
Write-Host "1/5 Assessing clean local repository..."
$assessment = PostJson "$base/assess-repository" @{ source_path=$SourcePath; confirmed=$false }
$assessment | ConvertTo-Json -Depth 20
if (-not $assessment.ready_for_admission) { throw "Repository admission blocked. Resolve the reported blockers before continuing." }
if ($Admit) {
  Write-Host "2/5 Admitting copy-only governed snapshot..."
  PostJson "$base/admit-repository" @{ source_path=$SourcePath; confirmed=$true } | ConvertTo-Json -Depth 20
} else {
  Write-Host "Admission not requested. Re-run with -Admit after reviewing the assessment."
}
if ($Prepare) {
  Write-Host "3/5 Recording real-source baseline and rollback checkpoint..."
  PostJson "$base/prepare" @{ confirmed=$true } | ConvertTo-Json -Depth 30
}
if ($ExecuteSupportedMigration) {
  if (-not $Prepare) { throw "-ExecuteSupportedMigration requires -Prepare in this operator workflow." }
  Write-Host "4/5 Executing deterministic supported provider migration..."
  PostJson "$base/execute-supported" @{ confirmed=$true } | ConvertTo-Json -Depth 30
}
Write-Host "5/5 Current readiness evidence..."
Invoke-RestMethod -Method Get -Uri "$base/readiness" | ConvertTo-Json -Depth 30
Write-Host "Production cutover is not performed by this script."
