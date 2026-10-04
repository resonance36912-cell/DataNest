param(
  [switch]$AllowNetworkProvisioning,
  [switch]$OpenBrowser
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$requiredPython = "3.13"
$venvDir = Join-Path $root ".resonance-venv"
$venvPython = Join-Path $venvDir "Scripts\python.exe"
$wheelhouse = Join-Path $root "runtime\supply-chain\wheelhouse"
$stagingWheelhouse = Join-Path $root "runtime\supply-chain\wheelhouse-download-staging"
$completionMarker = Join-Path $wheelhouse "COMPLETE.json"
$requirements = Join-Path $root "foundry_controller\requirements.txt"

Write-Host "Resonance Open Nova v1.5.8 - Automatic Runtime Resume"
Write-Host "Supported runtime: CPython $requiredPython (64-bit recommended)."
Write-Host "Source package builds are denied; only prebuilt wheels are admitted."
Write-Host "This script never purchases AI credits and never downloads an AI model."
Write-Host "Network provisioning occurs only during the explicit FIRST-RUN workflow."
Write-Host "Do not disable Smart App Control or Microsoft Defender for this setup."

function Test-Python313Executable {
  param([string]$Executable, [string[]]$PrefixArgs)
  if (-not $Executable) { return $false }
  try {
    $output = & $Executable @PrefixArgs -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}|{sys.executable}')" 2>$null
    if ($LASTEXITCODE -ne 0) { return $false }
    $line = (($output | Select-Object -Last 1) -as [string])
    if (-not $line) { return $false }
    $parts = $line.Trim().Split('|', 2)
    if ($parts[0] -ne "3.13") { return $false }
    if ($parts.Count -gt 1 -and $parts[1] -match "\\Microsoft\\WindowsApps\\python(3)?\.exe$") {
      return $false
    }
    return $true
  } catch {
    return $false
  }
}

function Resolve-Python313 {
  $candidates = New-Object System.Collections.Generic.List[string]
  if ($env:LOCALAPPDATA) {
    $candidates.Add((Join-Path $env:LOCALAPPDATA "Programs\Python\Python313\python.exe"))
    $candidates.Add((Join-Path $env:LOCALAPPDATA "Programs\Python\Python313-64\python.exe"))
    $candidates.Add((Join-Path $env:LOCALAPPDATA "Python\pythoncore-3.13-64\python.exe"))
  }
  if ($env:ProgramFiles) {
    $candidates.Add((Join-Path $env:ProgramFiles "Python313\python.exe"))
    $candidates.Add((Join-Path $env:ProgramFiles "Python313-64\python.exe"))
  }
  if (${env:ProgramFiles(x86)}) {
    $candidates.Add((Join-Path ${env:ProgramFiles(x86)} "Python313-32\python.exe"))
  }
  foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if ((Test-Path -LiteralPath $candidate -PathType Leaf) -and (Test-Python313Executable -Executable $candidate -PrefixArgs @())) {
      return [pscustomobject]@{ Command = $candidate; Prefix = @(); Display = $candidate }
    }
  }
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py -and (Test-Python313Executable -Executable $py.Source -PrefixArgs @("-3.13"))) {
    return [pscustomobject]@{ Command = $py.Source; Prefix = @("-3.13"); Display = ($py.Source + " -3.13") }
  }
  $named = @("python3.13", "python")
  foreach ($name in $named) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd -and (Test-Python313Executable -Executable $cmd.Source -PrefixArgs @())) {
      return [pscustomobject]@{ Command = $cmd.Source; Prefix = @(); Display = $cmd.Source }
    }
  }
  return $null
}

function Install-WithWinget {
  param([string]$PackageId, [string]$Label)
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) { return $false }
  Write-Host "Installing $Label through Windows Package Manager..." -ForegroundColor Cyan
  & $winget.Source install --id $PackageId --exact --source winget --scope user --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Windows Package Manager could not install $Label automatically." -ForegroundColor Yellow
    return $false
  }
  Start-Sleep -Seconds 2
  return $true
}

$python = Resolve-Python313
if (-not $python -and $AllowNetworkProvisioning) {
  [void](Install-WithWinget -PackageId "Python.Python.3.13" -Label "CPython 3.13")
  $python = Resolve-Python313
}
if (-not $python) {
  if ($AllowNetworkProvisioning) {
    Write-Host "Opening the official Python 3.13.15 download page." -ForegroundColor Yellow
    Start-Process "https://www.python.org/downloads/release/python-31315/"
  }
  throw "CPython 3.13 is not available. Install the official 64-bit Python 3.13 release, then run OPEN-NOVA-FIRST-RUN.cmd again. The WindowsApps alias is intentionally rejected."
}
Write-Host "Using Python runtime: $($python.Display)" -ForegroundColor Green
$pythonCommand = $python.Command
$pythonPrefix = @($python.Prefix)

$gitCommand = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCommand -and $AllowNetworkProvisioning) {
  [void](Install-WithWinget -PackageId "Git.Git" -Label "Git for Windows")
  $gitCandidates = @()
  if ($env:ProgramFiles) { $gitCandidates += (Join-Path $env:ProgramFiles "Git\cmd\git.exe") }
  if ($env:LOCALAPPDATA) { $gitCandidates += (Join-Path $env:LOCALAPPDATA "Programs\Git\cmd\git.exe") }
  foreach ($candidate in $gitCandidates) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      $env:PATH = (Split-Path -Parent $candidate) + ";" + $env:PATH
      break
    }
  }
  $gitCommand = Get-Command git -ErrorAction SilentlyContinue
}
if (-not $gitCommand) {
  throw "Git is required for governed repository admission. Install Git for Windows, then run OPEN-NOVA-FIRST-RUN.cmd again."
}

if (Test-Path -LiteralPath $venvPython -PathType Leaf) {
  try {
    $venvVersion = (& $venvPython -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null | Select-Object -Last 1).Trim()
  } catch {
    $venvVersion = "invalid"
  }
  if ($venvVersion -ne $requiredPython) {
    Write-Host "Replacing incompatible local environment ($venvVersion) with Python $requiredPython..."
    Remove-Item -Recurse -Force $venvDir
  }
}

if (-not (Test-Path -LiteralPath $venvPython -PathType Leaf)) {
  Write-Host "Creating governed Python $requiredPython environment..."
  & $pythonCommand @pythonPrefix -m venv $venvDir
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $venvPython -PathType Leaf)) {
    throw "Unable to create the local Python $requiredPython environment."
  }
}

$venvVersion = (& $venvPython -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" | Select-Object -Last 1).Trim()
if ($venvVersion -ne $requiredPython) {
  throw "Governed environment version mismatch: expected $requiredPython, received $venvVersion."
}

$wheelhouseReady = Test-Path -LiteralPath $completionMarker -PathType Leaf
if (-not $wheelhouseReady) {
  if (-not $AllowNetworkProvisioning) {
    throw "The governed binary wheelhouse is incomplete. Run OPEN-NOVA-FIRST-RUN.cmd for explicit one-time package provisioning."
  }
  Write-Host "Downloading only pinned, prebuilt Python wheels into a staging directory..." -ForegroundColor Cyan
  if (Test-Path $stagingWheelhouse) { Remove-Item -Recurse -Force $stagingWheelhouse }
  New-Item -ItemType Directory -Force -Path $stagingWheelhouse | Out-Null
  & $venvPython -m pip download --only-binary=:all: --requirement $requirements --dest $stagingWheelhouse
  if ($LASTEXITCODE -ne 0) {
    Remove-Item -Recurse -Force $stagingWheelhouse -ErrorAction SilentlyContinue
    throw "Pinned binary-wheel download failed. No source build and no source fallback were permitted."
  }
  $downloaded = @(Get-ChildItem -Path $stagingWheelhouse -File -Filter "*.whl")
  $nonWheels = @(Get-ChildItem -Path $stagingWheelhouse -File | Where-Object { $_.Extension -ne ".whl" })
  if ($downloaded.Count -eq 0 -or $nonWheels.Count -gt 0) {
    Remove-Item -Recurse -Force $stagingWheelhouse -ErrorAction SilentlyContinue
    throw "Wheelhouse admission failed: expected only prebuilt .whl files."
  }
  $marker = [ordered]@{
    schema = "resonance-wheelhouse-completion/v1"
    python = $requiredPython
    binary_only = $true
    package_count = $downloaded.Count
    completed_at = (Get-Date).ToUniversalTime().ToString("o")
  }
  $marker | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $stagingWheelhouse "COMPLETE.json")
  if (Test-Path $wheelhouse) { Remove-Item -Recurse -Force $wheelhouse }
  Move-Item -Path $stagingWheelhouse -Destination $wheelhouse
}

Write-Host "Installing from the local wheelhouse with network access disabled..."
& $venvPython -m pip install --no-index --only-binary=:all: --find-links $wheelhouse -r $requirements
if ($LASTEXITCODE -ne 0) { throw "Offline installation from the governed binary wheelhouse failed." }
& $venvPython -c "import fastapi, uvicorn, httpx, pydantic, yaml, pytest; print('Open Nova Python runtime verified')"
if ($LASTEXITCODE -ne 0) { throw "Installed runtime verification failed." }

$hashFile = Join-Path $root "runtime\supply-chain\wheelhouse-sha256.json"
$items = @()
Get-ChildItem -Path $wheelhouse -File | Sort-Object Name | ForEach-Object {
  $h = Get-FileHash -Algorithm SHA256 -Path $_.FullName
  $items += [ordered]@{ file = $_.Name; sha256 = $h.Hash.ToLowerInvariant(); bytes = $_.Length }
}
$record = [ordered]@{
  schema = "resonance-wheelhouse/v1"
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  python = $requiredPython
  binary_only = $true
  network_provisioning_explicit = [bool]$AllowNetworkProvisioning
  package_count = $items.Count
  packages = $items
}
$record | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $hashFile

Write-Host "Provisioning complete. Future runs use the local Python 3.13 environment and governed wheelhouse." -ForegroundColor Green
Write-Host "Wheelhouse integrity record: $hashFile"
if ($OpenBrowser) {
  & (Join-Path $PSScriptRoot "run-and-package-first-real.ps1") -OpenBrowser
}
