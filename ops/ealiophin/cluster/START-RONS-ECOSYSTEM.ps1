param([string]$Root = (Join-Path $env:USERPROFILE 'Resonance\OpenNova'))
$ErrorActionPreference = 'Stop'
Write-Host '[RONSAS] Legacy START-RONS-ECOSYSTEM alias -> canonical RONSAS supervisor.'
& (Join-Path $PSScriptRoot 'START-RONSAS-ECOSYSTEM.ps1') -Root $Root
exit $LASTEXITCODE
