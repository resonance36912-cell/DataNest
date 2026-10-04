import { createClient } from "@supabase/supabase-js";
import { callOpenAiCompatibleProvider,type ProviderConnection } from "../_shared/provider.ts";

declare const Deno:{env:{get:(name:string)=>string|undefined};serve:(handler:(request:Request)=>Response|Promise<Response>)=>void};

const allowedOrigins=new Set([
  "https://datanest-supository.github.io",
  "https://reson8.datanest.life",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4173",
  "http://127.0.0.1:4173"
]);

const riskClasses=new Set(["low","moderate","high","critical"]);
const reviewLanes=new Set(["audit_optimizer","workflow_reviewer","code_cleaner","cross_system"]);

function cors(origin:string|null){
  const safe=origin&&allowedOrigins.has(origin)?origin:"https://datanest-supository.github.io";
  return {
    "Access-Control-Allow-Origin":safe,
    "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods":"POST,OPTIONS",
    "Vary":"Origin"
  };
}

function json(body:unknown,status:number,origin:string|null){
  return new Response(JSON.stringify(body),{
    status,
    headers:{...cors(origin),"Content-Type":"application/json","Cache-Control":"no-store"}
  });
}

async function sha256Text(input:string){
  const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(input));
  return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,"0")).join("");
}

function stringArray(value:unknown,max=24){
  return Array.isArray(value)
    ?value.map(item=>String(item||"").trim()).filter(Boolean).slice(0,max)
    :[];
}

function objectValue(value:unknown):Record<string,unknown>{
  return value&&typeof value==="object"&&!Array.isArray(value)
    ?value as Record<string,unknown>
    :{};
}

function timestampValue(value:unknown){
  const timestamp=Date.parse(String(value||""));
  return Number.isFinite(timestamp)?timestamp:0;
}

function monitorEvidenceIdentity(item:Record<string,unknown>){
  const evidenceRef=String(item.evidence_ref||"");
  if(!evidenceRef.startsWith("control-monitor:"))return "";
  const parts=evidenceRef.split(":");
  const checkKey=parts.slice(2).join(":").trim();
  if(!checkKey)return "";
  return `${String(item.control_key||"unknown")}:${checkKey}`;
}

function reconcileControlEvidence(value:unknown,maxActive=15,maxHistory=12){
  const items=(Array.isArray(value)?value:[])
    .filter(item=>item&&typeof item==="object"&&!Array.isArray(item))
    .map(item=>item as Record<string,unknown>)
    .sort((a,b)=>timestampValue(b.observed_at)-timestampValue(a.observed_at));

  const latestByCheck=new Map<string,Record<string,unknown>>();
  const historyByCheck=new Map<string,{
    control_key:string;
    check_key:string;
    latest_trace_key:string;
    latest_evidence_state:string;
    latest_observed_at:string;
    superseded_failure_count:number;
  }>();
  const retainedNonMonitor:Record<string,unknown>[]=[];

  for(const item of items){
    const identity=monitorEvidenceIdentity(item);
    if(!identity){
      retainedNonMonitor.push(item);
      continue;
    }

    const [controlKey,...checkParts]=identity.split(":");
    const checkKey=checkParts.join(":");
    const existing=latestByCheck.get(identity);
    if(!existing){
      latestByCheck.set(identity,item);
      historyByCheck.set(identity,{
        control_key:controlKey,
        check_key:checkKey,
        latest_trace_key:String(item.trace_key||""),
        latest_evidence_state:String(item.evidence_state||"unknown"),
        latest_observed_at:String(item.observed_at||""),
        superseded_failure_count:0
      });
      continue;
    }

    const state=String(item.evidence_state||"").toLowerCase();
    if(state==="failed"){
      const summary=historyByCheck.get(identity);
      if(summary)summary.superseded_failure_count+=1;
    }
  }

  const active=[...latestByCheck.values(),...retainedNonMonitor]
    .sort((a,b)=>timestampValue(b.observed_at)-timestampValue(a.observed_at))
    .slice(0,maxActive);
  const history=[...historyByCheck.values()]
    .sort((a,b)=>timestampValue(b.latest_observed_at)-timestampValue(a.latest_observed_at))
    .slice(0,maxHistory);

  return {active,history};
}

function collectAllowedEvidenceRefs(compactEvidence:Record<string,unknown>){
  const allowed=new Set<string>([
    "ai_metrics","job_metrics","ai_impact_assessments","governance_observations",
    "external_audit_findings","control_evidence","governance_cycles"
  ]);
  const arrays=[
    compactEvidence.governance_observations,
    compactEvidence.external_audit_findings,
    compactEvidence.ai_impact_assessments,
    compactEvidence.control_evidence,
    compactEvidence.governance_cycles
  ];
  for(const array of arrays){
    if(!Array.isArray(array))continue;
    for(const raw of array){
      const item=objectValue(raw);
      for(const key of ["id","trace_key","assessment_key","evidence_ref","control_key"]){
        const value=String(item[key]||"").trim();
        if(value)allowed.add(value);
      }
    }
  }
  return allowed;
}

function collectPassingControlEvidenceRefs(value:unknown){
  const refs=new Set<string>();
  if(!Array.isArray(value))return refs;
  for(const raw of value){
    const item=objectValue(raw);
    const state=String(item.evidence_state||"").toLowerCase();
    if(state!=="passed"&&state!=="resolved")continue;
    for(const key of ["id","trace_key","evidence_ref"]){
      const ref=String(item[key]||"").trim();
      if(ref)refs.add(ref);
    }
  }
  return refs;
}

function parseProviderJson(content:string):unknown{
  const trimmed=content.trim();
  const unfenced=trimmed
    .replace(/^\`\`\`(?:json)?\s*/i,"")
    .replace(/\s*\`\`\`$/,"")
    .trim();
  try{return JSON.parse(unfenced);}catch{}
  const start=unfenced.indexOf("{");
  const end=unfenced.lastIndexOf("}");
  if(start>=0&&end>start){
    try{return JSON.parse(unfenced.slice(start,end+1));}catch{}
  }
  throw new Error("provider_returned_non_json_optimizer_draft");
}

type OptimizerSuggestion={
  fingerprint:string;
  title:string;
  problemStatement:string;
  hypothesis:string;
  desiredOutcome:string;
  proposedChange:Record<string,unknown>;
  guardrails:Record<string,unknown>;
  evidenceRefs:string[];
  standardRefs:string[];
  riskClass:"low"|"moderate"|"high"|"critical";
  confidence:number|null;
};

async function validateDraft(
  raw:unknown,
  standardKeys:Set<string>,
  allowedEvidenceRefs:Set<string>,
  passingControlEvidenceRefs:Set<string>
):Promise<{summary:string;limitations:string[];suggestions:OptimizerSuggestion[]}>{
  if(!raw||typeof raw!=="object")throw new Error("optimizer_draft_object_required");
  const record=raw as Record<string,unknown>;
  const suggestionsRaw=Array.isArray(record.suggestions)?record.suggestions.slice(0,10):[];
  const suggestions:OptimizerSuggestion[]=[];

  for(const item of suggestionsRaw){
    if(!item||typeof item!=="object")continue;
    const value=item as Record<string,unknown>;
    const title=String(value.title||"").trim().slice(0,300);
    const problemStatement=String(value.problemStatement||"").trim().slice(0,4000);
    const hypothesis=String(value.hypothesis||"").trim().slice(0,4000);
    const desiredOutcome=String(value.desiredOutcome||"").trim().slice(0,4000);
    if(title.length<3||problemStatement.length<3||hypothesis.length<3||desiredOutcome.length<3)continue;

    const proposedChange=objectValue(value.proposedChange);
    const guardrails=objectValue(value.guardrails);
    const laneRaw=String(proposedChange.lane||"cross_system").trim().toLowerCase();
    const lane=reviewLanes.has(laneRaw)?laneRaw:"cross_system";
    const normalizedProposedChange={...proposedChange,lane};
    const normalizedGuardrails={
      ...guardrails,
      collaboration:{
        controller:"DataNest AI",
        reviewers:["Audit Optimizer","Workflow Reviewer","Code Cleaner"]
      },
      noAutomaticCodeChanges:true
    };
    const evidenceRefs=stringArray(value.evidenceRefs).filter(ref=>allowedEvidenceRefs.has(ref));
    if(evidenceRefs.length===0)continue;
    if(evidenceRefs.every(ref=>passingControlEvidenceRefs.has(ref)))continue;
    const standardRefs=stringArray(value.standardRefs).filter(key=>standardKeys.has(key));
    const riskRaw=String(value.riskClass||"moderate").toLowerCase();
    const riskClass=(riskClasses.has(riskRaw)?riskRaw:"moderate") as OptimizerSuggestion["riskClass"];
    const confidenceRaw=Number(value.confidence);
    const confidence=Number.isFinite(confidenceRaw)?Math.max(0,Math.min(1,confidenceRaw)):null;
    const fingerprint=await sha256Text([
      title.toLowerCase(),problemStatement.toLowerCase(),JSON.stringify(normalizedProposedChange)
    ].join("\n"));

    suggestions.push({
      fingerprint,title,problemStatement,hypothesis,desiredOutcome,
      proposedChange:normalizedProposedChange,
      guardrails:normalizedGuardrails,
      evidenceRefs,standardRefs,riskClass,confidence
    });
  }

  return {
    summary:String(record.summary||"").trim().slice(0,6000),
    limitations:stringArray(record.limitations,20).map(item=>item.slice(0,1000)),
    suggestions
  };
}

Deno.serve(async(request)=>{
  const origin=request.headers.get("origin");
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
  if(request.method!=="POST")return json({error:"method_not_allowed"},405,origin);

  const url=Deno.env.get("SUPABASE_URL")||"";
  const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!anon||!serviceKey)return json({error:"runtime_not_configured"},503,origin);

  const serviceClient=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  let runId="";
  let aiRequestId="";

  try{
    const body=await request.json() as Record<string,unknown>;
    const action=String(body.action||"").trim();
    const projectId=String(body.projectId||"").trim();
    if(!projectId)return json({error:"projectId_required"},400,origin);

    let actorUserId="";
    let triggerKind:"owner"|"admin"|"cron";

    if(action==="cron"){
      triggerKind="cron";
      const cronToken=String(body.cronToken||"");
      const {data:verified,error:verifyError}=await serviceClient.rpc(
        "service_verify_optimizer_cron_token_v1",
        {target_token:cronToken}
      );
      if(verifyError)throw verifyError;
      if(verified!==true)return json({error:"cron_authentication_failed"},401,origin);

      const {data:owners,error:ownerError}=await serviceClient
        .from("project_members")
        .select("user_id")
        .eq("project_id",projectId)
        .eq("status","active")
        .eq("role","owner")
        .order("user_id")
        .limit(1);
      if(ownerError)throw ownerError;
      actorUserId=String(owners?.[0]?.user_id||"");
      if(!actorUserId)return json({error:"active_owner_required"},409,origin);
    }else if(action==="run"){
      const authHeader=request.headers.get("authorization")||"";
      if(!authHeader)return json({error:"authentication_required"},401,origin);
      const userClient=createClient(url,anon,{
        global:{headers:{Authorization:authHeader}},
        auth:{persistSession:false,autoRefreshToken:false}
      });
      const {data:userData,error:userError}=await userClient.auth.getUser();
      if(userError||!userData.user)return json({error:"authentication_required"},401,origin);
      actorUserId=userData.user.id;

      const {data:membership,error:membershipError}=await serviceClient
        .from("project_members")
        .select("role,status")
        .eq("project_id",projectId)
        .eq("user_id",actorUserId)
        .maybeSingle();
      if(membershipError)throw membershipError;
      if(
        membership?.status!=="active"||
        !["owner","admin"].includes(String(membership.role||""))
      ){
        return json({error:"optimizer_admin_access_required"},403,origin);
      }
      triggerKind=membership.role==="owner"?"owner":"admin";
    }else{
      return json({error:"unsupported_action"},400,origin);
    }

    const requestKey=String(body.requestKey||crypto.randomUUID());
    const {data:runState,error:runError}=await serviceClient.rpc(
      "service_create_optimizer_run_v1",
      {
        target_project:projectId,
        target_trigger_kind:triggerKind,
        target_actor_user:actorUserId,
        target_request_key:requestKey
      }
    );
    if(runError)throw runError;
    if(runState?.skip){
      return json({
        skipped:true,
        reason:String(runState.status||"not_due"),
        nextRunAfter:runState.next_run_after||null
      },200,origin);
    }
    runId=String(runState?.run_id||"");
    if(!runId)throw new Error("optimizer_run_not_created");

    const {data:evidence,error:evidenceError}=await serviceClient.rpc(
      "service_get_optimizer_evidence_v1",
      {target_project:projectId}
    );
    if(evidenceError)throw evidenceError;

    const evidenceObject=objectValue(evidence);
    const standards=Array.isArray(evidenceObject.standards)?evidenceObject.standards:[];
    const standardKeys=new Set(
      standards.map(item=>String((item as Record<string,unknown>)?.standard_key||"")).filter(Boolean)
    );
    const reconciledControlEvidence=reconcileControlEvidence(evidenceObject.control_evidence);
    const compactEvidence={
      captured_at:evidenceObject.captured_at||null,
      project:evidenceObject.project||null,
      job_metrics:evidenceObject.job_metrics||{},
      ai_metrics:evidenceObject.ai_metrics||{},
      boundaries:evidenceObject.boundaries||{},
      standards:Array.isArray(evidenceObject.standards)?evidenceObject.standards.slice(0,24):[],
      governance_cycles:Array.isArray(evidenceObject.governance_cycles)?evidenceObject.governance_cycles.slice(0,4):[],
      governance_observations:Array.isArray(evidenceObject.governance_observations)?evidenceObject.governance_observations.slice(0,15):[],
      external_audit_findings:Array.isArray(evidenceObject.external_audit_findings)?evidenceObject.external_audit_findings.slice(0,15):[],
      ai_impact_assessments:Array.isArray(evidenceObject.ai_impact_assessments)?evidenceObject.ai_impact_assessments.slice(0,10):[],
      control_evidence:reconciledControlEvidence.active
    };
    const evidenceText=JSON.stringify(compactEvidence);
    const evidenceDigest=await sha256Text(evidenceText);
    const clientRequestId=crypto.randomUUID();

    const {data:requestState,error:beginError}=await serviceClient.rpc(
      "service_begin_optimizer_ai_request_v1",
      {
        target_run:runId,
        target_client_request_id:clientRequestId,
        target_message_fingerprint:evidenceDigest
      }
    );
    if(beginError)throw beginError;
    aiRequestId=String(requestState?.id||"");
    if(!aiRequestId)throw new Error("optimizer_ai_request_not_created");

    const {data:connection,error:connectionError}=await serviceClient.rpc(
      "service_get_ai_provider_connection_v3",
      {target_project:projectId,target_user:actorUserId,target_connection:null}
    );
    if(connectionError)throw connectionError;
    if(!connection)throw new Error("governed_ai_provider_unavailable");

    const {data:authorization,error:authorizationError}=await serviceClient.rpc(
      "service_authorize_ai_request",
      {target_request:aiRequestId,target_connection:(connection as Record<string,unknown>).id}
    );
    if(authorizationError)throw authorizationError;

    if(!(authorization as Record<string,unknown>)?.allowed){
      const reason=String((authorization as Record<string,unknown>)?.reason||"policy_denied");
      await serviceClient.rpc("service_finish_ai_request",{
        target_request:aiRequestId,target_status:"denied",input_tokens:0,output_tokens:0,
        estimated_cost_minor:null,provider_reported_cost_minor:null,reconciled_cost_minor:null,
        target_error_category:reason,target_error_message:"Optimizer AI request denied by governed policy."
      });
      await serviceClient.rpc("service_complete_optimizer_run_v1",{
        target_run:runId,target_status:"denied",target_summary:null,target_limitations:[],
        target_evidence_snapshot:{capturedAt:evidenceObject.captured_at||null,digest:evidenceDigest},
        target_suggestions:[],target_error_category:reason,
        target_error_message:"Optimizer AI request denied by governed policy."
      });
      return json({error:"ai_request_denied",reason,runId},403,origin);
    }

    const governedPrompt=[
      "You are the Resonance DataNest AI System Optimizer.",
      "Coordinate three explicit review lanes for the entire governed system:",
      "1. Audit Optimizer — inspect evidence, controls, governance, security, compliance, reliability, cost and operational anomalies.",
      "2. Workflow Reviewer — inspect Job flow, queues, handoffs, approvals, blocked work, traceability, scheduling and process friction.",
      "3. Code Cleaner — identify evidence-supported maintainability, duplication, test, configuration, performance or cleanup opportunities. Code Cleaner may propose patch plans and verification steps, but must never edit, merge or deploy code.",
      "Use cross_system when a suggestion materially spans more than one lane.",
      "Your only authority is to SUGGEST optimizations for Admin/Owner review. Only an Owner may approve a suggestion into formal governance.",
      "Never approve, vote, ratify, deploy, mutate production, alter roles, weaken controls, edit source code, or claim certification.",
      "Analyze the supplied DataNest governance, audit, operational, AI-usage, impact-assessment, and control evidence.",
      "Prefer concrete, reversible, testable improvements. Preserve dissent, uncertainty, provenance, privacy, security, accessibility, and existing governance boundaries.",
      "Do not invent source-code defects. Code Cleaner suggestions require evidence that supports a code, configuration, test, or maintainability implication; otherwise record the limitation and use another lane or return no suggestion.",
      "Each suggestion must cite evidenceRefs using identifiers or trace keys present in the supplied evidence. Use standardRefs only from the supplied active standard_key values.",
      "For monitored governance controls, control_evidence contains only the latest applicable state per control/check. Superseded monitor failures are intentionally omitted from active-problem evidence.",
      "Never propose remediation from a superseded failed monitor record when the latest evidence for that same control/check is passed or resolved. Do not infer an active problem from a current passed/resolved control state.",
      "Return JSON only with this shape:",
      JSON.stringify({
        summary:"string",
        limitations:["string"],
        suggestions:[{
          title:"string",
          problemStatement:"string",
          hypothesis:"string",
          desiredOutcome:"string",
          proposedChange:{
            lane:"audit_optimizer|workflow_reviewer|code_cleaner|cross_system",
            description:"string",
            implementationOutline:["string"],
            verification:["string"],
            rollback:"string"
          },
          guardrails:{
            humanApproval:true,
            noAutomaticDeployment:true,
            noAutomaticCodeChanges:true
          },
          evidenceRefs:["string"],
          standardRefs:["active-standard-key"],
          riskClass:"low|moderate|high|critical",
          confidence:0.0
        }]
      }),
      "Generate at most 5 suggestions. It is acceptable to return zero suggestions when evidence does not support a useful change.",
      "DATANEST EVIDENCE SNAPSHOT:",
      evidenceText.slice(0,26000)
    ].join("\n\n");

    const provider=await callOpenAiCompatibleProvider({
      connection:connection as ProviderConnection,
      governedPrompt,
      maxOutputTokens:Math.min(Number((authorization as Record<string,unknown>)?.max_output_tokens||2200),2200),
      chatTemplateKwargs:{enable_thinking:false,force_nonempty_content:true}
    });

    const parsed=parseProviderJson(provider.content);
    const allowedEvidenceRefs=collectAllowedEvidenceRefs(compactEvidence);
    const passingControlEvidenceRefs=collectPassingControlEvidenceRefs(reconciledControlEvidence.active);
    const draft=await validateDraft(parsed,standardKeys,allowedEvidenceRefs,passingControlEvidenceRefs);

    await serviceClient.rpc("service_finish_ai_request",{
      target_request:aiRequestId,target_status:"succeeded",
      input_tokens:provider.inputTokens,output_tokens:provider.outputTokens,
      estimated_cost_minor:null,provider_reported_cost_minor:null,reconciled_cost_minor:null,
      target_error_category:null,target_error_message:null
    });

    const {data:complete,error:completeError}=await serviceClient.rpc(
      "service_complete_optimizer_run_v1",
      {
        target_run:runId,
        target_status:"succeeded",
        target_summary:draft.summary||"Optimizer review completed.",
        target_limitations:draft.limitations,
        target_evidence_snapshot:{
          capturedAt:evidenceObject.captured_at||null,
          digest:evidenceDigest,
          governanceObservationCount:Array.isArray(evidenceObject.governance_observations)?evidenceObject.governance_observations.length:0,
          externalAuditFindingCount:Array.isArray(evidenceObject.external_audit_findings)?evidenceObject.external_audit_findings.length:0,
          controlEvidenceCount:Array.isArray(evidenceObject.control_evidence)?evidenceObject.control_evidence.length:0,
          reconciledControlEvidenceCount:reconciledControlEvidence.active.length,
          reconciledMonitorCheckCount:reconciledControlEvidence.history.length,
          impactAssessmentCount:Array.isArray(evidenceObject.ai_impact_assessments)?evidenceObject.ai_impact_assessments.length:0
        },
        target_suggestions:draft.suggestions,
        target_error_category:null,
        target_error_message:null
      }
    );
    if(completeError)throw completeError;

    return json({
      runId,
      status:"succeeded",
      suggestionCount:Number((complete as Record<string,unknown>)?.suggestion_count||0),
      summary:draft.summary,
      limitations:draft.limitations
    },200,origin);
  }catch(error){
    const message=error instanceof Error?error.message:"optimizer_failure";
    const category=String((error as Error&{category?:string})?.category||"failed");
    if(aiRequestId){
      try{
        await serviceClient.rpc("service_finish_ai_request",{
          target_request:aiRequestId,
          target_status:category==="unknown"?"unknown":"failed",
          input_tokens:0,output_tokens:0,estimated_cost_minor:null,
          provider_reported_cost_minor:null,reconciled_cost_minor:null,
          target_error_category:"optimizer_analysis_failed",target_error_message:message
        });
      }catch{}
    }
    if(runId){
      try{
        await serviceClient.rpc("service_complete_optimizer_run_v1",{
          target_run:runId,target_status:"failed",target_summary:null,
          target_limitations:[],target_evidence_snapshot:{},target_suggestions:[],
          target_error_category:"optimizer_analysis_failed",target_error_message:message
        });
      }catch{}
    }
    return json({error:message,runId:runId||null,resumable:true},message==="governed_ai_provider_unavailable"?503:500,origin);
  }
});
