$ErrorActionPreference = 'Stop'
$parent = Split-Path $PSScriptRoot -Parent
$repoStatus = Join-Path $parent 'cluster\STATUS-RONSAS-ECOSYSTEM.ps1'
$liveStatus = Join-Path $parent 'integrations\rons-cluster\STATUS-RONSAS-ECOSYSTEM.ps1'
$statusScript = if (Test-Path -LiteralPath $repoStatus -PathType Leaf) { $repoStatus } elseif (Test-Path -LiteralPath $liveStatus -PathType Leaf) { $liveStatus } else { $null }
if (-not $statusScript) { throw 'RONSAS status gate missing from repository and live layouts.' }

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $statusScript | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Host 'RONSAS ACCEPTANCE FAILED: governed module/service health gate failed.' -ForegroundColor Red
    exit 2
}

$routes = @(
    @('Hub login','http://127.0.0.1:4173/login'),
    @('Hub pricing','http://127.0.0.1:4173/pricing'),
    @('Hub governance','http://127.0.0.1:4173/governance/workspace'),
    @('ePublisher module','http://127.0.0.1:3101/'),
    @('Creative Studio module','http://127.0.0.1:3201/studio'),
    @('Sync Vision module','http://127.0.0.1:3301/'),
    @('YouTube Optimizer module','http://127.0.0.1:3401/')
)
$failed = @()
foreach ($route in $routes) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $route[1] -TimeoutSec 8
        $ok = $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
        Write-Host ('[{0}] {1} HTTP {2}' -f $(if($ok){'PASS'}else{'FAIL'}),$route[0],$response.StatusCode)
        if (-not $ok) { $failed += $route[0] }
    } catch { Write-Host ('[FAIL] {0} {1}' -f $route[0],$_.Exception.Message); $failed += $route[0] }
}if ($failed.Count -gt 0) {
    Write-Host ('RONSAS ACCEPTANCE FAILED: ' + ($failed -join ', ')) -ForegroundColor Red
    exit 2
}
Write-Host ('RONSAS ACCEPTANCE PASSED: governed registry + {0} route smokes' -f $routes.Count) -ForegroundColor Green
exit 0
