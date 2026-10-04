[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$RuntimeRoot = if ($env:DATANEST_RONSAS_RUNTIME_ROOT) {
    [System.IO.Path]::GetFullPath($env:DATANEST_RONSAS_RUNTIME_ROOT)
} else {
    Join-Path $env:LOCALAPPDATA 'Resonance\DataNest-RONSAS'
}
$Bridge = Join-Path $RepoRoot 'apps\ronsas\syncvision\runtime\musetalk\musetalk_bridge.py'
$StatePath = Join-Path $RuntimeRoot 'r5-local-ai.json'
$BridgeRuntime = Join-Path $RuntimeRoot 'musetalk-bridge'

if (-not (Test-Path -LiteralPath $Bridge -PathType Leaf)) {
    throw "DataNest SyncVision MuseTalk bridge is missing: $Bridge"
}
if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) {
    throw "MuseTalk machine-local state is missing: $StatePath"
}

$State = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
$Python = [string]$State.python_path
if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) {
    throw "MuseTalk Python runtime is missing: $Python"
}

$env:HF_HUB_OFFLINE = '1'
$env:TRANSFORMERS_OFFLINE = '1'
$env:DIFFUSERS_OFFLINE = '1'
$env:HF_HUB_DISABLE_TELEMETRY = '1'
$env:GRADIO_ANALYTICS_ENABLED = 'False'
$env:PYTHONNOUSERSITE = '1'
$env:PYTHONUTF8 = '1'
$env:NO_PROXY = '127.0.0.1,localhost'

Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ' DATANEST RONSAS - SYNCVISION MUSETALK LOCAL BRIDGE' -ForegroundColor Cyan
Write-Host ' http://127.0.0.1:7863 | offline | one GPU job at a time' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan

& $Python $Bridge --root $RuntimeRoot --state $StatePath --runtime-dir $BridgeRuntime --host 127.0.0.1 --port 7863 --inference-timeout 2700
exit $LASTEXITCODE
