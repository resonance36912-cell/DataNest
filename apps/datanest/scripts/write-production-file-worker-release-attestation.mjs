import { createHash } from "node:crypto";
import { dirname, relative, resolve } from "node:path";
import { existsSync, readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";

const target=resolve(process.argv[2] || ".datanest/datanest-ai-file-worker-release.json");
const releaseSha=(process.env.DATANEST_RELEASE_SHA || "").trim();
const supabaseToken=(process.env.SUPABASE_ACCESS_TOKEN || "").trim();
const projectRef=(process.env.DATANEST_SUPABASE_PROJECT || "sgqdmfgjbprsoqsmgigi").trim();
const workflowRunId=Number(process.env.GITHUB_RUN_ID || 0);
const repository=(process.env.GITHUB_REPOSITORY || "").trim();
const functionSlug="datanest-ai-file-worker";

if(!/^[0-9a-f]{40}$/i.test(releaseSha))throw new Error("DATANEST_RELEASE_SHA must be an exact 40-character Git commit SHA.");
if(!supabaseToken)throw new Error("SUPABASE_ACCESS_TOKEN is required for file worker release attestation.");
if(!Number.isInteger(workflowRunId)||workflowRunId<=0)throw new Error("GITHUB_RUN_ID is required for file worker release attestation.");
if(!repository)throw new Error("GITHUB_REPOSITORY is required for file worker release attestation.");

function filesUnder(root){
  const output=[];
  function visit(current){
    for(const name of readdirSync(current).sort()){
      const path=resolve(current,name);
      const relativePath=relative(root,path).split("\\").join("/");
      const stat=statSync(path);
      if(stat.isDirectory())visit(path);
      else if(stat.isFile())output.push({path:relativePath,bytes:readFileSync(path)});
    }
  }
  visit(root);
  return output;
}

function sha256Tree(root){
  const hash=createHash("sha256");
  for(const file of filesUnder(root)){
    const pathBytes=Buffer.from(file.path,"utf8");
    hash.update(Buffer.from(String(pathBytes.byteLength)+":"));
    hash.update(pathBytes);
    hash.update(Buffer.from(":"));
    hash.update(file.bytes);
    hash.update(Buffer.from("\n"));
  }
  return hash.digest("hex");
}

const sourceRoot=resolve("supabase/functions");
if(!existsSync(sourceRoot))throw new Error("Supabase Edge Function source tree is missing.");
const sourceTreeSha256=sha256Tree(sourceRoot);

const response=await fetch(
  "https://api.supabase.com/v1/projects/"+encodeURIComponent(projectRef)+"/functions",
  {headers:{Authorization:"Bearer "+supabaseToken,Accept:"application/json"}}
);
let payload;
try{payload=await response.json();}catch{payload=null;}
if(!response.ok)throw new Error("Production Edge Function inventory request failed with HTTP "+response.status+".");

const observedFunctions=Array.isArray(payload)?payload:[];
const observed=observedFunctions.find(fn=>String(fn.slug||"")===functionSlug);
if(!observed)throw new Error("Production file worker is missing from the Edge Function inventory.");

const version=Number(observed.version);
const digest=String(observed.ezbr_sha256||"");
const status=String(observed.status||"");
const verifyJwt=Boolean(observed.verify_jwt);
if(status!=="ACTIVE")throw new Error("Production file worker is not ACTIVE.");
if(verifyJwt!==false)throw new Error("Production file worker must remain configured with verify_jwt=false.");
if(!Number.isInteger(version)||version<=0)throw new Error("Production file worker version is missing or invalid.");
if(!/^[0-9a-f]{64}$/i.test(digest))throw new Error("Production file worker digest is missing or invalid.");

const attestation={
  schemaVersion:"datanest-ai-file-worker-release-attestation-v1",
  status:"verified",
  source:"datanest-ai-file-worker-deploy",
  repository,
  project:projectRef,
  function:functionSlug,
  sourceCommit:releaseSha,
  workflowRunId,
  sourceTreeScope:"supabase/functions",
  sourceTreeSha256,
  deployment:{version,ezbr_sha256:digest,status,verify_jwt:verifyJwt},
  verifiedAt:new Date().toISOString()
};

mkdirSync(dirname(target),{recursive:true});
writeFileSync(target,JSON.stringify(attestation,null,2)+"\n","utf8");
console.log("Recorded DataNest file worker production release for",releaseSha);
