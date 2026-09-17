param([switch]$SkipValidation)
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalCheck = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error 'Administrator elevation is required to register the startup task.'
  exit 5
}
$TaskName = 'RONS Public Runtime Bootstrap'
$Control = 'C:\Users\Ashley\AppData\Local\Resonance\RONS-ControlCenter'
$Bootstrap = Join-Path $Control 'RONS-Bootstrap-Public.ps1'
if (-not (Test-Path -LiteralPath $Bootstrap -PathType Leaf)) {
  throw "Bootstrap script missing: $Bootstrap"
}
$action = New-ScheduledTaskAction -Execute 'C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $Bootstrap + '"')
$trigger = New-ScheduledTaskTrigger -AtStartup
try { $trigger.Delay = 'PT20S' } catch {}
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Registered startup task: $TaskName"
if (-not $SkipValidation) {
  Start-ScheduledTask -TaskName $TaskName
  $deadline = (Get-Date).AddMinutes(3)
  do {
    Start-Sleep -Seconds 2
    $task = Get-ScheduledTask -TaskName $TaskName
  } while ($task.State -eq 'Running' -and (Get-Date) -lt $deadline)
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  if ($task.State -eq 'Running') {
    throw 'Startup task validation did not finish within the validation window.'
  }
  if ($info.LastTaskResult -ne 0) {
    throw "Startup task validation failed with result $($info.LastTaskResult)."
  }
  Write-Host 'Startup task validation passed.'
}
$t = Get-ScheduledTask -TaskName $TaskName
$i = Get-ScheduledTaskInfo -TaskName $TaskName
[pscustomobject]@{
  TaskName = $t.TaskName
  State = $t.State
  Principal = $t.Principal.UserId
  LastResult = $i.LastTaskResult
  StartWhenAvailable = $t.Settings.StartWhenAvailable
  RestartCount = $t.Settings.RestartCount
} | Format-List
