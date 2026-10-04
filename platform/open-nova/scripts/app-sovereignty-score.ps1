param([Parameter(Mandatory=$true)][string]$AppId)
$ErrorActionPreference = "Stop"
$r = Invoke-RestMethod -Method Get -Uri ("http://127.0.0.1:8787/v1/sovereignty/apps/" + [uri]::EscapeDataString($AppId))
$r | ConvertTo-Json -Depth 14
if (-not $r.operationally_sovereign) {
  Write-Warning ("App is not operationally sovereign. Critical blockers: " + ($r.critical_blockers -join ", "))
}
