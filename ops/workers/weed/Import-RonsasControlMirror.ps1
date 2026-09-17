[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$git='C:\Program Files\Git\cmd\git.exe'
$root=Join-Path $env:USERPROFILE 'Resonance\RONSAS'
$repo=Join-Path $root 'github\control-worker'
$stage=Join-Path $env:USERPROFILE 'Dropbox\RONS-Audit\RONS-AI-AUDIT-REPOSITORY\09-SUPPORT-PC-STAGING\RONSAS-CONTROL-MIRROR'
$bundle=Join-Path $stage 'control-main.bundle'
$metaPath=Join-Path $stage 'control-main.json'
if(!(Test-Path $bundle) -or !(Test-Path $metaPath)){throw 'control mirror unavailable'}
$meta=Get-Content $metaPath -Raw | ConvertFrom-Json
$hash=(Get-FileHash $bundle -Algorithm SHA256).Hash
if($meta.sha256 -and $hash -ne $meta.sha256){throw 'control mirror hash mismatch'}
$dirty=@(& $git -C $repo status --porcelain)
if($dirty.Count){throw 'control working tree dirty; refusing mirror import'}
$current=(& $git -C $repo rev-parse HEAD).Trim()
if($current -ne $meta.head){
  & $git -C $repo fetch $bundle main:refs/remotes/dropbox/main
  if($LASTEXITCODE){throw 'control bundle fetch failed'}
  & $git -C $repo merge --ff-only refs/remotes/dropbox/main | Out-Null
  if($LASTEXITCODE){throw 'control mirror fast-forward failed'}
}
$head=(& $git -C $repo rev-parse HEAD).Trim()
if($head -ne $meta.head){throw "control head mismatch after import: $head"}
$authorityPath=Join-Path $root 'node\authority.json'
$authority=Get-Content $authorityPath -Raw | ConvertFrom-Json
$authority.sourceAuthority.control.head=$head
$authority | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $authorityPath -Encoding UTF8
Write-Output "control-mirror-aligned $head"
