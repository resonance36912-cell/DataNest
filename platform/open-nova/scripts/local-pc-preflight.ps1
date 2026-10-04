param([switch]$WriteEvidence)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Has($name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }
$container = if (Has "podman") { "podman" } elseif (Has "docker") { "docker" } else { $null }

Write-Host "Resonance Open Nova v1.2 - Local PC Preflight"
Write-Host "Workspace: $root"
Write-Host ("Python:  " + $(if (Has "py") {"present"} elseif (Has "python") {"present"} else {"missing"}))
Write-Host ("Git:     " + $(if (Has "git") {"present"} else {"missing"}))
Write-Host ("Container:" + $(if ($container) {" $container"} else {" missing"}))
Write-Host ("OpenSSL: " + $(if (Has "openssl") {"present"} else {"missing"}))
Write-Host ("Ollama:  " + $(if (Has "ollama") {"present (optional for deterministic mode)"} else {"missing (local-AI mode unavailable)"}))

if (-not (Test-Path ".resonance-venv/Scripts/python.exe")) {
  Write-Warning "Local Python environment is not provisioned yet. Strict offline start will require a cached wheelhouse."
  exit 2
}

$uri = "http://127.0.0.1:8787/v1/deployment/preflight"
try {
  $result = Invoke-RestMethod -Method Get -Uri $uri -TimeoutSec 4
  $result | ConvertTo-Json -Depth 12
  if ($WriteEvidence) {
    $body = @{confirmed=$true} | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8787/v1/deployment/evidence" -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 8
  }
  if (-not $result.ready_for_offline_runtime) { exit 3 }
} catch {
  Write-Warning "Controller is not running, so API-level deployment evidence could not be collected. Start Open Nova and re-run this script."
  exit 4
}
