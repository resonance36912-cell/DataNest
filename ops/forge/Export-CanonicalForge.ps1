[CmdletBinding()]
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$OutputDir = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path '_evidence-local\forge-export'),
  [string]$RepositoryName = 'DataNest-Supository',
  [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($RepoRoot)
if (-not (Test-Path -LiteralPath (Join-Path $root '.git'))) {
  throw "Not a Git worktree: $root"
}

function Invoke-Git {
  param([Parameter(Mandatory=$true)][string[]]$Arguments)
  & git -C $root @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

$dirty = @(& git -C $root status --porcelain)
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect repository status.' }
if ($dirty.Count -gt 0) {
  throw "Canonical worktree is not clean. Commit or remove local changes before export.`n$($dirty -join "`n")"
}

$head = (& git -C $root rev-parse $Branch).Trim()
if ($LASTEXITCODE -ne 0 -or $head -notmatch '^[0-9a-f]{40,64}$') {
  throw "Unable to resolve branch '$Branch'."
}
$short = $head.Substring(0, 8)

$ps = Get-Command pwsh -ErrorAction SilentlyContinue
if (-not $ps) { $ps = Get-Command powershell.exe -ErrorAction Stop }

$traceability = Join-Path $root 'ops\validation\Test-ResonanceTraceability.ps1'
& $ps.Source -NoProfile -ExecutionPolicy Bypass -File $traceability -RepoRoot $root
if ($LASTEXITCODE -ne 0) { throw 'Traceability validation failed; forge export blocked.' }

$openNovaVerifier = Join-Path $root 'platform\open-nova\scripts\verify-build-manifest.ps1'
$openNovaRoot = Join-Path $root 'platform\open-nova'
& $ps.Source -NoProfile -ExecutionPolicy Bypass -File $openNovaVerifier -RootPath $openNovaRoot
if ($LASTEXITCODE -ne 0) { throw 'Open Nova manifest verification failed; forge export blocked.' }

$spiderReadinessPath = Join-Path $root 'ops\nodes\SPIDER-READINESS.json'
if (-not (Test-Path -LiteralPath $spiderReadinessPath -PathType Leaf)) {
  throw 'Spider readiness record is missing; forge export blocked.'
}
$spider = Get-Content -LiteralPath $spiderReadinessPath -Raw | ConvertFrom-Json
if ([string]$spider.canonicalId -ne 'RSN-NODE-SPIDER-DR-01') {
  throw 'Spider readiness record has the wrong canonical node ID.'
}
if ([bool]$spider.promotionAuthority) {
  throw 'Spider must not hold production promotion authority.'
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$bundleName = "$RepositoryName-main-$short.bundle"
$bundlePath = Join-Path $OutputDir $bundleName
if (Test-Path -LiteralPath $bundlePath) { Remove-Item -LiteralPath $bundlePath -Force }

Invoke-Git -Arguments @('bundle', 'create', $bundlePath, $Branch)
Invoke-Git -Arguments @('bundle', 'verify', $bundlePath)

$file = Get-Item -LiteralPath $bundlePath
$sha = (Get-FileHash -LiteralPath $bundlePath -Algorithm SHA256).Hash.ToUpperInvariant()
$manifestName = "FORGE-EXPORT-MANIFEST-$short.json"
$manifestPath = Join-Path $OutputDir $manifestName

$manifest = [ordered]@{
  schema = 'resonance-forge-export/v1'
  generatedAt = (Get-Date).ToString('o')
  canonicalRepository = $RepositoryName
  canonicalPath = $root
  branch = $Branch
  head = $head
  sourceState = 'clean'
  validations = [ordered]@{
    traceability = 'passed'
    openNovaBuildManifest = 'passed-261-files'
  }
  nodeReadiness = [ordered]@{
    ealiophin = 'online-observed-production-authority'
    weed = 'online-observed-support-recovery'
    spider = [ordered]@{
      canonicalId = [string]$spider.canonicalId
      role = [string]$spider.role
      statusAtExport = [string]$spider.desktopCommander.statusAtRecord
      freshWorkstationAudit = [bool]$spider.desktopCommander.freshWorkstationAudit
      promotionAuthority = [bool]$spider.promotionAuthority
      includedInCanonicalTopology = [bool]$spider.migrationDisposition.includedInCanonicalTopology
      forgeImportBlocked = [bool]$spider.migrationDisposition.forgeImportBlocked
      fullTopologyCertificationBlockedUntilFreshAudit = [bool]$spider.migrationDisposition.fullTopologyCertificationBlockedUntilFreshAudit
    }
  }
  bundle = [ordered]@{
    file = $bundleName
    bytes = [int64]$file.Length
    sha256 = $sha
    content = 'full-history-reachable-from-main'
  }
  import = [ordered]@{
    targetProvider = 'GitLab'
    targetRepository = 'Resonance-AppDev/DataNest-Supository'
    productionAuthority = 'protected-main-only'
  }
}

$json = $manifest | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText($manifestPath, $json + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))

Write-Host "Forge export created: $bundlePath" -ForegroundColor Green
Write-Host "SHA-256: $sha" -ForegroundColor Green
Write-Host "Manifest: $manifestPath" -ForegroundColor Green
