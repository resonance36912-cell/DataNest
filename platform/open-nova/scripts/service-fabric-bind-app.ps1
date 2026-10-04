param(
  [Parameter(Mandatory=$true)][string]$AppId
)
$ErrorActionPreference = "Stop"
$Base = if ($env:FOUNDRY_URL) { $env:FOUNDRY_URL.TrimEnd('/') } else { "http://127.0.0.1:8787" }
$plan = Invoke-RestMethod -Uri "$Base/v1/service-fabric/$AppId/migration-plan" -Method Get
$plan | ConvertTo-Json -Depth 12
if (-not $plan.ready_to_bind) { throw "Service binding plan is not ready." }
$body = @{ confirmed = $true } | ConvertTo-Json
$result = Invoke-RestMethod -Uri "$Base/v1/service-fabric/$AppId/bindings" -Method Post -ContentType "application/json" -Body $body
$result | ConvertTo-Json -Depth 12
