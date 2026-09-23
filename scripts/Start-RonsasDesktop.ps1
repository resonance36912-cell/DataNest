[CmdletBinding()]
param(
  [ValidateSet('Start','Status','Stop','Restart')]
  [string]$Action = 'Start',
  [string]$Root = (Join-Path $env:USERPROFILE 'Resonance\OpenNova')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$LiveClusterRoot = Join-Path $Root 'integrations\rons-cluster'
$SourceClusterRoot = Join-Path $env:USERPROFILE 'Documents\GitHub\rons-sovereign-codebase\ops\ealiophin\cluster'
$ControlCandidates = @($LiveClusterRoot, $SourceClusterRoot)

function Test-CompleteControlRoot {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) { return $false }
  foreach ($name in @(
    'START-RONSAS-ECOSYSTEM.ps1',
    'STATUS-RONSAS-ECOSYSTEM.ps1',
    'STOP-RONSAS-ECOSYSTEM.ps1',
    'RONSAS-MODULES.json'
  )) {
    if (-not (Test-Path -LiteralPath (Join-Path $Path $name) -PathType Leaf)) { return $false }
  }
  return $true
}

$ClusterRoot = @($ControlCandidates | Where-Object { Test-CompleteControlRoot $_ } | Select-Object -First 1)
if ($ClusterRoot.Count -ne 1) {
  throw ('No complete RONSAS control root is available. Checked: ' + ($ControlCandidates -join '; '))
}
$ClusterRoot = [string]$ClusterRoot[0]
$StartScript = Join-Path $ClusterRoot 'START-RONSAS-ECOSYSTEM.ps1'
$StatusScript = Join-Path $ClusterRoot 'STATUS-RONSAS-ECOSYSTEM.ps1'
$StopScript = Join-Path $ClusterRoot 'STOP-RONSAS-ECOSYSTEM.ps1'
$LogRoot = Join-Path $env:LOCALAPPDATA 'Resonance\RONSAS\logs\desktop-control'
$ReceiptPath = Join-Path $LogRoot 'last-operation.txt'
$PowerShellExe = Join-Path $PSHOME 'powershell.exe'

New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null

function Write-Receipt {
  param(
    [string]$Operation,
    [int]$ExitCode,
    [string]$Stdout,
    [string]$Stderr
  )
  @(
    'schema=ronsas-desktop-control/v1'
    ('operation=' + $Operation)
    ('completedAt=' + (Get-Date).ToUniversalTime().ToString('o'))
    ('exitCode=' + $ExitCode)
    ('stdout=' + $Stdout)
    ('stderr=' + $Stderr)
  ) | Set-Content -LiteralPath $ReceiptPath -Encoding UTF8
}

function Invoke-HiddenControl {
  param(
    [string]$Name,
    [string]$Script,
    [int]$TimeoutSeconds = 600
  )

  if (-not (Test-Path -LiteralPath $Script -PathType Leaf)) {
    throw "RONSAS control script missing: $Script"
  }

  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
  $stdout = Join-Path $LogRoot ($stamp + '-' + $Name + '.out.log')
  $stderr = Join-Path $LogRoot ($stamp + '-' + $Name + '.err.log')
  $arguments = @(
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-WindowStyle', 'Hidden',
    '-ExecutionPolicy', 'Bypass',
    '-File', ('"{0}"' -f $Script),
    '-Root', ('"{0}"' -f $Root)
  )

  $process = Start-Process -FilePath $PowerShellExe -ArgumentList $arguments `
    -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru

  if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
    Write-Receipt -Operation $Name -ExitCode 3 -Stdout $stdout -Stderr $stderr
    throw "RONSAS $Name exceeded the ${TimeoutSeconds}s desktop-control wait. The hidden child was left running; inspect $stdout and $stderr."
  }

  $process.Refresh()
  $code = [int]$process.ExitCode
  Write-Receipt -Operation $Name -ExitCode $code -Stdout $stdout -Stderr $stderr
  return $code
}

$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\RONSAS_Desktop_Control', [ref]$created)
if (-not $created) {
  exit 0
}

try {
  switch ($Action) {
    'Start' {
      $startCode = Invoke-HiddenControl -Name 'start' -Script $StartScript -TimeoutSeconds 600
      if ($startCode -ne 0) { exit $startCode }
      exit (Invoke-HiddenControl -Name 'status-after-start' -Script $StatusScript -TimeoutSeconds 90)
    }
    'Status' {
      exit (Invoke-HiddenControl -Name 'status' -Script $StatusScript -TimeoutSeconds 90)
    }
    'Stop' {
      exit (Invoke-HiddenControl -Name 'stop' -Script $StopScript -TimeoutSeconds 180)
    }
    'Restart' {
      $stopCode = Invoke-HiddenControl -Name 'restart-stop' -Script $StopScript -TimeoutSeconds 180
      if ($stopCode -ne 0) { exit $stopCode }
      $startCode = Invoke-HiddenControl -Name 'restart-start' -Script $StartScript -TimeoutSeconds 600
      if ($startCode -ne 0) { exit $startCode }
      exit (Invoke-HiddenControl -Name 'status-after-restart' -Script $StatusScript -TimeoutSeconds 90)
    }
  }
} finally {
  if ($mutex) {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
  }
}
