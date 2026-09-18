param([string]$Root = (Join-Path $env:USERPROFILE 'Resonance\OpenNova'))
$ErrorActionPreference = 'Stop'
Write-Host '[RONSAS] Legacy STATUS-RONS-ECOSYSTEM alias -> canonical RONSAS status.'
& (Join-Path $PSScriptRoot 'STATUS-RONSAS-ECOSYSTEM.ps1') -Root $Root
exit $LASTEXITCODE
