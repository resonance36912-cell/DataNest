import { dirname, resolve } from "node:path";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { gitTrackedTreeSha256 } from "./lib/git-tracked-tree-sha256.mjs";

const target=resolve(process.argv[2] || ".datanest/edge-function-release.json");
const releaseSha=(process.env.DATANEST_RELEASE_SHA || "").trim();
const supabaseToken=(process.env.SUPABASE_ACCESS_TOKEN || "").trim();
const projectRef=(process.env.DATANEST_SUPABASE_PROJECT || "sgqdmfgjbprsoqsmgigi").trim();
const workflowRunId=Number(process.env.GITHUB_RUN_ID || 0);
const repository=(process.env.GITHUB_REPOSITORY || "").trim();
const connectorPath=resolve(process.env.DATANEST_CONNECTOR_ATTESTATION_FILE || "config/production-edge-function-connector-attestation.json");

const functions=[
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
if(!Number.isInteger(workflowRunId)||workflowRunId<=0)throw new Error("GITHUB_RUN_ID is required for production Edge Function release attestation.");
if(!repository)throw new Error("GITHUB_REPOSITORY is required for production Edge Function release attestation.");

const sourceTreeSha256=gitTrackedTreeSha256("supabase/functions");

let observedFunctions=[];
let verificationMode="management-api";
let connectorObservedAt=null;
let connectorSourceCommit=null;

if(supabaseToken){
  const response=await fetch(
    "https://api.supabase.com/v1/projects/"+encodeURIComponent(projectRef)+"/functions",
    {headers:{Authorization:"Bearer "+supabaseToken,Accept:"application/json"}}
  );
  let payload;
  try{payload=await response.json();}catch{payload=null;}
  if(!response.ok)throw new Error("Production Edge Function inventory request failed with HTTP "+response.status+".");
  observedFunctions=Array.isArray(payload)?payload:[];
}else{
  const connector=JSON.parse(readFileSync(connectorPath,"utf8"));
  if(connector.schemaVersion!=="edge-function-connector-attestation-v1"||connector.status!=="verified"){
    throw new Error("Connector Edge Function attestation is invalid.");
  }
  if(connector.source!=="supabase-mcp-connector"||String(connector.project||"")!==projectRef){
    throw new Error("Connector Edge Function attestation provenance mismatch.");
  }
  connectorObservedAt=String(connector.observedAt||"");
  connectorSourceCommit=String(connector.sourceCommit||"");
  observedFunctions=Object.entries(connector.functions||{}).map(([slug,value])=>({slug,...value}));
  verificationMode="connector-attested";
}

const observedBySlug=new Map(observedFunctions.map(fn=>[String(fn.slug||""),fn]));
const releaseFunctions={};
const mismatches=[];
for(const slug of functions){
  const observed=observedBySlug.get(slug);
  if(!observed){mismatches.push({slug,reason:"missing"});continue;}
  if(String(observed.status||"")!=="ACTIVE")mismatches.push({slug,field:"status",expected:"ACTIVE",observed:String(observed.status||"")});
  if(observed.verify_jwt!==true)mismatches.push({slug,field:"verify_jwt",expected:true,observed:Boolean(observed.verify_jwt)});
  const version=Number(observed.version);
  const digest=String(observed.ezbr_sha256||"");
  if(!Number.isInteger(version)||version<=0)mismatches.push({slug,field:"version",reason:"missing_or_invalid"});
  if(!/^[0-9a-f]{64}$/i.test(digest))mismatches.push({slug,field:"ezbr_sha256",reason:"missing_or_invalid"});
  releaseFunctions[slug]={version,ezbr_sha256:digest,status:String(observed.status||""),verify_jwt:Boolean(observed.verify_jwt),sourceCommit:releaseSha,sourceTreeSha256};
}
if(mismatches.length)throw new Error("Production Edge Function release inventory validation failed: "+JSON.stringify(mismatches));

const attestation={
  schemaVersion:"edge-function-release-attestation-v2",
  status:"verified",
  source:"governed-production-edge-function-release",
  verificationMode,
  repository,
  project:projectRef,
  sourceCommit:releaseSha,
  workflowRunId,
  sourceTreeSha256,
  connectorObservedAt,
  connectorSourceCommit,
  functions:releaseFunctions,
  verifiedAt:new Date().toISOString()
};

mkdirSync(dirname(target),{recursive:true});
writeFileSync(target,JSON.stringify(attestation,null,2)+"\n","utf8");
console.log("Recorded governed production Edge Function release for",releaseSha,"via",verificationMode);
