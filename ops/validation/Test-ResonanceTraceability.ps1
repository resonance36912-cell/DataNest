param(
  [Parameter(Mandatory=$true)][string]$RepoRoot
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($RepoRoot)
$fail = New-Object System.Collections.Generic.List[string]
$pass = New-Object System.Collections.Generic.List[string]
function Pass([string]$m){ $pass.Add($m); Write-Host "PASS: $m" -ForegroundColor Green }
function Fail([string]$m){ $fail.Add($m); Write-Host "FAIL: $m" -ForegroundColor Red }

$indexPath = Join-Path $root 'ops/index/TRACEABILITY-INDEX.json'
$idx = $null
if(Test-Path -LiteralPath $indexPath){
  try { $idx = Get-Content -LiteralPath $indexPath -Raw | ConvertFrom-Json; Pass 'traceability index parses as JSON' }
  catch { Fail "traceability index JSON invalid: $($_.Exception.Message)" }
} else { Fail 'ops/index/TRACEABILITY-INDEX.json missing' }

if($idx){
  $ids=@(); $ids += @($idx.platforms.canonicalId); $ids += @($idx.applications.canonicalId); $ids += @($idx.nodes.canonicalId); $ids += @($idx.services.canonicalId)
  $dupes=$ids | Group-Object | Where-Object Count -gt 1
  if($dupes){ Fail ('duplicate canonical IDs: '+(($dupes.Name)-join ', ')) } else { Pass 'canonical IDs are unique' }
}

$required=@('apps/datanest','apps/hub','apps/epublisher','apps/creative-studio','apps/sync-vision','apps/youtube-optimizer','platform/ronsas','platform/open-nova','governance/rcgf','services/sovereign-backend','ops','evidence','docs','tests')
foreach($rel in $required){ if(Test-Path -LiteralPath (Join-Path $root $rel)){ Pass "canonical path present: $rel" } else { Fail "canonical path missing: $rel" } }
if($idx){
  foreach($app in @($idx.applications)){
    $p=Join-Path $root ([string]$app.repoPath)
    if(Test-Path -LiteralPath $p){ Pass "indexed application path present: $($app.canonicalId)" } else { Fail "indexed application path missing: $($app.canonicalId) -> $($app.repoPath)" }
  }
}

$nestedGit=Get-ChildItem -LiteralPath $root -Directory -Recurse -Force -Filter '.git' -ErrorAction SilentlyContinue | Where-Object FullName -ne (Join-Path $root '.git')
if($nestedGit){ Fail ('nested .git directories found: '+(($nestedGit.FullName)-join '; ')) } else { Pass 'no nested .git directories' }

if(Test-Path (Join-Path $root '.git')){
  $tracked = & git -C $root ls-files
  $badTracked = $tracked | Where-Object { ($_ -match '(^|/)(node_modules|\.next|\.output|dist|coverage|\.cache)/|(^|/)\.env($|\.)|\.(pem|key|p12|pfx)$|(^|/)id_rsa($|\.)') -and ($_ -notmatch '(^|/)\.env(?:\.[^/]+)?\.example$') }
  if($badTracked){ Fail ('forbidden generated/secret-like tracked paths: '+($badTracked -join '; ')) } else { Pass 'no forbidden generated/secret-like tracked paths' }
  $savedEap=$ErrorActionPreference
  $ErrorActionPreference='Continue'
  $gitCheck = (& git -C $root diff --check 2>&1 | Out-String)
  $gitExit=$LASTEXITCODE
  $ErrorActionPreference=$savedEap
  if($gitExit -eq 0){ Pass 'git diff --check passes' } else { Fail ('git diff --check failed: '+$gitCheck.Trim()) }
}

$publicRoots=@((Join-Path $root 'apps/hub/public/ops'), (Join-Path $root 'apps/datanest/public/ops'))
$forbidden='BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|password\s*[:=]|secret\s*[:=]|token\s*[:=]|postgres(ql)?://|C:\\Users\\|C:\\Resonance\\|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+'
foreach($pr in $publicRoots){
  if(-not (Test-Path $pr)){ Fail "public operating plane missing: $pr"; continue }
  $hits=Get-ChildItem $pr -File -Recurse | Select-String -Pattern $forbidden -CaseSensitive:$false
  if($hits){ Fail ('unsafe public operational content: '+(($hits.Path+':'+$hits.LineNumber)-join '; ')) } else { Pass "public operating plane sanitized: $pr" }
  foreach($jf in Get-ChildItem $pr -File -Filter '*.json'){
    try { Get-Content $jf.FullName -Raw | ConvertFrom-Json | Out-Null; Pass "public JSON valid: $($jf.Name)" }
    catch { Fail "public JSON invalid: $($jf.FullName)" }
  }
}

if($idx){
  $catalogPath=Join-Path $root 'apps/hub/public/ops/catalog.json'
  try {
    $catalog=Get-Content -LiteralPath $catalogPath -Raw | ConvertFrom-Json
    $known=@($idx.platforms.canonicalId)+@($idx.applications.canonicalId)
    $unknown=@($catalog.applications.canonical_id) | Where-Object { $_ -and ($_ -notin $known) }
    if($unknown){ Fail ('public catalog canonical IDs missing from internal index: '+($unknown -join ', ')) } else { Pass 'public catalog IDs resolve to internal canonical index' }
  } catch { Fail "public catalog/index cross-check failed: $($_.Exception.Message)" }
}

$moduleRegistry=Join-Path $root 'platform/ronsas/ops/ealiophin/cluster/RONSAS-MODULES.json'
if((Test-Path $moduleRegistry) -and $idx){
  try {
    $mr=Get-Content $moduleRegistry -Raw|ConvertFrom-Json
    $legacy=@($mr.modules.id)+@($mr.services.id)
    $mapped=@($idx.services.legacyId)
    $unmapped=$legacy | Where-Object { $_ -and ($_ -notin $mapped) }
    if($unmapped){ Fail ('RONSAS registry IDs not mapped to canonical service IDs: '+($unmapped -join ', ')) } else { Pass 'RONSAS module/service registry mapped into canonical index' }
  } catch { Fail "RONSAS module registry invalid: $($_.Exception.Message)" }
}

Write-Host "`nSUMMARY: $($pass.Count) passed; $($fail.Count) failed."
if($fail.Count -gt 0){ exit 1 }
exit 0
