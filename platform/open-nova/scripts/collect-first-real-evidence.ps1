param(
  [string]$AppId = "reson8-life",
  [string]$OutputPath
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "Resonance Open Nova v1.5.2 - Real Execution Evidence Handoff"
Write-Host "Scope: governance/execution evidence only | Source: excluded | Secrets: excluded"

$python = Join-Path $root ".resonance-venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
  $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
  if ($pythonCmd) { $python = $pythonCmd.Source } else { throw "Python is unavailable." }
}
$script = Join-Path $PSScriptRoot "evidence-handoff.py"
$argsList = @($script, "--workspace", $root, "--app-id", $AppId)
if ($OutputPath) { $argsList += @("--output", $OutputPath) }

& $python @argsList
if ($LASTEXITCODE -ne 0) { throw "Evidence packaging failed with exit code $LASTEXITCODE." }

$bundle = if ($OutputPath) { $OutputPath } else { Join-Path $root "exports\evidence-bundles\$AppId-real-execution-evidence.zip" }
& $python $script --verify $bundle
if ($LASTEXITCODE -ne 0) { throw "Evidence bundle verification failed." }

Write-Host "Evidence bundle ready: $bundle"
Write-Host "Upload that ZIP to ChatGPT for real migration analysis."
