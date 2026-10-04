import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const envelopePath=resolve(process.argv[2] || ".datanest/release-evidence-envelope.json");
const indexPath=resolve(process.argv[3] || ".datanest/forge-evidence-index.json");
const envelope=JSON.parse(readFileSync(envelopePath,"utf8"));

if(envelope?.schemaVersion!=="release-evidence-envelope-v1") throw new Error("Forge ingestion accepts only release-evidence-envelope-v1.");
if(!envelope.repository?.fullName || !envelope.commitSha || !envelope.releaseId) throw new Error("Forge ingestion requires repository, commitSha and releaseId.");
if(typeof envelope.authority?.productionAuthority!=="boolean" || typeof envelope.authority?.productionDeploymentAllowed!=="boolean") throw new Error("Forge ingestion requires explicit authority flags.");

const existing = (()=>{ try { return JSON.parse(readFileSync(indexPath,"utf8")); } catch { return null; } })();
const index=existing && existing.schemaVersion==="forge-evidence-index-v1"
  ? existing
  : {schemaVersion:"forge-evidence-index-v1",mode:"read-only",entries:[]};

const key=envelope.repository.fullName+"@"+envelope.commitSha+"#"+envelope.releaseId;
const entry={
  key,
  schemaVersion:envelope.schemaVersion,
  repository:envelope.repository,
  commitSha:envelope.commitSha,
  releaseId:envelope.releaseId,
  environment:envelope.environment,
  backend:envelope.backend,
  workflow:envelope.workflow,
  artifact:envelope.artifact,
  verification:envelope.verification,
  certification:envelope.certification || null,
  auditOptimizer:envelope.auditOptimizer || null,
  governance:{
    reviewed:Boolean(envelope.governance?.reviewed),
    humanAuthorized:Boolean(envelope.governance?.humanAuthorized)
  },
  authority:{
    productionAuthority:Boolean(envelope.authority.productionAuthority),
    productionDeploymentAllowed:Boolean(envelope.authority.productionDeploymentAllowed)
  },
  ingestedAt:new Date().toISOString()
};

const next=index.entries.filter(item=>item.key!==key);
next.push(entry);
index.entries=next;
index.lastIngestedKey=key;
index.updatedAt=new Date().toISOString();

mkdirSync(dirname(indexPath),{recursive:true});
writeFileSync(indexPath,JSON.stringify(index,null,2)+"\n","utf8");
console.log("Forge read-only evidence indexed:",key);
