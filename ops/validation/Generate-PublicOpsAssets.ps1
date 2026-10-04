param(
  [Parameter(Mandatory=$true)][string]$RepoRoot,
  [ValidateSet('development','rnd','test','staging','production','recovery')][string]$Environment='production',
  [string]$HubPublicOrigin='https://reson8.life',
  [string]$DataNestPublicOrigin='PENDING_NEW_PROVIDER',
  [string]$Release='PENDING_CANONICAL_RECONCILIATION',
  [string]$SourceCommit='PENDING_CANONICAL_RECONCILIATION',
  [string]$Status='migration-reconciliation'
)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath($RepoRoot)
$index=Get-Content (Join-Path $root 'ops\index\TRACEABILITY-INDEX.json') -Raw | ConvertFrom-Json
function WriteJson([string]$Path,[object]$Value){
  $parent=Split-Path -Parent $Path; New-Item -ItemType Directory -Force -Path $parent|Out-Null
  $json=$Value|ConvertTo-Json -Depth 20
  [IO.File]::WriteAllText($Path,$json+[Environment]::NewLine,(New-Object Text.UTF8Encoding($false)))
}
$hubDir=Join-Path $root 'apps\hub\public\ops'
$dnDir=Join-Path $root 'apps\datanest\public\ops'
$hubTrace=[ordered]@{schema='resonance-public-traceability/v1';canonical_id='RSN-APP-HUB';canonical_name='Resonance Hub';environment=$Environment;release=$Release;source_commit=$SourceCommit;governance_authority='RSN-PLT-DATANEST';system_runtime='RSN-SYS-RONSAS';classification='public-operational-metadata'}
$dnTrace=[ordered]@{schema='resonance-public-traceability/v1';canonical_id='RSN-PLT-DATANEST';canonical_name='Resonance DataNest';environment=$Environment;release=$Release;source_commit=$SourceCommit;runtime_front_door='RSN-APP-HUB';system_runtime='RSN-SYS-RONSAS';classification='public-operational-metadata'}
WriteJson (Join-Path $hubDir 'traceability.json') $hubTrace
WriteJson (Join-Path $dnDir 'traceability.json') $dnTrace
WriteJson (Join-Path $hubDir 'environment.json') ([ordered]@{schema='resonance-public-environment/v1';canonical_id='RSN-APP-HUB';environment=$Environment;deployment_state=$Status;public_origin=$HubPublicOrigin;internal_topology_exposed=$false})
WriteJson (Join-Path $dnDir 'environment.json') ([ordered]@{schema='resonance-public-environment/v1';canonical_id='RSN-PLT-DATANEST';environment=$Environment;deployment_state=$Status;public_origin=$DataNestPublicOrigin;internal_topology_exposed=$false})
WriteJson (Join-Path $hubDir 'health.json') ([ordered]@{schema='resonance-public-health/v1';canonical_id='RSN-APP-HUB';status=$Status;ready=($Status -eq 'ready');checked_at=$null;detail_policy='public-summary-only'})
WriteJson (Join-Path $dnDir 'health.json') ([ordered]@{schema='resonance-public-health/v1';canonical_id='RSN-PLT-DATANEST';status=$Status;ready=($Status -eq 'ready');checked_at=$null;detail_policy='public-summary-only'})
$catalog=[ordered]@{schema='resonance-public-catalog/v1';canonical_id='RSN-APP-HUB';applications=@(
 [ordered]@{canonical_id='RSN-APP-HUB';name='Resonance Hub';public_url=$HubPublicOrigin;status=$Status},
 [ordered]@{canonical_id='RSN-APP-EPUBLISHER';name='ePublisher';public_url='https://epublisher.reson8.life';status='revalidation-required'},
 [ordered]@{canonical_id='RSN-APP-CREATIVE-STUDIO';name='Creative Studio';public_url='https://creative.reson8.life';status='revalidation-required'},
 [ordered]@{canonical_id='RSN-APP-SYNC-VISION';name='Sync Vision';public_url='https://sync.reson8.life';status='revalidation-required'},
 [ordered]@{canonical_id='RSN-APP-YOUTUBE-OPTIMIZER';name='YouTube Optimizer';public_url='https://youtube.reson8.life';status='revalidation-required'}
);publication_policy='public-urls-and-public-state-only'}
WriteJson (Join-Path $hubDir 'catalog.json') $catalog
WriteJson (Join-Path $dnDir 'catalog.json') ([ordered]@{schema='resonance-public-catalog/v1';canonical_id='RSN-PLT-DATANEST';capabilities=@('project-governance','stakeholder-management','datanest-ai','think-tanks','product-lab','unifi-planning','transcheduler','runs','checkpoints','audit','transparency');publication_policy='capability-names-only-no-private-project-state'})
Write-Host 'Public operational assets generated from allowlisted fields only.' -ForegroundColor Green
