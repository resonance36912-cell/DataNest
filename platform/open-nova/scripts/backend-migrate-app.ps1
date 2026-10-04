param([Parameter(Mandatory=$true)][string]$AppId)
$ErrorActionPreference = "Stop"
$plan = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8787/v1/backend/apps/$AppId/migration-plan"
$plan | ConvertTo-Json -Depth 10
if ($plan.blockers.Count -gt 0) { throw "Migration blockers must be resolved before execution." }
$body = @{confirmed=$true} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8787/v1/backend/apps/$AppId/migrate" -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 10
