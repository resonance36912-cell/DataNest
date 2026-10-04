$ErrorActionPreference = "Stop"
$r = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8787/v1/release/preflight"
$r | ConvertTo-Json -Depth 10
if (-not $r.passed) { throw "Release-candidate integrity preflight failed." }
Write-Host "Release-candidate integrity preflight passed. This does NOT certify the runtime as operationally sovereign."
