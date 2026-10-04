$ErrorActionPreference = 'Stop'
$taskName = 'RONS Autonomous Supervisor'
$control = 'C:\Users\Ashley\AppData\Local\Resonance\RONS-ControlCenter'
$supervisor = Join-Path $control 'RONS-Supervisor.ps1'
if (-not (Test-Path -LiteralPath $supervisor -PathType Leaf)) { throw "Supervisor missing: $supervisor" }
$userId = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $supervisor + '"')
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
$sttInstaller = Join-Path $control 'REGISTER-RONS-EPUBLISHER-STT-TASK.ps1'
if (Test-Path -LiteralPath $sttInstaller -PathType Leaf) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sttInstaller | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "ePublisher STT scheduled task registration failed with exit code $LASTEXITCODE" }
}
Start-Sleep -Seconds 3
$t = Get-ScheduledTask -TaskName $taskName
$i = Get-ScheduledTaskInfo -TaskName $taskName
[pscustomobject]@{
  TaskName = $t.TaskName
  State = $t.State
  UserId = $t.Principal.UserId
  LastResult = $i.LastTaskResult
  StartWhenAvailable = $t.Settings.StartWhenAvailable
  RestartCount = $t.Settings.RestartCount
} | Format-List
