param([switch]$SkipValidation, [switch]$Elevated)
$ErrorActionPreference = 'Stop'
$Control = 'C:\Users\Ashley\AppData\Local\Resonance\RONS-ControlCenter'
$LogDir = Join-Path $Control 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir 'boot-task-install.log'
function Log([string]$Message) {
  Add-Content -LiteralPath $Log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $Message) -Encoding UTF8
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalCheck = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdmin = $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Log ('Requesting elevation from user=' + $identity.Name)
  $args = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$PSCommandPath,'-Elevated')
  if ($SkipValidation) { $args += '-SkipValidation' }
  try {
    $child = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $args -PassThru -Wait
    Log ('Elevated installer returned exit=' + $child.ExitCode)
    exit $child.ExitCode
  } catch {
    Log ('Elevation failed or was cancelled: ' + $_.Exception.Message)
    Write-Error $_
    exit 5
  }
}
Log ('Elevated installer started identity=' + $identity.Name)
$TaskName = 'RONS Public Runtime Bootstrap'
$Bootstrap = Join-Path $Control 'RONS-Bootstrap-Public.ps1'
try {
  if (-not (Test-Path -LiteralPath $Bootstrap -PathType Leaf)) { throw "Bootstrap script missing: $Bootstrap" }
  Log 'Creating Scheduled Task objects.'
  $action = New-ScheduledTaskAction -Execute 'C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $Bootstrap + '"')
  $trigger = New-ScheduledTaskTrigger -AtStartup
  try { $trigger.Delay = 'PT20S' } catch {}
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Hours 1)
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  Log 'Registering SYSTEM startup task.'
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  Log ('Registered startup task: ' + $TaskName)
  if (-not $SkipValidation) {
    Log 'Starting installed task for validation.'
    Start-ScheduledTask -TaskName $TaskName
    $deadline = (Get-Date).AddMinutes(3)
    do { Start-Sleep -Seconds 2; $task = Get-ScheduledTask -TaskName $TaskName } while ($task.State -eq 'Running' -and (Get-Date) -lt $deadline)
    $info = Get-ScheduledTaskInfo -TaskName $TaskName
    if ($task.State -eq 'Running') { throw 'Startup task validation did not finish within the validation window.' }
    if ($info.LastTaskResult -ne 0) { throw "Startup task validation failed with result $($info.LastTaskResult)." }
    Log 'Startup task validation passed.'
  }
  $t = Get-ScheduledTask -TaskName $TaskName
  $i = Get-ScheduledTaskInfo -TaskName $TaskName
  [pscustomobject]@{ TaskName=$t.TaskName; State=$t.State; Principal=$t.Principal.UserId; LastResult=$i.LastTaskResult; StartWhenAvailable=$t.Settings.StartWhenAvailable; RestartCount=$t.Settings.RestartCount } | Format-List
  Log ('Installer completed successfully lastResult=' + $i.LastTaskResult)
  exit 0
} catch {
  Log ('Installer failed: ' + $_.Exception.Message)
  Write-Error $_
  exit 2
}