param(
  [switch]$OpenBrowser,
  [switch]$RequireLocalAI,
  [string]$WorkspaceRoot = $env:WORKSPACE_ROOT
)
$ErrorActionPreference = "Stop"
$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$python = Join-Path $root '.resonance-venv\Scripts\python.exe'
Set-Location $root

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
  $WorkspaceRoot = $root
}

if (-not [IO.Path]::IsPathRooted($WorkspaceRoot)) {
  throw "WorkspaceRoot must be an absolute path."
}

$WorkspaceRoot = [IO.Path]::GetFullPath($WorkspaceRoot)

if (-not (Test-Path -LiteralPath $WorkspaceRoot -PathType Container)) {
  throw "WorkspaceRoot does not exist: $WorkspaceRoot"
}

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
  throw "Offline start refused: governed repository-local .resonance-venv is missing. Provision from the local wheelhouse first."
}
if ($RequireLocalAI) {
  if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    throw "Local-AI start refused: Ollama is not installed locally. Deterministic Zero-Credit mode can still run without -RequireLocalAI."
  }
  $model = if ($env:SOVEREIGN_MODEL) { $env:SOVEREIGN_MODEL } else { "qwen3-coder:30b" }
  $models = (& ollama list 2>$null | Out-String)
  if ($LASTEXITCODE -ne 0 -or $models -notmatch [regex]::Escape(($model -split ':')[0])) {
    throw "Local-AI start refused: governed local model '$model' is not present. No model download will be attempted."
  }
}
$port = if ($env:FOUNDRY_PORT) { $env:FOUNDRY_PORT } else { "8787" }
$env:ALLOW_EXTERNAL_AI = "false"
$env:WORKSPACE_ROOT = $WorkspaceRoot
Write-Host "Starting Resonance Open Nova v1.4 RC in strict Zero-Credit mode at http://127.0.0.1:$port/builder"
Write-Host "External AI is disabled. No package/model/image download is performed by this script."
if ($OpenBrowser) { Start-Process "http://127.0.0.1:$port/builder" }
& $python -m uvicorn foundry_controller.app.main:app --host 127.0.0.1 --port $port
