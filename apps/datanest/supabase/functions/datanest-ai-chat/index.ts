import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveDataNestAiStaging } from "../_shared/datanestAiStaging.ts";
import {
  buildGovernedPrompt,
  executeChatTurn,
  filterCurrentSessionEvidence,
  sha256Text
} from "../_shared/datanestAiRuntime.ts";
import {
  callOpenAiCompatibleProvider,
  type ProviderConnection
} from "../_shared/provider.ts";
import {
  resolveIlm1Route,
  type Ilm1RouteResult,
  type IlmProfile
} from "../_shared/ilm.ts";
import { chronologicalFromNewestFirst } from "../_shared/datanestAiContinuity.ts";
import { buildEvidenceLanguageMetadata } from "../_shared/datanestLanguageMetadata.ts";
import { updateTrendCandidate } from "../_shared/datanestAiLearning.ts";
import {
  buildDevelopmentCommandPrompt,
  buildLegalEaglePrompt,
  formatDualAdvocacyResponse,
  parseCompleteDualAdvocacyResponse,
  parseDualAdvocacyResponse,
  type DualAdvocacyResponse
} from "../_shared/dualAdvocacy.ts";

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
const policyVersion="datanest-ai-governed-memory-v2";
const visibilityClasses=new Set([
  "public","nest_private","project_restricted","organization_restricted","high_sensitivity","local_only"
]);
const rawReuseStates=new Set([
  "runtime_only","session_context","project_learning_eligible"
]);
type DevelopmentWorkExpertiseKey=
  "ui_ux"|"frontend"|"backend"|"data"|"ai"|"testing"|"security"|"infrastructure"|"documentation"|"product_planning";
type WorkFocusKey=
  "ui_ux"|"database_architecture"|"workflow_functionality"|"cost_saving"|"brand_promotion"|"user_acquisition"|"datanest_ai_learning"|"governance_process"|"security_testing"|"documentation_mentoring";
const workFocusKeySet=new Set<WorkFocusKey>([
  "ui_ux","database_architecture","workflow_functionality","cost_saving","brand_promotion","user_acquisition","datanest_ai_learning","governance_process","security_testing","documentation_mentoring"
]);
type DevelopmentWorkExpertiseRoute={label:string;verificationTrack:DevelopmentWorkExpertiseKey;requirementFocusKeys:readonly WorkFocusKey[]};
const developmentWorkExpertise=new Map<DevelopmentWorkExpertiseKey,DevelopmentWorkExpertiseRoute>([
  ["ui_ux",{label:"UI & UX",verificationTrack:"ui_ux",requirementFocusKeys:["ui_ux"]}],
  ["frontend",{label:"Frontend",verificationTrack:"frontend",requirementFocusKeys:["workflow_functionality","ui_ux"]}],
  ["backend",{label:"Backend",verificationTrack:"backend",requirementFocusKeys:["workflow_functionality","database_architecture"]}],
  ["data",{label:"Data",verificationTrack:"data",requirementFocusKeys:["database_architecture"]}],
  ["ai",{label:"AI",verificationTrack:"ai",requirementFocusKeys:["datanest_ai_learning","workflow_functionality"]}],
  ["testing",{label:"Testing",verificationTrack:"testing",requirementFocusKeys:["security_testing","workflow_functionality"]}],
  ["security",{label:"Security",verificationTrack:"security",requirementFocusKeys:["security_testing","governance_process"]}],
  ["infrastructure",{label:"Infrastructure",verificationTrack:"infrastructure",requirementFocusKeys:["database_architecture","cost_saving"]}],
  ["documentation",{label:"Documentation",verificationTrack:"documentation",requirementFocusKeys:["documentation_mentoring"]}],
  ["product_planning",{label:"Product Planning",verificationTrack:"product_planning",requirementFocusKeys:["workflow_functionality","governance_process"]}]
]);

function requirementFocusKeys(requirements:unknown):WorkFocusKey[]{
  if(!requirements||typeof requirements!=="object"||Array.isArray(requirements))return [];
  const raw=(requirements as Record<string,unknown>).focus_areas;
  if(!Array.isArray(raw))return [];
  const seen=new Set<WorkFocusKey>();
  for(const value of raw){
    const key=String(value||"").trim().toLowerCase() as WorkFocusKey;
    if(workFocusKeySet.has(key))seen.add(key);
  }
  return [...seen];
}

type AnyClient=SupabaseClient<any>;

type JobContext={
  id:string;
  project_id:string;
  job_number:number;
  title:string;
  description:string|null;
  priority:number;
  status:string;
  required_capabilities:unknown;
  requirements:unknown;
  acceptance:unknown;
  deadline:string|null;
};

type StagedEvent={
  id:string;
  trace_id:string;
  project_id:string;
  job_id:string;
  session_id:string;
  source_type:string;
  source_user_id:string|null;
  source_provider:string|null;
  parent_event_id:string|null;
  client_request_id:string|null;
  content:string;
  created_at:string;
  metadata:Record<string,unknown>|null;
};

function cors(origin:string|null){
  const allow=origin&&allowedOrigins.has(origin)
    ?origin
    :"https://datanest-supository.github.io";
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
    headers:{
      ...cors(origin),
      "Content-Type":"application/json",
      "Cache-Control":"no-store"
    }
  });
}

function requireEnv(name:string):string{
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

async function loadAuthorizedJob(client:AnyClient,jobId:string):Promise<JobContext>{
  const {data,error}=await client
    .from("jobs")
    .select("id,project_id,job_number,title,description,priority,status,required_capabilities,requirements,acceptance,deadline")
    .eq("id",jobId)
    .single();
  if(error||!data)throw new Error(error?.message||"Job not found or not authorized.");
  return data as JobContext;
}

async function ensureStagingSession(input:{
  staging:AnyClient;
  projectId:string;
  jobId:string;
  userId:string;
  existingSessionId:string|null;
}):Promise<{id:string}>{
  if(input.existingSessionId){
    const {data,error}=await input.staging
      .from("ai_sessions")
      .select("id")
      .eq("id",input.existingSessionId)
      .eq("project_id",input.projectId)
      .eq("job_id",input.jobId)
      .eq("user_id",input.userId)
      .maybeSingle();
    if(error)throw error;
    if(!data)throw new Error("DataNest AI session does not belong to this user and Job.");
    return data as {id:string};
  }

  const {data,error}=await input.staging
    .from("ai_sessions")
    .insert({
      project_id:input.projectId,
      job_id:input.jobId,
      user_id:input.userId,
      client_session_id:crypto.randomUUID()
    })
    .select("id")
    .single();
  if(error||!data)throw error||new Error("Unable to create DataNest AI session.");
  return data as {id:string};
}

async function loadSessionEvents(input:{
  staging:AnyClient;
  projectId:string;
  jobId:string;
  sessionId:string;
}):Promise<StagedEvent[]>{
  const {data,error}=await input.staging
    .from("ai_intake_events")
    .select("id,trace_id,project_id,job_id,session_id,source_type,source_user_id,source_provider,parent_event_id,client_request_id,content,created_at,metadata")
    .eq("project_id",input.projectId)
    .eq("job_id",input.jobId)
    .eq("session_id",input.sessionId)
    .order("created_at",{ascending:false})
    .limit(100);
  if(error)throw error;
  const rows=chronologicalFromNewestFirst((data||[]) as StagedEvent[]);
  const mapped=rows.map(row=>({
    ...row,
    projectId:row.project_id,
    jobId:row.job_id,
    sessionId:row.session_id
  }));
  return filterCurrentSessionEvidence(mapped,{
    projectId:input.projectId,
    jobId:input.jobId,
    sessionId:input.sessionId
  });
}

type CertifiedMemorySelection={
  items:Array<Record<string,unknown>>;
  strategy:string;
  projection:{key:string;version:number}|null;
  summary:{
    active_count:number;
    projected_count:number;
    applicable_count:number;
    selected_count:number;
    review_due_count:number;
  };
};

function nonNegativeCount(value:unknown,fallback=0):number{
  const parsed=Number(value);
  return Number.isFinite(parsed)&&parsed>=0?Math.floor(parsed):fallback;
}

async function loadCertifiedMemory(input:{
  client:AnyClient;
  projectId:string;
  jobId:string;
  query:string;
  purpose:string;
  productScope:string|null;
  projectionKey:string;
  jurisdiction:string|null;
  visibilityClass:string;
  limit?:number;
}):Promise<CertifiedMemorySelection>{
  const rankedV3=await input.client.rpc("get_ranked_certified_memory_context_v3",{
    target_project:input.projectId,
    target_job:input.jobId,
    target_query:input.query,
    target_purpose:input.purpose,
    target_product_scope:input.productScope,
    target_projection_key:input.projectionKey,
    target_jurisdiction:input.jurisdiction,
    target_visibility_class:input.visibilityClass,
    target_limit:input.limit||24
  });
  if(!rankedV3.error){
    const payload=(rankedV3.data||{}) as Record<string,unknown>;
    const rawItems=Array.isArray(payload.items)?payload.items:[];
    const items=rawItems as Array<Record<string,unknown>>;
    const rawSummary=
      payload.summary&&typeof payload.summary==="object"&&!Array.isArray(payload.summary)
        ?payload.summary as Record<string,unknown>
        :{};
    const rawProjection=
      payload.projection&&typeof payload.projection==="object"&&!Array.isArray(payload.projection)
        ?payload.projection as Record<string,unknown>
        :{};
    return {
      items,
      strategy:String(payload.strategy||"verified-memory-ranked-v3"),
      projection:{
        key:String(rawProjection.key||input.projectionKey),
        version:nonNegativeCount(rawProjection.version,1)
      },
      summary:{
        active_count:nonNegativeCount(rawSummary.active_count,items.length),
        projected_count:nonNegativeCount(rawSummary.projected_count,items.length),
        applicable_count:nonNegativeCount(rawSummary.applicable_count,items.length),
        selected_count:items.length,
        review_due_count:nonNegativeCount(rawSummary.review_due_count,0)
      }
    };
  }

  const missingV3=
    String((rankedV3.error as {code?:unknown}).code||"")==="PGRST202" ||
    /get_ranked_certified_memory_context_v3|could not find the function/i.test(
      String((rankedV3.error as {message?:unknown}).message||"")
    );
  if(!missingV3)throw rankedV3.error;
  throw new Error("certified_memory_projection_unavailable");
}


async function recordCertifiedMemoryUsage(input:{
  serviceClient:AnyClient;
  projectId:string;
  jobId:string;
  requestId:string;
  traceId:string;
  query:string;
  purpose:string;
  productScope:string|null;
  visibilityClass:string;
  selection:CertifiedMemorySelection;
}):Promise<"recorded"|"not_available">{
  const selectedMemoryIds=input.selection.items
    .map(item=>String(item.id||""))
    .filter(Boolean);
  const queryHash=await sha256Text(input.query);

  if(input.selection.projection){
    const projected=await input.serviceClient.rpc("service_record_certified_memory_usage_v2",{
      target_project:input.projectId,
      target_job:input.jobId,
      target_ai_usage_request:input.requestId,
      target_trace_id:input.traceId,
      target_strategy:input.selection.strategy,
      target_projection_key:input.selection.projection.key,
      target_projection_version:input.selection.projection.version,
      target_purpose:input.purpose,
      target_product_scope:input.productScope,
      target_visibility_class:input.visibilityClass,
      target_query_hash:queryHash,
      target_active_count:input.selection.summary.active_count,
      target_applicable_count:input.selection.summary.applicable_count,
      target_selected_count:selectedMemoryIds.length,
      target_review_due_count:input.selection.summary.review_due_count,
      target_selected_memory_ids:selectedMemoryIds
    });
    if(!projected.error)return "recorded";

    const missingV2=
      String((projected.error as {code?:unknown}).code||"")==="PGRST202" ||
      /service_record_certified_memory_usage_v2|could not find the function/i.test(
        String((projected.error as {message?:unknown}).message||"")
      );
    if(!missingV2)throw projected.error;
  }

  const {error}=await input.serviceClient.rpc("service_record_certified_memory_usage_v1",{
    target_project:input.projectId,
    target_job:input.jobId,
    target_ai_usage_request:input.requestId,
    target_trace_id:input.traceId,
    target_strategy:input.selection.strategy,
    target_purpose:input.purpose,
    target_product_scope:input.productScope,
    target_visibility_class:input.visibilityClass,
    target_query_hash:queryHash,
    target_active_count:input.selection.summary.active_count,
    target_applicable_count:input.selection.summary.applicable_count,
    target_selected_count:selectedMemoryIds.length,
    target_review_due_count:input.selection.summary.review_due_count,
    target_selected_memory_ids:selectedMemoryIds
  });
  if(!error)return "recorded";

  const missingReceiptFunction=
    String((error as {code?:unknown}).code||"")==="PGRST202" ||
    /service_record_certified_memory_usage_v1|could not find the function/i.test(
      String((error as {message?:unknown}).message||"")
    );
  if(missingReceiptFunction)return "not_available";
  throw error;
}

async function loadDevelopmentWorkingMemory(
  serviceClient:AnyClient,
  projectId:string,
  userId:string
):Promise<string[]>{
  const {data,error}=await serviceClient
    .from("development_command_working_memory")
    .select("normalized_knowledge,created_at")
    .eq("project_id",projectId)
    .eq("active",true)
    .or("user_id.is.null,user_id.eq."+userId)
    .order("created_at",{ascending:false})
    .limit(120);
  if(error)throw error;
  return (data||[])
    .slice()
    .reverse()
    .map(item=>String(item.normalized_knowledge||""))
    .filter(Boolean);
}

async function recordDevelopmentWorkingMemory(input:{
  serviceClient:AnyClient;
  projectId:string;
  jobId:string;
  userId:string;
  sessionId:string;
  clientRequestId:string;
  inputTraceId:string;
  outputTraceId:string;
  command:string;
  dual:DualAdvocacyResponse;
  providerLabel:string|null;
  modelLabel:string|null;
  expertiseSection:string|null;
  expertiseLabel:string|null;
  verificationTrack:string|null;
  requirementFocusKeys:readonly WorkFocusKey[];
  jobRequirementFocusKeys:readonly WorkFocusKey[];
  matchedRequirementFocusKeys:readonly WorkFocusKey[];
}){
  const commandHash=await sha256Text(input.userId+"|"+input.command);
  const synthesisHash=await sha256Text(input.userId+"|"+input.dual.synthesis);
  const now=new Date().toISOString();
  const {data:memoryRows,error:memoryError}=await input.serviceClient
    .from("development_command_working_memory")
    .upsert([
      {
        project_id:input.projectId,
        job_id:input.jobId,
        user_id:input.userId,
        memory_kind:"development_command",
        normalized_knowledge:input.command,
        content_hash:commandHash,
        source_trace_id:input.inputTraceId,
        source_label:"development_command_channel",
        metadata:{
          working_memory_scope:"development_command",
          origin:"human_command",
          category:input.expertiseSection?"development_work":null,
          impact_area:input.expertiseLabel,
          expertise_section:input.expertiseSection,
          expertise_label:input.expertiseLabel,
          verification_track:input.verificationTrack,
          requirement_focus_keys:input.requirementFocusKeys,
          job_requirement_focus_keys:input.jobRequirementFocusKeys,
          matched_requirement_focus_keys:input.matchedRequirementFocusKeys,
          requirement_focus_match:input.matchedRequirementFocusKeys.length>0,
          routing_version:input.expertiseSection?"development-work-expertise-v1":null
        },
        active:true,
        updated_at:now
      },
      {
        project_id:input.projectId,
        job_id:input.jobId,
        user_id:input.userId,
        memory_kind:"assistant_synthesis",
        normalized_knowledge:input.dual.synthesis,
        content_hash:synthesisHash,
        source_trace_id:input.outputTraceId,
        source_label:"development_command_channel",
        metadata:{
          working_memory_scope:"development_command",
          origin:"dual_advocacy_synthesis",
          category:input.expertiseSection?"development_work":null,
          impact_area:input.expertiseLabel,
          expertise_section:input.expertiseSection,
          expertise_label:input.expertiseLabel,
          verification_track:input.verificationTrack,
          requirement_focus_keys:input.requirementFocusKeys,
          job_requirement_focus_keys:input.jobRequirementFocusKeys,
          matched_requirement_focus_keys:input.matchedRequirementFocusKeys,
          requirement_focus_match:input.matchedRequirementFocusKeys.length>0,
          routing_version:input.expertiseSection?"development-work-expertise-v1":null
        },
        active:true,
        updated_at:now
      }
    ],{onConflict:"project_id,memory_kind,content_hash"})
    .select("id");
  if(memoryError)throw memoryError;

  const memoryIds=(memoryRows||[]).map(item=>String(item.id));
  const {error:turnError}=await input.serviceClient
    .from("development_command_turns")
    .upsert({
      project_id:input.projectId,
      job_id:input.jobId,
      user_id:input.userId,
      session_id:input.sessionId,
      client_request_id:input.clientRequestId,
      trace_id:input.outputTraceId,
      command_text:input.command,
      angels_advocate:input.dual.angelsAdvocate,
      devils_advocate:input.dual.devilsAdvocate,
      synthesis:input.dual.synthesis,
      provider_label:input.providerLabel,
      model_label:input.modelLabel,
      memory_item_ids:memoryIds
    },{onConflict:"project_id,user_id,client_request_id"});
  if(turnError)throw turnError;
}

async function loadActiveIlmProfile(input:{
  serviceClient:AnyClient;
  projectId:string;
}):Promise<IlmProfile|null>{
  const {data,error}=await input.serviceClient
    .from("ilm_profiles")
    .select("id,project_id,version,profile_key,allowed_purposes,default_capability,allowed_resource_kinds,memory_policy,routing_policy,evaluation_policy")
    .eq("project_id",input.projectId)
    .eq("profile_key","ilm-1")
    .eq("status","active")
    .order("version",{ascending:false})
    .limit(1)
    .maybeSingle();
  if(error){
    const code=String((error as {code?:unknown}).code||"");
    const message=String((error as {message?:unknown}).message||"");
    if(code==="42P01"||code==="PGRST205"||/ilm_profiles.*schema cache/i.test(message)){
      return null;
    }
    throw error;
  }
  if(!data)return null;
  return {
    id:String(data.id),
    projectId:String(data.project_id),
    version:Number(data.version),
    profileKey:String(data.profile_key),
    allowedPurposes:Array.isArray(data.allowed_purposes)?data.allowed_purposes.map(String):[],
    defaultCapability:String(data.default_capability||"chat"),
    allowedResourceKinds:Array.isArray(data.allowed_resource_kinds)?data.allowed_resource_kinds.map(String):[],
    memoryPolicy:typeof data.memory_policy==="object"&&data.memory_policy?data.memory_policy as Record<string,unknown>:{},
    routingPolicy:typeof data.routing_policy==="object"&&data.routing_policy?data.routing_policy as Record<string,unknown>:{},
    evaluationPolicy:typeof data.evaluation_policy==="object"&&data.evaluation_policy?data.evaluation_policy as Record<string,unknown>:{}
  };
}

async function resolveActiveIlmRoute(input:{
  serviceClient:AnyClient;
  userId:string;
  job:JobContext;
  requestId:string;
  traceId:string;
  purpose:string;
  visibilityClass:string;
  learningEligible:boolean;
  requestedConnection:string|null;
  certifiedMemory:Array<Record<string,unknown>>;
}):Promise<{route:Ilm1RouteResult|null;connection:ProviderConnection|null;phaseCDecisionRecordId:string|null}>{
  const profile=await loadActiveIlmProfile({
    serviceClient:input.serviceClient,
    projectId:input.job.project_id
  });
  if(!profile)return {route:null,connection:null,phaseCDecisionRecordId:null};

  let selectedConnection:ProviderConnection|null=null;
  let selectedPhaseCDecisionRecordId:string|null=null;
  const requestedCapability=profile.defaultCapability
    ||(Array.isArray(input.job.required_capabilities)&&input.job.required_capabilities.length
      ?String(input.job.required_capabilities[0])
      :"chat");

  const route=await resolveIlm1Route({
    loadCertifiedMemory:async()=>input.certifiedMemory.map(item=>({
      id:String(item.id||""),
      normalizedKnowledge:String(item.normalized_knowledge||"")
    })).filter(item=>Boolean(item.id)),
    evaluateDataPolicy:async()=>{
      const {data,error}=await input.serviceClient.rpc("service_evaluate_data_policy_v1",{
        target_project:input.job.project_id,
        target_actor_user:input.userId,
        target_subject_type:"job",
        target_purpose:input.purpose,
        target_requested_operation:"process",
        target_trace_id:input.traceId,
        target_subject_id:input.job.id,
        target_subject_reference:null,
        target_provider_connection:null,
        target_provider_key:null,
        target_hard_learning_exclusion:!input.learningEligible
      });
      if(error)throw error;
      const policy=(data||{}) as Record<string,unknown>;
      const outcome=String(policy.outcome||"review_required");
      return {
        outcome:outcome==="allow"?"allow":outcome==="deny"?"deny":"review_required",
        enforcementMode:String(policy.enforcement_mode||"report_only"),
        reasonCode:String(policy.reason_code||"policy_review_required"),
        evidence:{
          decision_trace:policy.decision_trace||null,
          decision_record_id:policy.decision_record_id||null,
          visibility_class:policy.visibility_class||input.visibilityClass,
          reuse_state:policy.reuse_state||null,
          policy_version:policy.policy_version||null,
          enforcement_mode:policy.enforcement_mode||null
        }
      };
    },
    resolveResourceCandidates:async(routeInput)=>{
      const effectiveVisibility=String(routeInput.policy.evidence?.visibility_class||input.visibilityClass);
      const {data,error}=await input.serviceClient.rpc("service_resolve_resource_candidates_v1",{
        target_project:input.job.project_id,
        target_capability:requestedCapability,
        target_requested_operation:"prepare",
        target_visibility_class:effectiveVisibility,
        target_trace_id:input.traceId
      });
      if(error)throw error;
      const result=(data||{}) as Record<string,unknown>;
      const rawCandidates=Array.isArray(result.eligible_candidates)?result.eligible_candidates:[];
      return {
        eligibleCandidates:rawCandidates.map(value=>{
          const row=value as Record<string,unknown>;
          return {
            resourceId:String(row.resource_id||""),
            capabilityId:String(row.capability_id||""),
            resourceKind:String(row.resource_kind||""),
            resourceKey:row.resource_key?String(row.resource_key):undefined
          };
        }).filter(candidate=>candidate.resourceId&&candidate.capabilityId&&candidate.resourceKind),
        decisions:Array.isArray(result.decisions)
          ?result.decisions as Array<Record<string,unknown>>
          :[]
      };
    },
    resolveProviderConnection:async(routeInput)=>{
      const connection=await resolveConfiguredProviderConnection({
        serviceClient:input.serviceClient,
        projectId:input.job.project_id,
        userId:input.userId,
        requestedConnection:input.requestedConnection
      });
      if(!connection)return null;
      const providerKey=connection.provider.toLowerCase()+":"+connection.endpoint_host.toLowerCase();
      const {data:providerPolicyData,error:providerPolicyError}=await input.serviceClient.rpc(
        "service_evaluate_data_policy_v1",{
          target_project:input.job.project_id,
          target_actor_user:input.userId,
          target_subject_type:"job",
          target_purpose:"external_provider_processing",
          target_requested_operation:"process",
          target_trace_id:input.traceId,
          target_subject_id:input.job.id,
          target_subject_reference:null,
          target_provider_connection:connection.id,
          target_provider_key:providerKey,
          target_hard_learning_exclusion:!input.learningEligible
        }
      );
      if(providerPolicyError)throw providerPolicyError;
      const providerPolicy=(providerPolicyData||{}) as Record<string,unknown>;
      selectedPhaseCDecisionRecordId=providerPolicy.decision_record_id?String(providerPolicy.decision_record_id):null;
      const providerPolicyEnforced=String(providerPolicy.enforcement_mode||"report_only")==="enforced";
      if(providerPolicyEnforced&&String(providerPolicy.outcome||"deny")!=="allow")return null;

      selectedConnection=connection;
      const candidate=routeInput.resources.eligibleCandidates[0]||null;
      return {
        connectionId:connection.id,
        providerKey,
        modelLabel:connection.model,
        resourceId:candidate?.resourceId||null,
        capabilityId:candidate?.capabilityId||null,
        routeKind:"provider_model" as const,
        policyEvidence:{
          provider_decision_trace:providerPolicy.decision_trace||null,
          provider_decision_record_id:providerPolicy.decision_record_id||null,
          provider_profile_id:providerPolicy.provider_profile_id||null,
          provider_processing_region:providerPolicy.provider_processing_region||null,
          provider_allowed_regions:providerPolicy.provider_allowed_regions||[],
          provider_reason_code:providerPolicy.reason_code||null,
          provider_policy_version:providerPolicy.policy_version||null,
          provider_enforcement_mode:providerPolicy.enforcement_mode||null
        }
      };
    },
    recordRouteDecision:async(routeInput)=>{
      const {data,error}=await input.serviceClient.rpc("service_record_intelligence_route_v1",{
        target_project:routeInput.projectId,
        target_trace_id:routeInput.traceId,
        target_profile:routeInput.profileId,
        target_purpose:routeInput.purpose,
        target_visibility_class:routeInput.visibilityClass,
        target_requested_operation:routeInput.requestedOperation,
        target_requested_capability:routeInput.requestedCapability,
        target_route_kind:routeInput.routeKind,
        target_decision:routeInput.decision,
        target_reason_codes:routeInput.reasonCodes,
        target_certified_memory_ids:routeInput.certifiedMemoryIds,
        target_job:routeInput.jobId,
        target_ai_usage_request:routeInput.aiUsageRequestId,
        target_resource:routeInput.resourceId,
        target_capability:routeInput.capabilityId,
        target_provider_connection:routeInput.providerConnectionId,
        target_provider_key:routeInput.providerKey,
        target_model_label:routeInput.modelLabel,
        target_policy_evidence:routeInput.policyEvidence,
        target_resource_evidence:routeInput.resourceEvidence
      });
      if(error)throw error;
      return {id:String(data||"")};
    }
  },{
    projectId:input.job.project_id,
    jobId:input.job.id,
    aiUsageRequestId:input.requestId,
    traceId:input.traceId,
    profile,
    purpose:input.purpose,
    visibilityClass:input.visibilityClass,
    requestedOperation:"prepare",
    requestedCapability
  });

  return {route,connection:selectedConnection,phaseCDecisionRecordId:selectedPhaseCDecisionRecordId};
}


async function resolveConfiguredProviderConnection(input:{
  serviceClient:AnyClient;
  projectId:string;
  userId:string;
  requestedConnection:string|null;
}):Promise<ProviderConnection|null>{
  const load=async()=>{
    const {data,error}=await input.serviceClient.rpc(
      "service_get_ai_provider_connection_v3",{
        target_project:input.projectId,
        target_user:input.userId,
        target_connection:input.requestedConnection
      }
    );
    if(error)throw error;
    return data?data as ProviderConnection:null;
  };

  const existing=await load();
  if(input.requestedConnection)return existing;

  if(existing){
    const metadata=(existing.metadata||{}) as Record<string,unknown>;
    if(String(metadata.scope||"")!=="project_shared_copy")return existing;

    const {data:refreshed,error:refreshError}=await input.serviceClient.rpc(
      "service_sync_shared_ai_provider_connection_v1",{
        target_project:input.projectId,
        target_user:input.userId
      }
    );
    if(refreshError)throw refreshError;
    return refreshed?refreshed as ProviderConnection:null;
  }

  const {data:sharedConnection,error:sharedError}=await input.serviceClient.rpc(
    "service_sync_shared_ai_provider_connection_v1",{
      target_project:input.projectId,
      target_user:input.userId
    }
  );
  if(sharedError)throw sharedError;
  if(sharedConnection)return sharedConnection as ProviderConnection;

  const apiBaseUrl=(Deno.env.get("DATANEST_SHARED_AI_BASE_URL")||"").trim();
  const endpointHost=(Deno.env.get("DATANEST_SHARED_AI_HOST")||"").trim().toLowerCase();
  const model=(Deno.env.get("DATANEST_SHARED_AI_MODEL")||"").trim();
  const secret=(Deno.env.get("DATANEST_SHARED_AI_SECRET")||"").trim();
  const label=(Deno.env.get("DATANEST_SHARED_AI_LABEL")||"DataNest Sovereign AI").trim();

  if(!apiBaseUrl||!endpointHost||!model||!secret)return null;

  const url=new URL(apiBaseUrl);
  if(
    url.protocol!=="https:" ||
    url.hostname.toLowerCase()!==endpointHost ||
    url.username ||
    url.password ||
    (url.port&&url.port!=="443")
  ){
    throw new Error("configured_shared_provider_endpoint_rejected");
  }

  const {error:upsertError}=await input.serviceClient.rpc(
    "service_upsert_ai_provider_connection_v2",{
      target_project:input.projectId,
      target_user:input.userId,
      target_provider:"openai_compatible",
      target_label:label,
      target_api_base_url:apiBaseUrl,
      target_endpoint_host:endpointHost,
      target_model:model,
      target_secret:secret
    }
  );
  if(upsertError)throw upsertError;

  return await load();
}

async function finishUsageRequest(
  client:AnyClient,
  input:{
    requestId:string;
    target_status:string;
    inputTokens?:number;
    outputTokens?:number;
    errorCategory?:string|null;
    errorMessage?:string|null;
  }
){
  const {error}=await client.rpc("service_finish_ai_request",{
    target_request:input.requestId,
    target_status:input.target_status,
    input_tokens:input.inputTokens||0,
    output_tokens:input.outputTokens||0,
    estimated_cost_minor:null,
    provider_reported_cost_minor:null,
    reconciled_cost_minor:null,
    target_error_category:input.errorCategory||null,
    target_error_message:input.errorMessage||null
  });
  if(error)throw error;
}

function embeddedResponse(
  job:JobContext,
  message:string,
  productMode:string,
  jurisdiction:string,
  clientTimeZone:string
){
  const code="JOB-"+String(job.job_number||0).padStart(5,"0");
  if(productMode==="legal_eagle"){
    return [
      `Legal Eagle received your request for ${code} · ${job.title}.`,
      `Jurisdiction supplied: ${jurisdiction}.`,
      "A governed external AI provider is not currently available for substantive legal reasoning in this route.",
      "You can still use this matter workspace to organize facts and questions. Verify legal rights, deadlines, procedures and strategy with a qualified lawyer in the relevant jurisdiction."
    ].join("\n\n");
  }

  const normalized=message.trim().toLowerCase().replace(/[^a-z0-9\s?'’-]/g,"");
  const now=new Date();
  let timeZone=clientTimeZone||"UTC";
  try{
    new Intl.DateTimeFormat("en",{timeZone}).format(now);
  }catch{
    timeZone="UTC";
  }

  if(/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(normalized)){
    return `Hello. DataNest AI is online in ${code} · ${job.title}. What would you like to work on?`;
  }

  if(
    /\b(what('?s| is) (the )?date|today'?s date|what day is it|current date)\b/.test(normalized)
  ){
    const date=new Intl.DateTimeFormat("en-ZA",{
      weekday:"long",year:"numeric",month:"long",day:"numeric",timeZone
    }).format(now);
    return `Today is ${date} (${timeZone}).`;
  }

  if(/\b(what('?s| is) (the )?time|current time|time now)\b/.test(normalized)){
    const time=new Intl.DateTimeFormat("en-ZA",{
      hour:"2-digit",minute:"2-digit",second:"2-digit",timeZone,timeZoneName:"short"
    }).format(now);
    return `The current time is ${time}.`;
  }

  if(/\b(what (job|context)|current job|which job)\b/.test(normalized)){
    return `You are working in ${code} · ${job.title}.${job.description?" "+job.description:""}`;
  }

  if(/^(help|what can you do|commands?)\??$/.test(normalized)){
    return "I can work with the active Job context, analyze and plan work, help debug implementation, compare approaches, and preserve this session as governed evidence. Substantive generative reasoning requires an approved AI provider route.";
  }

  return [
    "I received your message and kept it in this active Job/session.",
    "A governed AI provider is not currently available for substantive generative reasoning in this route, so I will not pretend a canned acknowledgement is a full answer.",
    "You can still ask me for the current date/time, active Job context, or help; connect/approve an AI provider route for general conversational reasoning."
  ].join("\n\n");
}

async function loadCachedTurn(input:{
  staging:AnyClient;
  userId:string;
  clientRequestId:string;
}){
  const {data:human,error:humanError}=await input.staging
    .from("ai_intake_events")
    .select("id,trace_id,session_id")
    .eq("source_type","human")
    .eq("source_user_id",input.userId)
    .eq("client_request_id",input.clientRequestId)
    .maybeSingle();
  if(humanError)throw humanError;
  if(!human)throw new Error("The existing DataNest AI request has no staged intake event.");

  const {data:assistant,error:assistantError}=await input.staging
    .from("ai_intake_events")
    .select("trace_id,content")
    .eq("source_type","datanest_ai")
    .eq("parent_event_id",human.id)
    .order("created_at",{ascending:false})
    .limit(1)
    .maybeSingle();
  if(assistantError)throw assistantError;
  if(!assistant){
    throw new Error("The existing request is staged but has no completed response; it will not be sent again automatically.");
  }
  return {
    assistant:String(assistant.content),
    outputTraceId:String(assistant.trace_id),
    inputTraceId:String(human.trace_id),
    sessionId:String(human.session_id)
  };
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
    const staging=stagingConfig(supabaseUrl,serviceKey);

    const userClient=createClient(supabaseUrl,anonKey,{
      global:{headers:{Authorization:authorization}},
      auth:{persistSession:false,autoRefreshToken:false}
    });
    const serviceClient=createClient(supabaseUrl,serviceKey,{
      auth:{persistSession:false,autoRefreshToken:false}
    });
    const stagingClient=createClient(staging.url,staging.key,{
      auth:{persistSession:false,autoRefreshToken:false}
    });

    const {data:userData,error:userError}=await userClient.auth.getUser();
    if(userError||!userData.user)return json({error:"Authentication is required."},401,origin);
    const user=userData.user;

    const body=await request.json().catch(()=>({})) as Record<string,unknown>;
    const action=String(body.action||"chat");
    const jobId=String(body.jobId||"");
    if(!jobId)return json({error:"jobId is required."},400,origin);
    const clientTimeZone=typeof body.clientTimeZone==="string"
      ?body.clientTimeZone.trim().slice(0,120)
      :"";

    const channelMode=String(body.channelMode||"").trim();
    if(channelMode&&channelMode!=="development_command"){
      return json({error:"Unsupported DataNest AI channel mode."},400,origin);
    }

    const productMode=String(body.productMode||"").trim();
    if(productMode&&productMode!=="legal_eagle"){
      return json({error:"Unsupported DataNest AI product mode."},400,origin);
    }
    const legalMode=productMode==="legal_eagle";
    const developmentMode=channelMode==="development_command"&&!legalMode;
    const jurisdiction=legalMode?String(body.jurisdiction||"").trim().slice(0,160):"";
    const legalTask=legalMode?String(body.legalTask||"general").trim().slice(0,80):"";
    if(legalMode&&!jurisdiction){
      return json({error:"Legal Eagle requires a jurisdiction before substantive assistance."},400,origin);
    }

    const requestedVisibilityClass=String(body.visibilityClass||"").trim();
    if(requestedVisibilityClass&&!visibilityClasses.has(requestedVisibilityClass)){
      return json({error:"Unsupported DataNest AI visibility class."},400,origin);
    }
    const visibilityClass=requestedVisibilityClass||"project_restricted";

    const requestedReuseState=String(body.reuseState||"").trim();
    if(requestedReuseState&&!rawReuseStates.has(requestedReuseState)){
      return json({error:"Unsupported DataNest AI reuse state."},400,origin);
    }
    const reuseState=(legalMode||developmentMode)
      ?"session_context"
      :(requestedReuseState||"project_learning_eligible");
    const policyPurpose=legalMode?"user_requested_analysis":"job_execution";
    const projectionKey=legalMode
      ?"legal_eagle"
      :developmentMode
        ?"development_command"
        :"datanest_ai";
    const learningEligible=!legalMode&&!developmentMode&&reuseState==="project_learning_eligible";

    const job=await loadAuthorizedJob(userClient,jobId);

    if(action==="context"){
      const session=await ensureStagingSession({
        staging:stagingClient,
        projectId:job.project_id,
        jobId:job.id,
        userId:user.id,
        existingSessionId:typeof body.sessionId==="string"&&body.sessionId?body.sessionId:null
      });
      const [events,certifiedMemorySelection]=await Promise.all([
        loadSessionEvents({
          staging:stagingClient,
          projectId:job.project_id,
          jobId:job.id,
          sessionId:session.id
        }),
        loadCertifiedMemory({
          client:userClient,
          projectId:job.project_id,
          jobId:job.id,
          query:[job.title,job.description,legalTask,jurisdiction].filter(Boolean).join(" "),
          purpose:policyPurpose,
          productScope:legalMode?"legal_eagle":developmentMode?"development_command":"datanest_ai",
          projectionKey,
          jurisdiction:legalMode?jurisdiction:null,
          visibilityClass,
          limit:24
        })
      ]);
      return json({
        sessionId:session.id,
        job,
        events,
        certifiedMemory:certifiedMemorySelection.items,
        certifiedMemoryStrategy:certifiedMemorySelection.strategy,
        certifiedMemoryProjection:certifiedMemorySelection.projection,
        certifiedMemorySummary:certifiedMemorySelection.summary
      },200,origin);
    }

    if(action!=="chat")return json({error:"Unsupported DataNest AI action."},400,origin);

    const requestedExpertiseSection=String(body.expertiseSection||"").trim();
    const expertise=requestedExpertiseSection
      ?developmentWorkExpertise.get(requestedExpertiseSection as DevelopmentWorkExpertiseKey)||null
      :null;
    if(requestedExpertiseSection&&!expertise){
      return json({error:"Unsupported Development Work expertise section."},400,origin);
    }
    const jobRequirementFocusKeys=requirementFocusKeys(job.requirements);
    const expertiseRequirementFocusKeys=expertise?[...expertise.requirementFocusKeys]:[];
    const matchedRequirementFocusKeys=expertiseRequirementFocusKeys.filter(key=>jobRequirementFocusKeys.includes(key));

    const message=String(body.message||"").trim();
    const clientRequestId=String(body.clientRequestId||"");
    if(!message||!clientRequestId){
      return json({error:"message and clientRequestId are required."},400,origin);
    }
    const sourceLanguageProvided=Object.prototype.hasOwnProperty.call(body,"sourceLanguage");
    const inputLanguageMetadata=buildEvidenceLanguageMetadata({
      content:message,
      declaredLanguageProvided:sourceLanguageProvided,
      declaredLanguage:body.sourceLanguage,
      declaredBasis:"user_declared"
    });
    const requestedConnection=typeof body.providerConnectionId==="string"
      ?body.providerConnectionId
      :null;
    const requestedSessionId=typeof body.sessionId==="string"&&body.sessionId
      ?body.sessionId
      :null;
    const fingerprint=await sha256Text(message);
    let sessionId="";
    let certifiedMemoryIds:string[]=[];
    let provisionalIds:string[]=[];
    let requestStatus="pending";
    let activeRequestId="";
    let stagedInputTraceId="";
    let learningPolicy:Record<string,unknown>={
      outcome:"review_required",
      reason_code:"policy_evaluation_unavailable",
      reuse_state:"runtime_only",
      policy_version:"unresolved",
      decision_record_id:null
    };
    let learningPolicyErrorMessage:string|null=null;
    let finalLearningEligible=false;
    let trendAnalysis:{status:"not_applicable"|"recorded"|"failed";candidateId?:string|null;trendKey?:string|null;evidenceCount?:number;error?:string}={status:"not_applicable"};
    let developmentDual:DualAdvocacyResponse|null=null;
    let workingMemoryStatus:"not_applicable"|"not_recorded"|"recorded"|"skipped_incomplete_response"|"failed"=
      developmentMode?"not_recorded":"not_applicable";
    let developmentProviderLabel:string|null=null;
    let developmentModelLabel:string|null=null;
    let contributionTracking:{status:"not_applicable"|"staged"|"failed";contributionId?:string|null;error?:string}={status:"not_applicable"};
    let memoryReceiptStatus:"not_recorded"|"recorded"|"not_available"="not_recorded";
    let memorySelectionStrategy:string|null=null;

    const result=await executeChatTurn({
      beginRequest:async()=>{
        const {data,error}=await userClient.rpc("begin_datanest_ai_request",{
          target_job:job.id,
          target_client_request_id:clientRequestId,
          message_fingerprint:fingerprint
        });
        if(error)throw error;
        const row=(data||{}) as Record<string,unknown>;
        requestStatus=String(row.status||"pending");
        activeRequestId=String(row.id||"");
        return {
          id:activeRequestId,
          isNew:Boolean(row.is_new),
          status:requestStatus
        };
      },
      loadCachedTurn:async()=>loadCachedTurn({
        staging:stagingClient,
        userId:user.id,
        clientRequestId
      }),
      stageInput:async({requestId})=>{
        const session=await ensureStagingSession({
          staging:stagingClient,
          projectId:job.project_id,
          jobId:job.id,
          userId:user.id,
          existingSessionId:requestedSessionId
        });
        sessionId=session.id;
        const traceId="DN-AI-"+crypto.randomUUID();
        if(developmentMode){
          learningPolicy={
            outcome:"not_applicable",
            reason_code:"development_working_memory_lane",
            reuse_state:"session_context",
            policy_version:policyVersion,
            decision_record_id:null
          };
          learningPolicyErrorMessage=null;
          finalLearningEligible=false;
        }else{
          const {data:learningPolicyData,error:learningPolicyError}=await serviceClient.rpc(
            "service_evaluate_data_policy_v1",{
              target_project:job.project_id,
              target_actor_user:user.id,
              target_subject_type:"job",
              target_purpose:"project_learning",
              target_requested_operation:"reuse",
              target_trace_id:traceId,
              target_subject_id:job.id,
              target_subject_reference:null,
              target_provider_connection:null,
              target_provider_key:null,
              target_hard_learning_exclusion:!learningEligible
            }
          );
          if(learningPolicyError){
            learningPolicyErrorMessage=learningPolicyError.message||"Project-learning policy evaluation failed.";
          }else if(learningPolicyData){
            learningPolicy=learningPolicyData as Record<string,unknown>;
          }
          finalLearningEligible=
            !learningPolicyErrorMessage &&
            learningEligible &&
            String(learningPolicy.outcome||"deny")==="allow";
        }

        const {data,error}=await stagingClient
          .from("ai_intake_events")
          .insert({
            trace_id:traceId,
            project_id:job.project_id,
            job_id:job.id,
            session_id:session.id,
            source_type:"human",
            source_user_id:user.id,
            client_request_id:clientRequestId,
            content:message,
            content_hash:fingerprint,
            metadata:{
              ...inputLanguageMetadata,
              request_id:requestId,
              trust_state:"uncertified",
              channel_mode:developmentMode?"development_command":"standard",
              product_mode:legalMode?"legal_eagle":"datanest_ai",
              jurisdiction:legalMode?jurisdiction:null,
              legal_task:legalMode?legalTask:null,
              dual_advocacy:legalMode||developmentMode,
              requested_learning_eligible:learningEligible,
              learning_eligible:finalLearningEligible,
              visibility_class:visibilityClass,
              reuse_state:reuseState,
              effective_reuse_state:learningPolicy.reuse_state,
              purpose:policyPurpose,
              policy_version:learningPolicy.policy_version||policyVersion,
              decision_record_id:learningPolicy.decision_record_id,
              category:expertise?"development_work":null,
              impact_area:expertise?.label||null,
              expertise_section:requestedExpertiseSection||null,
              expertise_label:expertise?.label||null,
              verification_track:expertise?.verificationTrack||null,
              requirement_focus_keys:expertiseRequirementFocusKeys,
              job_requirement_focus_keys:jobRequirementFocusKeys,
              matched_requirement_focus_keys:matchedRequirementFocusKeys,
              requirement_focus_match:matchedRequirementFocusKeys.length>0,
              routing_version:expertise?"development-work-expertise-v1":null
            }
          })
          .select("id,trace_id,session_id")
          .single();
        if(error||!data)throw error||new Error("Unable to stage DataNest AI input.");
        stagedInputTraceId=String(data.trace_id);

        if(developmentMode&&expertise){
          const {data:contributionId,error:contributionError}=await userClient.rpc(
            "submit_development_work_contribution_v2",{
              target_project:job.project_id,
              target_job:job.id,
              target_source_ref:String(data.id),
              target_content:message,
              target_content_hash:fingerprint,
              target_impact_area:expertise.label,
              target_expertise_section:requestedExpertiseSection,
              target_verification_track:expertise.verificationTrack,
              target_routing_version:"development-work-expertise-v1"
            }
          );
          contributionTracking=contributionError
            ?{status:"failed",error:contributionError.message||"Governed contribution intake failed."}
            :{status:"staged",contributionId:String(contributionId||"")};
        }

        return {
          id:String(data.id),
          traceId:stagedInputTraceId,
          sessionId:String(data.session_id)
        };
      },
      finishRequest:async(input)=>finishUsageRequest(serviceClient,{
        requestId:input.requestId,
        target_status:input.status,
        errorCategory:input.errorCategory||null,
        errorMessage:input.errorCategory==="staging_intake_failed"
          ?"DataNest AI staging intake failed before provider execution."
          :null
      }),
      callProvider:async()=>{
        const productScope=legalMode?"legal_eagle":developmentMode?"development_command":"datanest_ai";
        const memoryQuery=[message,job.title,job.description,legalTask,jurisdiction].filter(Boolean).join(" ");
        const [memorySelection,events,developmentMemory]=await Promise.all([
          loadCertifiedMemory({
            client:userClient,
            projectId:job.project_id,
            jobId:job.id,
            query:memoryQuery,
            purpose:policyPurpose,
            productScope,
            projectionKey,
            jurisdiction:legalMode?jurisdiction:null,
            visibilityClass,
            limit:24
          }),
          loadSessionEvents({
            staging:stagingClient,
            projectId:job.project_id,
            jobId:job.id,
            sessionId
          }),
          developmentMode
            ?loadDevelopmentWorkingMemory(serviceClient,job.project_id,user.id)
            :Promise.resolve([] as string[])
        ]);
        const certifiedMemory=memorySelection.items;
        certifiedMemoryIds=certifiedMemory.map(item=>String(item.id||"")).filter(Boolean);
        memorySelectionStrategy=memorySelection.strategy;
        memoryReceiptStatus=await recordCertifiedMemoryUsage({
          serviceClient,
          projectId:job.project_id,
          jobId:job.id,
          requestId:activeRequestId,
          traceId:stagedInputTraceId,
          query:memoryQuery,
          purpose:policyPurpose,
          productScope,
          visibilityClass,
          selection:memorySelection
        });
        provisionalIds=events.map(item=>item.id);
        const governanceRules=[
          "DATANEST AI GOVERNANCE",
          "Certified memory is reusable project knowledge.",
          "Uncertified current-session evidence is provisional and must not be generalized to other Jobs.",
          "Never claim certification that is not present in the supplied certified-memory context."
        ];
        if(legalMode){
          governanceRules.push(
            "LEGAL EAGLE · RESONANCE ASSISTANCE",
            "You are Legal Eagle, a legal-information and matter-preparation assistant. You are not a lawyer or law firm and do not create an attorney-client relationship or legal privilege.",
            `Relevant jurisdiction supplied by the user: ${jurisdiction}.`,
            `Requested legal workflow: ${legalTask||"general"}.`,
            "Help with plain-language explanation, issue spotting, chronology, document organization, research planning, question preparation and draft structure. Do not claim to represent the user.",
            "Separate user-supplied facts, assumptions, disputed claims and missing information. Do not turn allegations into established facts.",
            "Do not fabricate statutes, cases, citations, court rules, filing requirements or deadlines. When current primary-source verification is unavailable, say what official source or qualified professional should verify the point.",
            "Treat deadlines, limitation periods, court dates, criminal exposure, immigration status, family safety, housing loss and similar high-impact matters as requiring prompt verification by qualified local counsel or the appropriate authority.",
            "Never promise an outcome or present a legal strategy as guaranteed. Present options, uncertainties and questions for a qualified lawyer.",
            "Templates and draft wording must be described as drafts for human review, not filed-ready or lawyer-approved documents.",
            "Do not infer consent to contact courts, regulators, opposing parties or other people. Legal Eagle cannot act as the user's representative.",
            "Keep this legal conversation scoped to the current Job/session. It is not eligible for automatic project-wide learning."
          );
        }
        const governedPrompt=legalMode
          ?buildLegalEaglePrompt({
              jurisdiction,
              legalTask,
              job,
              certifiedMemory:certifiedMemory.map(item=>String(item.normalized_knowledge||"")),
              matterEvidence:events.map(item=>item.content),
              userMessage:message
            })
          :developmentMode
            ?buildDevelopmentCommandPrompt({
                job,
                workingMemory:[
                  ...certifiedMemory.map(item=>"[CERTIFIED BASELINE] "+String(item.normalized_knowledge||"")),
                  ...developmentMemory.map(item=>"[WORKING MEMORY] "+item)
                ],
                userMessage:message
              })
            :buildGovernedPrompt({
                governance:governanceRules.join("\n"),
                certifiedMemory:certifiedMemory.map(item=>String(item.normalized_knowledge||"")),
                job,
                uncertifiedEvidence:events.map(item=>item.content),
                userMessage:message
              });

        const ilm=await resolveActiveIlmRoute({
          serviceClient,
          userId:user.id,
          job,
          requestId:activeRequestId,
          traceId:stagedInputTraceId,
          purpose:policyPurpose,
          visibilityClass,
          learningEligible,
          requestedConnection,
          certifiedMemory
        });

        if(ilm.route){
          if(
            ilm.route.decision==="selected" &&
            ilm.route.routeKind==="provider_model" &&
            ilm.connection
          ){
            const connection=ilm.connection;
            const providerKey=connection.provider.toLowerCase()+":"+connection.endpoint_host.toLowerCase();
            const {data:ilmPhaseDAuthorityData,error:ilmPhaseDAuthorityError}=await serviceClient.rpc(
              "service_evaluate_execution_authority_v1",{
                target_project:job.project_id,
                target_requesting_user:user.id,
                target_route_key:"external_ai_provider",
                target_actor_type:"service",
                target_actor_reference:"service:datanest-ai",
                target_job:job.id,
                target_operation:"external_provider_call",
                target_consequence_class:"resource_execution",
                target_requested_autonomy:"A3",
                target_trace_id:stagedInputTraceId,
                target_capability_keys:["external_ai:"+providerKey],
                target_target_type:"provider",
                target_target_reference:providerKey,
                target_exact_evidence_identity:null,
                target_phase_c_decision:ilm.phaseCDecisionRecordId,
                target_provider_request:activeRequestId,
                target_require_reservation:false,
                target_consume_operation:true
              }
            );
            if(ilmPhaseDAuthorityError){
              requestStatus="denied";
              await finishUsageRequest(serviceClient,{
                requestId:activeRequestId,
                target_status:"denied",
                errorCategory:"execution_authority_evaluation_failed",
                errorMessage:"Execution authority could not be evaluated; external routing was stopped safely."
              });
            }else{
              const ilmPhaseDAuthority=(ilmPhaseDAuthorityData||{}) as Record<string,unknown>;
              const ilmPhaseDAuthorityEnforced=String(ilmPhaseDAuthority.enforcement_mode||"report_only")==="enforced";
              if(ilmPhaseDAuthorityEnforced&&String(ilmPhaseDAuthority.outcome||"deny")!=="allow"){
                requestStatus="denied";
                await finishUsageRequest(serviceClient,{
                  requestId:activeRequestId,
                  target_status:"denied",
                  errorCategory:"execution_authority_denied",
                  errorMessage:"Execution authority blocked external routing: "+String(ilmPhaseDAuthority.reason_code||"authority_denied")
                });
              }else{
            const {data:authz,error:authzError}=await serviceClient.rpc(
              "service_authorize_ai_request",{
                target_request:activeRequestId,
                target_connection:connection.id
              }
            );
            if(authzError)throw authzError;
            if(Boolean((authz as Record<string,unknown>|null)?.allowed)){
              try{
                const ext=await callOpenAiCompatibleProvider({
                  connection,
                  governedPrompt,
                  maxOutputTokens:Number((authz as Record<string,unknown>).max_output_tokens||4000)
                });
                await finishUsageRequest(serviceClient,{
                  requestId:activeRequestId,
                  target_status:"succeeded",
                  inputTokens:ext.inputTokens,
                  outputTokens:ext.outputTokens
                });
                requestStatus="succeeded";
                developmentDual=developmentMode?parseCompleteDualAdvocacyResponse(ext.content):null;
                const content=legalMode
                  ?formatDualAdvocacyResponse(parseDualAdvocacyResponse(ext.content))
                  :developmentDual
                    ?formatDualAdvocacyResponse(developmentDual)
                    :ext.content;
                if(developmentMode){
                  developmentProviderLabel=connection.label;
                  developmentModelLabel=connection.model;
                }
                return {
                  content,
                  providerMode:"external",
                  providerLabel:connection.label,
                  inputTokens:ext.inputTokens,
                  outputTokens:ext.outputTokens
                };
              }catch(error){
                const category=(error as Error&{category?:string}).category==="failed"
                  ?"failed"
                  :"unknown";
                requestStatus=category;
                await finishUsageRequest(serviceClient,{
                  requestId:activeRequestId,
                  target_status:category,
                  errorCategory:category==="failed"?"provider_failure":"provider_outcome_unknown",
                  errorMessage:category==="failed"
                    ?"Provider rejected or could not complete the request."
                    :"Provider outcome is unknown; DataNest will not retry automatically."
                });
              }
            }else{
              requestStatus="denied";
              await finishUsageRequest(serviceClient,{
                requestId:activeRequestId,
                target_status:"denied",
                errorCategory:String((authz as Record<string,unknown>|null)?.reason||"policy_denied"),
                errorMessage:"Provider request blocked by DataNest policy."
              });
            }
              }
            }
          }else if(ilm.route.decision==="rejected"){
            requestStatus="denied";
            await finishUsageRequest(serviceClient,{
              requestId:activeRequestId,
              target_status:"denied",
              errorCategory:ilm.route.reasonCodes[0]||"ilm_route_rejected",
              errorMessage:"ILM-1 rejected external intelligence routing for this request."
            });
          }
        }else{
          const connection=await resolveConfiguredProviderConnection({
            serviceClient,
            projectId:job.project_id,
            userId:user.id,
            requestedConnection
          });
  
          if(connection){
            const providerKey=connection.provider.toLowerCase()+":"+connection.endpoint_host.toLowerCase();
            const {data:phaseCPolicyData,error:phaseCPolicyError}=await serviceClient.rpc(
              "service_evaluate_data_policy_v1",{
                target_project:job.project_id,
                target_actor_user:user.id,
                target_subject_type:"job",
                target_purpose:"external_provider_processing",
                target_requested_operation:"process",
                target_trace_id:stagedInputTraceId,
                target_subject_id:job.id,
                target_subject_reference:null,
                target_provider_connection:connection.id,
                target_provider_key:providerKey,
                target_hard_learning_exclusion:!learningEligible
              }
            );
            if(phaseCPolicyError)throw phaseCPolicyError;
            const phaseCPolicy=(phaseCPolicyData||{}) as Record<string,unknown>;
  
            const phaseCPolicyEnforced=String(phaseCPolicy.enforcement_mode||"report_only")==="enforced";
            if(phaseCPolicyEnforced&&String(phaseCPolicy.outcome||"deny")!=="allow"){
              requestStatus="denied";
              await finishUsageRequest(serviceClient,{
                requestId:activeRequestId,
                target_status:"denied",
                errorCategory:"provider_trust_policy_denied",
                errorMessage:"Provider Trust Profile blocked external routing: "+String(phaseCPolicy.reason_code||"policy_denied")
              });
            }else{
              const {data:phaseDAuthorityData,error:phaseDAuthorityError}=await serviceClient.rpc(
                "service_evaluate_execution_authority_v1",{
                  target_project:job.project_id,
                  target_requesting_user:user.id,
                  target_route_key:"external_ai_provider",
                  target_actor_type:"service",
                  target_actor_reference:"service:datanest-ai",
                  target_job:job.id,
                  target_operation:"external_provider_call",
                  target_consequence_class:"resource_execution",
                  target_requested_autonomy:"A3",
                  target_trace_id:stagedInputTraceId,
                  target_capability_keys:["external_ai:"+providerKey],
                  target_target_type:"provider",
                  target_target_reference:providerKey,
                  target_exact_evidence_identity:null,
                  target_phase_c_decision:phaseCPolicy.decision_record_id||null,
                  target_provider_request:activeRequestId,
                  target_require_reservation:false,
                  target_consume_operation:true
                }
              );
              if(phaseDAuthorityError){
                requestStatus="denied";
                await finishUsageRequest(serviceClient,{
                  requestId:activeRequestId,
                  target_status:"denied",
                  errorCategory:"execution_authority_evaluation_failed",
                  errorMessage:"Execution authority could not be evaluated; external routing was stopped safely."
                });
              }else{
                const phaseDAuthority=(phaseDAuthorityData||{}) as Record<string,unknown>;
                const phaseDAuthorityEnforced=String(phaseDAuthority.enforcement_mode||"report_only")==="enforced";
                if(phaseDAuthorityEnforced&&String(phaseDAuthority.outcome||"deny")!=="allow"){
                  requestStatus="denied";
                  await finishUsageRequest(serviceClient,{
                    requestId:activeRequestId,
                    target_status:"denied",
                    errorCategory:"execution_authority_denied",
                    errorMessage:"Execution authority blocked external routing: "+String(phaseDAuthority.reason_code||"authority_denied")
                  });
                }else{
              const {data:authz,error:authzError}=await serviceClient.rpc(
                "service_authorize_ai_request",{
                  target_request:activeRequestId,
                  target_connection:connection.id
                }
              );
              if(authzError)throw authzError;
              if(Boolean((authz as Record<string,unknown>|null)?.allowed)){
                try{
                  const ext=await callOpenAiCompatibleProvider({
                    connection,
                    governedPrompt,
                    maxOutputTokens:Number((authz as Record<string,unknown>).max_output_tokens||4000)
                  });
                  await finishUsageRequest(serviceClient,{
                    requestId:activeRequestId,
                    target_status:"succeeded",
                    inputTokens:ext.inputTokens,
                    outputTokens:ext.outputTokens
                  });
                  requestStatus="succeeded";
                  developmentDual=developmentMode?parseCompleteDualAdvocacyResponse(ext.content):null;
                  const content=legalMode
                    ?formatDualAdvocacyResponse(parseDualAdvocacyResponse(ext.content))
                    :developmentDual
                      ?formatDualAdvocacyResponse(developmentDual)
                      :ext.content;
                if(developmentMode){
                  developmentProviderLabel=connection.label;
                  developmentModelLabel=connection.model;
                }
                return {
                  content,
                  providerMode:"external",
                  providerLabel:connection.label,
                  inputTokens:ext.inputTokens,
                  outputTokens:ext.outputTokens
                };
                }catch(error){
                  const category=(error as Error&{category?:string}).category==="failed"
                    ?"failed"
                    :"unknown";
                  requestStatus=category;
                  await finishUsageRequest(serviceClient,{
                    requestId:activeRequestId,
                    target_status:category,
                    errorCategory:category==="failed"?"provider_failure":"provider_outcome_unknown",
                    errorMessage:category==="failed"
                      ?"Provider rejected or could not complete the request."
                      :"Provider outcome is unknown; DataNest will not retry automatically."
                  });
                }
              }else{
                requestStatus="denied";
                await finishUsageRequest(serviceClient,{
                  requestId:activeRequestId,
                  target_status:"denied",
                  errorCategory:String((authz as Record<string,unknown>|null)?.reason||"policy_denied"),
                  errorMessage:"Provider request blocked by DataNest policy."
                });
              }                }
              }
            }
          }
  
        }
        if(requestStatus==="pending"){
          await finishUsageRequest(serviceClient,{
            requestId:activeRequestId,
            target_status:"embedded"
          });
          requestStatus="embedded";
        }

        return {
          content:embeddedResponse(job,message,productMode,jurisdiction,clientTimeZone),
          providerMode:"embedded",
          providerLabel:null,
          inputTokens:0,
          outputTokens:0
        };
      },
      stageOutput:async({inputEvent,provider})=>{
        const traceId="DN-AI-"+crypto.randomUUID();
        const contentHash=await sha256Text(provider.content);
        const {data,error}=await stagingClient
          .from("ai_intake_events")
          .insert({
            trace_id:traceId,
            project_id:job.project_id,
            job_id:job.id,
            session_id:sessionId,
            source_type:"datanest_ai",
            source_provider:provider.providerLabel||provider.providerMode||"embedded",
            parent_event_id:inputEvent.id,
            content:provider.content,
            content_hash:contentHash,
            metadata:{
              ...buildEvidenceLanguageMetadata({content:provider.content}),
              trust_state:"uncertified",
              channel_mode:developmentMode?"development_command":"standard",
              request_status:requestStatus,
              policy_version:policyVersion,
              product_mode:legalMode?"legal_eagle":"datanest_ai",
              jurisdiction:legalMode?jurisdiction:null,
              legal_task:legalMode?legalTask:null,
              requested_learning_eligible:learningEligible,
              learning_eligible:false,
              visibility_class:visibilityClass,
              reuse_state:reuseState,
              purpose:policyPurpose
            }
          })
          .select("id,trace_id")
          .single();
        if(error||!data)throw error||new Error("Unable to stage DataNest AI response.");
        return {id:String(data.id),traceId:String(data.trace_id)};
      },
      stageEnvelope:async({inputEvent,outputEvent,provider})=>{
        const ids=[...new Set([...provisionalIds,String(inputEvent.id||"")].filter(Boolean))];
        const {error}=await stagingClient
          .from("ai_reasoning_envelopes")
          .insert({
            project_id:job.project_id,
            job_id:job.id,
            session_id:sessionId,
            output_event_id:outputEvent.id,
            provider_route:provider.providerMode||"embedded",
            policy_version:policyVersion,
            input_event_ids:ids,
            certified_memory_ids:certifiedMemoryIds,
            uncertified_event_ids:ids,
            request_status:requestStatus
          });
        if(error)throw error;

        try{
          if(developmentMode){
            trendAnalysis={status:"not_applicable"};
            if(!developmentDual||!outputEvent.traceId){
              workingMemoryStatus="skipped_incomplete_response";
              return;
            }
            await recordDevelopmentWorkingMemory({
              serviceClient,
              projectId:job.project_id,
              jobId:job.id,
              userId:user.id,
              sessionId,
              clientRequestId,
              inputTraceId:String(inputEvent.traceId||stagedInputTraceId),
              outputTraceId:String(outputEvent.traceId),
              command:message,
              dual:developmentDual,
              providerLabel:developmentProviderLabel,
              modelLabel:developmentModelLabel,
              expertiseSection:requestedExpertiseSection||null,
              expertiseLabel:expertise?.label||null,
              verificationTrack:expertise?.verificationTrack||null,
              requirementFocusKeys:expertiseRequirementFocusKeys,
              jobRequirementFocusKeys,
              matchedRequirementFocusKeys
            });
            workingMemoryStatus="recorded";
            return;
          }

          if(learningPolicyErrorMessage)throw new Error(learningPolicyErrorMessage);

          if(legalMode){
            trendAnalysis={status:"not_applicable"};
            return;
          }
          if(!finalLearningEligible){
            trendAnalysis={status:"not_applicable"};
            return;
          }

          const trend=await updateTrendCandidate({
            staging:stagingClient,
            projectId:job.project_id,
            inputEventId:String(inputEvent.id||""),
            policyVersion
          });
          trendAnalysis=trend.candidateId
            ?{status:"recorded",...trend}
            :{status:"not_applicable",...trend};
        }catch(trendError){
          if(developmentMode){
            workingMemoryStatus="failed";
            return;
          }
          trendAnalysis={
            status:"failed",
            error:trendError instanceof Error?trendError.message:"Trend analysis failed."
          };
        }
      }
    },{message});

    if(developmentMode&&result.idempotent){
      const {data:recordedTurn,error:recordedTurnError}=await serviceClient
        .from("development_command_turns")
        .select("id")
        .eq("project_id",job.project_id)
        .eq("user_id",user.id)
        .eq("client_request_id",clientRequestId)
        .maybeSingle();
      if(recordedTurnError)throw recordedTurnError;
      workingMemoryStatus=recordedTurn?"recorded":"not_recorded";
    }

    return json({
      ...result,
      trustState:workingMemoryStatus==="recorded"?"WORKING_MEMORY":"UNCERTIFIED",
      channelMode:developmentMode?"development_command":null,
      cumulativeWorkingMemory:workingMemoryStatus==="recorded",
      workingMemoryStatus,
      certifiedMemoryIds,
      memorySelectionStrategy,
      memoryReceiptStatus,
      requestStatus,
      trendAnalysis,
      productMode:legalMode?"legal_eagle":null,
      dualAdvocacy:legalMode||developmentMode,
      jurisdiction:legalMode?jurisdiction:null,
      learningEligible,
      visibilityClass,
      reuseState,
      policyPurpose,
      expertiseSection:requestedExpertiseSection||null,
      impactArea:expertise?.label||null,
      verificationTrack:expertise?.verificationTrack||null,
      requirementFocusKeys:expertiseRequirementFocusKeys,
      jobRequirementFocusKeys,
      matchedRequirementFocusKeys,
      requirementFocusMatch:matchedRequirementFocusKeys.length>0,
      contributionTracking
    },200,origin);
  }catch(error){
    const message=error instanceof Error?error.message:"Unable to process DataNest AI request.";
    const status=/staging/i.test(message)?503:400;
    return json({error:message},status,origin);
  }
});
