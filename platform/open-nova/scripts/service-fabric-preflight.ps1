$ErrorActionPreference = "Stop"
if (Get-Command podman -ErrorAction SilentlyContinue) { $engine = "podman" }
elseif (Get-Command docker -ErrorAction SilentlyContinue) { $engine = "docker" }
else { throw "No local container engine found. Install/provision one before service-fabric startup." }

$required = @(
  "postgres:16.6-alpine",
  "resonance-service-auth:0.9",
  "resonance-service-storage:0.9",
  "resonance-service-gateway:0.9"
)
$missing = @()
foreach ($image in $required) {
  & $engine image inspect $image *> $null
  if ($LASTEXITCODE -ne 0) { $missing += $image }
}
if ($missing.Count -gt 0) {
  Write-Host "FAIL: governed local service images are missing:"
  $missing | ForEach-Object { Write-Host " - $_" }
  throw "Service Fabric is not offline-ready. No image pull was attempted."
}
Write-Host "PASS: all governed local service image aliases are present."
Write-Host "No image pull or remote registry request was attempted."
