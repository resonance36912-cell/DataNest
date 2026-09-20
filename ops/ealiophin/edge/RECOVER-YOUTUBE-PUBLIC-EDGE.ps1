param(
  [string]$Root = (Join-Path $env:USERPROFILE 'Resonance\OpenNova'),
  [string]$RequestPath = (Join-Path $PSScriptRoot '..\..\release-requests\youtube-optimizer-recovery.json')
)

$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest

$LocalUrl='http://127.0.0.1:3401/'
$CaddyYoutubeUrl='http://127.0.0.1:8804/'
$PublicUrl='https://youtube.reson8.life/'
$ControlRoot=Join-Path $env:LOCALAPPDATA 'Resonance\RONS-ControlCenter'
$ControlConfig=Join-Path $ControlRoot 'rons-control.json'
$EdgeScript=Join-Path $ControlRoot 'RONS-Ensure-Public-Edge.ps1'
$LogRoot=Join-Path $Root 'runtime\logs\rons-cluster'
$ReceiptRoot=Join-Path $Root 'runtime\release-receipts'
$GovernedCaddy=Join-Path $PSScriptRoot 'Caddyfile.cgnat-edge'
New-Item -ItemType Directory -Force -Path $LogRoot,$ReceiptRoot | Out-Null

function Test-Url([string]$Url,[int]$Timeout=8){
  try {
    $resp=Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $Timeout
    return ($resp.StatusCode -eq 200)
  } catch { return $false }
}

function Wait-Url([string]$Url,[int]$Seconds=60){
  $deadline=(Get-Date).AddSeconds($Seconds)
  do {
    if(Test-Url $Url 10){return $true}
    Start-Sleep -Seconds 2
  } while((Get-Date) -lt $deadline)
  return $false
}

function Write-Receipt([string]$Conclusion,[string]$Detail=''){
  $runId=if($env:GITHUB_RUN_ID){$env:GITHUB_RUN_ID}else{'manual'}
  [pscustomobject]@{
    schema='ronsas-youtube-edge-recovery-receipt/v1'
    runId=$runId
    module='youtube-optimizer'
    conclusion=$Conclusion
    detail=$Detail
    recordedAt=(Get-Date).ToUniversalTime().ToString('o')
  } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $ReceiptRoot ("youtube-edge-recovery-$runId.json")) -Encoding UTF8
}

try {
  if(-not (Test-Path -LiteralPath $RequestPath -PathType Leaf)){throw "Recovery request missing: $RequestPath"}
  $request=Get-Content -Raw -LiteralPath $RequestPath | ConvertFrom-Json
  if([string]$request.schema -ne 'ronsas-youtube-recovery/v1'){throw 'Unexpected recovery schema.'}
  if([string]$request.module -ne 'youtube-optimizer'){throw 'Unexpected recovery module.'}
  if([string]$request.confirmation -ne 'RECOVER RONSAS YOUTUBE OPTIMIZER'){throw 'Explicit recovery confirmation missing.'}
  if([bool]$request.constraints.changeBilling -or [bool]$request.constraints.changeDomains -or [bool]$request.constraints.createService -or [bool]$request.constraints.cloudflareWorkerMigration -or [bool]$request.constraints.rebuildSource -or [bool]$request.constraints.touchOtherSpokes){
    throw 'Recovery request violates protected constraints.'
  }

  if(-not (Test-Url $LocalUrl 10)){throw 'YouTube Optimizer loopback port 3401 is not healthy; edge-only recovery is not authorized for an app-runtime failure.'}
  $listener=Get-NetTCPConnection -LocalPort 3401 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if(-not $listener){throw 'YouTube Optimizer loopback responded but no listener exists on port 3401.'}
  $proc=Get-CimInstance Win32_Process -Filter ("ProcessId=" + [int]$listener.OwningProcess) -ErrorAction SilentlyContinue
  if(-not $proc -or [string]$proc.Name -ne 'node.exe'){throw 'YouTube Optimizer port 3401 is not owned by the expected Node runtime.'}
  $cmd=[string]$proc.CommandLine
  if($cmd -and $cmd -notlike '*youtube-optimizer-stage*'){throw 'YouTube Optimizer port 3401 is owned by an unrecognized Node process.'}
  Write-Host "PASS app loopback: $LocalUrl PID $($listener.OwningProcess)"

  if(-not (Test-Path -LiteralPath $ControlConfig -PathType Leaf)){throw "Control config missing: $ControlConfig"}
  if(-not (Test-Path -LiteralPath $EdgeScript -PathType Leaf)){throw "Edge recovery script missing: $EdgeScript"}
  if(-not (Test-Path -LiteralPath $GovernedCaddy -PathType Leaf)){throw "Governed Caddyfile missing: $GovernedCaddy"}

  $control=Get-Content -Raw -LiteralPath $ControlConfig | ConvertFrom-Json
  $edge=$control.publicEdge
  if(-not $edge){throw 'RONS public-edge configuration is missing.'}

  $CaddyExe=[string]$edge.caddyExe
  $CaddyConfig=[string]$edge.caddyConfig
  $CloudflaredExe=[string]$edge.cloudflaredExe
  $CloudflaredConfig=[string]$edge.cloudflaredConfig
  $TunnelName=[string]$edge.tunnelName
  foreach($required in @($CaddyExe,$CaddyConfig,$CloudflaredExe,$CloudflaredConfig)){
    if(-not (Test-Path -LiteralPath $required)){throw "Required public-edge asset missing: $required"}
  }

  & $CaddyExe validate --config $GovernedCaddy
  if($LASTEXITCODE -ne 0){throw 'Governed Caddyfile validation failed.'}

  $installedHash=(Get-FileHash -Algorithm SHA256 -LiteralPath $CaddyConfig).Hash
  $governedHash=(Get-FileHash -Algorithm SHA256 -LiteralPath $GovernedCaddy).Hash
  Write-Host "Caddy installed SHA256=$installedHash"
  Write-Host "Caddy governed  SHA256=$governedHash"

  if($installedHash -ne $governedHash){
    $backup=Join-Path $LogRoot ('Caddyfile.before-youtube-edge-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    Copy-Item -LiteralPath $CaddyConfig -Destination $backup -Force
    Copy-Item -LiteralPath $GovernedCaddy -Destination $CaddyConfig -Force
    Write-Host "Promoted governed Caddyfile after backup: $backup"
  }

  if($installedHash -ne $governedHash -or -not (Test-Url $CaddyYoutubeUrl 8)){
    & $CaddyExe reload --config $CaddyConfig
    if($LASTEXITCODE -ne 0){throw 'Managed Caddy reload failed.'}
    Start-Sleep -Seconds 2
  }
  if(-not (Wait-Url $CaddyYoutubeUrl 30)){throw 'Managed local Caddy YouTube route 8804 is unhealthy.'}
  Write-Host "PASS Caddy local edge: $CaddyYoutubeUrl"

  $cfLines=@(Get-Content -LiteralPath $CloudflaredConfig)
  $hostIndex=-1
  for($i=0;$i -lt $cfLines.Count;$i++){
    if($cfLines[$i] -match '^\s*-?\s*hostname:\s*youtube\.reson8\.life\s*$'){$hostIndex=$i;break}
  }
  if($hostIndex -lt 0){throw 'Existing cloudflared config has no youtube.reson8.life ingress; refusing domain mutation.'}
  $end=[Math]::Min($cfLines.Count-1,$hostIndex+5)
  $ingressBlock=($cfLines[$hostIndex..$end] -join [Environment]::NewLine)
  if($ingressBlock -notmatch 'service:\s*http://127\.0\.0\.1:8804\s*$'){
    throw 'Existing youtube.reson8.life ingress does not target governed local edge port 8804; refusing domain mutation.'
  }
  Write-Host 'PASS existing cloudflared ingress: youtube.reson8.life -> http://127.0.0.1:8804'

  if(-not (Test-Url $PublicUrl 10)){
    $tunnel=Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
      Where-Object {
        [string]$_.CommandLine -like ('*' + $TunnelName + '*') -and
        [string]$_.CommandLine -like ('*' + $CloudflaredConfig + '*')
      } | Select-Object -First 1

    if($tunnel){
      Write-Host "Recycling verified existing named tunnel PID $($tunnel.ProcessId); ingress config is unchanged."
      Stop-Process -Id ([int]$tunnel.ProcessId) -Force -ErrorAction Stop
      Start-Sleep -Seconds 2
    } else {
      Write-Host 'Managed named tunnel is absent; governed edge recovery will start the configured tunnel.'
    }

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $EdgeScript
    if($LASTEXITCODE -ne 0){Write-Warning "Edge ensure returned code $LASTEXITCODE; final public verification remains authoritative."}
  }

  if(-not (Wait-Url $PublicUrl 75)){throw 'YouTube loopback and Caddy local edge are healthy, but youtube.reson8.life still fails through the existing named tunnel.'}

  Write-Host "PASS public YouTube edge: $PublicUrl"
  Write-Host 'RONSAS YOUTUBE PUBLIC EDGE: HEALTHY'
  Write-Receipt 'success' 'Loopback 3401, Caddy 8804, existing cloudflared ingress, and public URL verified.'
  exit 0
} catch {
  $message=$_.Exception.Message
  Write-Receipt 'failure' $message
  Write-Error $message
  exit 2
}
