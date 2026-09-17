$ErrorActionPreference = 'Continue'
$UserHome = 'C:\Users\Ashley'
$Control = Join-Path $UserHome 'AppData\Local\Resonance\RONS-ControlCenter'
$LogDir = Join-Path $Control 'logs'
$Log = Join-Path $LogDir 'boot-public.log'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
function Log([string]$m) {
  Add-Content -LiteralPath $Log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $m)
}
$env:RONS_USER_HOME = $UserHome
$env:RONS_LOCALAPPDATA = Join-Path $UserHome 'AppData\Local'
$env:USERPROFILE = $UserHome
$env:LOCALAPPDATA = $env:RONS_LOCALAPPDATA
$machinePath = [Environment]::GetEnvironmentVariable('Path','Machine')
$runtimePath = @(
  'C:\Program Files\nodejs',
  'C:\Users\Ashley\AppData\Local\Programs\Python\Python310',
  'C:\Users\Ashley\AppData\Local\Programs\Python\Python310\Scripts',
  'C:\Users\Ashley\AppData\Local\Programs\Ollama'
) -join ';'
$env:Path = $runtimePath + ';' + $machinePath
Log ("Boot public bootstrap started as $env:USERNAME.")
try {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Control 'RONS-Recover-Suite.ps1') -Attempts 2 -StepTimeoutSeconds 75
  $recoveryExit = $LASTEXITCODE
  Log ("Governed recovery exit=$recoveryExit")
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Control 'RONS-Ensure-Public-Edge.ps1')
  Start-Sleep -Seconds 4
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Control 'RONS-Verify-Public-Endpoints.ps1')
  $edgeExit = $LASTEXITCODE
  Log ("Public edge verification exit=$edgeExit")
  if ($recoveryExit -eq 0 -and $edgeExit -eq 0) {
    Log 'Boot public bootstrap passed.'
    exit 0
  }
  Log 'Boot public bootstrap failed one or more gates.'
  exit 2
} catch {
  Log ('Boot public bootstrap exception: ' + $_.Exception.Message)
  exit 3
}
