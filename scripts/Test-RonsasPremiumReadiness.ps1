[CmdletBinding()]
param(
  [ValidateSet("assess","smoke","load")]
  [string]$Mode = "assess",
  [string]$TargetBaseUrl = "",
  [switch]$AllowStagingTraffic,
  [switch]$RequireReady,
  [string]$ReportPath = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
if ([string]::IsNullOrWhiteSpace($ReportPath)) {
  $ReportPath = Join-Path $repoRoot ".ronsas\state\premium-readiness-status.json"
}

$productionHosts = @(
  "reson8.life",
  "www.reson8.life",
  "epublisher.reson8.life",
  "creative.reson8.life",
  "sync.reson8.life",
  "youtube.reson8.life",
  "career-compass.org",
  "www.career-compass.org",
  "career-compass-admin.org",
  "www.career-compass-admin.org",
  "resonance-podcast.com",
  "www.resonance-podcast.com"
)

function Get-EnvReady([string]$Name) {
  return [Environment]::GetEnvironmentVariable($Name) -eq "1"
}

function Resolve-FixtureCount([string]$RelativePath) {
  $path = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path)) { return 0 }
  $fixtureExtensions = @(".json", ".md", ".txt", ".yaml", ".yml")
  return @(
    Get-ChildItem -LiteralPath $path -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $fixtureExtensions -contains $_.Extension.ToLowerInvariant() }
  ).Count
}

$manifestPath = Join-Path $repoRoot "qa\premium-readiness\fixture-manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Premium-readiness fixture manifest is missing: $manifestPath"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

$prereqs = [ordered]@{
  disposable_accounts = Get-EnvReady "RONSAS_DISPOSABLE_ACCOUNTS_READY"
  sandbox_payments = Get-EnvReady "RONSAS_SANDBOX_PAYMENT_READY"
  provider_stubs = Get-EnvReady "RONSAS_PROVIDER_STUBS_READY"
  observability = Get-EnvReady "RONSAS_OBSERVABILITY_READY"
  approved_traffic_budget = Get-EnvReady "RONSAS_APPROVED_TEST_BUDGET"
}

$fixtures = @()
foreach ($app in $manifest.apps) {
  if (-not $app.generative) { continue }
  $count = Resolve-FixtureCount $app.fixture_directory
  $fixtures += [pscustomobject]@{
    app = $app.id
    required = [int]$app.minimum_fixtures
    present = $count
    ready = ($count -ge [int]$app.minimum_fixtures)
  }
}

$target = $null
$targetSafe = $true
$targetReason = "assessment-only"
if (-not [string]::IsNullOrWhiteSpace($TargetBaseUrl)) {
  try {
    $target = [Uri]$TargetBaseUrl
  } catch {
    throw "TargetBaseUrl is not a valid absolute URL: $TargetBaseUrl"
  }
  if ($target.Scheme -notin @("http","https")) {
    throw "Only http/https staging targets are permitted."
  }
  $targetHost = $target.Host.ToLowerInvariant()
  if ($productionHosts -contains $targetHost -or $targetHost.EndsWith(".reson8.life")) {
    $targetSafe = $false
    $targetReason = "production-host-blocked"
  } else {
    $targetReason = "non-production-host"
  }
}

$k6Available = [bool](Get-Command k6 -ErrorAction SilentlyContinue)
$missingPrereqs = @($prereqs.Keys | Where-Object { -not $prereqs[$_] })
$fixtureFailures = @($fixtures | Where-Object { -not $_.ready })
$readyForSmoke = $targetSafe -and $missingPrereqs.Count -eq 0 -and $fixtureFailures.Count -eq 0
$readyForLoad = $readyForSmoke -and $k6Available

if ($Mode -ne "assess") {
  if ([string]::IsNullOrWhiteSpace($TargetBaseUrl)) {
    throw "A staging TargetBaseUrl is required for mode '$Mode'."
  }
  if (-not $targetSafe) {
    throw "Refusing traffic to production or protected host '$($target.Host)'."
  }
  if (-not $AllowStagingTraffic) {
    throw "Traffic is disabled by default. Re-run with -AllowStagingTraffic after staging approval."
  }
  if ($missingPrereqs.Count -gt 0) {
    throw "Staging prerequisites are incomplete: $($missingPrereqs -join ', ')"
  }
  if ($fixtureFailures.Count -gt 0) {
    throw "Representative fixture minimum is not met for: $((@($fixtureFailures.app)) -join ', ')"
  }
}

$trafficResult = $null
if ($Mode -eq "smoke") {
  $paths = @("/", "/pricing")
  $probes = @()
  foreach ($path in $paths) {
    $uri = [Uri]::new($target, $path)
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $uri.AbsoluteUri -TimeoutSec 15
      $probes += [pscustomobject]@{ path = $path; status = [int]$response.StatusCode; ok = ($response.StatusCode -eq 200) }
    } catch {
      $probes += [pscustomobject]@{ path = $path; status = 0; ok = $false; error = $_.Exception.Message }
    }
  }
  $trafficResult = [ordered]@{ profile = "smoke"; probes = $probes; ok = -not (@($probes | Where-Object { -not $_.ok }).Count) }
}

if ($Mode -eq "load") {
  if (-not $k6Available) {
    throw "k6 is required for load mode and is not installed."
  }
  if ([Environment]::GetEnvironmentVariable("RONSAS_ALLOW_LOAD_TEST") -ne "1") {
    throw "Set RONSAS_ALLOW_LOAD_TEST=1 after explicit approval before load mode."
  }
  $script = Join-Path $repoRoot "qa\performance\reson8-staging.k6.js"
  & k6 run -e RONSAS_TEST_BASE_URL=$TargetBaseUrl -e RONSAS_ALLOW_LOAD_TEST=1 $script
  if ($LASTEXITCODE -ne 0) { throw "k6 staging workload failed with exit code $LASTEXITCODE" }
  $trafficResult = [ordered]@{ profile = "load"; ok = $true }
}

$report = [ordered]@{
  schema = "ronsas.premium-readiness-status.v1"
  captured_at_utc = (Get-Date).ToUniversalTime().ToString("o")
  mode = $Mode
  target = if ($target) { $target.AbsoluteUri } else { $null }
  target_safe = $targetSafe
  target_reason = $targetReason
  production_hosts_blocked = $productionHosts
  prerequisites = $prereqs
  missing_prerequisites = $missingPrereqs
  fixture_status = $fixtures
  k6_available = $k6Available
  ready_for_smoke = $readyForSmoke
  ready_for_load = $readyForLoad
  traffic_result = $trafficResult
  certification_ready = $false
  certification_note = "Certification also requires authenticated workflow evidence, human output review, billing/recovery evidence, WCAG 2.2 AA manual checks, OWASP ASVS evidence, and approved staging load/failure testing."
}

$reportDir = Split-Path $ReportPath -Parent
if ($reportDir) { New-Item -ItemType Directory -Force -Path $reportDir | Out-Null }
$report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ReportPath -Encoding utf8

$fixtures | Format-Table app, required, present, ready -AutoSize
Write-Output ""
Write-Output ("Missing prerequisites: " + ($(if ($missingPrereqs.Count) { $missingPrereqs -join ", " } else { "none" })))
Write-Output ("Target safe: " + $targetSafe + " (" + $targetReason + ")")
Write-Output ("k6 available: " + $k6Available)
Write-Output ("Ready for staging smoke: " + $readyForSmoke)
Write-Output ("Ready for staging load: " + $readyForLoad)
Write-Output ("Certification ready: False")
Write-Output ("Report: " + $ReportPath)

if ($RequireReady -and -not $readyForSmoke) { exit 1 }
exit 0
