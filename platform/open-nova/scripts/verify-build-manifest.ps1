param(
  [string]$RootPath = (Split-Path -Parent $PSScriptRoot)
)
$ErrorActionPreference = "Stop"
$root = [System.IO.Path]::GetFullPath($RootPath)
$rootPrefix = $root.TrimEnd("\", "/") + [System.IO.Path]::DirectorySeparatorChar
$manifestPath = Join-Path $root "BUILD_MANIFEST.json"
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "BUILD_MANIFEST.json is missing. The package cannot be verified."
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$failures = @()
foreach ($item in $manifest.files) {
  $relative = [string]$item.path
  $candidate = [System.IO.Path]::GetFullPath((Join-Path $root $relative))
  if (-not $candidate.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    $failures += "$relative escaped the package root"
    continue
  }
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    $failures += "$relative is missing"
    continue
  }
  $file = Get-Item -LiteralPath $candidate
  if ([int64]$file.Length -ne [int64]$item.bytes) {
    $failures += "$relative has an unexpected size"
    continue
  }
  $actual = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne ([string]$item.sha256).ToLowerInvariant()) {
    $failures += "$relative failed SHA-256 verification"
  }
}
if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Host "VERIFY FAILED: $_" -ForegroundColor Red }
  throw "Open Nova package verification failed. No launcher was executed."
}
Write-Host "Open Nova build manifest verified: $($manifest.file_count) files." -ForegroundColor Green
