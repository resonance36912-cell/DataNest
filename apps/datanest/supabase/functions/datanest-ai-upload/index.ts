import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveDataNestAiStaging } from "../_shared/datanestAiStaging.ts";
import { FILE_BUCKET, isRetryableFileError, validateBatch } from "../_shared/datanestFileDomain.ts";

declare const Deno:{
  env:{get:(name:string)=>string|undefined};
  serve:(handler:(request:Request)=>Response|Promise<Response>)=>void;
};
declare const EdgeRuntime:{
  waitUntil:(promise:Promise<unknown>)=>void;
};

type AnyClient=SupabaseClient<any>;
type UploadDescriptor={name:string;size:number;type?:string|null;clientSha256?:string|null};

const TUS_ENDPOINT="https://qchttpcyqlqnhvahprhz.storage.supabase.co/storage/v1/upload/resumable";
const allowedOrigins=new Set([
  "https://datanest-supository.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4173",
  "http://localhost:4173"
]);

function cors(origin:string|null){
  const allow=origin&&allowedOrigins.has(origin)?origin:"https://datanest-supository.github.io";
  return {
    "Access-Control-Allow-Origin":allow,
    "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Vary":"Origin"
  };
}

function json(body:unknown,status=200,origin:string|null=null){
  return new Response(JSON.stringify(body),{
    status,
    headers:{...cors(origin),"Content-Type":"application/json","Cache-Control":"no-store"}
  });
}

function requireEnv(name:string){
  const value=Deno.env.get(name);
  if(!value)throw new Error(name+" is not configured.");
  return value;
}

function stagingConfig(supabaseUrl:string,serviceKey:string){
  return resolveDataNestAiStaging({
    supabaseUrl,
    serviceKey,
    configuredUrl:Deno.env.get("DATANEST_AI_STAGING_URL"),
    configuredKey:Deno.env.get("DATANEST_AI_STAGING_SERVICE_ROLE_KEY")
  });
}

function safeFileName(value:string){
  const cleaned=value.trim().replace(/[^A-Za-z0-9_.!&$@=;:+?(), '-]+/g,"_").replace(/\s+/g," ");
  return (cleaned||"upload").slice(0,180);
}

async function authorizeJob(userClient:AnyClient,jobId:string){
  const {data,error}=await userClient.rpc("authorize_datanest_ai_file_access",{target_job:jobId});
  if(error)throw new Error(error.message||"Explicit Job file access is required.");
  const payload=(data||{}) as Record<string,unknown>;
  if(payload.authorized!==true)throw new Error("Explicit Job file access is required.");
  return {
    projectId:String(payload.project_id||""),
    jobId:String(payload.job_id||jobId),
    userId:String(payload.user_id||"")
  };
}

async function loadSubmission(staging:AnyClient,submissionId:string,jobId:string){
  const {data,error}=await staging
    .from("ai_file_submissions")
    .select("id,trace_id,project_id,job_id,session_id,user_id,instruction,status,file_count,response_event_id,analysis_attempt_count,last_analysis_error_code,last_analysis_error_message,created_at,updated_at,completed_at")
    .eq("id",submissionId)
    .eq("job_id",jobId)
    .maybeSingle();
  if(error)throw error;
  if(!data)throw new Error("File submission not found for this Job.");
  return data as Record<string,unknown>;
}

async function loadItemWithSubmission(staging:AnyClient,itemId:string,jobId:string){
  const {data:item,error:itemError}=await staging
    .from("ai_file_submission_items")
    .select("*")
    .eq("id",itemId)
    .maybeSingle();
  if(itemError)throw itemError;
  if(!item)throw new Error("File item not found.");
  const submission=await loadSubmission(staging,String(item.submission_id),jobId);
  return {item:item as Record<string,unknown>,submission};
}

async function signedUpload(staging:AnyClient,path:string){
  const {data,error}=await staging.storage.from(FILE_BUCKET).createSignedUploadUrl(path,{upsert:false});
  if(error||!data?.token)throw error||new Error("Unable to create signed upload token.");
  return String(data.token);
}

async function objectExists(staging:AnyClient,path:string){
  const parts=path.split("/");
  const name=parts.pop()||"";
  const folder=parts.join("/");
  const {data,error}=await staging.storage.from(FILE_BUCKET).list(folder,{limit:100,search:name});
  if(error)throw error;
  return (data||[]).some(item=>item.name===name);
}

async function enqueue(staging:AnyClient,itemId:string){
  const {error}=await staging.rpc("service_enqueue_datanest_file_item",{
    target_queue:"datanest_file_ingestion",
    target_item:itemId
  });
  if(error)throw error;
}

function wakeFileWorker(stagingUrl:string,stagingKey:string){
  const endpoint=stagingUrl.replace(/\/$/,"")+"/functions/v1/datanest-ai-file-worker";
  EdgeRuntime.waitUntil(
    fetch(endpoint,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "x-datanest-worker-auth":stagingKey
      },
      body:JSON.stringify({action:"drain"})
    }).catch(()=>undefined)
  );
}

async function createSubmission(input:{
  body:Record<string,unknown>;
  userClient:AnyClient;
  serviceClient:AnyClient;
  staging:AnyClient;
  userId:string;
}){
  const jobId=String(input.body.jobId||"").trim();
  const sessionId=String(input.body.sessionId||"").trim();
  const clientRequestId=String(input.body.clientRequestId||"").trim();
  const instruction=String(input.body.instruction||"").trim()||null;
  const files=Array.isArray(input.body.files)?input.body.files as UploadDescriptor[]:[];
  if(!jobId||!sessionId||!clientRequestId)throw new Error("jobId, sessionId and clientRequestId are required.");
  const authorization=await authorizeJob(input.userClient,jobId);
  if(authorization.userId!==input.userId)throw new Error("Authenticated user mismatch.");
  validateBatch(files);

  const {data:session,error:sessionError}=await input.staging
    .from("ai_sessions")
    .select("id")
    .eq("id",sessionId)
    .eq("project_id",authorization.projectId)
    .eq("job_id",jobId)
    .eq("user_id",input.userId)
    .maybeSingle();
  if(sessionError)throw sessionError;
  if(!session)throw new Error("DataNest AI session does not belong to this user and Job.");

  const {data:existing,error:existingError}=await input.staging
    .from("ai_file_submissions")
    .select("id,trace_id,status,job_id,session_id,file_count")
    .eq("user_id",input.userId)
    .eq("client_request_id",clientRequestId)
    .maybeSingle();
  if(existingError)throw existingError;

  let submissionId=existing?String(existing.id):"";
  let traceId=existing?String(existing.trace_id):"";
  if(existing){
    if(String(existing.job_id)!==jobId||String(existing.session_id)!==sessionId||Number(existing.file_count)!==files.length){
      throw new Error("clientRequestId is already bound to a different file submission.");
    }
  }else{
    traceId="DN-FILE-"+crypto.randomUUID();

    const {data:learningPolicyData,error:learningPolicyError}=await input.serviceClient.rpc(
      "service_evaluate_data_policy_v1",{
        target_project:authorization.projectId,
        target_actor_user:input.userId,
        target_subject_type:"job",
        target_purpose:"project_learning",
        target_requested_operation:"reuse",
        target_trace_id:traceId,
        target_subject_id:jobId,
        target_subject_reference:null,
        target_provider_connection:null,
        target_provider_key:null,
        target_hard_learning_exclusion:false
      }
    );
    if(learningPolicyError)throw learningPolicyError;
    const learningPolicy=(learningPolicyData||{}) as Record<string,unknown>;
    const learningPolicyOutcome=String(learningPolicy.outcome||"review_required");
    const learningPolicyReasonCode=String(learningPolicy.reason_code||"policy_unresolved");
    const learningReuseState=String(learningPolicy.reuse_state||"runtime_only");
    const learningPolicyVersion=String(learningPolicy.policy_version||"unresolved");
    const learningDecisionRecordId=learningPolicy.decision_record_id
      ?String(learningPolicy.decision_record_id)
      :null;

    const {data:memory,error:memoryError}=await input.userClient.rpc("get_certified_memory_context",{
      target_project:authorization.projectId,
      target_job:jobId,
      target_limit:200
    });
    if(memoryError)throw memoryError;
    const memoryItems=Array.isArray((memory as Record<string,unknown>|null)?.items)
      ?(memory as {items:Array<Record<string,unknown>>}).items
      :[];
    const certifiedMemorySnapshot=memoryItems.map(item=>({
      id:String(item.id||""),
      normalized_knowledge:String(item.normalized_knowledge||""),
      category:item.category==null?null:String(item.category),
      content_hash:item.content_hash==null?null:String(item.content_hash),
      effective_version:Number(item.effective_version||0),
      certification_class:item.certification_class==null?null:String(item.certification_class),
      confidence:item.confidence==null?null:Number(item.confidence)
    })).filter(item=>item.id&&item.normalized_knowledge);
    const certifiedMemoryIds=certifiedMemorySnapshot.map(item=>item.id);

    const {data:frozenEvents,error:frozenEventsError}=await input.staging
      .from("ai_intake_events")
      .select("id")
      .eq("project_id",authorization.projectId)
      .eq("job_id",jobId)
      .eq("session_id",sessionId)
      .order("created_at",{ascending:true})
      .limit(100);
    if(frozenEventsError)throw frozenEventsError;
    const frozenSessionEventIds=(frozenEvents||[]).map(item=>String(item.id));

    const {data:created,error:createError}=await input.staging
      .from("ai_file_submissions")
      .insert({
        trace_id:traceId,
        project_id:authorization.projectId,
        job_id:jobId,
        session_id:sessionId,
        user_id:input.userId,
        client_request_id:clientRequestId,
        instruction,
        certified_memory_ids:certifiedMemoryIds,
        certified_memory_snapshot:certifiedMemorySnapshot,
        frozen_session_event_ids:frozenSessionEventIds,
        learning_policy_outcome:learningPolicyOutcome,
        learning_policy_reason_code:learningPolicyReasonCode,
        learning_reuse_state:learningReuseState,
        learning_policy_version:learningPolicyVersion,
        learning_decision_record_id:learningDecisionRecordId,
        status:"UPLOADING",
        file_count:files.length
      })
      .select("id")
      .single();
    if(createError||!created)throw createError||new Error("Unable to create file submission.");
    submissionId=String(created.id);

    const rows=files.map((file,index)=>({
      submission_id:submissionId,
      trace_id:traceId+"-F"+String(index+1).padStart(2,"0"),
      client_index:index,
      original_name:file.name,
      declared_mime:file.type||null,
      byte_size:file.size,
      client_sha256:String(file.clientSha256||"")||null,
      status:"UPLOADING"
    }));
    const {error:itemError}=await input.staging.from("ai_file_submission_items").insert(rows);
    if(itemError)throw itemError;
  }

  const {data:items,error:itemsError}=await input.staging
    .from("ai_file_submission_items")
    .select("id,trace_id,client_index,original_name,status,storage_object_path")
    .eq("submission_id",submissionId)
    .order("client_index",{ascending:true});
  if(itemsError)throw itemsError;

  const slots=[];
  for(const item of items||[]){
    let path=String(item.storage_object_path||"");
    if(!path){
      path="incoming/"+submissionId+"/"+String(item.id)+"/"+safeFileName(String(item.original_name));
      const {error:updateError}=await input.staging
        .from("ai_file_submission_items")
        .update({storage_object_path:path,updated_at:new Date().toISOString()})
        .eq("id",item.id);
      if(updateError)throw updateError;
    }
    const token=String(item.status)==="UPLOADING"?await signedUpload(input.staging,path):null;
    slots.push({
      itemId:String(item.id),
      traceId:String(item.trace_id),
      clientIndex:Number(item.client_index),
      path,
      token,
      status:String(item.status)
    });
  }

  return {submissionId,traceId,jobId,sessionId,tusEndpoint:TUS_ENDPOINT,items:slots,trustState:"UNCERTIFIED"};
}

Deno.serve(async(request:Request)=>{
  const origin=request.headers.get("Origin");
  if(request.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
  if(request.method!=="POST")return json({error:"Method not allowed."},405,origin);

  try{
    const authorizationHeader=request.headers.get("Authorization");
    if(!authorizationHeader)return json({error:"Authentication is required."},401,origin);
    const supabaseUrl=requireEnv("SUPABASE_URL");
    const anonKey=requireEnv("SUPABASE_ANON_KEY");
    const serviceKey=requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const stagingEnv=stagingConfig(supabaseUrl,serviceKey);
    const userClient=createClient(supabaseUrl,anonKey,{
      global:{headers:{Authorization:authorizationHeader}},
      auth:{persistSession:false,autoRefreshToken:false}
    });
    const serviceClient=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const staging=createClient(stagingEnv.url,stagingEnv.key,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:userData,error:userError}=await userClient.auth.getUser();
    if(userError||!userData.user)return json({error:"Authentication is required."},401,origin);
    const userId=userData.user.id;
    const body=await request.json().catch(()=>({})) as Record<string,unknown>;
    const action=String(body.action||"");

    if(action==="create_submission"){
      return json(await createSubmission({body,userClient,serviceClient,staging,userId}),200,origin);
    }

    const jobId=String(body.jobId||"").trim();
    if(!jobId)return json({error:"jobId is required."},400,origin);
    await authorizeJob(userClient,jobId);

    if(action==="finalize_item"){
      const itemId=String(body.itemId||"").trim();
      if(!itemId)return json({error:"itemId is required."},400,origin);
      const {item}=await loadItemWithSubmission(staging,itemId,jobId);
      if(String(item.status)!=="UPLOADING")return json({itemId,status:String(item.status),idempotent:true},200,origin);
      const path=String(item.storage_object_path||"");
      if(!path.startsWith("incoming/")||!(await objectExists(staging,path))){
        return json({error:"Uploaded object could not be verified."},409,origin);
      }
      const {error:updateError}=await staging
        .from("ai_file_submission_items")
        .update({status:"QUEUED",updated_at:new Date().toISOString()})
        .eq("id",itemId)
        .eq("status","UPLOADING");
      if(updateError)throw updateError;
      let wakeQueued=true;
      try{
        await enqueue(staging,itemId);
        wakeFileWorker(stagingEnv.url,stagingEnv.key);
      }catch{
        wakeQueued=false;
      }
      return json({itemId,status:"QUEUED",wakeQueued},200,origin);
    }

    if(action==="status"){
      const submissionId=String(body.submissionId||"").trim();
      if(!submissionId)return json({error:"submissionId is required."},400,origin);
      const submission=await loadSubmission(staging,submissionId,jobId);
      const {data:items,error:itemsError}=await staging
        .from("ai_file_submission_items")
        .select("id,trace_id,client_index,original_name,declared_mime,detected_mime,byte_size,verified_sha256,status,attempt_count,last_error_code,last_error_message,extraction_method,extraction_version,created_at,updated_at,completed_at")
        .eq("submission_id",submissionId)
        .order("client_index",{ascending:true});
      if(itemsError)throw itemsError;
      return json({submission,items:items||[]},200,origin);
    }

    if(action==="retry_item"){
      const itemId=String(body.itemId||"").trim();
      if(!itemId)return json({error:"itemId is required."},400,origin);
      const {item}=await loadItemWithSubmission(staging,itemId,jobId);
      if(String(item.status)!=="FAILED")return json({error:"Only failed file items can be retried."},409,origin);
      if(!isRetryableFileError(String(item.last_error_code||""))){
        return json({error:"This file failure is deterministic and cannot be retried."},409,origin);
      }
      const {error:updateError}=await staging
        .from("ai_file_submission_items")
        .update({status:"QUEUED",last_error_code:null,last_error_message:null,updated_at:new Date().toISOString()})
        .eq("id",itemId)
        .eq("status","FAILED");
      if(updateError)throw updateError;
      await enqueue(staging,itemId);
      wakeFileWorker(stagingEnv.url,stagingEnv.key);
      return json({itemId,status:"QUEUED"},200,origin);
    }

    if(action==="source_link"){
      const itemId=String(body.itemId||"").trim();
      if(!itemId)return json({error:"itemId is required."},400,origin);
      const {item}=await loadItemWithSubmission(staging,itemId,jobId);
      const path=String(item.storage_object_path||"");
      const hash=String(item.verified_sha256||"");
      const canonical=/^[a-f0-9]{64}$/.test(hash)
        ?"sha256/"+hash.slice(0,2)+"/"+hash.slice(2,4)+"/"+hash
        :"";
      if(!canonical||path!==canonical)return json({error:"Verified canonical source is not available yet."},409,origin);
      const {data,error}=await staging.storage.from(FILE_BUCKET).createSignedUrl(path,60);
      if(error||!data?.signedUrl)throw error||new Error("Unable to create governed source link.");
      return json({itemId,signedUrl:data.signedUrl,expiresIn:60},200,origin);
    }

    return json({error:"Unsupported action."},400,origin);
  }catch(error){
    const message=error instanceof Error?error.message:"DataNest AI upload request failed.";
    const status=/access|required|authorized|ownership/i.test(message)?403:400;
    return json({error:message},status,origin);
  }
});
