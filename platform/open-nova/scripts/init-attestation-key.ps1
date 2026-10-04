$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) { throw "OpenSSL is required." }
$secretDir = Join-Path $root "runtime/secrets"
New-Item -ItemType Directory -Force -Path $secretDir | Out-Null
$private = Join-Path $secretDir "attestation.key"
$public = Join-Path $secretDir "attestation.pub.pem"
if ((Test-Path $private) -or (Test-Path $public)) { throw "Attestation identity already exists; refusing to overwrite it." }
openssl genpkey -algorithm ED25519 -out $private
openssl pkey -in $private -pubout -out $public
Write-Host "Created local Ed25519 attestation identity. Keep runtime/secrets/attestation.key private."
