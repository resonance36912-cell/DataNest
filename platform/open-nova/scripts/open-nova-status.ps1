$ErrorActionPreference = "Stop"
$r = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8787/v1/control-plane"
$r | ConvertTo-Json -Depth 14
if (-not $r.platform_sovereignty.operationally_sovereign) {
  Write-Warning ("Operational sovereignty is not yet certified. Blockers: " + ($r.platform_sovereignty.critical_blockers -join ", "))
}
