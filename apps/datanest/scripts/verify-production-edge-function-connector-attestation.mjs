import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const path=resolve(process.argv[2] || "config/production-edge-function-connector-attestation.json");
const releaseSha=(process.env.DATANEST_RELEASE_SHA || "").trim();
const projectRef=(process.env.DATANEST_SUPABASE_PROJECT || "sgqdmfgjbprsoqsmgigi").trim();
const maxAgeHours=Number(process.env.DATANEST_CONNECTOR_ATTESTATION_MAX_AGE_HOURS || 24);

const requiredFunctions=[
  "datanest-ai-chat",
  "datanest-ai-intake",
  "datanest-ai-certification",
  "manage-ai-provider-v2",
  "send-job-invite",
  "send-project-member-invite",
  "ronsas-status",
  "external-audit"
];

if(!/^[0-9a-f]{40}$/i.test(releaseSha))throw new Error("DATANEST_RELEASE_SHA must be an exact 40-character Git commit SHA.");
if(!Number.isFinite(maxAgeHours)||maxAgeHours<=0||maxAgeHours>72)throw new Error("Connector attestation max age must be between 0 and 72 hours.");

const attestation=JSON.parse(readFileSync(path,"utf8"));
if(attestation.schemaVersion!=="edge-function-connector-attestation-v1")throw new Error("Unexpected connector attestation schema.");
if(attestation.status!=="verified")throw new Error("Connector attestation is not verified.");
if(attestation.source!=="supabase-mcp-connector")throw new Error("Connector attestation source is not trusted.");
if(String(attestation.project||"")!==projectRef)throw new Error("Connector attestation project mismatch.");

const sourceCommit=String(attestation.sourceCommit||"");
if(!/^[0-9a-f]{40}$/i.test(sourceCommit))throw new Error("Connector attestation sourceCommit is invalid.");
execFileSync("git",["merge-base","--is-ancestor",sourceCommit,releaseSha],{stdio:"inherit"});
try{
  execFileSync("git",["diff","--quiet",sourceCommit,releaseSha,"--","supabase/functions"],{stdio:"inherit"});
}catch{
  throw new Error("Edge Function source changed after connector observation; refresh connector attestation before release.");
}

const observedAt=Date.parse(String(attestation.observedAt||""));
if(!Number.isFinite(observedAt))throw new Error("Connector attestation observedAt is invalid.");
const ageHours=(Date.now()-observedAt)/3_600_000;
if(ageHours<(-5/60))throw new Error("Connector attestation observedAt is unexpectedly in the future.");
if(ageHours>maxAgeHours)throw new Error(`Connector attestation is stale (${ageHours.toFixed(2)}h > ${maxAgeHours}h).`);

for(const slug of requiredFunctions){
  const fn=attestation.functions?.[slug];
  if(!fn)throw new Error(`Connector attestation is missing ${slug}.`);
  if(fn.status!=="ACTIVE")throw new Error(`${slug} is not ACTIVE in connector attestation.`);
  if(fn.verify_jwt!==true)throw new Error(`${slug} does not have JWT verification enabled.`);
  if(!Number.isInteger(Number(fn.version))||Number(fn.version)<=0)throw new Error(`${slug} has an invalid version.`);
  if(!/^[0-9a-f]{64}$/i.test(String(fn.ezbr_sha256||"")))throw new Error(`${slug} has an invalid deployment digest.`);
}

console.log(JSON.stringify({
  schemaVersion:attestation.schemaVersion,
  status:attestation.status,
  project:attestation.project,
  sourceCommit,
  releaseSha,
  observedAt:attestation.observedAt,
  ageHours:Number(ageHours.toFixed(3)),
  functionCount:requiredFunctions.length
},null,2));
