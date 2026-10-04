[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:USERPROFILE 'Resonance\RONSAS'
$git = 'C:\Program Files\Git\cmd\git.exe'
$result = [ordered]@{
  schema='ronsas-worker-sync/v1'; node='Weed'; generatedAt=(Get-Date).ToString('o')
  status='ok'; gitTransport='isomorphic-git-policy-safe-fallback'; topology=$null
}
try {
  foreach($name in @('control-worker','resonance-hub')) {
    $repo=Join-Path $root ('github\' + $name)
    $dirty=@(& $git -C $repo status --porcelain)
    if($dirty.Count){throw "$name working tree dirty; refusing sync"}
  }
  $importer = Join-Path $root 'node\Import-RonsasControlMirror.ps1'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $importer | Out-Null
  if ($LASTEXITCODE) { throw 'Control mirror import failed' }
  $sync = Join-Path $root 'node-tools\sync-ronsas.cjs'
  $raw = & node.exe $sync
  if ($LASTEXITCODE) { throw 'Policy-safe Git sync failed' }
  $repoState = $raw | ConvertFrom-Json
  $result.hubHead = $repoState.hubHead
  $result.controlHead = $repoState.controlHead
  $result.controlMode = $repoState.controlMode
  $authorityPath=Join-Path $root 'node\authority.json'
  $authority=Get-Content $authorityPath -Raw | ConvertFrom-Json
  $authority.sourceAuthority.hub.head=$repoState.hubHead
  $authority | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $authorityPath -Encoding UTF8
  if (-not (Test-Path (Join-Path $root 'audit'))) { throw 'Dropbox audit authority is unavailable' }
  if (-not (Test-Path (Join-Path $root 'ealiophin-authority\latest-observed'))) { throw 'Ealiophin observed snapshot is unavailable' }
  $env:Path = 'C:\Program Files\Git\cmd;' + $env:Path
  $validator = Join-Path $root 'github\control-worker\scripts\Test-RonsasTopology.ps1'
  $topologyJson = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validator -Json
  $topology = $topologyJson | ConvertFrom-Json
  $result.topology = $topology.status
  if ($topology.status -ne 'mapped') { throw 'Worker topology is not mapped' }
}
catch {
  $result.status = 'attention'
  $result.error = $_.Exception.Message
}
$out = Join-Path $root 'node\last-sync.json'
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $out -Encoding UTF8
$result | ConvertTo-Json -Depth 6
if ($result.status -ne 'ok') { exit 2 }
