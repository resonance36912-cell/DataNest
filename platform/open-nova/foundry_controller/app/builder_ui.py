from __future__ import annotations


def builder_html() -> str:
    return r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Resonance Open Nova — Sovereign App Factory</title>
<style>
:root{font-family:Inter,system-ui,sans-serif;color-scheme:dark}body{margin:0;background:#0b0f14;color:#e6edf3}
main{max-width:980px;margin:auto;padding:32px 20px 64px}.eyebrow{letter-spacing:.14em;text-transform:uppercase;opacity:.65;font-size:12px}
h1{font-size:clamp(32px,6vw,64px);line-height:1;margin:.2em 0}.card{background:#111821;border:1px solid #283341;border-radius:18px;padding:20px;margin-top:20px}
textarea,input,select,button{box-sizing:border-box;width:100%;padding:12px;border-radius:10px;border:1px solid #334155;background:#0b1118;color:#e6edf3;margin-top:8px}
textarea{min-height:160px;resize:vertical}button{cursor:pointer;font-weight:700;background:#e6edf3;color:#0b0f14}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#080c10;padding:16px;border-radius:12px;min-height:80px}.status{font-size:13px;opacity:.75}.warn{opacity:.8}
@media(max-width:680px){.grid{grid-template-columns:1fr}}
</style></head>
<body><main>
<div class="eyebrow">Resonance Open Nova · Sovereign Release Candidate v1.5</div>
<h1>Sovereign Development Platform</h1>
<p>Create, migrate, govern, test, run and certify applications locally without making third-party AI credits a core dependency.</p>
<div class="card">
<h2>Create</h2>
<label>Application intent<textarea id="intent" placeholder="Create an inventory and customer management application..."></textarea></label>
<div class="grid"><label>Name (optional)<input id="name" placeholder="aurum-operations"></label><label>Template<select id="template"><option value="python-fastapi">Python / FastAPI</option><option value="static-web">Static Web</option></select></label></div>
<div class="grid"><button id="spec">Create governed spec</button><button id="generate">Generate deterministic baseline</button></div>
<button id="localGenerate">Generate with local AI</button>
<p class="status">External AI is not used by these builder actions.</p>
</div>
<div class="card"><h2>First Real Repository Execution</h2><p class="warn">Consolidated evidence-first path for the real application repository. Assessment is read-only; admission copies a clean Git snapshot into Open Nova. Supported migration remains reversible and production cutover stays disabled.</p><label>Repository root<input id="execSource" placeholder="C:\path\to\real-app-repository"></label><label>App ID<input id="execApp" value="reson8-life"></label><div class="grid"><button id="execAssess">Assess real repository</button><button id="execAdmit">Admit governed copy</button></div><div class="grid"><button id="execPrepare">Create baseline + checkpoint</button><button id="execMigrate">Execute supported migration</button></div><div class="grid"><button id="execStatus">Readiness</button><button id="execEvidence">Verify execution evidence</button></div><pre id="execOut">Real repository not yet assessed.</pre></div>
<div class="card"><h2>Sovereign Workstation & Repository Bridge</h2><p class="warn">Initialize this PC as a governed Open Nova workstation, then stage a clean local Git repository without network cloning. Absolute source paths and remote URLs are not recorded.</p><div class="grid"><button id="workstationStatus">Workstation status</button><button id="workstationInit">Initialize workstation</button></div><label>Local Git repository root<input id="repoSource" placeholder="C:\path\to\ResonanceAppDev"></label><label>App ID<input id="repoApp" value="reson8-life"></label><div class="grid"><button id="repoAssess">Assess repository</button><button id="repoStage">Stage clean snapshot</button></div><div class="grid"><button id="repoStatus">Repository status</button><button id="repoVerify">Verify staged snapshot</button></div><pre id="workstationOut">No workstation/repository operation yet.</pre></div>
<div class="card">
<h2>Migrate existing project</h2>
<p class="warn">Place a project under <code>imports/projects/</code>. Assessment is read-only. Import creates a new copy under <code>apps/</code> and never alters the source.</p>
<div class="grid"><label>Source directory<input id="migrationSource" placeholder="imports/projects/my-existing-app"></label><label>New app name (optional)<input id="migrationName" placeholder="my-sovereign-app"></label></div>
<div class="grid"><button id="assess">Assess migration</button><button id="import">Import confirmed copy</button></div>
</div>
<div class="card"><h2>Real Source Ingestion & Migration Execution</h2><p class="warn">Copies an approved local source tree into the governed inbox without recording its absolute path. Secrets, symlinks/reparse points and overwrites are refused. Supported provider rewrites require a baseline and rollback checkpoint.</p><label>Local source path<input id="realSourcePath" placeholder="C:\path\to\reson8-life"></label><label>App ID<input id="realSourceApp" value="reson8-life"></label><div class="grid"><button id="realStage">Stage approved source</button><button id="realStatus">Source status</button></div><div class="grid"><button id="realImport">Import governed copy</button><button id="migrationPrepare">Prepare migration</button></div><div class="grid"><button id="migrationExecute">Execute supported rewrites</button><button id="migrationVerify">Verify migration</button></div><pre id="realSourceOut">No real-source operation yet.</pre></div>

<div class="card"><h2>Local Deployment & First-App Pilot</h2><p class="warn">Collect evidence from this PC, verify the local sovereign prerequisites, and generate the migration plan for the first Resonance application. No network provisioning or production cutover occurs here.</p><div class="grid"><button id="deployPreflight">Run local deployment preflight</button><button id="deployEvidence">Record confirmed evidence</button></div><label>First app ID<input id="pilotApp" value="reson8-life"></label><div class="grid"><button id="pilotPlan">View first-app plan</button><button id="pilotWrite">Record migration plan</button></div><pre id="deployOut">No local deployment query yet.</pre></div>
<div class="card"><h2>First Real App Cutover</h2><p class="warn">Evidence-gated local cutover for the actual imported app. Production deployment remains disabled. Record a baseline, create a rollback checkpoint, run isolated regression, verify a loopback preview, then inspect/certify readiness.</p><label>Managed app ID<input id="cutoverApp" value="reson8-life"></label><div class="grid"><button id="cutoverBaseline">Record source baseline</button><button id="cutoverCheckpoint">Create rollback checkpoint</button></div><div class="grid"><button id="cutoverRegression">Run isolated regression</button><button id="cutoverPlan">Inspect cutover gates</button></div><label>Loopback preview URL<input id="cutoverUrl" value="http://127.0.0.1:4310/"></label><div class="grid"><button id="cutoverPreview">Verify local preview</button><button id="cutoverCertify">Certify local cutover</button></div><pre id="cutoverOut">No cutover query yet.</pre></div>
<div class="card"><h2>Open Nova Control Plane</h2><p class="warn">Read-only operational view of Zero-Credit policy, suite migration, runtime health, registry integrity and evidence-based sovereignty scoring.</p><div class="grid"><button id="controlPlane">Refresh control plane</button><button id="releasePreflight">Release preflight</button></div><pre id="controlOut">No control-plane query yet.</pre></div>
<div class="card"><strong>Result</strong><pre id="output">Ready.</pre></div>
<div class="card"><strong>Registered applications</strong><button id="refresh">Refresh registry</button><pre id="apps">No registry query yet.</pre></div>
<div class="card"><h2>Suite Migration Control Centre</h2><p class="warn">Shows the governed migration/readiness state of the declared Resonance application suite. This view does not modify source code.</p><button id="suite">Refresh suite control centre</button><pre id="suiteOut">No suite query yet.</pre></div>

<div class="card"><h2>Sovereign Adapter & Migration Engine</h2><p class="warn">Inspect provider-specific code, generate local provider-neutral adapters, prepare a reversible cutover, and verify readiness. Ambiguous operations are blocked instead of guessed.</p><label>Managed app ID<input id="adapterApp" placeholder="my-sovereign-app"></label><div class="grid"><button id="adapterAssess">Assess provider code</button><button id="adapterGenerate">Generate adapters</button></div><div class="grid"><button id="adapterCutover">Prepare confirmed cutover</button><button id="adapterVerify">Verify cutover</button></div><pre id="adapterOut">No adapter query yet.</pre></div>

<div class="card"><h2>Sovereign Backend Runtime</h2><p class="warn">Initialize local secret references, generate the offline backend runtime, inspect service health, plan database migrations and certify app cutover readiness.</p><div class="grid"><button id="backendValidate">Validate backend</button><button id="backendHealth">Backend health</button></div><div class="grid"><button id="backendSecrets">Initialize local secrets</button><button id="backendWrite">Generate runtime</button></div><label>Managed app ID<input id="backendApp" placeholder="my-sovereign-app"></label><div class="grid"><button id="backendPlan">Migration plan</button><button id="backendCertify">Certify cutover</button></div><pre id="backendOut">No backend-runtime query yet.</pre></div>
<div class="card"><h2>Sovereign Service Fabric</h2><p class="warn">Local database, auth, storage, gateway, secrets and AI service contracts. Health checks are loopback-only and never expose secret values.</p><div class="grid"><button id="fabric">Inspect service fabric</button><button id="fabricHealth">Check local service health</button></div><pre id="fabricOut">No service-fabric query yet.</pre></div>
<script>
const execOut=document.querySelector('#execOut'), out=document.querySelector('#output'), apps=document.querySelector('#apps'), suiteOut=document.querySelector('#suiteOut'), fabricOut=document.querySelector('#fabricOut'), adapterOut=document.querySelector('#adapterOut'), backendOut=document.querySelector('#backendOut'), controlOut=document.querySelector('#controlOut'), deployOut=document.querySelector('#deployOut'), cutoverOut=document.querySelector('#cutoverOut'), realSourceOut=document.querySelector('#realSourceOut'), workstationOut=document.querySelector('#workstationOut');
const execId=()=>document.querySelector('#execApp').value.trim();
const execSource=()=>document.querySelector('#execSource').value;
async function execCall(suffix,method='GET',payload){const id=execId();if(!id){execOut.textContent='Enter an app ID.';return;}execOut.textContent='Checking governed real-source execution…';const r=await fetch(`/v1/real-execution/${encodeURIComponent(id)}/${suffix}`,{method,headers:{'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});execOut.textContent=JSON.stringify(await r.json(),null,2);}
document.querySelector('#execAssess').onclick=()=>execCall('assess-repository','POST',{source_path:execSource(),confirmed:false});
document.querySelector('#execAdmit').onclick=()=>execCall('admit-repository','POST',{source_path:execSource(),confirmed:true});
document.querySelector('#execPrepare').onclick=()=>execCall('prepare','POST',{confirmed:true});
document.querySelector('#execMigrate').onclick=()=>execCall('execute-supported','POST',{confirmed:true});
document.querySelector('#execStatus').onclick=()=>execCall('readiness');
document.querySelector('#execEvidence').onclick=()=>execCall('evidence/verify');
const body=()=>({intent:document.querySelector('#intent').value,app_name:document.querySelector('#name').value||null,template:document.querySelector('#template').value});
const migration=()=>({source_dir:document.querySelector('#migrationSource').value,app_name:document.querySelector('#migrationName').value||null});
async function call(url,method='GET',payload){out.textContent='Working locally…'; const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined}); const d=await r.json(); out.textContent=JSON.stringify(d,null,2);}

async function workstationCall(url,method='GET',payload){workstationOut.textContent='Checking local workstation…';const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});workstationOut.textContent=JSON.stringify(await r.json(),null,2);}
document.querySelector('#workstationStatus').onclick=()=>workstationCall('/v1/workstation/status');
document.querySelector('#workstationInit').onclick=()=>workstationCall('/v1/workstation/initialize','POST',{confirmed:true});
const repoApp=()=>document.querySelector('#repoApp').value.trim();
const repoSource=()=>document.querySelector('#repoSource').value;
document.querySelector('#repoAssess').onclick=()=>{const id=repoApp();if(id)workstationCall(`/v1/repository-bridge/${encodeURIComponent(id)}/assess`,'POST',{source_path:repoSource(),confirmed:false});};
document.querySelector('#repoStage').onclick=()=>{const id=repoApp();if(id)workstationCall(`/v1/repository-bridge/${encodeURIComponent(id)}/stage`,'POST',{source_path:repoSource(),confirmed:true});};
document.querySelector('#repoStatus').onclick=()=>{const id=repoApp();if(id)workstationCall(`/v1/repository-bridge/${encodeURIComponent(id)}/status`);};
document.querySelector('#repoVerify').onclick=()=>{const id=repoApp();if(id)workstationCall(`/v1/repository-bridge/${encodeURIComponent(id)}/verify`);};
document.querySelector('#spec').onclick=()=>call('/v1/factory/spec','POST',body());
document.querySelector('#generate').onclick=()=>call('/v1/factory/generate','POST',{...body(),strategy:'deterministic',overwrite:false,confirmed:false});
document.querySelector('#localGenerate').onclick=()=>call('/v1/factory/generate','POST',{...body(),strategy:'local_model',overwrite:false,confirmed:false});
document.querySelector('#assess').onclick=()=>call('/v1/migration/assess','POST',migration());
document.querySelector('#import').onclick=()=>call('/v1/migration/import','POST',{...migration(),confirmed:true});
document.querySelector('#refresh').onclick=async()=>{const r=await fetch('/v1/apps');apps.textContent=JSON.stringify(await r.json(),null,2)};
document.querySelector('#suite').onclick=async()=>{const r=await fetch('/v1/suite');suiteOut.textContent=JSON.stringify(await r.json(),null,2)};
document.querySelector('#controlPlane').onclick=async()=>{const r=await fetch('/v1/control-plane');controlOut.textContent=JSON.stringify(await r.json(),null,2)};
document.querySelector('#releasePreflight').onclick=async()=>{const r=await fetch('/v1/release/preflight');controlOut.textContent=JSON.stringify(await r.json(),null,2)};
async function deployCall(url,method='GET',payload){deployOut.textContent='Checking local sovereignty evidence…';const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});deployOut.textContent=JSON.stringify(await r.json(),null,2);}
document.querySelector('#deployPreflight').onclick=()=>deployCall('/v1/deployment/preflight');
document.querySelector('#deployEvidence').onclick=()=>deployCall('/v1/deployment/evidence','POST',{confirmed:true});
const pilotId=()=>document.querySelector('#pilotApp').value.trim();
document.querySelector('#pilotPlan').onclick=()=>{const id=pilotId();if(id)deployCall(`/v1/deployment/first-app/${encodeURIComponent(id)}/plan`);else deployOut.textContent='Enter an app ID.'};
document.querySelector('#pilotWrite').onclick=()=>{const id=pilotId();if(id)deployCall(`/v1/deployment/first-app/${encodeURIComponent(id)}/plan`,'POST',{confirmed:true});else deployOut.textContent='Enter an app ID.'};


const cutoverId=()=>document.querySelector('#cutoverApp').value.trim();
async function cutoverCall(suffix,method='GET',payload){const id=cutoverId();if(!id){cutoverOut.textContent='Enter a managed app ID.';return;}cutoverOut.textContent='Checking cutover evidence…';const r=await fetch(`/v1/cutover/${encodeURIComponent(id)}/${suffix}`,{method,headers:{'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});cutoverOut.textContent=JSON.stringify(await r.json(),null,2);}
document.querySelector('#cutoverBaseline').onclick=()=>cutoverCall('baseline','POST',{confirmed:true});
document.querySelector('#cutoverCheckpoint').onclick=()=>cutoverCall('checkpoint','POST',{confirmed:true});
document.querySelector('#cutoverRegression').onclick=()=>cutoverCall('regression','POST',{confirmed:true,tasks:[]});
document.querySelector('#cutoverPlan').onclick=()=>cutoverCall('plan');
document.querySelector('#cutoverPreview').onclick=()=>cutoverCall('preview','POST',{confirmed:true,url:document.querySelector('#cutoverUrl').value});
document.querySelector('#cutoverCertify').onclick=()=>cutoverCall('certify-local','POST',{confirmed:true});
document.querySelector('#fabric').onclick=async()=>{const r=await fetch('/v1/service-fabric');fabricOut.textContent=JSON.stringify(await r.json(),null,2)};
document.querySelector('#fabricHealth').onclick=async()=>{const r=await fetch('/v1/service-fabric/health');fabricOut.textContent=JSON.stringify(await r.json(),null,2)};
const adapterId=()=>document.querySelector('#adapterApp').value.trim();
async function adapterCall(suffix,method='GET',payload){const id=adapterId();if(!id){adapterOut.textContent='Enter a managed app ID.';return;}adapterOut.textContent='Working locally…';const r=await fetch(`/v1/adapters/${encodeURIComponent(id)}/${suffix}`,{method,headers:{'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});adapterOut.textContent=JSON.stringify(await r.json(),null,2);}
document.querySelector('#adapterAssess').onclick=()=>adapterCall('assess');
document.querySelector('#adapterGenerate').onclick=()=>adapterCall('generate','POST',{confirmed:true});
document.querySelector('#adapterCutover').onclick=()=>adapterCall('cutover','POST',{confirmed:true});
document.querySelector('#adapterVerify').onclick=()=>adapterCall('verify');
async function backendCall(url,method='GET',payload){backendOut.textContent='Working locally…';const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});backendOut.textContent=JSON.stringify(await r.json(),null,2);}
document.querySelector('#backendValidate').onclick=()=>backendCall('/v1/backend/validate');
document.querySelector('#backendHealth').onclick=()=>backendCall('/v1/backend/health');
document.querySelector('#backendSecrets').onclick=()=>backendCall('/v1/backend/secrets/init','POST',{confirmed:true});
document.querySelector('#backendWrite').onclick=()=>backendCall('/v1/backend/runtime/write','POST',{confirmed:true});
const backendId=()=>document.querySelector('#backendApp').value.trim();
document.querySelector('#backendPlan').onclick=()=>{const id=backendId(); if(id) backendCall(`/v1/backend/apps/${encodeURIComponent(id)}/migration-plan`); else backendOut.textContent='Enter a managed app ID.'};
document.querySelector('#backendCertify').onclick=()=>{const id=backendId(); if(id) backendCall(`/v1/backend/apps/${encodeURIComponent(id)}/certify`,'POST'); else backendOut.textContent='Enter a managed app ID.'};

const realApp=()=>document.querySelector('#realSourceApp').value.trim();
async function realCall(prefix,suffix,method='GET',payload){const id=realApp();if(!id){realSourceOut.textContent='Enter an app ID.';return;}realSourceOut.textContent='Executing governed local operation…';const r=await fetch(`/v1/${prefix}/${encodeURIComponent(id)}/${suffix}`,{method,headers:{'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});realSourceOut.textContent=JSON.stringify(await r.json(),null,2);}
document.querySelector('#realStage').onclick=()=>realCall('source-ingestion','stage-local','POST',{source_path:document.querySelector('#realSourcePath').value,confirmed:true});
document.querySelector('#realStatus').onclick=()=>realCall('source-ingestion','status');
document.querySelector('#realImport').onclick=()=>realCall('source-ingestion','import','POST',{confirmed:true});
document.querySelector('#migrationPrepare').onclick=()=>realCall('migration-execution','prepare','POST',{confirmed:true});
document.querySelector('#migrationExecute').onclick=()=>realCall('migration-execution','execute-supported','POST',{confirmed:true});
document.querySelector('#migrationVerify').onclick=()=>realCall('migration-execution','verify');

</script></main></body></html>'''
