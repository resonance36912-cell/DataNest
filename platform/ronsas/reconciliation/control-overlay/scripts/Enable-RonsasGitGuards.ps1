[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (& git rev-parse --show-toplevel 2>$null).Trim()
if (-not $root) { throw 'Run this script from inside the RONSAS repository.' }
if (-not (Test-Path -LiteralPath (Join-Path $root '.githooks\pre-push'))) { throw 'RONSAS pre-push hook is missing.' }
& git -C $root config core.hooksPath .githooks
if ($LASTEXITCODE -ne 0) { throw 'Failed to configure core.hooksPath.' }
Write-Host 'RONSAS Git guards enabled.'
Write-Host 'Direct pushes to main are blocked; use a review branch and pull request.'
