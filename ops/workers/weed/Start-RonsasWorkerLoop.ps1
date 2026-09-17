[CmdletBinding()]
param([switch]$Once)
$ErrorActionPreference='Stop'
$root=Join-Path $env:USERPROFILE 'Resonance\RONSAS'
$sync=Join-Path $root 'node\Sync-RonsasWorker.ps1'
$log=Join-Path $root 'node\worker-loop.log'
$name='Local\RONSASWorkerSync-' + $env:COMPUTERNAME
$mutex=New-Object System.Threading.Mutex($false,$name)
if(-not $mutex.WaitOne(0)){exit 0}
try {
  do {
    $stamp=(Get-Date).ToString('o')
    Add-Content -LiteralPath $log -Value "$stamp sync-start"
    $prior=$ErrorActionPreference
    $ErrorActionPreference='Continue'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sync *>> $log
    $code=$LASTEXITCODE
    $ErrorActionPreference=$prior
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) sync-exit=$code"
    if($Once){break}
    Start-Sleep -Seconds 3600
  } while($true)
}
finally {
  $mutex.ReleaseMutex() | Out-Null
  $mutex.Dispose()
}
