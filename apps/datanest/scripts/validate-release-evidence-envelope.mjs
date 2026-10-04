import { readFileSync } from "node:fs";

const file=process.argv[2];
if(!file) throw new Error("Usage: node scripts/validate-release-evidence-envelope.mjs <envelope.json>");

const envelope=JSON.parse(readFileSync(file,"utf8"));

const fail=(message)=>{ throw new Error("Release evidence envelope invalid: "+message); };
const sha=/^[0-9a-f]{40}$/;
const digest=/^sha256:[0-9a-f]{64}$/;
const has=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);

if(envelope?.schemaVersion!=="release-evidence-envelope-v1") fail("schemaVersion must be release-evidence-envelope-v1");
if(!envelope.repository || typeof envelope.repository.fullName!=="string" || !["canonical","mirror-rd","forge-replica"].includes(envelope.repository.role)) fail("repository identity/role is invalid");
if(typeof envelope.commitSha!=="string" || !sha.test(envelope.commitSha)) fail("commitSha must be a 40-character lowercase SHA");
if(typeof envelope.releaseId!=="string" || !envelope.releaseId) fail("releaseId is required");
if(!["development","staging","production","recovery"].includes(envelope.environment)) fail("environment is invalid");
if(!envelope.backend || typeof envelope.backend.projectId!=="string" || typeof envelope.backend.environment!=="string") fail("backend identity is incomplete");
if(!envelope.workflow || envelope.workflow.provider!=="github-actions" || typeof envelope.workflow.name!=="string" || typeof envelope.workflow.runId!=="string") fail("workflow identity is incomplete");
if(!envelope.artifact || typeof envelope.artifact.type!=="string" || typeof envelope.artifact.identity!=="string") fail("artifact identity is incomplete");
if(has(envelope.artifact,"digest") && !digest.test(envelope.artifact.digest)) fail("artifact digest is invalid");
for(const key of ["tests","typecheck","security","live"]){
  if(!["pass","fail","not_run"].includes(envelope.verification?.[key])) fail("verification."+key+" is invalid");
}
if(typeof envelope.governance?.reviewed!=="boolean" || typeof envelope.governance?.humanAuthorized!=="boolean") fail("governance flags are required");
if(typeof envelope.authority?.productionAuthority!=="boolean" || typeof envelope.authority?.productionDeploymentAllowed!=="boolean") fail("authority flags are required");

if(envelope.authority.productionDeploymentAllowed && !envelope.authority.productionAuthority) fail("productionDeploymentAllowed cannot be true while productionAuthority is false");
if(envelope.authority.productionDeploymentAllowed && envelope.environment!=="production") fail("production deployment requires production environment");
if(envelope.repository.role==="mirror-rd" && envelope.authority.productionAuthority) fail("mirror-rd cannot assert productionAuthority");
if(envelope.repository.role==="mirror-rd" && envelope.authority.productionDeploymentAllowed) fail("mirror-rd cannot assert productionDeploymentAllowed");
if(envelope.authority.productionDeploymentAllowed){
  if(!envelope.governance.reviewed || !envelope.governance.humanAuthorized) fail("production deployment requires reviewed and humanAuthorized");
  if(envelope.verification.tests!=="pass" || envelope.verification.typecheck!=="pass" || envelope.verification.security!=="pass" || envelope.verification.live!=="pass") fail("production deployment requires all hard verification gates to pass");
  if(envelope.certification?.status!=="pass") fail("production deployment requires certification");
  if(envelope.auditOptimizer?.status!=="pass") fail("production deployment requires Audit Optimizer evidence");
}
console.log("Release evidence envelope valid:",envelope.releaseId);
