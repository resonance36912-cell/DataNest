import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const target=resolve(process.argv[2] || ".datanest/release-attestation.json");
const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
const expectedReference=(process.env.DATANEST_EXPECTED_DB_MIGRATION_REFERENCE || "").trim();

if(!supabaseUrl||!publishableKey)throw new Error("Production release attestation requires Supabase public configuration.");
if(!expectedReference)throw new Error("Production release attestation requires the expected database migration reference.");

let expectedConfig;
try{
  expectedConfig=JSON.parse(expectedReference);
}catch{
  throw new Error("DATANEST_EXPECTED_DB_MIGRATION_REFERENCE must be valid JSON.");
}
const expectedHead=String(expectedConfig?.head||"").trim();
const expectedName=String(expectedConfig?.name||"").trim();
if(!expectedHead||!expectedName){
  throw new Error("DATANEST_EXPECTED_DB_MIGRATION_REFERENCE must contain non-empty head and name fields.");
}

const response=await fetch(
  supabaseUrl.replace(/\/$/,"")+"/rest/v1/rpc/get_datanest_release_attestation_v1",
  {
    method:"POST",
    headers:{
      apikey:publishableKey,
      Authorization:"Bearer "+publishableKey,
      Accept:"application/json",
      "Content-Type":"application/json"
    },
    body:"{}"
  }
);

let payload;
try{payload=await response.json();}catch{payload=null;}
if(!response.ok)throw new Error("Production database release attestation request failed with HTTP "+response.status+".");

const observed=payload&&typeof payload==="object"?payload:{};
const observedHead=String(observed.database_migration_head||"");
const observedName=String(observed.database_migration_name||"");
const expectedFingerprint=createHash("sha256").update(expectedHead+"\n"+expectedName).digest("hex");
const observedFingerprint=createHash("sha256").update(observedHead+"\n"+observedName).digest("hex");

if(
  String(observed.schema_version||"")!=="release-attestation-v1" ||
  String(observed.project||"")!=="Resonance DataNest" ||
  String(observed.supabase_project||"")!=="sgqdmfgjbprsoqsmgigi"
){
  throw new Error("Production database returned an unexpected release-attestation identity.");
}

if(expectedFingerprint!==observedFingerprint){
  throw new Error(
    "Production database migration head mismatch. Expected "+
    expectedHead+" / "+expectedName+" but observed "+
    observedHead+" / "+observedName+"."
  );
}

const attestation={
  schemaVersion:"release-attestation-v1",
  status:"verified",
  source:"live-production-database",
  verifiedAt:new Date().toISOString(),
  expected:{migrationHead:expectedHead,migrationName:expectedName},
  observed:{migrationHead:observedHead,migrationName:observedName},
  fingerprint:observedFingerprint
};

mkdirSync(dirname(target),{recursive:true});
writeFileSync(target,JSON.stringify(attestation)+"\n","utf8");
console.log("Verified production database release attestation:",observedHead,observedName);
