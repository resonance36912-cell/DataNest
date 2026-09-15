[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repoRoot=Split-Path $PSScriptRoot -Parent
$sourceGuard=Join-Path $PSScriptRoot 'Invoke-RonsasSovereigntyGuard.ps1'
if(-not(Test-Path -LiteralPath $sourceGuard)){throw 'Sovereignty guard script is missing.'}
$launcherRoot=Join-Path $env:LOCALAPPDATA 'Resonance\RONSAS\Launcher'
New-Item -ItemType Directory -Force -Path $launcherRoot|Out-Null
$guard=Join-Path $launcherRoot 'Invoke-RonsasSovereigntyGuard.ps1'
Copy-Item -LiteralPath $sourceGuard -Destination $guard -Force
$desktop=[Environment]::GetFolderPath('Desktop')
$startup=[Environment]::GetFolderPath('Startup')
$powershell=Join-Path $PSHOME 'powershell.exe'
$shell=New-Object -ComObject WScript.Shell
function New-RonsasShortcut{param([string]$Path,[string]$Arguments,[string]$Description,[string]$IconLocation,[int]$WindowStyle=1);$sc=$shell.CreateShortcut($Path);$sc.TargetPath=$powershell;$sc.Arguments=$Arguments;$sc.WorkingDirectory=$repoRoot;$sc.Description=$Description;$sc.IconLocation=$IconLocation;$sc.WindowStyle=$WindowStyle;$sc.Save()}
function Safe-ShortcutName{param([string]$Name);return ($Name -replace '[<>:"/\\|?*]','_').Trim()}
$quotedGuard='"{0}"' -f $guard
$quotedRepo='"{0}"' -f $repoRoot
$common="-NoProfile -ExecutionPolicy Bypass -File $quotedGuard -RepoRoot $quotedRepo"
foreach($stale in @('RONSAS Web - Chrome.lnk','RONSAS Web - Firefox.lnk')){$p=Join-Path $desktop $stale;if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Force}}
New-RonsasShortcut -Path (Join-Path $desktop 'RONSAS Sovereign Start.lnk') -Arguments "$common -Mode Workspace" -Description 'Validate sovereignty controls, safely sync main, then open RONSAS.' -IconLocation "$powershell,0"
New-RonsasShortcut -Path (Join-Path $startup 'RONSAS Sovereignty Guard.lnk') -Arguments "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File $quotedGuard -RepoRoot $quotedRepo -Mode Startup -Quiet" -Description 'Validate Resonance sovereignty controls at Windows sign-in.' -IconLocation "$powershell,0" -WindowStyle 7
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
Write-Host "Desktop: $desktop"
Write-Host "Startup: $startup"
