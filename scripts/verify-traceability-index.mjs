import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalog=path.join(root,'catalog');
const files=['platforms.json','applications.json','governance.json','environments.json','nodes.json','services.json','public-assets.json'];
const all=[];
const failures=[];
for(const name of files){const doc=JSON.parse(fs.readFileSync(path.join(catalog,name),'utf8').replace(/^\uFEFF/,''));for(const item of doc.items??[]){all.push({...item,_catalog:name});}}
const unique=(field)=>{const seen=new Map();for(const x of all){if(!x[field])continue;if(seen.has(x[field]))failures.push(`duplicate ${field}: ${x[field]} in ${seen.get(x[field])} and ${x._catalog}`);else seen.set(x[field],x._catalog);}};
unique('canonical_id'); unique('trace_id');
for(const x of all.filter(x=>x._catalog==='public-assets.json')){
  if(x.visibility!=='public') failures.push(`public asset not public: ${x.path}`);
  if(x.secret_material_permitted!==false) failures.push(`public asset permits secrets: ${x.path}`);
  if(x.state==='present' && !fs.existsSync(path.join(root,x.path))) failures.push(`indexed public asset missing: ${x.path}`);
}
const nodeIds=new Set(all.filter(x=>x._catalog==='nodes.json').map(x=>x.canonical_id));
const envIds=new Set(all.filter(x=>x._catalog==='environments.json').map(x=>x.canonical_id));
for(const x of all.filter(x=>x._catalog==='services.json')){
  if(x.runtime_authority_node_id && !nodeIds.has(x.runtime_authority_node_id)) failures.push(`service node unresolved: ${x.canonical_id}`);
  for(const e of x.environment_ids??[]) if(!envIds.has(e)) failures.push(`service environment unresolved: ${x.canonical_id} -> ${e}`);
}
const forbidden=/(^|\/)(\.env($|\.)|id_rsa|.*\.(pem|key|p12|pfx)$)/i;
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(ent.name==='.git')continue;const p=path.join(dir,ent.name);const rel=path.relative(root,p).split(path.sep).join('/');if(ent.isDirectory())walk(p);else if(forbidden.test(rel) && !/\.env\..*\.example$|\.env\.example$/i.test(rel))failures.push(`forbidden credential-like path in staging: ${rel}`);}}
walk(root);
for(const app of ['hub','datanest']){for(const f of ['service-manifest.json','environment.json','release.json','asset-index.json']){const p=path.join(root,'apps',app,'public','.well-known','resonance',f);if(!fs.existsSync(p))failures.push(`missing public trace metadata: ${path.relative(root,p)}`);else JSON.parse(fs.readFileSync(p,'utf8'));}}
if(failures.length){console.error(failures.join('\n'));process.exit(1);}console.log(`TRACEABILITY_VERIFY_OK resources=${all.length}`);
