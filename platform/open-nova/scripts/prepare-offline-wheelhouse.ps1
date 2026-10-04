$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$store = Join-Path $root "runtime/supply-chain/artifacts"
$wheelhouse = Join-Path $root "runtime/supply-chain/wheelhouse"
if (-not (Test-Path $store)) { throw "No local artifact store exists yet." }
New-Item -ItemType Directory -Force -Path $wheelhouse | Out-Null
$count = 0
Get-ChildItem -Path $store -Recurse -File -Filter *.whl | ForEach-Object {
  $expected = $_.Directory.Name
  $actual = (Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLower()
  if ($expected -ne $actual) { throw "Artifact integrity mismatch: $($_.FullName)" }
  Copy-Item -Force $_.FullName (Join-Path $wheelhouse $_.Name)
  $count++
}
Write-Host "Prepared offline Python wheelhouse with $count verified wheel artifact(s)."
