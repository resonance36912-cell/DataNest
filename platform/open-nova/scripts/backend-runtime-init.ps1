param(
  [switch]$Start,
  [string]$WorkspaceRoot = $env:WORKSPACE_ROOT
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$body = @{confirmed=$true} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8787/v1/backend/secrets/init" -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 8
$r = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8787/v1/backend/runtime/write" -ContentType "application/json" -Body $body
$r | ConvertTo-Json -Depth 8
if ($Start) {
  if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
    throw "WorkspaceRoot or WORKSPACE_ROOT is required when -Start is used."
  }
  if (-not [IO.Path]::IsPathRooted($WorkspaceRoot)) {
    throw "WorkspaceRoot must be an absolute path."
  }
  $WorkspaceRoot = [IO.Path]::GetFullPath($WorkspaceRoot)
  if (-not (Test-Path -LiteralPath $WorkspaceRoot -PathType Container)) {
    throw "WorkspaceRoot does not exist: $WorkspaceRoot"
  }
  if (-not $r.path) {
    throw "Backend runtime response did not include a compose path."
  }
  $composePath = if ([IO.Path]::IsPathRooted([string]$r.path)) {
    [IO.Path]::GetFullPath([string]$r.path)
  } else {
    [IO.Path]::GetFullPath((Join-Path $WorkspaceRoot ([string]$r.path)))
  }
  $expectedComposePath = [IO.Path]::GetFullPath((Join-Path $WorkspaceRoot 'runtime\backend-runtime\compose.backend.yml'))
  if (-not [string]::Equals($composePath,$expectedComposePath,[StringComparison]::OrdinalIgnoreCase)) {
    throw "Backend runtime compose path escaped canonical authority: $composePath"
  }
  if (-not (Test-Path -LiteralPath $composePath -PathType Leaf)) {
    throw "Canonical backend compose file is missing: $composePath"
  }
  $engine = if (Get-Command podman -ErrorAction SilentlyContinue) {"podman"} elseif (Get-Command docker -ErrorAction SilentlyContinue) {"docker"} else {throw "Podman or Docker is required."}
  & $engine compose -f $composePath up -d
  if ($LASTEXITCODE -ne 0) {
    throw "Backend compose start failed with exit code $LASTEXITCODE."
  }
}
