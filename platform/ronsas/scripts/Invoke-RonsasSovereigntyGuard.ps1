[CmdletBinding()]
param(
    [ValidateSet('Startup','Workspace','Web')][string]$Mode='Workspace',
    [ValidateSet('Default','Chrome','Firefox','Edge')][string]$Browser='Default',
    [string]$BrowserProfile='',
    [string]$RepoRoot='',
    [switch]$Quiet
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repoRoot=if([string]::IsNullOrWhiteSpace($RepoRoot)){Split-Path $PSScriptRoot -Parent}else{[IO.Path]::GetFullPath($RepoRoot)}
$logDir=Join-Path $env:LOCALAPPDATA 'Resonance\RONSAS'
$logPath=Join-Path $logDir 'sovereignty-guard.log'
New-Item -ItemType Directory -Force -Path $logDir|Out-Null
function Write-GuardLog{param([string]$Message);$line='{0} [{1}] {2}' -f (Get-Date).ToString('o'),$env:COMPUTERNAME,$Message;Add-Content -LiteralPath $logPath -Value $line;if(-not $Quiet){Write-Host $Message}}
function Assert-Guard{param([bool]$Condition,[string]$Message);if(-not $Condition){throw $Message}}
function Get-GitExecutable{$cmd=Get-Command git -ErrorAction SilentlyContinue;if($cmd){return $cmd.Source};foreach($c in @('C:\Program Files\Git\cmd\git.exe','C:\Program Files\Git\bin\git.exe',(Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe'))){if(Test-Path -LiteralPath $c){return $c}};throw 'Git executable not found.'}
function Invoke-Git{param([string[]]$Arguments,[string]$Repository=$repoRoot);$p=$ErrorActionPreference;try{$ErrorActionPreference='Continue';$out=& $script:Git -C $Repository @Arguments 2>&1;$code=$LASTEXITCODE}finally{$ErrorActionPreference=$p};if($code -ne 0){throw "git $($Arguments -join ' ') failed: $($out -join ' ')"};return (($out|ForEach-Object{$_.ToString()}|Out-String).TrimEnd())}
function Normalize-Remote{param([string]$Remote);return $Remote.Trim().TrimEnd('/')}
$Git=Get-GitExecutable
$gitDir=Split-Path $Git -Parent
if($env:PATH -notlike "*$gitDir*"){$env:PATH="$gitDir;$env:PATH"}
try{
 Write-GuardLog "RONSAS sovereignty guard starting in $Mode mode."
 $authorityPath=Join-Path $repoRoot '.ronsas\github-authority.json'
 Assert-Guard (Test-Path -LiteralPath $authorityPath) 'GitHub authority manifest is missing.'
 $authority=Get-Content -Raw -LiteralPath $authorityPath|ConvertFrom-Json
 Assert-Guard ($authority.schema -eq 'ronsas-github-authority/v1') 'Unexpected authority schema.'
 Assert-Guard ($authority.canonical_owner -eq 'resonance36912-cell') 'Canonical GitHub owner mismatch.'
 Assert-Guard ($authority.control_repository -eq 'resonance36912-cell/RONSAS') 'Control repository mismatch.'
 Assert-Guard ($authority.promotion_policy -eq 'review-branch-pr-only') 'Promotion policy mismatch.'
 Assert-Guard ($authority.history_policy -eq 'preserve-independent-repository-history') 'History policy mismatch.'
 Assert-Guard (-not [bool]$authority.force_rewrite_allowed) 'Force rewrite must remain disabled.'
 $expectedRemote='https://github.com/resonance36912-cell/RONSAS.git'
 $actualRemote=(Invoke-Git -Arguments @('remote','get-url','origin')).Trim()
 Assert-Guard ((Normalize-Remote $actualRemote) -eq (Normalize-Remote $expectedRemote)) 'RONSAS origin is not canonical.'
 Invoke-Git -Arguments @('config','core.hooksPath','.githooks')|Out-Null
 $hooks=(Invoke-Git -Arguments @('config','--get','core.hooksPath')).Trim()
 Assert-Guard ($hooks -eq '.githooks') 'RONSAS Git guards are not enabled.'
 Invoke-Git -Arguments @('fetch','origin','--prune')|Out-Null
 $branch=(Invoke-Git -Arguments @('branch','--show-current')).Trim()
 if($branch -eq 'main'){
   $dirty=Invoke-Git -Arguments @('status','--porcelain')
   Assert-Guard ([string]::IsNullOrWhiteSpace($dirty)) 'Main is dirty; governed startup refuses to alter it.'
   $counts=(Invoke-Git -Arguments @('rev-list','--left-right','--count','origin/main...HEAD')).Trim()
   Assert-Guard ($counts -match '^(\d+)\s+(\d+)$') 'Unable to determine main divergence.'
   $behind=[int]$Matches[1];$ahead=[int]$Matches[2]
   Assert-Guard ($ahead -eq 0) 'Local main is ahead of origin/main; direct-main promotion is forbidden.'
   if($behind -gt 0){Invoke-Git -Arguments @('pull','--ff-only','origin','main')|Out-Null;Write-GuardLog "Fast-forwarded main by $behind commit(s)."}
 }else{Write-GuardLog "Review branch '$branch' detected; no automatic merge/rebase/reset performed."}
 $topologyPath=Join-Path $repoRoot '.ronsas\topology.local.json'
 if(-not(Test-Path -LiteralPath $topologyPath)){$topologyPath=Join-Path $repoRoot '.ronsas\topology.example.json'}
 Assert-Guard (Test-Path -LiteralPath $topologyPath) 'Topology manifest is missing.'
 $topology=Get-Content -Raw -LiteralPath $topologyPath|ConvertFrom-Json
 foreach($pathEntry in @($topology.paths)){
   if(-not [bool]$pathEntry.required){continue}
   $requiredPath=[Environment]::ExpandEnvironmentVariables($pathEntry.local_path)
   Assert-Guard (Test-Path -LiteralPath $requiredPath) "Required topology path missing: $($pathEntry.id)."
 }
 foreach($repoEntry in @($topology.repositories)){
   if(-not [bool]$repoEntry.required){continue}
   $repoPath=[Environment]::ExpandEnvironmentVariables($repoEntry.local_path)
   Assert-Guard (Test-Path -LiteralPath (Join-Path $repoPath '.git')) "Required repository missing: $($repoEntry.id)."
   if($repoEntry.configured_remote){$repoRemote=(Invoke-Git -Arguments @('remote','get-url','origin') -Repository $repoPath).Trim();Assert-Guard ((Normalize-Remote $repoRemote) -eq (Normalize-Remote $repoEntry.configured_remote)) "Remote mismatch for $($repoEntry.id)."}
 }
 $dropboxPath=[Environment]::ExpandEnvironmentVariables($topology.cloud.dropbox.local_root)
 Assert-Guard (Test-Path -LiteralPath $dropboxPath) 'Dropbox audit authority path is unavailable.'
 $dropboxItem=Get-Item -LiteralPath $dropboxPath -Force
 if($dropboxPath -notmatch '\\Dropbox\\'){
   if($dropboxItem.Attributes -band [IO.FileAttributes]::ReparsePoint){$targets=@($dropboxItem.Target);Assert-Guard (@($targets|Where-Object{$_ -match '\\Dropbox\\'}).Count -gt 0) 'Audit junction does not resolve into Dropbox.'}
   else{throw 'Audit authority is not rooted in Dropbox.'}
 }
 Write-GuardLog 'Authority, Git, hooks, topology, and Dropbox checks passed.'
 if($Mode -eq 'Workspace'){Start-Process explorer.exe -ArgumentList ('"{0}"' -f $repoRoot)}
 elseif($Mode -eq 'Web'){
   $urls=@('https://github.com/resonance36912-cell/RONSAS','https://www.dropbox.com/home/RONS-Audit/RONS-AI-AUDIT-REPOSITORY','https://reson8.life/governance')
   $browserPaths=@{Chrome=@('C:\Program Files\Google\Chrome\Application\chrome.exe','C:\Program Files (x86)\Google\Chrome\Application\chrome.exe');Firefox=@('C:\Program Files\Mozilla Firefox\firefox.exe','C:\Program Files (x86)\Mozilla Firefox\firefox.exe');Edge=@('C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe','C:\Program Files\Microsoft\Edge\Application\msedge.exe')}
   if($Browser -eq 'Default'){foreach($url in $urls){Start-Process $url}}
   else{$exe=@($browserPaths[$Browser]|Where-Object{Test-Path -LiteralPath $_}|Select-Object -First 1);Assert-Guard ($exe.Count -eq 1) "$Browser is not installed.";$args=@();if(-not[string]::IsNullOrWhiteSpace($BrowserProfile)){if($Browser -eq 'Chrome' -or $Browser -eq 'Edge'){$args+="--profile-directory=$BrowserProfile"}elseif($Browser -eq 'Firefox'){$args+=@('-profile',$BrowserProfile)}};$args+=$urls;Start-Process $exe[0] -ArgumentList $args}
 }
 Write-GuardLog 'RONSAS sovereignty guard completed successfully.'
 exit 0
}catch{Write-GuardLog ("BLOCKED: "+$_.Exception.Message);if(-not $Quiet){[Console]::Error.WriteLine($_.Exception.Message)};exit 3}
