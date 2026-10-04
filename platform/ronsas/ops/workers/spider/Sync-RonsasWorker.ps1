[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:USERPROFILE 'Resonance\RONSAS'
$git = 'C:\Program Files\Git\cmd\git.exe'
$repos = @(
  @{ Name='control'; Branch='main' },
  @{ Name='resonance-hub'; Branch='ronsas/ealiophin-production' }
)
$result = [ordered]@{
  schema='ronsas-worker-sync/v1'; node='Spider'; generatedAt=(Get-Date).ToString('o')
  status='ok'; repositories=@(); dropbox=$false; ealiophinSnapshot=$false; topology=$null
}
try {
  foreach ($repo in $repos) {
    $dir = Join-Path $root ('github\' + $repo.Name)
    if (-not (Test-Path (Join-Path $dir '.git'))) { throw "Missing repository: $dir" }
    $dirty = @(& $git -C $dir status --porcelain)
    if ($dirty.Count) { throw "$($repo.Name) is dirty; refusing sync" }
    & $git -C $dir fetch --prune origin $repo.Branch | Out-Null
    if ($LASTEXITCODE) { throw "$($repo.Name) fetch failed" }
    & $git -C $dir merge --ff-only ('origin/' + $repo.Branch) | Out-Null
    if ($LASTEXITCODE) { throw "$($repo.Name) fast-forward failed" }
    $head = (& $git -C $dir rev-parse HEAD).Trim()
    $result.repositories += [ordered]@{ name=$repo.Name; branch=$repo.Branch; head=$head }
  }
  $publisher = Join-Path $root 'node\Publish-RonsasControlMirror.ps1'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $publisher | Out-Null
  $result.dropbox = Test-Path (Join-Path $root 'audit')
  $result.ealiophinSnapshot = Test-Path (Join-Path $root 'ealiophin-authority\latest-observed')
  if (-not $result.dropbox) { throw 'Dropbox audit authority is unavailable' }
  if (-not $result.ealiophinSnapshot) { throw 'Ealiophin observed snapshot is unavailable' }
  $validator = Join-Path $root 'github\control\scripts\Test-RonsasTopology.ps1'
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
