[CmdletBinding()]
param(
  [switch]$Deep,
  [switch]$SkipFetch,
  [switch]$SkipRuntime,
  [string]$ReportPath = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
if ([string]::IsNullOrWhiteSpace($ReportPath)) {
  $ReportPath = Join-Path $repoRoot ".ronsas\state\backend-source-status.json"
}

$sourceRoot = Join-Path $env:USERPROFILE "Resonance\OpenNova\sources\rons-sovereign-backend-source"
$expectedRemote = "https://github.com/resonance36912-cell/rons-sovereign-backend-source.git"
$expectedTag = "ronsas-source-baseline-2026-09-19"

function Invoke-GitText {
  param([string[]]$Arguments)
  $output = & git -C $sourceRoot @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Arguments -join ' ') failed: $($output -join [Environment]::NewLine)"
  }
  return (($output | Out-String).Trim())
}

function Test-HttpHealth([string]$Name, [string]$Url) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
    return [pscustomobject]@{ name=$Name; url=$Url; status=[int]$response.StatusCode; ok=($response.StatusCode -eq 200) }
  } catch {
    return [pscustomobject]@{ name=$Name; url=$Url; status=0; ok=$false; error=$_.Exception.Message }
  }
}

$failures = @()
$result = [ordered]@{
  schema = "ronsas.backend-source-status.v1"
  captured_at_utc = (Get-Date).ToUniversalTime().ToString("o")
  source_root = $sourceRoot
  repository = "resonance36912-cell/rons-sovereign-backend-source"
  branch = $null
  head = $null
  origin_main = $null
  origin = $null
  baseline_tag = $null
  clean = $false
  synchronized = $false
  authority_metadata = $false
  runtime = @()
  deep = [bool]$Deep
  tests = $null
  ok = $false
}

try {
  if (-not (Test-Path -LiteralPath $sourceRoot)) { throw "source path missing" }
  if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot ".git"))) { throw "Git metadata missing" }

  if (-not $SkipFetch) {
    & git -C $sourceRoot fetch origin main --quiet
    if ($LASTEXITCODE -ne 0) { throw "git fetch origin main failed" }
  }

  $result.branch = Invoke-GitText @("branch","--show-current")
  $result.head = Invoke-GitText @("rev-parse","HEAD")
  $result.origin_main = Invoke-GitText @("rev-parse","origin/main")
  $result.origin = Invoke-GitText @("remote","get-url","origin")
  $result.baseline_tag = Invoke-GitText @("rev-list","-n","1",$expectedTag)
  $dirty = Invoke-GitText @("status","--porcelain")
  $result.clean = [string]::IsNullOrWhiteSpace($dirty)
  $result.synchronized = ($result.head -eq $result.origin_main)

  if ($result.branch -ne "main") { throw "canonical backend source is not on main" }
  if ($result.origin.TrimEnd("/") -ne $expectedRemote.TrimEnd("/")) { throw "origin remote mismatch" }
  if (-not $result.clean) { throw "backend source working tree is dirty" }
  if (-not $result.synchronized) { throw "backend source main is not synchronized with origin/main" }
  if ($result.baseline_tag -ne $result.head) { throw "baseline tag does not identify current baseline head" }

  $authorityPath = Join-Path $sourceRoot "RONSAS-SOURCE-AUTHORITY.json"
  if (-not (Test-Path -LiteralPath $authorityPath)) { throw "RONSAS-SOURCE-AUTHORITY.json missing" }
  $authority = Get-Content -LiteralPath $authorityPath -Raw | ConvertFrom-Json
  if ($authority.repository -ne "https://github.com/resonance36912-cell/rons-sovereign-backend-source") {
    throw "backend source-authority repository metadata mismatch"
  }
  $result.authority_metadata = $true

  if (-not $SkipRuntime) {
    $runtime = @(
      (Test-HttpHealth "gateway" "http://127.0.0.1:58600/health"),
      (Test-HttpHealth "auth" "http://127.0.0.1:58680/health"),
      (Test-HttpHealth "storage" "http://127.0.0.1:59000/health")
    )
    try {
      $tcp = New-Object System.Net.Sockets.TcpClient
      $ar = $tcp.BeginConnect("127.0.0.1",55432,$null,$null)
      $connected = $ar.AsyncWaitHandle.WaitOne(3000,$false)
      if ($connected) { $tcp.EndConnect($ar) }
      $tcp.Close()
      $runtime += [pscustomobject]@{ name="postgres"; url="tcp://127.0.0.1:55432"; status=if($connected){200}else{0}; ok=[bool]$connected }
    } catch {
      $runtime += [pscustomobject]@{ name="postgres"; url="tcp://127.0.0.1:55432"; status=0; ok=$false; error=$_.Exception.Message }
    }
    $result.runtime = $runtime
    $badRuntime = @($runtime | Where-Object { -not $_.ok })
    if ($badRuntime.Count) { throw "one or more live backend loopback services are unhealthy" }
  }

  if ($Deep) {
    $python = Join-Path $sourceRoot ".venv\Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $python)) { throw "backend validation venv is missing" }
    Push-Location $sourceRoot
    try {
      & $python -m pytest -q
      $testExit = $LASTEXITCODE
    } finally {
      Pop-Location
    }
    $result.tests = [ordered]@{ command=".venv/Scripts/python -m pytest -q"; exit_code=$testExit }
    if ($testExit -ne 0) { throw "backend test suite failed" }
  }

  $result.ok = $true
} catch {
  $failures += $_.Exception.Message
}

$report = [ordered]@{
  result = $result
  failures = $failures
}
$reportDir = Split-Path $ReportPath -Parent
if ($reportDir) { New-Item -ItemType Directory -Force -Path $reportDir | Out-Null }
$report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ReportPath -Encoding utf8

[pscustomobject]$result |
  Select-Object branch,clean,synchronized,authority_metadata,@{n="runtime_ok";e={-not (@($_.runtime | Where-Object {-not $_.ok}).Count)}},@{n="tests";e={if($_.tests){$_.tests.exit_code}else{"skipped"}}},ok |
  Format-Table -AutoSize

Write-Output ""
Write-Output ("Report: " + $ReportPath)

if ($failures.Count) {
  Write-Output ""
  Write-Output "Failures:"
  $failures | ForEach-Object { Write-Output ("- " + $_) }
  exit 1
}

Write-Output ""
Write-Output "RONSAS backend source verification passed."
exit 0
