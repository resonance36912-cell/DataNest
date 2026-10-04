param(
  [Parameter(Mandatory=$true)][string]$SourcePath,
  [string]$AppId = "reson8-life"
)
$ErrorActionPreference = "Stop"
$base = if ($env:FOUNDRY_URL) { $env:FOUNDRY_URL.TrimEnd('/') } else { 'http://127.0.0.1:8787' }
$resolved = (Resolve-Path -LiteralPath $SourcePath).Path
$id = [System.Uri]::EscapeDataString($AppId)
$body = @{source_path=$resolved; confirmed=$true} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$base/v1/source-ingestion/$id/stage-local" -ContentType 'application/json' -Body $body | ConvertTo-Json -Depth 20
