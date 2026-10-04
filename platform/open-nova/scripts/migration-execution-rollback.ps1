param(
  [string]$AppId = "reson8-life",
  [Parameter(Mandatory=$true)][string]$MigrationId
)
$base = if ($env:FOUNDRY_URL) { $env:FOUNDRY_URL.TrimEnd('/') } else { 'http://127.0.0.1:8787' }
$id=[System.Uri]::EscapeDataString($AppId)
$body=@{migration_id=$MigrationId;confirmed=$true}|ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$base/v1/migration-execution/$id/rollback" -ContentType 'application/json' -Body $body | ConvertTo-Json -Depth 30
