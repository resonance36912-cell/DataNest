[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$GuardPath,
    [Parameter(Mandatory=$true)][string]$RepoRoot,
    [int]$PollSeconds = 5,
    [int]$DebounceSeconds = 15
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$logDir=Join-Path $env:LOCALAPPDATA 'Resonance\RONSAS'
$logPath=Join-Path $logDir 'browser-process-guard.log'
New-Item -ItemType Directory -Force -Path $logDir|Out-Null
function Write-WatcherLog {
    param([string]$Message)
    Add-Content -LiteralPath $logPath -Value ('{0} [{1}] {2}' -f (Get-Date).ToString('o'),[Environment]::MachineName,$Message)
}
if(-not(Test-Path -LiteralPath $GuardPath)){throw 'Sovereignty guard script is missing.'}
if(-not(Test-Path -LiteralPath $RepoRoot)){throw 'RONSAS repository root is missing.'}
$created=$false
$mutex=New-Object System.Threading.Mutex($true,'Local\RONSASBrowserProcessGuard',[ref]$created)
if(-not $created){Write-WatcherLog 'Browser process watcher already running; exiting duplicate instance.';exit 0}
$browserNames=@('chrome','firefox','msedge')
$known=@{}
$lastGuard=[datetime]::MinValue
Write-WatcherLog 'Browser process watcher started.'
try {
    while($true){
        try {
            foreach($proc in @(Get-Process -Name $browserNames -ErrorAction SilentlyContinue)){
                if($known.ContainsKey($proc.Id)){continue}
                $known[$proc.Id]=$proc.ProcessName
                $now=Get-Date
                if(($now-$lastGuard).TotalSeconds -lt $DebounceSeconds){continue}
                $lastGuard=$now
                Write-WatcherLog ("Detected browser process {0} pid={1}; running sovereignty preflight." -f $proc.ProcessName,$proc.Id)
                $p=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$GuardPath,'-RepoRoot',$RepoRoot,'-Mode','Startup','-Quiet') -Wait -PassThru -WindowStyle Hidden
                if($p.ExitCode -eq 0){Write-WatcherLog 'Browser-triggered sovereignty preflight passed.'}
                else{Write-WatcherLog ("BLOCKED browser-triggered preflight exit={0}." -f $p.ExitCode)}
            }
            $live=@{}
            foreach($proc in @(Get-Process -Name $browserNames -ErrorAction SilentlyContinue)){$live[$proc.Id]=$true}
            foreach($id in @($known.Keys)){if(-not $live.ContainsKey($id)){$known.Remove($id)}}
        }
        catch {Write-WatcherLog ("Watcher error: "+$_.Exception.Message)}
        Start-Sleep -Seconds ([Math]::Max(2,$PollSeconds))
    }
}
finally {
    try{$mutex.ReleaseMutex()|Out-Null}catch{}
    $mutex.Dispose()
}
