[CmdletBinding()]
param(
  [switch]$Deep,
  [switch]$SkipFetch,
  [switch]$SkipPublic,
  [switch]$SkipPorts,
  [string]$ReportPath = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ReportPath)) {
  $ReportPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".ronsas\state\spoke-source-status.json"
}

$apps = @(
  [pscustomobject]@{
    Id = "epublisher"
    Name = "ePublisher"
    Root = Join-Path $env:USERPROFILE "Resonance\OpenNova\apps\epublisher-sovereign-local-v0.1"
    Repository = "resonance36912-cell/rons-epublisher-sovereign-source"
    Origin = "https://github.com/resonance36912-cell/rons-epublisher-sovereign-source.git"
    Url = "https://epublisher.reson8.life/"
    Port = 3101
    DeepChecks = @("npm.cmd run build:types", "npm.cmd test")
  },
  [pscustomobject]@{
    Id = "creative-studio"
    Name = "Creative Studio"
    Root = Join-Path $env:USERPROFILE "Resonance\OpenNova\apps\creative-studio-sovereign-local-v0.1"
    Repository = "resonance36912-cell/rons-creative-studio-sovereign-source"
    Origin = "https://github.com/resonance36912-cell/rons-creative-studio-sovereign-source.git"
    Url = "https://creative.reson8.life/"
    Port = 3201
    DeepChecks = @("npm.cmd run ci:pricing", "npm.cmd test")
  },
  [pscustomobject]@{
    Id = "sync-vision"
    Name = "Sync Vision"
    Root = Join-Path $env:USERPROFILE "Resonance\OpenNova\apps\sync-vision-sovereign-local-v0.1"
    Repository = "resonance36912-cell/rons-sync-vision-sovereign-source"
    Origin = "https://github.com/resonance36912-cell/rons-sync-vision-sovereign-source.git"
    Url = "https://sync.reson8.life/"
    Port = 3301
    DeepChecks = @("npm.cmd run typecheck", "npm.cmd run lint:jsonld", "npm.cmd test")
  },
  [pscustomobject]@{
    Id = "youtube-optimizer"
    Name = "YouTube Optimizer"
    Root = Join-Path $env:USERPROFILE "Resonance\OpenNova\apps\youtube-optimizer-sovereign-local-v0.1"
    Repository = "resonance36912-cell/rons-youtube-optimizer-sovereign-source"
    Origin = "https://github.com/resonance36912-cell/rons-youtube-optimizer-sovereign-source.git"
    Url = "https://youtube.reson8.life/"
    Port = 3401
    DeepChecks = @(
      "bun run check:config",
      "bun run check:escalation",
      "bun run check:retention",
      "bun run typecheck",
      "bun run test"
    )
  }
)

function Invoke-GitText {
  param([string]$Root, [string[]]$Arguments)
  $output = & git -C $Root @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Arguments -join ' ') failed in ${Root}: $($output -join [Environment]::NewLine)"
  }
  return (($output | Out-String).Trim())
}

$results = @()
$failures = @()

foreach ($app in $apps) {
  $row = [ordered]@{
    id = $app.Id
    name = $app.Name
    root = $app.Root
    repository = $app.Repository
    exists = $false
    git = $false
    branch = $null
    head = $null
    origin_main = $null
    origin = $null
    clean = $false
    synchronized = $false
    authority_metadata = $false
    port_listening = $null
    public_status = $null
    deep_checks = @()
    ok = $false
  }

  try {
    if (-not (Test-Path -LiteralPath $app.Root)) {
      throw "source path missing"
    }
    $row.exists = $true

    if (-not (Test-Path -LiteralPath (Join-Path $app.Root ".git"))) {
      throw "Git metadata missing"
    }
    $row.git = $true

    if (-not $SkipFetch) {
      & git -C $app.Root fetch origin main --quiet
      if ($LASTEXITCODE -ne 0) { throw "git fetch origin main failed" }
    }

    $row.branch = Invoke-GitText $app.Root @("branch", "--show-current")
    $row.head = Invoke-GitText $app.Root @("rev-parse", "HEAD")
    $row.origin_main = Invoke-GitText $app.Root @("rev-parse", "origin/main")
    $row.origin = Invoke-GitText $app.Root @("remote", "get-url", "origin")
    $dirty = Invoke-GitText $app.Root @("status", "--porcelain")
    $row.clean = [string]::IsNullOrWhiteSpace($dirty)
    $row.synchronized = ($row.head -eq $row.origin_main)

    if ($row.branch -ne "main") { throw "canonical working copy is not on main" }
    if ($row.origin.TrimEnd("/") -ne $app.Origin.TrimEnd("/")) { throw "origin remote mismatch" }
    if (-not $row.clean) { throw "working tree is dirty" }
    if (-not $row.synchronized) { throw "local main is not synchronized with origin/main" }

    $authorityPath = Join-Path $app.Root "RONSAS-SOURCE-AUTHORITY.json"
    if (-not (Test-Path -LiteralPath $authorityPath)) {
      throw "RONSAS-SOURCE-AUTHORITY.json missing"
    }
    $authority = Get-Content -LiteralPath $authorityPath -Raw | ConvertFrom-Json
    $expectedRepoUrl = "https://github.com/$($app.Repository)"
    if ($authority.repository -ne $expectedRepoUrl) {
      throw "source-authority repository metadata mismatch"
    }
    $row.authority_metadata = $true

    if (-not $SkipPorts) {
      $listener = Get-NetTCPConnection -LocalPort $app.Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
      $row.port_listening = [bool]$listener
      if (-not $row.port_listening) { throw "loopback port $($app.Port) is not listening" }
    }

    if (-not $SkipPublic) {
      try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $app.Url -TimeoutSec 12
        $row.public_status = [int]$response.StatusCode
      } catch {
        $row.public_status = 0
        throw "public endpoint check failed: $($_.Exception.Message)"
      }
      if ($row.public_status -ne 200) { throw "public endpoint returned HTTP $($row.public_status)" }
    }

    if ($Deep) {
      Push-Location $app.Root
      try {
        foreach ($check in $app.DeepChecks) {
          & cmd.exe /d /s /c $check
          $code = $LASTEXITCODE
          $row.deep_checks += [ordered]@{ command = $check; exit_code = $code }
          if ($code -ne 0) { throw "deep check failed: $check" }
        }
      } finally {
        Pop-Location
      }
    }

    $row.ok = $true
  } catch {
    $failures += "$($app.Name): $($_.Exception.Message)"
  }

  $results += [pscustomobject]$row
}

$reportDir = Split-Path $ReportPath -Parent
if ($reportDir) {
  New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
}

$report = [ordered]@{
  schema = "ronsas.spoke-source-status.v1"
  captured_at_utc = (Get-Date).ToUniversalTime().ToString("o")
  deep = [bool]$Deep
  results = $results
  failures = $failures
}

$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ReportPath -Encoding utf8

$results |
  Select-Object name, branch, clean, synchronized, authority_metadata, port_listening, public_status, ok |
  Format-Table -AutoSize

Write-Output ""
Write-Output ("Report: " + $ReportPath)

if ($failures.Count -gt 0) {
  Write-Output ""
  Write-Output "Failures:"
  $failures | ForEach-Object { Write-Output ("- " + $_) }
  exit 1
}

Write-Output ""
Write-Output "RONSAS spoke source verification passed."
exit 0
