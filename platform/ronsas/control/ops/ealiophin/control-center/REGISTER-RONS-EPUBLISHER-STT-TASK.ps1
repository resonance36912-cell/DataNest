$ErrorActionPreference = 'Stop'

$TaskName = 'RONS ePublisher STT'
$Control = Join-Path $env:LOCALAPPDATA 'Resonance\RONS-ControlCenter'
$Runner = Join-Path $Control 'RONS-ePublisher-STT.ps1'
if (-not (Test-Path -LiteralPath $Runner -PathType Leaf)) { throw "Task runner missing: $Runner" }

function Test-SttHealth {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:7869/health' -TimeoutSec 5
        return ([int]$response.StatusCode -eq 200)
    } catch {
        return $false
    }
}

$listener = Get-NetTCPConnection -LocalPort 7869 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    $listenerPid = [int]$listener.OwningProcess
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$listenerPid" -ErrorAction SilentlyContinue
    $commandLine = if ($process) { [string]$process.CommandLine } else { '' }
    if ($commandLine -and $commandLine -notmatch 'syncvision-local-stt\.py') {
        throw "Port 7869 is occupied by an unverified process."
    }
    Stop-Process -Id $listenerPid -Force -ErrorAction Stop
    $deadline = (Get-Date).AddSeconds(20)
    do {
        Start-Sleep -Milliseconds 500
        $remaining = Get-NetTCPConnection -LocalPort 7869 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    } while ($remaining -and (Get-Date) -lt $deadline)
    if ($remaining) { throw 'Verified ePublisher STT listener did not release port 7869.' }
}

$userId = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $Runner + '"')
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

$deadline = (Get-Date).AddSeconds(90)
do {
    if (Test-SttHealth) { break }
    Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)

if (-not (Test-SttHealth)) { throw 'Scheduled ePublisher STT task did not become healthy on port 7869.' }

$task = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName
[pscustomobject]@{
    TaskName = $task.TaskName
    State = $task.State
    UserId = $task.Principal.UserId
    LastResult = $info.LastTaskResult
    Healthy = $true
    Port = 7869
} | ConvertTo-Json -Compress
