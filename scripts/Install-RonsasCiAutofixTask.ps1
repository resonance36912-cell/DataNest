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
$taskCommand = ('"{0}" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{1}" -RepoRoot "{2}" -Repository "resonance36912-cell/RONSAS" -AutoRemediate' -f $powerShell,$monitor,$RepoRoot)

& schtasks.exe /Create /TN $TaskName /TR $taskCommand /SC MINUTE /MO $EveryMinutes /F | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Failed to create scheduled task '$TaskName'." }

& schtasks.exe /Run /TN $TaskName | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Scheduled task '$TaskName' was created but could not be started." }

Write-Output "Installed '$TaskName' every $EveryMinutes minute(s) with guarded auto-remediation."
