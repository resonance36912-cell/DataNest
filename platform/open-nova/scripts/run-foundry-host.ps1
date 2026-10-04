$ErrorActionPreference = "Stop"
$env:ALLOW_EXTERNAL_AI = "false"

if (-not (Test-Path ".env.sovereign")) {
  Copy-Item ".env.sovereign.example" ".env.sovereign"
}

Get-Content ".env.sovereign" | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
    $parts = $line.Split("=", 2)
    [Environment]::SetEnvironmentVariable($parts[0], $parts[1], "Process")
  }
}

if (-not (Test-Path ".resonance-venv/Scripts/python.exe")) {
  py -3 -m venv .resonance-venv
  & .\.resonance-venv\Scripts\python.exe -m pip install --upgrade pip
  & .\.resonance-venv\Scripts\python.exe -m pip install -r foundry_controller\requirements.txt
}

$port = if ($env:FOUNDRY_PORT) { $env:FOUNDRY_PORT } else { "8787" }
Write-Host "Starting Resonance Open Nova v1.0 RC on http://localhost:$port"
& .\.resonance-venv\Scripts\python.exe -m uvicorn foundry_controller.app.main:app --host 127.0.0.1 --port $port
