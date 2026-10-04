param(
  [string]$RepositoryPath,
  [string]$AppId = "reson8-life",
  [switch]$AssessOnly,
  [switch]$ExecuteSupportedMigration,
  [switch]$OpenBrowser
)
$ErrorActionPreference = "Stop"
$runner = Join-Path $PSScriptRoot "run-first-real-local.ps1"
$collector = Join-Path $PSScriptRoot "collect-first-real-evidence.ps1"

$argsList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $runner, "-AppId", $AppId)
if ($RepositoryPath) { $argsList += @("-RepositoryPath", $RepositoryPath) }
if ($AssessOnly) { $argsList += "-AssessOnly" }
if ($ExecuteSupportedMigration) { $argsList += "-ExecuteSupportedMigration" }
if ($OpenBrowser) { $argsList += "-OpenBrowser" }

& powershell.exe @argsList
if ($LASTEXITCODE -ne 0) { throw "Local real-execution handoff failed with exit code $LASTEXITCODE." }
& $collector -AppId $AppId
if ($LASTEXITCODE -ne 0) { throw "Evidence collection failed with exit code $LASTEXITCODE." }
