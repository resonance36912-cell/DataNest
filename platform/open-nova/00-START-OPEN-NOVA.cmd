@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Resonance Open Nova v1.5.5 - Start Here
set "OPEN_NOVA_SELF=%~f0"
echo Resonance Open Nova v1.5.5 - automatic first-run launcher
echo This launcher keeps external AI denied and production cutover disabled.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$r=Get-Content -LiteralPath $env:OPEN_NOVA_SELF -Raw; $p=($r -split '(?m)^:OPEN_NOVA_POWERSHELL\r?$',2)[1]; if(-not $p){throw 'Embedded launcher section is missing.'}; Invoke-Expression $p"
if errorlevel 1 (
  echo.
  echo Open Nova stopped safely. Read the error above.
  echo No production cutover was performed.
  pause
  exit /b 1
)
exit /b 0
:OPEN_NOVA_POWERSHELL
$ErrorActionPreference = "Stop"
$folder = "ResonanceAppDev_ZeroCredit_v1.5.5"
$releaseVersion = "1.5.5-oneclick1"
$self = $env:OPEN_NOVA_SELF
$here = Split-Path -Parent $self

function Start-VerifiedOpenNova([string]$root) {
  $verifier = Join-Path $root "scripts\verify-build-manifest.ps1"
  $launcher = Join-Path $root "OPEN-NOVA-FIRST-RUN.cmd"
  if (-not (Test-Path -LiteralPath $verifier -PathType Leaf)) {
    throw "The package verifier is missing: $verifier"
  }
  if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) {
    throw "The first-run launcher is missing: $launcher"
  }
  & $verifier -RootPath $root
  Start-Process -FilePath $launcher -WorkingDirectory $root
  Write-Host "Open Nova first-run started from: $root" -ForegroundColor Green
}

# Normal extracted-folder path.
if (Test-Path -LiteralPath (Join-Path $here "scripts\one-click-first-real.ps1") -PathType Leaf) {
  Start-VerifiedOpenNova $here
  return
}

# Windows Explorer ZIP-view path. Locate the downloaded package automatically.
$homePath = $env:USERPROFILE
$roots = @(
  (Join-Path $homePath "Downloads"),
  (Join-Path $homePath "Desktop")
)
if ($env:OneDrive) {
  $roots += (Join-Path $env:OneDrive "Downloads")
  $roots += (Join-Path $env:OneDrive "Desktop")
}
$roots = @($roots | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -Unique)
$candidates = @()
foreach ($root in $roots) {
  $candidates += @(Get-ChildItem -LiteralPath $root -Filter "ResonanceAppDev_ZeroCredit_v1.5.5*.zip" -File -ErrorAction SilentlyContinue)
}
$candidates = @($candidates | Sort-Object LastWriteTime -Descending)
$zipPath = $null
if ($candidates.Count -gt 0) {
  $zipPath = $candidates[0].FullName
}
if (-not $zipPath) {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title = "Select ResonanceAppDev_ZeroCredit_v1.5.5.zip"
  $dialog.Filter = "ZIP archives (*.zip)|*.zip"
  $dialog.InitialDirectory = Join-Path $homePath "Downloads"
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    throw "No Open Nova package was selected."
  }
  $zipPath = $dialog.FileName
}

$stage = Join-Path $env:TEMP ("open-nova-v155-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $stage | Out-Null
try {
  Write-Host "Extracting the verified Open Nova package..."
  Expand-Archive -LiteralPath $zipPath -DestinationPath $stage -Force
  $source = Join-Path $stage $folder
  $releasePath = Join-Path $source "RELEASE.json"
  if (-not (Test-Path -LiteralPath $releasePath -PathType Leaf)) {
    throw "The selected ZIP is not the expected Open Nova v1.5.5 package."
  }
  $release = Get-Content -LiteralPath $releasePath -Raw | ConvertFrom-Json
  if ([string]$release.version -ne $releaseVersion) {
    throw "Unexpected release version: $($release.version)"
  }
  & (Join-Path $source "scripts\verify-build-manifest.ps1") -RootPath $source

  $parent = Join-Path $homePath "Resonance\OpenNova"
  $target = Join-Path $parent $folder
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  if (Test-Path -LiteralPath $target) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    Move-Item -LiteralPath $target -Destination ($target + ".previous-" + $stamp)
  }
  Move-Item -LiteralPath $source -Destination $target
  Start-VerifiedOpenNova $target
}
finally {
  if (Test-Path -LiteralPath $stage) {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
  }
}
