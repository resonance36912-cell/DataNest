[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repoRoot=Split-Path $PSScriptRoot -Parent
$sourceGuard=Join-Path $PSScriptRoot 'Invoke-RonsasSovereigntyGuard.ps1'
$sourceWatcher=Join-Path $PSScriptRoot 'Watch-RonsasBrowserProcesses.ps1'
$sourceDesktop=Join-Path $PSScriptRoot 'Start-RonsasDesktop.ps1'
foreach($required in @($sourceGuard,$sourceWatcher,$sourceDesktop)){if(-not(Test-Path -LiteralPath $required)){throw "Required launcher script is missing: $required"}}
$launcherRoot=Join-Path $env:LOCALAPPDATA 'Resonance\RONSAS\Launcher'
New-Item -ItemType Directory -Force -Path $launcherRoot|Out-Null
$guard=Join-Path $launcherRoot 'Invoke-RonsasSovereigntyGuard.ps1'
$watcher=Join-Path $launcherRoot 'Watch-RonsasBrowserProcesses.ps1'
$desktopControl=Join-Path $launcherRoot 'Start-RonsasDesktop.ps1'
Copy-Item -LiteralPath $sourceGuard -Destination $guard -Force
Copy-Item -LiteralPath $sourceWatcher -Destination $watcher -Force
Copy-Item -LiteralPath $sourceDesktop -Destination $desktopControl -Force

# Install a topology-preserving copy of the canonical machine controls so the
# desktop shortcut does not depend on a stale Git checkout or a partial live
# integrations directory. The repository remains the source authority.
$sourceCluster=Join-Path $repoRoot 'ops\ealiophin\cluster'
$sourceRuntime=Join-Path $repoRoot 'ops\ealiophin\runtime'
$installedOpsRoot=Join-Path $launcherRoot 'Control\ops\ealiophin'
$installedCluster=Join-Path $installedOpsRoot 'cluster'
$installedRuntime=Join-Path $installedOpsRoot 'runtime'
New-Item -ItemType Directory -Force -Path $installedCluster,$installedRuntime|Out-Null

foreach($name in @('START-RONSAS-ECOSYSTEM.ps1','STATUS-RONSAS-ECOSYSTEM.ps1','STOP-RONSAS-ECOSYSTEM.ps1','RONSAS-MODULES.json')){
  $source=Join-Path $sourceCluster $name
  if(-not(Test-Path -LiteralPath $source -PathType Leaf)){throw "Required RONSAS control file is missing: $source"}
  Copy-Item -LiteralPath $source -Destination (Join-Path $installedCluster $name) -Force
}
foreach($name in @('syncvision-local-stt.py','rons-local-llm-service.py','epublisher-premium-image-service.py')){
  $source=Join-Path $sourceRuntime $name
  if(-not(Test-Path -LiteralPath $source -PathType Leaf)){throw "Required RONSAS runtime source is missing: $source"}
  Copy-Item -LiteralPath $source -Destination (Join-Path $installedRuntime $name) -Force
}

$desktop=[Environment]::GetFolderPath('Desktop')
$startup=[Environment]::GetFolderPath('Startup')
$powershell=Join-Path $PSHOME 'powershell.exe'
$shell=New-Object -ComObject WScript.Shell
function New-RonsasShortcut{param([string]$Path,[string]$Arguments,[string]$Description,[string]$IconLocation,[int]$WindowStyle=1);$sc=$shell.CreateShortcut($Path);$sc.TargetPath=$powershell;$sc.Arguments=$Arguments;$sc.WorkingDirectory=$repoRoot;$sc.Description=$Description;$sc.IconLocation=$IconLocation;$sc.WindowStyle=$WindowStyle;$sc.Save()}
function Safe-ShortcutName{param([string]$Name);return ($Name -replace '[<>:"/\\|?*]','_').Trim()}
$quotedGuard='"{0}"' -f $guard
$quotedWatcher='"{0}"' -f $watcher
$quotedDesktopControl='"{0}"' -f $desktopControl
$quotedRepo='"{0}"' -f $repoRoot
$common="-NoProfile -ExecutionPolicy Bypass -File $quotedGuard -RepoRoot $quotedRepo"
foreach($stale in @('RONSAS Web - Chrome.lnk','RONSAS Web - Firefox.lnk')){$p=Join-Path $desktop $stale;if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force}}
New-RonsasShortcut -Path (Join-Path $desktop 'RONS - ALL.lnk') -Arguments "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File $quotedDesktopControl -Action Start" -Description 'Start the complete RONSAS suite through the canonical hidden control plane.' -IconLocation "$powershell,0" -WindowStyle 7
New-RonsasShortcut -Path (Join-Path $desktop 'RONSAS Sovereign Start.lnk') -Arguments "$common -Mode Workspace" -Description 'Validate sovereignty controls, safely sync main, then open RONSAS.' -IconLocation "$powershell,0"
New-RonsasShortcut -Path (Join-Path $startup 'RONSAS Sovereignty Guard.lnk') -Arguments "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File $quotedGuard -RepoRoot $quotedRepo -Mode Startup -Quiet" -Description 'Validate Resonance sovereignty controls at Windows sign-in.' -IconLocation "$powershell,0" -WindowStyle 7
New-RonsasShortcut -Path (Join-Path $startup 'RONSAS Browser Process Guard.lnk') -Arguments "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File $quotedWatcher -GuardPath $quotedGuard -RepoRoot $quotedRepo" -Description 'Re-run the Resonance sovereignty preflight when supported browsers start.' -IconLocation "$powershell,0" -WindowStyle 7
New-RonsasShortcut -Path (Join-Path $desktop 'RONSAS Web - Default.lnk') -Arguments "$common -Mode Web -Browser Default" -Description 'Run sovereignty preflight before governed web access.' -IconLocation "$powershell,0"
$browserPaths=@{Chrome=@('C:\Program Files\Google\Chrome\Application\chrome.exe','C:\Program Files (x86)\Google\Chrome\Application\chrome.exe');Firefox=@('C:\Program Files\Mozilla Firefox\firefox.exe','C:\Program Files (x86)\Mozilla Firefox\firefox.exe');Edge=@('C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe','C:\Program Files\Microsoft\Edge\Application\msedge.exe')}
$chromeExe=@($browserPaths.Chrome|Where-Object{Test-Path -LiteralPath $_}|Select-Object -First 1)
if($chromeExe.Count -eq 1){$root=Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data';$profiles=Get-ChildItem $root -Directory -ErrorAction SilentlyContinue|Where-Object{$_.Name -eq 'Default' -or $_.Name -like 'Profile *'};foreach($profile in $profiles){$name=Safe-ShortcutName $profile.Name;New-RonsasShortcut -Path (Join-Path $desktop ("RONSAS Web - Chrome - {0}.lnk" -f $name)) -Arguments "$common -Mode Web -Browser Chrome -BrowserProfile `"$($profile.Name)`"" -Description "Governed web access using Chrome profile $($profile.Name)." -IconLocation "$($chromeExe[0]),0"}}
$firefoxExe=@($browserPaths.Firefox|Where-Object{Test-Path -LiteralPath $_}|Select-Object -First 1)
if($firefoxExe.Count -eq 1){$root=Join-Path $env:APPDATA 'Mozilla\Firefox\Profiles';$profiles=Get-ChildItem $root -Directory -ErrorAction SilentlyContinue;foreach($profile in $profiles){$name=Safe-ShortcutName $profile.Name;New-RonsasShortcut -Path (Join-Path $desktop ("RONSAS Web - Firefox - {0}.lnk" -f $name)) -Arguments "$common -Mode Web -Browser Firefox -BrowserProfile `"$($profile.FullName)`"" -Description "Governed web access using Firefox profile $($profile.Name)." -IconLocation "$($firefoxExe[0]),0"}}
$edgeExe=@($browserPaths.Edge|Where-Object{Test-Path -LiteralPath $_}|Select-Object -First 1)
if($edgeExe.Count -eq 1){New-RonsasShortcut -Path (Join-Path $desktop 'RONSAS Web - Edge.lnk') -Arguments "$common -Mode Web -Browser Edge" -Description 'Governed web access using the existing Edge account context.' -IconLocation "$($edgeExe[0]),0"}
Write-Host "Installed RONSAS sovereign shortcuts on $env:COMPUTERNAME"
Write-Host "Operational guard: $guard"
Write-Host "Browser watcher: $watcher"
Write-Host "Desktop control: $desktopControl"
Write-Host "Installed control bundle: $installedCluster"
Write-Host "Desktop: $desktop"
Write-Host "Startup: $startup"
