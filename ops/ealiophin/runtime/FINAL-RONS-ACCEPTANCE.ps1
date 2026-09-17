$ErrorActionPreference = 'Stop'
$targets = @(
  @('Hub Home','http://127.0.0.1:4173/'), @('Hub Login','http://127.0.0.1:4173/login'), @('Hub Pricing','http://127.0.0.1:4173/pricing'),
  @('ePublisher','http://127.0.0.1:3101/'), @('Creative Studio','http://127.0.0.1:3201/studio'), @('Sync Vision','http://127.0.0.1:3301/'),
  @('YouTube Optimizer','http://127.0.0.1:3401/'), @('Local STT','http://127.0.0.1:7864/health'), @('Local Image Service','http://127.0.0.1:7865/health'),
  @('MuseTalk','http://127.0.0.1:7863/health'), @('Foundry','http://127.0.0.1:8787/v1/apps'), @('Backend','http://127.0.0.1:8787/v1/backend/health'),
  @('RONS AI Broker','http://127.0.0.1:7868/health')
)
$semantic = @('Local STT','Local Image Service','MuseTalk','Backend','RONS AI Broker')
$failed = @()
foreach ($t in $targets) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri $t[1] -TimeoutSec 8
    $httpOk = $r.StatusCode -ge 200 -and $r.StatusCode -lt 400
    $semanticOk = $true
    if ($httpOk -and $semantic -contains $t[0]) {
      try {
        $p = $r.Content | ConvertFrom-Json
        if ($t[0] -eq 'Local STT') { $semanticOk = [bool]$p.ok -and [bool]$p.productionReady -and [bool]$p.cudaRuntimeReady -and [string]$p.defaultResolvedModel -eq 'large-v3' }
        elseif ($p.PSObject.Properties['ok']) { $semanticOk = [bool]$p.ok } elseif ($p.PSObject.Properties['ready']) { $semanticOk = [bool]$p.ready } elseif ($p.PSObject.Properties['status']) { $semanticOk = [string]$p.status -in @('healthy','up','ready') }
      } catch { $semanticOk = $false }
    }
    $ok = $httpOk -and $semanticOk; $detail = if ($semantic -contains $t[0]) { " semantic=$semanticOk" } else { '' }
    Write-Host ('[{0}] {1} HTTP {2} bytes={3}{4}' -f $(if($ok){'PASS'}else{'FAIL'}),$t[0],$r.StatusCode,$r.RawContentLength,$detail); if (-not $ok) { $failed += $t[0] }
  } catch { Write-Host ('[FAIL] {0} {1}' -f $t[0],$_.Exception.Message); $failed += $t[0] }
}
if ($failed.Count -gt 0) { Write-Host ('RONS ACCEPTANCE FAILED: ' + ($failed -join ', ')); exit 2 }
Write-Host ('RONS ACCEPTANCE PASSED: {0}/{0}' -f $targets.Count); exit 0