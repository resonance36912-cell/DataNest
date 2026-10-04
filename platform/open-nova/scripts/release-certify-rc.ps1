param([switch]$Confirm)
$ErrorActionPreference = "Stop"
if (-not $Confirm) { throw "Release certification requires explicit -Confirm." }
$body = @{confirmed=$true} | ConvertTo-Json
$r = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8787/v1/release/certify" -ContentType "application/json" -Body $body
$r | ConvertTo-Json -Depth 10
Write-Host "Release Candidate integrity certified. Operational runtime certification remains separate."
