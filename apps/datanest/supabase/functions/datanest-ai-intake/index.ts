import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveDataNestAiStaging } from "../_shared/datanestAiStaging.ts";
import { sha256Text } from "../_shared/datanestAiRuntime.ts";
import { replayContentMatches } from "../_shared/datanestAiContinuity.ts";
import { buildEvidenceLanguageMetadata } from "../_shared/datanestLanguageMetadata.ts";
import {
  canonicalDerivationKind,
  type EvidenceDerivationKind
} from "../_shared/datanestEvidenceDerivation.ts";
import { selectLatestAuthorizedSessionId } from "../_shared/datanestAiSessionSelection.ts";

declare const Deno:{
  env:{get:(name:string)=>string|undefined};
  serve:(handler:(request:Request)=>Response|Promise<Response>)=>void;
};

const allowedOrigins=new Set([
  "https://datanest-supository.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4173",
  "http://localhost:4173"
]);
type AnyClient=SupabaseClient<any>;

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
  if(!value)throw new Error(`${name} is not configured.`);
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
type EvidenceDerivationRequest={
  parentEventId:string;
  kind:EvidenceDerivationKind;
  transformationVersion:string;
};

function evidenceDerivationRequest(body:Record<string,unknown>):EvidenceDerivationRequest|null{
  const keys=["derivedFromEventId","derivationKind","transformationVersion"];
  const supplied=keys.filter(key=>Object.prototype.hasOwnProperty.call(body,key));
  if(!supplied.length)return null;
  if(supplied.length!==keys.length){
    throw new Error("derivedFromEventId, derivationKind and transformationVersion must be supplied together.");
  }
  const parentEventId=String(body.derivedFromEventId||"").trim();
  const transformationVersion=String(body.transformationVersion||"").trim();
  if(!parentEventId||!transformationVersion){
    throw new Error("Evidence derivation lineage requires a parent event and transformation version.");
  }
  return {
    parentEventId,
    kind:canonicalDerivationKind(body.derivationKind),
    transformationVersion:transformationVersion.slice(0,200)
  };
}

async function ensureEvidenceDerivation(input:{
  staging:AnyClient;
  projectId:string;
  childEventId:string;
  request:EvidenceDerivationRequest|null;
  createdBy:string;
}):Promise<{id:string;rootEventId:string}|null>{
  if(!input.request)return null;
  if(input.childEventId===input.request.parentEventId){
    throw new Error("Derived evidence cannot reference itself as its source.");
  }

  const {data:parent,error:parentError}=await input.staging
    .from("ai_intake_events")
    .select("id,project_id")
    .eq("id",input.request.parentEventId)
    .eq("project_id",input.projectId)
    .maybeSingle();
  if(parentError)throw parentError;
  if(!parent)throw new Error("Derived evidence source event was not found in this project.");

  const {data:parentLineage,error:parentLineageError}=await input.staging
    .from("ai_evidence_derivations")
    .select("root_event_id")
    .eq("project_id",input.projectId)
    .eq("child_event_id",input.request.parentEventId)
    .maybeSingle();
  if(parentLineageError)throw parentLineageError;
  const rootEventId=String(parentLineage?.root_event_id||parent.id);
  if(rootEventId===input.childEventId){
    throw new Error("Evidence derivation lineage cannot form a cycle.");
  }

  const {data:existing,error:existingError}=await input.staging
    .from("ai_evidence_derivations")
    .select("id,parent_event_id,root_event_id,derivation_kind,transformation_version")
    .eq("project_id",input.projectId)
    .eq("child_event_id",input.childEventId)
    .maybeSingle();
  if(existingError)throw existingError;
  if(existing){
    const same=
      String(existing.parent_event_id)===input.request.parentEventId &&
      String(existing.root_event_id)===rootEventId &&
      String(existing.derivation_kind)===input.request.kind &&
      String(existing.transformation_version)===input.request.transformationVersion;
    if(!same){
      throw new Error("This evidence event is already bound to different immutable derivation lineage.");
    }
    return {id:String(existing.id),rootEventId};
  }

  const {data:created,error:createError}=await input.staging
    .from("ai_evidence_derivations")
    .insert({
      project_id:input.projectId,
      child_event_id:input.childEventId,
      parent_event_id:input.request.parentEventId,
      root_event_id:rootEventId,
      derivation_kind:input.request.kind,
      transformation_version:input.request.transformationVersion,
      created_by:input.createdBy
    })
    .select("id,root_event_id")
    .single();
  if(createError||!created){
    throw createError||new Error("Unable to preserve evidence derivation lineage.");
  }
  return {id:String(created.id),rootEventId:String(created.root_event_id)};
}
async function ensureCompanionSession(input:{
  staging:AnyClient;
  projectId:string;
  jobId:string;
  userId:string;
  externalSessionId:string;
  preferredSessionId:string|null;
}){
  if(input.preferredSessionId){
    const {data,error}=await input.staging
      .from("ai_sessions")
      .select("id,project_id,job_id,user_id")
      .eq("id",input.preferredSessionId)
      .eq("project_id",input.projectId)
      .eq("job_id",input.jobId)
      .eq("user_id",input.userId)
      .maybeSingle();
    if(error)throw error;
    if(!data){
      throw new Error("Active DataNest AI session does not match the authorized user and Job.");
    }
    return {id:String(data.id)};
  }

  // The sidebar can be one render behind the main DataNest AI workspace when
  // the user opens an external companion immediately after selecting a Job.
  // Prefer the latest populated DataNest AI session for this Job/user instead
  // of creating an orphan companion-only session.
  const {data:recentEvents,error:recentEventsError}=await input.staging
    .from("ai_intake_events")
    .select("session_id,created_at")
    .eq("project_id",input.projectId)
    .eq("job_id",input.jobId)
    .in("source_type",["human","datanest_ai"])
    .order("created_at",{ascending:false})
    .limit(25);
  if(recentEventsError)throw recentEventsError;

  const candidateSessionIds=[...new Set(
    (recentEvents||[])
      .map(row=>String(row.session_id||""))
      .filter(Boolean)
  )];
  if(candidateSessionIds.length){
    const {data:candidateSessions,error:candidateSessionsError}=await input.staging
      .from("ai_sessions")
      .select("id,project_id,job_id,user_id")
      .in("id",candidateSessionIds)
      .eq("project_id",input.projectId)
      .eq("job_id",input.jobId)
      .eq("user_id",input.userId);
    if(candidateSessionsError)throw candidateSessionsError;

    const allowedSessionIds=new Set((candidateSessions||[]).map(row=>String(row.id)));
    const latestPopulatedSessionId=selectLatestAuthorizedSessionId(
      (recentEvents||[]).map(row=>({
        session_id:row.session_id?String(row.session_id):null,
        created_at:String(row.created_at||"")
      })),
      allowedSessionIds
    );
    if(latestPopulatedSessionId){
      return {id:latestPopulatedSessionId};
    }
  }

  const {data,error}=await input.staging
    .from("ai_sessions")
    .upsert({
      project_id:input.projectId,
      job_id:input.jobId,
      user_id:input.userId,
      client_session_id:input.externalSessionId
    },{onConflict:"user_id,client_session_id"})
    .select("id,project_id,job_id,user_id")
    .single();
  if(error||!data)throw error||new Error("Unable to create external AI staging session.");
  if(
    String(data.project_id)!==input.projectId ||
    String(data.job_id)!==input.jobId ||
    String(data.user_id)!==input.userId
  ){
    throw new Error("Existing external AI staging session does not match the authorized Job.");
  }
  return {id:String(data.id)};
}

Deno.serve(async(request:Request)=>{
  const origin=request.headers.get("Origin");
  if(request.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
  if(request.method!=="POST")return json({error:"Method not allowed."},405,origin);

  try{
    const authorization=request.headers.get("Authorization");
    if(!authorization)return json({error:"Authentication is required."},401,origin);

    const supabaseUrl=requireEnv("SUPABASE_URL");
    const anonKey=requireEnv("SUPABASE_ANON_KEY");
    const serviceKey=requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const stagingEnv=stagingConfig(supabaseUrl,serviceKey);
    const userClient=createClient(supabaseUrl,anonKey,{
      global:{headers:{Authorization:authorization}},
      auth:{persistSession:false,autoRefreshToken:false}
    });
    const staging=createClient(stagingEnv.url,stagingEnv.key,{
      auth:{persistSession:false,autoRefreshToken:false}
    });
    const serviceClient=createClient(supabaseUrl,serviceKey,{
      auth:{persistSession:false,autoRefreshToken:false}
    });

    const {data:userData,error:userError}=await userClient.auth.getUser();
    if(userError||!userData.user)return json({error:"Authentication is required."},401,origin);
    const user=userData.user;

    const body=await request.json().catch(()=>({})) as Record<string,unknown>;
    if(String(body.sourceType||"")!=="ai_companion"){
      return json({error:"sourceType must be ai_companion."},400,origin);
    }
    const externalAiSessionId=String(body.externalAiSessionId||"");
    const datanestAiSessionId=String(body.datanestAiSessionId||"").trim();
    const content=String(body.content||"").trim();
    const derivationRequest=evidenceDerivationRequest(body);
    if(!externalAiSessionId||!content){
      return json({error:"externalAiSessionId and content are required."},400,origin);
    }
    const sourceLanguageProvided=Object.prototype.hasOwnProperty.call(body,"sourceLanguage");
    const sourceLanguageMetadata=buildEvidenceLanguageMetadata({
      content,
      declaredLanguageProvided:sourceLanguageProvided,
      declaredLanguage:body.sourceLanguage,
      declaredBasis:"user_declared_for_external_evidence"
    });

    const {data:session,error:sessionError}=await userClient
      .from("external_ai_sessions")
      .select("id,project_id,job_id,user_id,provider,status,context_snapshot,staging_event_id,staging_trace_id")
      .eq("id",externalAiSessionId)
      .single();
    if(sessionError||!session)return json({error:"External AI session not found."},404,origin);
    if(String(session.user_id)!==user.id){
      return json({error:"External AI session ownership is required."},403,origin);
    }

    const {data:job,error:jobError}=await userClient
      .from("jobs")
      .select("id,project_id")
      .eq("id",session.job_id)
      .eq("project_id",session.project_id)
      .single();
    if(jobError||!job)return json({error:"Job collaboration access is required."},403,origin);

    const contentHash=await sha256Text(content);
    const traceKey=String(
      (session.context_snapshot as Record<string,unknown>|null)?.trace_key||""
    )||"DN-AI-"+crypto.randomUUID();

    let learningPolicy:Record<string,unknown>={
      outcome:"review_required",
      reason_code:"policy_evaluation_unavailable",
      reuse_state:"runtime_only",
      policy_version:"unresolved",
      decision_record_id:null
    };
    const {data:learningPolicyData,error:learningPolicyError}=await serviceClient.rpc(
      "service_evaluate_data_policy_v1",{
        target_project:String(session.project_id),
        target_actor_user:user.id,
        target_subject_type:"job",
        target_purpose:"project_learning",
        target_requested_operation:"reuse",
        target_trace_id:traceKey,
        target_subject_id:String(session.job_id),
        target_subject_reference:null,
        target_provider_connection:null,
        target_provider_key:null,
        target_hard_learning_exclusion:false
      }
    );
    if(!learningPolicyError&&learningPolicyData){
      learningPolicy=learningPolicyData as Record<string,unknown>;
    }
    const learningEligible=String(learningPolicy.outcome||"deny")==="allow";
    const policyMetadata=(base:Record<string,unknown>)=>({
      ...base,
      learning_eligible:learningEligible,
      decision_record_id:learningPolicy.decision_record_id,
      effective_reuse_state:learningPolicy.reuse_state,
      policy_version:learningPolicy.policy_version,
      policy_reason_code:learningPolicy.reason_code
    });

    if(session.staging_event_id){
      const {data:linkedEvent,error:linkedEventError}=await staging
        .from("ai_intake_events")
        .select("id,trace_id,content_hash,session_id,external_ai_session_id,metadata")
        .eq("id",String(session.staging_event_id))
        .maybeSingle();
      if(linkedEventError)throw linkedEventError;
      if(!linkedEvent||String(linkedEvent.external_ai_session_id)!==String(session.id)){
        return json({error:"The linked external AI evidence could not be verified."},409,origin);
      }
      if(!replayContentMatches(String(linkedEvent.content_hash||""),contentHash)){
        return json({error:"This external AI session is already staged with different content."},409,origin);
      }
      if(
        sourceLanguageProvided &&
        String((linkedEvent.metadata as Record<string,unknown>|null)?.source_language||"")!==
          String(sourceLanguageMetadata.source_language||"")
      ){
        return json({error:"This external AI evidence is already staged with different language metadata."},409,origin);
      }
      const derivationLineage=await ensureEvidenceDerivation({
        staging,
        projectId:String(session.project_id),
        childEventId:String(linkedEvent.id),
        request:derivationRequest,
        createdBy:user.id
      });
      return json({
        eventId:String(linkedEvent.id),
        traceId:String(linkedEvent.trace_id||session.staging_trace_id||""),
        sessionId:String(linkedEvent.session_id||""),
        jobId:String(session.job_id),
        trustState:"UNCERTIFIED",
        derivationLineage,
        idempotent:true
      },200,origin);
    }

    const stagingSession=await ensureCompanionSession({
      staging,
      projectId:String(session.project_id),
      jobId:String(session.job_id),
      userId:user.id,
      externalSessionId:String(session.id),
      preferredSessionId:datanestAiSessionId||null
    });

    const {data:existing,error:existingError}=await staging
      .from("ai_intake_events")
      .select("id,trace_id,content_hash,session_id,metadata")
      .eq("source_type","ai_companion")
      .eq("external_ai_session_id",String(session.id))
      .limit(1)
      .maybeSingle();
    if(existingError)throw existingError;

    let staged=existing as Record<string,unknown>|null;
    if(staged&&!replayContentMatches(String(staged.content_hash||""),contentHash)){
      return json({error:"This external AI session is already staged with different content."},409,origin);
    }
    if(
      staged &&
      sourceLanguageProvided &&
      String((staged.metadata as Record<string,unknown>|null)?.source_language||"")!==
        String(sourceLanguageMetadata.source_language||"")
    ){
      return json({error:"This external AI evidence is already staged with different language metadata."},409,origin);
    }

    if(!staged){
      const {data:created,error:createError}=await staging
        .from("ai_intake_events")
        .insert({
          trace_id:traceKey,
          project_id:String(session.project_id),
          job_id:String(session.job_id),
          session_id:stagingSession.id,
          source_type:"ai_companion",
          source_user_id:user.id,
          source_provider:String(session.provider),
          external_ai_session_id:String(session.id),
          content,
          content_hash:contentHash,
          metadata:policyMetadata({
            ...sourceLanguageMetadata,
            trace_key:traceKey,
            trust_state:"uncertified",
            source:"external_ai_companion",
            ...(derivationRequest?{
              derived_from_event_id:derivationRequest.parentEventId,
              derivation_kind:derivationRequest.kind,
              transformation_version:derivationRequest.transformationVersion
            }:{})
          })
        })
        .select("id,trace_id,content_hash,session_id")
        .single();
      if(createError||!created)throw createError||new Error("Unable to stage external AI evidence.");
      staged=created as Record<string,unknown>;
    }

    const derivationLineage=await ensureEvidenceDerivation({
      staging,
      projectId:String(session.project_id),
      childEventId:String(staged.id),
      request:derivationRequest,
      createdBy:user.id
    });

    const {data:linked,error:linkError}=await userClient.rpc(
      "mark_external_ai_session_staged",{
        target_session:String(session.id),
        target_staging_event:String(staged.id),
        target_trace_id:String(staged.trace_id)
      }
    );
    if(linkError)throw linkError;

    return json({
      eventId:String(staged.id),
      traceId:String(staged.trace_id),
      sessionId:String(staged.session_id||stagingSession.id),
      jobId:String(session.job_id),
      trustState:"UNCERTIFIED",
      derivationLineage,
      idempotent:Boolean((linked as Record<string,unknown>|null)?.idempotent)
    },200,origin);
  }catch(error){
    const message=error instanceof Error?error.message:"Unable to stage external AI evidence.";
    return json({error:message},400,origin);
  }
});
