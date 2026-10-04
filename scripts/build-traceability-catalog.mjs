import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const catalogDir = path.join(root, 'catalog');
const generatedAt = new Date().toISOString();
const writeJson = (name, value) => fs.writeFileSync(path.join(catalogDir, name), JSON.stringify(value, null, 2) + '\n');
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const urn = (kind, slug) => `urn:resonance:${kind}:${slug}`;

const platforms = [
  { canonical_id: urn('platform','resonance'), trace_id:'PLT-RES', display_name:'Resonance', kind:'ecosystem-orchestration', parent_id:null, lifecycle:'active' },
  { canonical_id: urn('platform','datanest'), trace_id:'PLT-DN', display_name:'DataNest', kind:'governance-knowledge-control', parent_id:urn('platform','resonance'), lifecycle:'migration-pending' },
  { canonical_id: urn('platform','ronsas'), trace_id:'PLT-RS', display_name:'RONSAS', kind:'sovereign-runtime-control', parent_id:urn('platform','resonance'), lifecycle:'active' },
  { canonical_id: urn('platform','open-nova'), trace_id:'PLT-ON', display_name:'Open Nova', kind:'provider-neutral-development', parent_id:urn('platform','resonance'), lifecycle:'active' },
];

const applications = [
  { canonical_id:urn('application','datanest'), trace_id:'APP-DN', display_name:'DataNest', platform_id:urn('platform','datanest'), source_path:'apps/datanest', lifecycle:'import-pending', source_authority:'Ealiophin local DataNest repository' },
  { canonical_id:urn('application','hub'), trace_id:'APP-HUB', display_name:'Resonance Hub', platform_id:urn('platform','resonance'), source_path:'apps/hub', lifecycle:'candidate', source_authority:'Hub runtime/commercial line' },
  { canonical_id:urn('application','epublisher'), trace_id:'APP-EPUB', display_name:'Resonance ePublisher', platform_id:urn('platform','ronsas'), lifecycle:'active', public_url:'https://epublisher.reson8.life' },
  { canonical_id:urn('application','creative-studio'), trace_id:'APP-CRTV', display_name:'Resonance Creative Studio', platform_id:urn('platform','ronsas'), lifecycle:'active', public_url:'https://creative.reson8.life' },
  { canonical_id:urn('application','sync-vision'), trace_id:'APP-SYNC', display_name:'Resonance Sync Vision', platform_id:urn('platform','ronsas'), lifecycle:'beta', public_url:'https://sync.reson8.life' },
  { canonical_id:urn('application','youtube-optimizer'), trace_id:'APP-YT', display_name:'YouTube Optimizer', platform_id:urn('platform','ronsas'), lifecycle:'pilot', public_url:'https://youtube.reson8.life' },
  { canonical_id:urn('application','myify'), trace_id:'APP-MYIFY', display_name:'MYIFY · DataNest', platform_id:urn('platform','datanest'), lifecycle:'pilot', public_url:'https://reson8.life/myify' },
];

const governance = [
  { canonical_id:urn('governance','rcgf'), trace_id:'GOV-RCGF', display_name:'Resonance Constitutional Governance Framework', source_path:'governance/rcgf', lifecycle:'history-import-pending' },
  { canonical_id:urn('governance','datanest'), trace_id:'GOV-DN', display_name:'DataNest Governance Control Plane', source_path:'apps/datanest', lifecycle:'source-import-pending' },
];

const environments = [
  ['development','ENV-DEV','Development','persistent'],
  ['research-and-development','ENV-RND','R&D','persistent'],
  ['test','ENV-TST','Controlled Test','persistent'],
  ['staging','ENV-STG','Staging / Certification','persistent'],
  ['production','ENV-PRD','Production','persistent'],
  ['disaster-recovery','ENV-DR','Disaster Recovery / Compatibility Recovery','persistent'],
  ['migration-staging','ENV-MIG','Migration Staging','temporary'],
].map(([slug,trace_id,display_name,lifecycle]) => ({ canonical_id:urn('environment',slug), trace_id, display_name, lifecycle }));

const nodes = [
  { canonical_id:urn('node','ealiophin'), trace_id:'NOD-EAL', display_name:'Ealiophin', roles:['primary-runtime-authority','production-control'], environment_ids:[urn('environment','production'),urn('environment','staging')], connector_state:'offline-at-2026-10-04-audit', authority:'production runtime', current_state:'requires-direct-reobservation' },
  { canonical_id:urn('node','weed'), trace_id:'NOD-WED', display_name:'Weed', roles:['support-worker','compatibility-recovery'], environment_ids:[urn('environment','disaster-recovery'),urn('environment','test'),urn('environment','migration-staging')], connector_state:'online', authority:'non-production', current_state:'services-observed-unreachable' },
  { canonical_id:urn('node','spider'), trace_id:'NOD-SPD', display_name:'Spider', roles:['review-worker','control-worker'], environment_ids:[urn('environment','test'),urn('environment','disaster-recovery')], connector_state:'not-observed-this-session', authority:'non-production', current_state:'historical-reference-only' },
];

const weedObservationPath = path.join(root,'evidence','audits','weed-service-observation.json');
const observations = fs.existsSync(weedObservationPath) ? JSON.parse(fs.readFileSync(weedObservationPath,'utf8').replace(/^\uFEFF/,'')) : [];
const observedById = Object.fromEntries(observations.map(x => [x.id,x]));
const svc = (slug, trace, display, kind, local, options={}) => ({
  canonical_id:urn('service',slug), trace_id:trace, display_name:display, kind,
  platform_id:options.platform_id ?? urn('platform','ronsas'), application_id:options.application_id ?? null,
  runtime_authority_node_id:options.runtime_authority_node_id ?? urn('node','ealiophin'),
  environment_ids:options.environment_ids ?? [urn('environment','production')],
  local_endpoint:local, public_url:options.public_url ?? null,
  visibility:options.visibility ?? 'internal', credential_policy: options.visibility === 'public' ? 'no-server-secrets-in-public-assets' : 'server-side-only',
  declared_by:options.declared_by ?? 'platform/ronsas/control/ops/ealiophin/cluster/RONSAS-MODULES.json',
  weed_observation: observedById[options.observation_id ?? slug] ?? null,
});

const services = [
  svc('datanest-web','SVC-DN-WEB','DataNest Web','web-application',null,{platform_id:urn('platform','datanest'),application_id:urn('application','datanest'),visibility:'public',public_url:null,declared_by:'apps/datanest/IMPORT-PENDING.md',observation_id:'datanest'}),
  svc('hub-web','SVC-HUB-WEB','Resonance Hub Web','web-application','http://127.0.0.1:4173/',{platform_id:urn('platform','resonance'),application_id:urn('application','hub'),visibility:'public',public_url:'https://reson8.life',observation_id:'hub'}),
  svc('epublisher-web','SVC-EPUB-WEB','ePublisher Web','application-service','http://127.0.0.1:3101/',{application_id:urn('application','epublisher'),visibility:'public',public_url:'https://epublisher.reson8.life',observation_id:'epublisher'}),
  svc('creative-studio-web','SVC-CRTV-WEB','Creative Studio Web','application-service','http://127.0.0.1:3201/studio',{application_id:urn('application','creative-studio'),visibility:'public',public_url:'https://creative.reson8.life',observation_id:'creative-studio'}),
  svc('sync-vision-web','SVC-SYNC-WEB','Sync Vision Web','application-service','http://127.0.0.1:3301/',{application_id:urn('application','sync-vision'),visibility:'public',public_url:'https://sync.reson8.life',observation_id:'sync-vision'}),
  svc('youtube-optimizer-web','SVC-YT-WEB','YouTube Optimizer Web','application-service','http://127.0.0.1:3401/',{application_id:urn('application','youtube-optimizer'),visibility:'public',public_url:'https://youtube.reson8.life',observation_id:'youtube-optimizer'}),
  svc('launch-broker','SVC-LAUNCH','Launch Broker','control-service','http://127.0.0.1:4450/health',{observation_id:'launch-broker'}),
  svc('musetalk-bridge','SVC-MUSE','MuseTalk Bridge','media-service','http://127.0.0.1:7863/health',{observation_id:'musetalk-bridge'}),
  svc('local-stt','SVC-STT','Local Speech-to-Text','ai-service','http://127.0.0.1:7864/health',{observation_id:'local-stt'}),
  svc('local-image','SVC-IMG','Local Image','ai-service','http://127.0.0.1:7865/health',{observation_id:'local-image'}),
  svc('local-llm','SVC-LLM','Local LLM','ai-service','http://127.0.0.1:7866/health',{observation_id:'local-llm'}),
  svc('creative-source','SVC-CSRC','Creative Source','content-service','http://127.0.0.1:7867/health',{observation_id:'creative-source'}),
  svc('ai-broker','SVC-AIB','AI Broker','ai-governance-service','http://127.0.0.1:7868/health',{observation_id:'ai-broker'}),
  svc('epublisher-stt','SVC-EPUB-STT','ePublisher Speech-to-Text','ai-service','http://127.0.0.1:7869/health',{observation_id:'epublisher-stt'}),
  svc('premium-image','SVC-PIMG','Premium ePublisher Image','ai-service','http://127.0.0.1:7870/health',{observation_id:'premium-image'}),
  svc('foundry','SVC-FNDRY','Foundry','development-service','http://127.0.0.1:8787/v1/apps',{environment_ids:[urn('environment','research-and-development'),urn('environment','staging')],observation_id:'foundry'}),
  svc('sovereign-backend','SVC-BACK','Sovereign Backend','data-service','http://127.0.0.1:8787/v1/backend/health',{observation_id:'sovereign-backend'}),
  svc('ollama','SVC-OLLAMA','Ollama Runtime','local-model-runtime','http://127.0.0.1:11434/',{observation_id:'ollama'}),
];

const aliases = [
  { canonical_id:urn('application','hub'), aliases:['resonance-hub','reson8-life','reson8.life','RONSAS Hub'] },
  { canonical_id:urn('platform','ronsas'), aliases:['RONSAS','rons-sovereign-codebase','Resonance Open Nova Sovereign Application Suite'] },
  { canonical_id:urn('platform','open-nova'), aliases:['OpenNova','ResonanceAppDev_ZeroCredit_v1.5.5'] },
  { canonical_id:urn('application','datanest'), aliases:['DataNest','DataNest-Supository/DataNest'] },
  { canonical_id:urn('application','creative-studio'), aliases:['creative_studio','creativestudio.life','creative.reson8.life'] },
  { canonical_id:urn('application','sync-vision'), aliases:['sync_vision','syncvision.life','sync.reson8.life','LyricSync Studio'] },
  { canonical_id:urn('application','youtube-optimizer'), aliases:['youtube_optimizer','youtubeoptimizer.life','youtube.reson8.life'] },
];

fs.mkdirSync(path.join(root,'apps','hub','public','.well-known','resonance'),{recursive:true});
fs.mkdirSync(path.join(root,'apps','datanest','public','.well-known','resonance'),{recursive:true});

const hubCommit = '1cbc8b72f88c210c076c4a9f9edafb40e55414fc';
const publicManifest = (appId, serviceId, traceId, sourceState) => ({
  schema:'resonance.public-service/v1', generated_at:generatedAt,
  application_id:appId, service_id:serviceId, trace_id:traceId,
  environment_id:urn('environment','migration-staging'),
  authority_state:sourceState, public_safe:true,
  secret_material_permitted:false,
});
fs.writeFileSync(path.join(root,'apps','hub','public','.well-known','resonance','service-manifest.json'),JSON.stringify(publicManifest(urn('application','hub'),urn('service','hub-web'),'SVC-HUB-WEB','provisional-recovery-input'),null,2)+'\n');
fs.writeFileSync(path.join(root,'apps','hub','public','.well-known','resonance','environment.json'),JSON.stringify({schema:'resonance.public-environment/v1',environment_id:urn('environment','migration-staging'),trace_id:'ENV-MIG',node_authority_id:urn('node','ealiophin'),deployed:false,generated_at:generatedAt},null,2)+'\n');
fs.writeFileSync(path.join(root,'apps','hub','public','.well-known','resonance','release.json'),JSON.stringify({schema:'resonance.public-release/v1',source_commit:hubCommit,source_role:'weed-recovery-snapshot',certification:'not-certified-for-production',generated_at:generatedAt},null,2)+'\n');
fs.writeFileSync(path.join(root,'apps','datanest','public','.well-known','resonance','service-manifest.json'),JSON.stringify(publicManifest(urn('application','datanest'),urn('service','datanest-web'),'SVC-DN-WEB','source-import-pending'),null,2)+'\n');
fs.writeFileSync(path.join(root,'apps','datanest','public','.well-known','resonance','environment.json'),JSON.stringify({schema:'resonance.public-environment/v1',environment_id:urn('environment','migration-staging'),trace_id:'ENV-MIG',node_authority_id:urn('node','ealiophin'),deployed:false,generated_at:generatedAt},null,2)+'\n');
fs.writeFileSync(path.join(root,'apps','datanest','public','.well-known','resonance','release.json'),JSON.stringify({schema:'resonance.public-release/v1',source_commit:null,source_role:'ealiophin-import-pending',certification:'not-certified-for-production',generated_at:generatedAt},null,2)+'\n');

function listFiles(dir, base=dir) {
  const out=[];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir,{withFileTypes:true})) {
    const p=path.join(dir,ent.name);
    if (ent.isDirectory()) out.push(...listFiles(p,base));
    else if (ent.isFile()) out.push({full:p,rel:path.relative(base,p).split(path.sep).join('/')});
  }
  return out;
}
const mime = (p) => ({'.json':'application/json','.txt':'text/plain','.md':'text/markdown','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.js':'text/javascript','.css':'text/css','.html':'text/html'}[path.extname(p).toLowerCase()] ?? 'application/octet-stream');
const publicAssets=[];
for (const [appSlug, tracePrefix] of [['hub','HUB'],['datanest','DN']]) {
  const pub=path.join(root,'apps',appSlug,'public');
  for (const f of listFiles(pub)) {
    if (f.rel === '.well-known/resonance/asset-index.json') continue;
    const slug=f.rel.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    publicAssets.push({canonical_id:urn('public-asset',`${appSlug}:${slug}`),trace_id:`PUB-${tracePrefix}-${slug.toUpperCase().replace(/-/g,'_')}`,application_id:urn('application',appSlug),path:`apps/${appSlug}/public/${f.rel}`,sha256:sha256(f.full),media_type:mime(f.rel),visibility:'public',secret_material_permitted:false,state:'present'});
  }
}
for (const rel of ['release-manifest.json','runtime-config.js','health.json','transparency/audits/index.json']) {
  if (!publicAssets.some(x => x.path === `apps/datanest/public/${rel}`)) {
    const slug=rel.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase();
    publicAssets.push({canonical_id:urn('public-asset',`datanest:${slug}`),trace_id:`PUB-DN-${slug.toUpperCase().replace(/-/g,'_')}`,application_id:urn('application','datanest'),path:`apps/datanest/public/${rel}`,sha256:null,media_type:mime(rel),visibility:'public',secret_material_permitted:false,state:'import-pending'});
  }
}

const envelope = (kind,items) => ({ schema:`resonance.catalog.${kind}/v1`, generated_at:generatedAt, items });
writeJson('platforms.json',envelope('platforms',platforms));
writeJson('applications.json',envelope('applications',applications));
writeJson('governance.json',envelope('governance',governance));
writeJson('environments.json',envelope('environments',environments));
writeJson('nodes.json',envelope('nodes',nodes));
writeJson('services.json',envelope('services',services));
writeJson('aliases.json',envelope('aliases',aliases));
writeJson('public-assets.json',envelope('public-assets',publicAssets));

for (const appSlug of ['hub','datanest']) {
  const appId=urn('application',appSlug);
  const subset=publicAssets.filter(x=>x.application_id===appId);
  fs.writeFileSync(path.join(root,'apps',appSlug,'public','.well-known','resonance','asset-index.json'),JSON.stringify({schema:'resonance.public-assets/v1',generated_at:generatedAt,application_id:appId,items:subset},null,2)+'\n');
}

writeJson('index.json',{schema:'resonance.catalog.index/v1',generated_at:generatedAt,files:['platforms.json','applications.json','governance.json','environments.json','nodes.json','services.json','aliases.json','public-assets.json'],identity_standard:'docs/traceability/NOMENCLATURE.md'});
console.log(`TRACEABILITY_CATALOG_BUILT ${publicAssets.length} public assets ${services.length} services`);
