@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Resonance Open Nova v1.5.8 - Start Here
set "OPEN_NOVA_SELF=%~f0"
echo Resonance Open Nova v1.5.8 - automatic Windows bootstrap
echo External AI denied - production cutover disabled.
echo External AI is denied and production cutover is disabled.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$r=Get-Content -LiteralPath $env:OPEN_NOVA_SELF -Raw; $p=($r -split '(?m)^:OPEN_NOVA_POWERSHELL\r?$',2)[1]; if(-not $p){throw 'Embedded launcher section is missing.'}; Invoke-Expression $p"
if errorlevel 1 (
  echo.
  echo Open Nova stopped safely. Read the error above.
  echo No production cutover was performed.
  pause
  exit /b 1
)
echo.
echo Open Nova bootstrap finished.
pause
exit /b 0
:OPEN_NOVA_POWERSHELL
$ErrorActionPreference = "Stop"
$folder = "ResonanceAppDev_ZeroCredit_v1.5.8"
$releaseVersion = "1.5.8"
$self = $env:OPEN_NOVA_SELF
$here = Split-Path -Parent $self
$logBase = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { $env:TEMP }
$logRoot = Join-Path $logBase "Resonance\OpenNova\logs"
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$logPath = Join-Path $logRoot ("bootstrap-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")
$transcriptStarted = $false
try {
  Start-Transcript -Path $logPath -Force | Out-Null
  $transcriptStarted = $true
} catch {
  Write-Host "Warning: diagnostic transcript could not be started."
}

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
  Write-Host "Starting the governed first-run workflow..." -ForegroundColor Cyan
  & $env:ComSpec /d /c ('call "' + $launcher + '"')
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "Open Nova first run stopped with exit code $exitCode."
  }
  Write-Host "Open Nova first run completed from: $root" -ForegroundColor Green
}

function Select-OpenNovaZip {
  param([string[]]$Candidates)
  $valid = @($Candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -Unique)
  if ($valid.Count -eq 1) {
    return $valid[0]
  }
  if ($valid.Count -gt 1) {
    Write-Host "Several v1.5.8 packages were found. Select the intended ZIP." -ForegroundColor Yellow
  }
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title = "Select ResonanceAppDev_ZeroCredit_v1.5.8.zip"
  $dialog.Filter = "ZIP archives (*.zip)|*.zip"
  $downloads = Join-Path $env:USERPROFILE "Downloads"
  if (Test-Path -LiteralPath $downloads) {
    $dialog.InitialDirectory = $downloads
  }
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    throw "No Open Nova package was selected."
  }
  return $dialog.FileName
}

try {
  Write-Host "Diagnostic log: $logPath"

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
  $candidateObjects = @()
  foreach ($root in $roots) {
    $candidateObjects += @(Get-ChildItem -LiteralPath $root -Filter "ResonanceAppDev_ZeroCredit_v1.5.8*.zip" -File -ErrorAction SilentlyContinue)
  }
  $candidatePaths = @($candidateObjects | Sort-Object LastWriteTime -Descending | ForEach-Object { $_.FullName })
  $zipPath = Select-OpenNovaZip -Candidates $candidatePaths

  $stage = Join-Path $env:TEMP ("open-nova-v158-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $stage | Out-Null
  try {
    Write-Host "Extracting the Open Nova package into a temporary staging area..." -ForegroundColor Cyan
    Expand-Archive -LiteralPath $zipPath -DestinationPath $stage -Force
    $source = Join-Path $stage $folder
    $releasePath = Join-Path $source "RELEASE.json"
    if (-not (Test-Path -LiteralPath $releasePath -PathType Leaf)) {
      throw "The selected ZIP is not the expected Open Nova v1.5.8 package."
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
      $previous = $target + ".previous-" + $stamp
      Move-Item -LiteralPath $target -Destination $previous
      Write-Host "Previous installation preserved at: $previous" -ForegroundColor Yellow
    }
    Move-Item -LiteralPath $source -Destination $target
    & (Join-Path $target "scripts\verify-build-manifest.ps1") -RootPath $target
    Start-VerifiedOpenNova $target
  }
  finally {
    if (Test-Path -LiteralPath $stage) {
      Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}
catch {
  Write-Host "" 
  Write-Host "OPEN NOVA STOPPED SAFELY" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "Diagnostic log: $logPath" -ForegroundColor Yellow
  Write-Host "External AI and production cutover remain disabled."
  throw
}
finally {
  if ($transcriptStarted) {
    try { Stop-Transcript | Out-Null } catch { }
  }
}
