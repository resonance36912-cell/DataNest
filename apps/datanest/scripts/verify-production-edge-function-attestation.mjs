import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const target=resolve(process.argv[2] || ".datanest/edge-function-attestation.json");
const baselinePath=resolve(process.env.DATANEST_EDGE_ATTESTATION_BASELINE || "config/production-edge-function-attestation.json");
const supabaseToken=(process.env.SUPABASE_ACCESS_TOKEN || "").trim();
const projectRef=(process.env.DATANEST_SUPABASE_PROJECT || "sgqdmfgjbprsoqsmgigi").trim();

if(!supabaseToken)throw new Error("Production Edge Function attestation requires SUPABASE_ACCESS_TOKEN with edge_functions_read scope.");

const baseline=JSON.parse(readFileSync(baselinePath,"utf8"));
if(baseline.supabase_project!==projectRef)throw new Error("Edge Function baseline project does not match configured production project.");

const response=await fetch(
  "https://api.supabase.com/v1/projects/"+encodeURIComponent(projectRef)+"/functions",
  {headers:{Authorization:"Bearer "+supabaseToken,Accept:"application/json"}}
);

let payload;
try{payload=await response.json();}catch{payload=null;}
if(!response.ok)throw new Error("Production Edge Function attestation request failed with HTTP "+response.status+".");

const observedFunctions=Array.isArray(payload)?payload:[];
const observedBySlug=new Map(observedFunctions.map(fn=>[String(fn.slug||""),fn]));
const mismatches=[];
const observations={};

for(const [slug,expected] of Object.entries(baseline.functions||{})){
  const observed=observedBySlug.get(slug);
  if(!observed){mismatches.push({slug,reason:"missing"});continue;}
  const version=Number(observed.version);
  const digest=String(observed.ezbr_sha256||"");
  observations[slug]={
    version,
    ezbr_sha256:digest,
    verify_jwt:Boolean(observed.verify_jwt),
    status:String(observed.status||"")
  };
  if(version!==Number(expected.version))mismatches.push({slug,field:"version",expected:Number(expected.version),observed:version});
  if(digest!==String(expected.ezbr_sha256))mismatches.push({slug,field:"ezbr_sha256",expected:String(expected.ezbr_sha256),observed:digest});
  if(String(observed.status||"")!=="ACTIVE")mismatches.push({slug,field:"status",expected:"ACTIVE",observed:String(observed.status||"")});
  if(observed.verify_jwt!==true)mismatches.push({slug,field:"verify_jwt",expected:true,observed:Boolean(observed.verify_jwt)});
}

const baselineFingerprint=createHash("sha256").update(JSON.stringify(baseline.functions)).digest("hex");
if(mismatches.length)throw new Error("Production Edge Function attestation mismatch: "+JSON.stringify(mismatches));

const attestation={
  schemaVersion:"edge-function-attestation-v1",
  status:"verified",
  source:"supabase-management-api",
  verifiedAt:new Date().toISOString(),
  project:projectRef,
  baselineFingerprint,
  functions:observations
};

mkdirSync(dirname(target),{recursive:true});
writeFileSync(target,JSON.stringify(attestation)+"\n","utf8");
console.log("Verified production Edge Function deployment identities for",Object.keys(observations).length,"functions.");
