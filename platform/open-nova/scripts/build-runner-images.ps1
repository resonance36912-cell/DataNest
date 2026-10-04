$ErrorActionPreference = "Stop"

$engine = $env:CONTAINER_ENGINE
if (-not $engine) {
  if (Get-Command podman -ErrorAction SilentlyContinue) { $engine = "podman" }
  elseif (Get-Command docker -ErrorAction SilentlyContinue) { $engine = "docker" }
  else { throw "No Podman or Docker container engine was found." }
}

Write-Host "Using isolated runner engine:" $engine
& $engine build -t resonance-runner-python:0.3 -f runner/python/Containerfile runner/python
if ($LASTEXITCODE -ne 0) { throw "Python runner image build failed." }
& $engine build -t resonance-runner-node:0.3 -f runner/node/Containerfile runner/node
if ($LASTEXITCODE -ne 0) { throw "Node runner image build failed." }

Write-Host "Runner images cached locally. Runtime policy uses --pull=never and --network=none."
