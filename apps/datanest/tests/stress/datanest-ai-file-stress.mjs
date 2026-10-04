import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const url=process.env.DATANEST_CERTIFICATION_URL;
const publishableKey=process.env.DATANEST_CERTIFICATION_PUBLISHABLE_KEY;
const serviceKey=process.env.DATANEST_CERTIFICATION_SERVICE_ROLE_KEY;
const stagingUrl=process.env.DATANEST_AI_STAGING_URL;
const stagingServiceKey=process.env.DATANEST_AI_STAGING_SERVICE_ROLE_KEY;
const email=process.env.DATANEST_AI_E2E_EMAIL;
const password=process.env.DATANEST_AI_E2E_PASSWORD;

if(!url||!publishableKey||!serviceKey||!stagingUrl||!stagingServiceKey||!email||!password){
  throw new Error("Canonical certification URL/keys, staging service credentials, and E2E credentials are required.");
}

const client=createClient(url,publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
const admin=createClient(stagingUrl,stagingServiceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const signed=await client.auth.signInWithPassword({email,password});
if(signed.error||!signed.data.user)throw signed.error||new Error("E2E sign-in failed.");
const userId=signed.data.user.id;

const projectResult=await client.from("projects").select("id").eq("slug","resonance-datanest").single();
if(projectResult.error)throw projectResult.error;
const projectId=projectResult.data.id;

const jobResult=await client.from("jobs")
  .select("id")
  .eq("project_id",projectId)
  .eq("title","DataNest AI E2E Job")
  .single();
if(jobResult.error)throw jobResult.error;
const jobId=jobResult.data.id;

const context=await client.functions.invoke("datanest-ai-chat",{body:{action:"context",jobId,sessionId:null}});
if(context.error||!context.data?.sessionId)throw context.error||new Error("E2E session unavailable.");
const sessionId=context.data.sessionId;

async function ensureStagingUser(){
  let page=1;
  while(page<=20){
    const listed=await admin.auth.admin.listUsers({page,perPage:100});
    if(listed.error)throw listed.error;
    const existing=listed.data.users.find(item=>item.email===email);
    if(existing){
      const updated=await admin.auth.admin.updateUserById(existing.id,{
        password,
        email_confirm:true
      });
      if(updated.error)throw updated.error;
      return updated.data.user;
    }
    if(listed.data.users.length<100)break;
    page++;
  }

  const created=await admin.auth.admin.createUser({
    email,
    password,
    email_confirm:true
  });
  if(created.error)throw created.error;
  return created.data.user;
}

async function ensureStagingProject(){
  const existing=await admin.from("projects")
    .select("id")
    .eq("slug","resonance-datanest")
    .maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data)return existing.data;

  const inserted=await admin.from("projects").insert({
    slug:"resonance-datanest",
    name:"Resonance DataNest",
    description:"Governed staging data-plane fixture for DataNest AI certification.",
    status:"ACTIVE"
  }).select("id").single();
  if(inserted.error)throw inserted.error;
  return inserted.data;
}

async function ensureStagingJob(stagingProjectId){
  const existing=await admin.from("jobs")
    .select("id")
    .eq("project_id",stagingProjectId)
    .eq("title","DataNest AI E2E Job")
    .maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data)return existing.data;

  const inserted=await admin.from("jobs").insert({
    project_id:stagingProjectId,
    title:"DataNest AI E2E Job",
    description:"Deterministic staging data-plane fixture for governed DataNest AI file-worker acceptance.",
    priority:70,
    status:"READY",
    required_capabilities:["chat"],
    requirements:{environment:"staging-data-plane"},
    acceptance:{traceable:true,uncertified_session:true}
  }).select("id").single();
  if(inserted.error)throw inserted.error;
  return inserted.data;
}

const stagingUser=await ensureStagingUser();
const stagingProject=await ensureStagingProject();
const stagingJob=await ensureStagingJob(stagingProject.id);

if(stagingUser.id===userId){
  throw new Error("Canonical and staging Auth identities unexpectedly share a UUID.");
}
if(stagingProject.id===projectId){
  throw new Error("Canonical and staging project identities unexpectedly share a UUID.");
}
if(stagingJob.id===jobId){
  throw new Error("Canonical and staging job identities unexpectedly share a UUID.");
}

const stagingSessionInsert=await admin.from("ai_sessions").insert({
  project_id:stagingProject.id,
  job_id:stagingJob.id,
  user_id:stagingUser.id,
  client_session_id:crypto.randomUUID(),
  status:"active"
}).select("id").single();
if(stagingSessionInsert.error)throw stagingSessionInsert.error;
const stagingSessionId=stagingSessionInsert.data.id;

const marker="file-worker-stress-"+Date.now()+"-"+crypto.randomUUID().slice(0,8);
const duplicate=Buffer.from(marker+" duplicate payload ".repeat(16),"utf8");
const payloads=[
  duplicate,
  duplicate,
  ...Array.from({length:4},(_,index)=>Buffer.from(marker+" unique "+index+" ".repeat(32),"utf8"))
];

let submissionId=null;
let artifactIds=[];
let canonicalPaths=[];

try{
  const submission=await admin.from("ai_file_submissions").insert({
    trace_id:"DN-FILE-STRESS-"+marker,
    project_id:stagingProject.id,
    job_id:stagingJob.id,
    session_id:stagingSessionId,
    user_id:stagingUser.id,
    client_request_id:crypto.randomUUID(),
    instruction:"Worker durability stress fixture.",
    status:"UPLOADING",
    file_count:payloads.length
  }).select("id").single();
  if(submission.error)throw submission.error;

  submissionId=submission.data.id;

  for(let index=0;index<payloads.length;index++){
    const item=await admin.from("ai_file_submission_items").insert({
      submission_id:submissionId,
      trace_id:"DN-FILE-STRESS-"+marker+"-F"+String(index+1).padStart(2,"0"),
      client_index:index,
      original_name:"fixture-"+index+".txt",
      declared_mime:"text/plain",
      byte_size:payloads[index].byteLength,
      client_sha256:"0".repeat(64),
      status:"UPLOADING"
    }).select("id").single();
    if(item.error)throw item.error;

    const tempPath="incoming/"+submissionId+"/"+item.data.id+"/fixture-"+index+".txt";
    const uploaded=await admin.storage.from("datanest-ai-staging-files")
      .upload(tempPath,payloads[index],{contentType:"text/plain",upsert:false});
    if(uploaded.error)throw uploaded.error;

    const updated=await admin.from("ai_file_submission_items")
      .update({storage_object_path:tempPath,status:"QUEUED"})
      .eq("id",item.data.id);
    if(updated.error)throw updated.error;

    const queued=await admin.rpc("service_enqueue_datanest_file_item",{
      target_queue:"datanest_file_ingestion",
      target_item:item.data.id
    });
    if(queued.error)throw queued.error;
  }

  for(let pass=0;pass<3;pass++){
    const response=await fetch(stagingUrl.replace(/\/$/,"")+"/functions/v1/datanest-ai-file-worker",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "x-datanest-worker-auth":stagingServiceKey
      },
      body:JSON.stringify({action:"drain"})
    });
    if(!response.ok)throw new Error("Worker drain failed: "+await response.text());
  }

  const items=await admin.from("ai_file_submission_items")
    .select("id,trace_id,status,verified_sha256,client_hash_matches,storage_object_path,artifact_id")
    .eq("submission_id",submissionId)
    .order("client_index",{ascending:true});
  if(items.error)throw items.error;
  if(items.data.some(item=>item.status!=="READY")){
    throw new Error("Expected every worker stress item to be READY.");
  }
  if(items.data.some(item=>item.client_hash_matches!==false)){
    throw new Error("Server digest did not override the deliberately wrong client digest.");
  }
  if(items.data[0].verified_sha256!==items.data[1].verified_sha256){
    throw new Error("Duplicate bytes did not converge on one server SHA-256.");
  }
  if(items.data[0].artifact_id!==items.data[1].artifact_id){
    throw new Error("Duplicate bytes did not reuse the same normalized artifact.");
  }
  if(items.data[0].trace_id===items.data[1].trace_id){
    throw new Error("Duplicate bytes lost distinct logical submission traces.");
  }

  artifactIds=[...new Set(items.data.map(item=>item.artifact_id).filter(Boolean))];
  canonicalPaths=[...new Set(items.data.map(item=>item.storage_object_path).filter(Boolean))];

  const chunkCountBefore=await admin.from("datanest_chunks")
    .select("id",{count:"exact",head:true})
    .in("artifact_id",artifactIds);
  if(chunkCountBefore.error)throw chunkCountBefore.error;

  const redelivery=await admin.rpc("service_enqueue_datanest_file_item",{
    target_queue:"datanest_file_ingestion",
    target_item:items.data[0].id
  });
  if(redelivery.error)throw redelivery.error;

  const redeliveryResponse=await fetch(stagingUrl.replace(/\/$/,"")+"/functions/v1/datanest-ai-file-worker",{
    method:"POST",
    headers:{"Content-Type":"application/json","x-datanest-worker-auth":stagingServiceKey},
    body:JSON.stringify({action:"drain"})
  });
  if(!redeliveryResponse.ok)throw new Error("READY redelivery drain failed.");

  const chunkCountAfter=await admin.from("datanest_chunks")
    .select("id",{count:"exact",head:true})
    .in("artifact_id",artifactIds);
  if(chunkCountAfter.error)throw chunkCountAfter.error;
  if(chunkCountAfter.count!==chunkCountBefore.count){
    throw new Error("READY redelivery duplicated normalized chunks.");
  }

  console.log(JSON.stringify({
    marker,
    canonicalProjectId:projectId,
    stagingProjectId:stagingProject.id,
    canonicalJobId:jobId,
    stagingJobId:stagingJob.id,
    canonicalUserId:userId,
    stagingUserId:stagingUser.id,
    canonicalSessionId:sessionId,
    stagingSessionId,
    logicalItems:items.data.length,
    duplicatePhysicalHash:items.data[0].verified_sha256,
    duplicateArtifactReused:true,
    distinctLogicalTraces:true,
    clientHashOverriddenByServer:true,
    readyRedeliveryChunkDelta:0
  }));
}finally{
  if(submissionId)await admin.from("ai_file_submissions").delete().eq("id",submissionId);
  if(artifactIds.length)await admin.from("datanest_artifacts").delete().in("id",artifactIds);
  if(canonicalPaths.length)await admin.storage.from("datanest-ai-staging-files").remove(canonicalPaths);
  await admin.from("ai_sessions").delete().eq("id",stagingSessionId);
}
