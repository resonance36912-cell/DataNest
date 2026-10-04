[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$git='C:\Program Files\Git\cmd\git.exe'
$repo=Join-Path $env:USERPROFILE 'Resonance\RONSAS\github\control'
$stage=Join-Path $env:USERPROFILE 'Dropbox\RONS-Audit\RONS-AI-AUDIT-REPOSITORY\09-SUPPORT-PC-STAGING\RONSAS-CONTROL-MIRROR'
New-Item -ItemType Directory -Force -Path $stage | Out-Null
$bundle=Join-Path $stage 'control-main.bundle'
$metaPath=Join-Path $stage 'control-main.json'
$head=(& $git -C $repo rev-parse main).Trim()
if(Test-Path $metaPath){
  $old=Get-Content $metaPath -Raw | ConvertFrom-Json
  if($old.head -eq $head -and (Test-Path $bundle)){ Write-Output "mirror-current $head"; exit 0 }
}
$tmp=$bundle+'.tmp'
if(Test-Path $tmp){Remove-Item $tmp -Force}
& $git -C $repo bundle create $tmp main
if($LASTEXITCODE){throw 'control bundle create failed'}
Move-Item -Force $tmp $bundle
$hash=(Get-FileHash $bundle -Algorithm SHA256).Hash
$meta=[ordered]@{schema='ronsas-control-mirror/v1';source='GitHub resonance36912-cell/RONSAS';branch='main';head=$head;sha256=$hash;generatedAt=(Get-Date).ToString('o');producer='Spider';transport='Dropbox support staging'}
$meta|ConvertTo-Json|Set-Content -LiteralPath $metaPath -Encoding UTF8
$meta|ConvertTo-Json
