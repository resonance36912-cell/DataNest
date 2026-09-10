param([string]$Root = (Join-Path $env:USERPROFILE "Resonance\OpenNova"))

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Integration = Join-Path $Root "integrations\musetalk-syncvision-bridge"
$Bridge = Join-Path $Integration "musetalk_bridge.py"
$StatePath = Join-Path $Root "runtime\r5-local-ai.json"
if (-not (Test-Path -LiteralPath $Bridge -PathType Leaf)) { throw "R5B bridge is missing: $Bridge" }
if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) { throw "R5A state is missing: $StatePath" }
$State = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
$Python = [string]$State.python_path
if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) { throw "R5A Python is missing: $Python" }

$env:HF_HUB_OFFLINE = "1"
$env:TRANSFORMERS_OFFLINE = "1"
$env:DIFFUSERS_OFFLINE = "1"
$env:HF_HUB_DISABLE_TELEMETRY = "1"
$env:GRADIO_ANALYTICS_ENABLED = "False"
$env:PYTHONNOUSERSITE = "1"
$existingPythonPath = $env:PYTHONPATH
$env:PYTHONPATH = [string]$State.engine_path
if ($existingPythonPath) { $env:PYTHONPATH += ";" + $existingPythonPath }
$env:TORCH_HOME = if ($State.torch_home) { [string]$State.torch_home } else { Join-Path $Root "runtime\model-cache\torch" }
$env:PYTHONUTF8 = "1"
$env:NO_PROXY = "127.0.0.1,localhost"
$env:PATH = ((Split-Path -Parent ([string]$State.ffmpeg_path)) + ";" + $env:PATH)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " RESONANCE R5B - MUSETALK / SYNC VISION LOCAL BRIDGE" -ForegroundColor Cyan
Write-Host " http://127.0.0.1:7863 | offline | one GPU job at a time" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Close this window to stop the bridge."
& $Python $Bridge --root $Root --host 127.0.0.1 --port 7863 --inference-timeout 2700
exit $LASTEXITCODE
