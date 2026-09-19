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

function Test-ZeroSpendBudget {
  $path = Join-Path $repoRoot "qa\premium-readiness\staging-budget.json"
  if (-not (Test-Path -LiteralPath $path)) { return $false }
  try {
    $budget = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    return (
      $budget.schema -eq "ronsas.premium-readiness.staging-budget.v1" -and
      $budget.status -eq "active_zero_external_spend" -and
      [int64]$budget.approved_external_spend_cents_max -eq 0 -and
      [int64]$budget.approved_real_provider_calls_max -eq 0 -and
      [bool]$budget.production_hosts_forbidden -and
      [bool]$budget.smoke_only_until_prerequisites_complete
    )
  } catch {
    return $false
  }
}

function Test-ProviderStubCapability {
  $path = Join-Path $repoRoot "qa\premium-readiness\provider-capabilities.json"
  if (-not (Test-Path -LiteralPath $path)) { return $false }
  try {
    $capabilities = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    if ($capabilities.schema -ne "ronsas.premium-readiness.provider-capabilities.v1") { return $false }
    $required = @("epublisher","creative-studio","sync-vision","youtube-optimizer")
    foreach ($id in $required) {
      $entry = @($capabilities.apps | Where-Object { $_.id -eq $id })
      if ($entry.Count -ne 1 -or -not [bool]$entry[0].stub_ready) { return $false }
    }
    return [bool]$capabilities.overall_provider_stubs_ready
  } catch {
    return $false
  }
}

function Test-StagingObservability {
  if (-not (Get-Command podman -ErrorAction SilentlyContinue)) { return $false }
  $containers = @(
    "resonance-sovereign-staging-v2-postgres-1",
    "resonance-sovereign-staging-v2-storage-1",
    "resonance-sovereign-staging-v2-auth-1",
    "resonance-sovereign-staging-v2-gateway-1"
  )
  try {
    foreach ($container in $containers) {
      $status = (& podman inspect -f "{{.State.Status}}" $container 2>$null | Out-String).Trim()
      if ($LASTEXITCODE -ne 0 -or $status -ne "running") { return $false }
      & cmd.exe /d /c "podman logs --tail 1 $container >nul 2>nul"
      if ($LASTEXITCODE -ne 0) { return $false }
    }
    foreach ($url in @("http://127.0.0.1:60680/health","http://127.0.0.1:60600/health")) {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 5
      if ([int]$response.StatusCode -ne 200) { return $false }
    }
    return $true
  } catch {
    return $false
  }
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

$autoEvidence = [ordered]@{
  provider_stubs = Test-ProviderStubCapability
  observability = Test-StagingObservability
  approved_traffic_budget = Test-ZeroSpendBudget
}

$prereqs = [ordered]@{
  disposable_accounts = Get-EnvReady "RONSAS_DISPOSABLE_ACCOUNTS_READY"
  sandbox_payments = Get-EnvReady "RONSAS_SANDBOX_PAYMENT_READY"
  provider_stubs = (Get-EnvReady "RONSAS_PROVIDER_STUBS_READY") -or $autoEvidence.provider_stubs
  observability = (Get-EnvReady "RONSAS_OBSERVABILITY_READY") -or $autoEvidence.observability
  approved_traffic_budget = (Get-EnvReady "RONSAS_APPROVED_TEST_BUDGET") -or $autoEvidence.approved_traffic_budget
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
  automatic_evidence = $autoEvidence
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
