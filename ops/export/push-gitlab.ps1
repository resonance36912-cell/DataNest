param(
  [Parameter(Mandatory=$true)][string]$GitLabProjectUrl,
  [switch]$IncludeLegacyBranches,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if ((git -C $repo status --porcelain)) { throw 'Canonical repository is not clean.' }
$head = (git -C $repo rev-parse HEAD).Trim()
$defaultBranch = 'main'
$remote = 'gitlab'
$existing = git -C $repo remote get-url $remote 2>$null
if ($LASTEXITCODE -eq 0) {
  if ($existing.Trim() -ne $GitLabProjectUrl) { throw "Remote '$remote' already points to a different URL: $existing" }
} elseif (-not $DryRun) {
  git -C $repo remote add $remote $GitLabProjectUrl
}
Write-Host "Canonical HEAD: $head"
Write-Host "Target: $GitLabProjectUrl"
Write-Host "Phase 1: main + certification/release tags"
if (-not $DryRun) {
  git -C $repo push $remote "refs/heads/$defaultBranch:refs/heads/$defaultBranch"
  if ($LASTEXITCODE -ne 0) { throw 'main push failed.' }
  git -C $repo push $remote --tags
  if ($LASTEXITCODE -ne 0) { throw 'tag push failed.' }
}
if ($IncludeLegacyBranches) {
  Write-Host 'Phase 2: preserved legacy/quarantine/reconciliation branches'
  $prefixes = @('legacy','quarantine','candidate','reconcile','repair','fix','consolidation','certified')
  foreach ($prefix in $prefixes) {
    $refs = @(git -C $repo for-each-ref "refs/heads/$prefix/" --format='%(refname)')
    foreach ($ref in $refs) {
      if ($DryRun) { Write-Host "DRY RUN push $ref" }
      else {
        git -C $repo push $remote "$ref`:$ref"
        if ($LASTEXITCODE -ne 0) { throw "Push failed: $ref" }
      }
    }
  }
}
Write-Host 'Push sequence complete. Configure protected main and human promotion controls before deployment.'