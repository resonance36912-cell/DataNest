[CmdletBinding()]
param(
    [string]$RepoRoot = 'C:\Users\Ashley\Documents\GitHub\rons-sovereign-codebase',
    [string]$TaskName = 'RONSAS GitHub CI Monitor',
    [int]$EveryMinutes = 15
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($EveryMinutes -lt 5) { throw 'CI monitor cadence must be at least 5 minutes.' }
$monitor = Join-Path $RepoRoot 'scripts\Watch-RonsasGitHubCI.ps1'
if (-not (Test-Path -LiteralPath $monitor -PathType Leaf)) { throw "CI monitor script missing: $monitor" }

$account = (& gh api user --jq .login 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $account -ne 'resonance36912-cell') {
    throw "Wrong GitHub CLI account '$account'; expected resonance36912-cell."
}

$origin = (& git -C $RepoRoot remote get-url origin 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $origin.TrimEnd('/') -ne 'https://github.com/resonance36912-cell/RONSAS.git') {
    throw "Wrong RONSAS origin '$origin'."
}

$powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$arguments = ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -RepoRoot "{1}" -Repository "resonance36912-cell/RONSAS" -AutoRemediate' -f $monitor,$RepoRoot)

$action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'RONSAS GitHub CI current-head monitor with guarded auto-remediation.' -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Output "Installed '$TaskName' every $EveryMinutes minute(s) with guarded auto-remediation."
