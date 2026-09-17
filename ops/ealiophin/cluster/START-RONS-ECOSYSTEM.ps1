param([string]$Root = (Join-Path $env:USERPROFILE 'Resonance\OpenNova'))
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$CanonicalLauncher = Join-Path $PSScriptRoot 'START-RONSAS-ECOSYSTEM.ps1'
if (-not (Test-Path -LiteralPath $CanonicalLauncher -PathType Leaf)) {
    throw "Canonical RONSAS launcher missing: $CanonicalLauncher"
}

Write-Host '[RONSAS] START-RONS-ECOSYSTEM.ps1 is a compatibility wrapper.' -ForegroundColor Yellow
Write-Host '[RONSAS] Delegating to START-RONSAS-ECOSYSTEM.ps1 (canonical).' -ForegroundColor Yellow
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $CanonicalLauncher -Root $Root
exit $LASTEXITCODE
