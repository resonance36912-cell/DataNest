$ErrorActionPreference = 'Continue'
$Base = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $Base 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir ('public-health-' + (Get-Date -Format 'yyyyMMdd') + '.log')
$Endpoints = @(
  'https://reson8.life',
  'https://www.reson8.life',
  'https://epublisher.reson8.life',
  'https://creative.reson8.life',
  'https://sync.reson8.life',
  'https://youtube.reson8.life',
  'https://reson8.life/api/public/app-status/health',
  'https://reson8.life/api/sovereign/auth/session',
  'https://epublisher.reson8.life/_rons/session',
  'https://creative.reson8.life/_rons/session',
  'https://sync.reson8.life/_rons/session',
  'https://youtube.reson8.life/_rons/session'
)
$Failures = 0
foreach ($Url in $Endpoints) {
  try {
    $Sw = [Diagnostics.Stopwatch]::StartNew()
    $Response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 10
    $Sw.Stop()
    if ($Response.StatusCode -ne 200) { $Failures++ }
    Add-Content -LiteralPath $Log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + " url=$Url code=$($Response.StatusCode) ms=$([math]::Round($Sw.Elapsed.TotalMilliseconds,1))")
  } catch {
    $Failures++
    Add-Content -LiteralPath $Log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + " url=$Url code=ERR error=$($_.Exception.Message)")
  }
}
if ($Failures -gt 0) { exit 2 }
exit 0

# supervisor-managed
# EOF
