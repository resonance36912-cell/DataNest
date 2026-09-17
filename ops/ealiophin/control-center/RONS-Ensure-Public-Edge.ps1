$ErrorActionPreference = 'Stop'
$Base = Split-Path -Parent $MyInvocation.MyCommand.Path
$Config = Get-Content -Raw -LiteralPath (Join-Path $Base 'rons-control.json') | ConvertFrom-Json
$LogDir = Join-Path $Base 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir ('public-edge-' + (Get-Date -Format 'yyyyMMdd') + '.log')
function Log([string]$m) { Add-Content -LiteralPath $Log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $m) -Encoding UTF8 }
if (-not [bool]$Config.autonomy.ensurePublicEdge) { return }
$edge = $Config.publicEdge
function Get-CaddyProcess {
  Get-CimInstance Win32_Process -Filter "Name='caddy.exe'" -ErrorAction SilentlyContinue |
    Where-Object { [string]$_.CommandLine -like ('*' + [string]$edge.caddyConfig + '*') } | Select-Object -First 1
}
function Get-TunnelProcess {
  Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object { [string]$_.CommandLine -like ('*' + [string]$edge.tunnelName + '*') -and [string]$_.CommandLine -like ('*' + [string]$edge.cloudflaredConfig + '*') } | Select-Object -First 1
}
try {
  $caddy = Get-CaddyProcess
  if (-not $caddy) {
    $occupied = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { [int]$_.LocalPort -in @($edge.caddyPorts) })
    if ($occupied.Count -gt 0) { throw 'Managed Caddy is absent but one or more edge ports are occupied; refusing duplicate start.' }
    if (-not (Test-Path -LiteralPath $edge.caddyExe -PathType Leaf)) { throw 'Caddy executable missing.' }
    if (-not (Test-Path -LiteralPath $edge.caddyConfig -PathType Leaf)) { throw 'Caddy configuration missing.' }
    Start-Process -FilePath $edge.caddyExe -ArgumentList @('run','--config',[string]$edge.caddyConfig) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogDir 'caddy.out.log') -RedirectStandardError (Join-Path $LogDir 'caddy.err.log') | Out-Null
    Start-Sleep -Seconds 3
    $caddy = Get-CaddyProcess
    if (-not $caddy) { throw 'Caddy did not stay running after recovery start.' }
    Log ('Recovered Caddy PID ' + $caddy.ProcessId + '.')
  }
  foreach ($port in @($edge.caddyPorts)) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort ([int]$port) -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $listener -or [int]$listener.OwningProcess -ne [int]$caddy.ProcessId) { throw ('Caddy edge port unhealthy: ' + $port) }
  }
  $tunnel = Get-TunnelProcess
  if (-not $tunnel) {
    if (-not (Test-Path -LiteralPath $edge.cloudflaredExe -PathType Leaf)) { throw 'cloudflared executable missing.' }
    if (-not (Test-Path -LiteralPath $edge.cloudflaredConfig -PathType Leaf)) { throw 'cloudflared configuration missing.' }
    Start-Process -FilePath $edge.cloudflaredExe -ArgumentList @('tunnel','--config',[string]$edge.cloudflaredConfig,'run',[string]$edge.tunnelName) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogDir 'cloudflared.out.log') -RedirectStandardError (Join-Path $LogDir 'cloudflared.err.log') | Out-Null
    Start-Sleep -Seconds 4
    $tunnel = Get-TunnelProcess
    if (-not $tunnel) { throw 'Named Cloudflare tunnel did not stay running after recovery start.' }
    Log ('Recovered named tunnel PID ' + $tunnel.ProcessId + '.')
  }
  try { $r = Invoke-WebRequest -UseBasicParsing -Uri ([string]$edge.canonicalUrl) -TimeoutSec 8; if ($r.StatusCode -ne 200) { throw ('HTTP ' + $r.StatusCode) } }
  catch { Log ('Public verification warning: ' + $_.Exception.Message); return }
} catch {
  Log ('Public edge recovery warning: ' + $_.Exception.Message)
}

$PublicVerifier = Join-Path $Base 'RONS-Verify-Public-Endpoints.ps1'
if (Test-Path -LiteralPath $PublicVerifier -PathType Leaf) {
  & $PublicVerifier
  if ($LASTEXITCODE -ne 0) { Log ('One or more public endpoints failed verification; code=' + $LASTEXITCODE) }
}
