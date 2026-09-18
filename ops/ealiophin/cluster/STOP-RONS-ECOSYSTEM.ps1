param([string]$Root = (Join-Path $env:USERPROFILE 'Resonance\OpenNova'))
$ErrorActionPreference = 'Stop'
Write-Host '[RONSAS] Legacy STOP-RONS-ECOSYSTEM alias -> canonical RONSAS stop control.'
& (Join-Path $PSScriptRoot 'STOP-RONSAS-ECOSYSTEM.ps1') -Root $Root
exit $LASTEXITCODE
