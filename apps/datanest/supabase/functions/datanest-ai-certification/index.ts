import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  allAutomatedCertificationGatesPassed,
  allCertificationGatesPassed,
  canAutoCertify,
  canHumanCertify,
  requiredCertificationAuthority,
  type CertificationGate,
  type ProjectRole,
  type RiskClass
} from "../_shared/datanestAiPolicy.ts";
import { sha256Text } from "../_shared/datanestAiRuntime.ts";
import { classifyCertifiedMemoryRelation } from "../_shared/datanestAiTrends.ts";
import {
  governedLanguageReviewResult,
  qualificationCoverageForReviewedLanguages,
  reviewedLanguageCoverageSatisfied,
  summarizeLanguageReviewEvidence,
  type LanguageReviewSummary,
  type ReviewerQualification
} from "../_shared/datanestLanguageReview.ts";
import { canonicalizeDeclaredLanguage } from "../_shared/datanestLanguageMetadata.ts";
import {
  canonicalEvidenceLanguage,
  semanticReviewStatus
} from "../_shared/datanestEvidenceDerivation.ts";
import { resolveDataNestAiStaging } from "../_shared/datanestAiStaging.ts";
import {
  candidateValidationSeal,
  validationRunMatchesSeal
} from "../_shared/datanestAiValidation.ts";

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
const currentPolicyVersion="datanest-ai-governed-memory-v2";
const baseGateOrder:CertificationGate[]=["AUDIT","VERIFY","VALIDATE","STRESS_TEST"];
const lifecycleAfterGate:Partial<Record<CertificationGate,string>>={
  AUDIT:"AUDITED",
  VERIFY:"VERIFIED",
  VALIDATE:"VALIDATED",
  STRESS_TEST:"CERTIFICATION_REVIEW"
};
const emptyLanguageReview:LanguageReviewSummary={
  required:false,
  sourceLanguages:[],
  reasons:[],
  evidenceIds:[]
};
function requiredGateOrder(languageReviewRequired:boolean):CertificationGate[]{
  return languageReviewRequired
    ?["AUDIT","VERIFY","LANGUAGE_REVIEW","VALIDATE","STRESS_TEST"]
    :baseGateOrder;
}

type AnyClient=SupabaseClient<any>;
type Member={role:ProjectRole;status:string};
type Candidate={
  id:string;
  project_id:string;
  normalized_knowledge:string;
  category:string;
  risk_class:RiskClass;
  lifecycle_state:string;
  evidence_count:number;
  has_conflict:boolean;
  confidence:number|null;
  policy_version:string;
  content_hash:string;
  certified_at:string|null;
};

type DerivationReviewStatus=
  "unreviewed"|"reviewed_equivalent"|"reviewed_changed"|"stale_review";

type CandidateDerivationReviewItem={
  id:string;
  childEventId:string;
  parentEventId:string;
  rootEventId:string;
  derivationKind:string;
  transformationVersion:string;
  sourceLanguage:string|null;
  targetLanguage:string|null;
  status:DerivationReviewStatus;
  reviewId:string|null;
  reviewBasis:string|null;
  reviewedBy:string|null;
  reviewedAt:string|null;
  qualificationIds:string[];
};

type CandidateDerivationReviewSummary={
  required:boolean;
  blocked:boolean;
  reviewHash:string;
  items:CandidateDerivationReviewItem[];
};

const emptyDerivationReview:CandidateDerivationReviewSummary={
  required:false,
  blocked:false,
  reviewHash:"",
  items:[]
};

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
async function loadMember(client:AnyClient,projectId:string,userId:string):Promise<Member>{
  const {data,error}=await client
    .from("project_members")
    .select("role,status")
    .eq("project_id",projectId)
    .eq("user_id",userId)
    .eq("status","active")
    .maybeSingle();
  if(error)throw error;
  if(!data)throw new Error("Active project membership is required.");
  return data as Member;
}
async function loadCandidate(staging:AnyClient,projectId:string,candidateId:string):Promise<Candidate>{
  const {data,error}=await staging
    .from("ai_learning_candidates")
    .select("*")
    .eq("id",candidateId)
    .eq("project_id",projectId)
    .single();
  if(error||!data)throw error||new Error("Candidate not found.");
  return data as Candidate;
}
async function loadValidationRuns(staging:AnyClient,candidateId:string){
  const {data,error}=await staging
    .from("ai_validation_runs")
    .select("id,gate,passed,suite_version,results,actor_type,actor_user_id,created_at")
    .eq("candidate_id",candidateId)
    .order("created_at",{ascending:true});
  if(error)throw error;
  return (data||[]) as Array<{
    id:string;
    gate:CertificationGate;
    passed:boolean;
    suite_version:string;
    results:unknown;
    actor_type:string;
    actor_user_id:string|null;
    created_at:string;
  }>;
}
async function loadCandidateEvidenceIds(staging:AnyClient,candidateId:string):Promise<string[]>{
  const {data,error}=await staging
    .from("ai_candidate_evidence")
    .select("event_id")
    .eq("candidate_id",candidateId);
  if(error)throw error;
  return [...new Set((data||[]).map(item=>String(item.event_id)).filter(Boolean))].sort();
}
async function loadLanguageReviewByCandidate(
  staging:AnyClient,
  candidateIds:string[]
):Promise<Map<string,LanguageReviewSummary>>{
  const summaries=new Map<string,LanguageReviewSummary>();
  for(const candidateId of candidateIds)summaries.set(candidateId,emptyLanguageReview);
  if(!candidateIds.length)return summaries;

  const {data:links,error:linksError}=await staging
    .from("ai_candidate_evidence")
    .select("candidate_id,event_id")
    .in("candidate_id",candidateIds);
  if(linksError)throw linksError;
  const eventIds=[...new Set((links||[]).map(item=>String(item.event_id)).filter(Boolean))];
  if(!eventIds.length)return summaries;

  const {data:events,error:eventsError}=await staging
    .from("ai_intake_events")
    .select("id,content,metadata")
    .in("id",eventIds);
  if(eventsError)throw eventsError;
  const eventById=new Map((events||[]).map(event=>[
    String(event.id),
    {
      id:String(event.id),
      content:String(event.content||""),
      metadata:typeof event.metadata==="object"&&event.metadata!==null
        ?event.metadata as Record<string,unknown>
        :{}
    }
  ]));
  for(const candidateId of candidateIds){
    const evidence=(links||[])
      .filter(link=>String(link.candidate_id)===candidateId)
      .map(link=>eventById.get(String(link.event_id)))
      .filter(Boolean) as Array<{id:string;content:string;metadata:Record<string,unknown>}>;
    summaries.set(candidateId,summarizeLanguageReviewEvidence(evidence));
  }
  return summaries;
}
async function loadDerivationReviewByCandidate(
  staging:AnyClient,
  projectId:string,
  candidateIds:string[]
):Promise<Map<string,CandidateDerivationReviewSummary>>{
  const summaries=new Map<string,CandidateDerivationReviewSummary>();
  for(const candidateId of candidateIds){
    summaries.set(candidateId,{...emptyDerivationReview,items:[]});
  }
  if(!candidateIds.length)return summaries;

  const {data:links,error:linksError}=await staging
    .from("ai_candidate_evidence")
    .select("candidate_id,event_id")
    .in("candidate_id",candidateIds);
  if(linksError)throw linksError;
  const eventIds=[...new Set((links||[]).map(item=>String(item.event_id)).filter(Boolean))];
  if(!eventIds.length)return summaries;

  const {data:derivations,error:derivationsError}=await staging
    .from("ai_evidence_derivations")
    .select("id,child_event_id,parent_event_id,root_event_id,derivation_kind,transformation_version")
    .eq("project_id",projectId)
    .in("child_event_id",eventIds);
  if(derivationsError)throw derivationsError;
  if(!(derivations||[]).length)return summaries;

  const derivationIds=(derivations||[]).map(item=>String(item.id));
  const lineageEventIds=[...new Set((derivations||[]).flatMap(item=>[
    String(item.child_event_id),
    String(item.parent_event_id)
  ]).filter(Boolean))];

  const [eventsResult,reviewsResult,qualificationsResult]=await Promise.all([
    staging
      .from("ai_intake_events")
      .select("id,metadata")
      .eq("project_id",projectId)
      .in("id",lineageEventIds),
    staging
      .from("ai_evidence_derivation_reviews")
      .select("id,derivation_id,decision,review_basis,language_tags,qualification_ids,reviewer_user_id,created_at")
      .eq("project_id",projectId)
      .in("derivation_id",derivationIds)
      .order("created_at",{ascending:false}),
    staging
      .from("ai_language_reviewer_qualifications")
      .select("id")
      .eq("project_id",projectId)
      .eq("active",true)
  ]);
  if(eventsResult.error)throw eventsResult.error;
  if(reviewsResult.error)throw reviewsResult.error;
  if(qualificationsResult.error)throw qualificationsResult.error;

  const eventLanguage=new Map<string,string|null>();
  for(const event of eventsResult.data||[]){
    eventLanguage.set(String(event.id),canonicalEvidenceLanguage(event.metadata));
  }
  const activeQualificationIds=new Set(
    (qualificationsResult.data||[]).map(item=>String(item.id))
  );
  const latestReviewByDerivation=new Map<string,Record<string,unknown>>();
  for(const review of reviewsResult.data||[]){
    const derivationId=String(review.derivation_id);
    if(!latestReviewByDerivation.has(derivationId)){
      latestReviewByDerivation.set(derivationId,review as Record<string,unknown>);
    }
  }
  const derivationByChild=new Map(
    (derivations||[]).map(item=>[String(item.child_event_id),item] as const)
  );

  for(const candidateId of candidateIds){
    const candidateEventIds=new Set(
      (links||[])
        .filter(link=>String(link.candidate_id)===candidateId)
        .map(link=>String(link.event_id))
    );
    const items:CandidateDerivationReviewItem[]=[];
    for(const childEventId of candidateEventIds){
      const derivation=derivationByChild.get(childEventId);
      if(!derivation)continue;
      const derivationId=String(derivation.id);
      const latest=latestReviewByDerivation.get(derivationId)||null;
      const qualificationIds=latest&&Array.isArray(latest.qualification_ids)
        ?[...new Set(latest.qualification_ids.map(value=>String(value)).filter(Boolean))].sort()
        :[];
      const qualificationsCurrent=
        qualificationIds.length>0&&qualificationIds.every(id=>activeQualificationIds.has(id));
      items.push({
        id:derivationId,
        childEventId:String(derivation.child_event_id),
        parentEventId:String(derivation.parent_event_id),
        rootEventId:String(derivation.root_event_id),
        derivationKind:String(derivation.derivation_kind),
        transformationVersion:String(derivation.transformation_version),
        sourceLanguage:eventLanguage.get(String(derivation.parent_event_id))||null,
        targetLanguage:eventLanguage.get(String(derivation.child_event_id))||null,
        status:semanticReviewStatus(latest?.decision,qualificationsCurrent),
        reviewId:latest?String(latest.id):null,
        reviewBasis:latest?String(latest.review_basis||""):null,
        reviewedBy:latest?String(latest.reviewer_user_id||""):null,
        reviewedAt:latest?String(latest.created_at||""):null,
        qualificationIds
      });
    }
    items.sort((a,b)=>a.id.localeCompare(b.id));
    const reviewHash=items.length
      ?await sha256Text(JSON.stringify(items.map(item=>({
        id:item.id,
        childEventId:item.childEventId,
        parentEventId:item.parentEventId,
        rootEventId:item.rootEventId,
        derivationKind:item.derivationKind,
        transformationVersion:item.transformationVersion,
        status:item.status,
        reviewId:item.reviewId,
        qualificationIds:item.qualificationIds
      }))))
      :"";
    summaries.set(candidateId,{
      required:items.length>0,
      blocked:items.some(item=>item.status!=="reviewed_equivalent"),
      reviewHash,
      items
    });
  }
  return summaries;
}

async function loadReviewerQualifications(
  staging:AnyClient,
  projectId:string,
  userId:string
):Promise<ReviewerQualification[]>{
  const {data,error}=await staging
    .from("ai_language_reviewer_qualifications")
    .select("id,language_tag,qualification_scope,active")
    .eq("project_id",projectId)
    .eq("user_id",userId)
    .eq("active",true);
  if(error)throw error;
  return (data||[]).map(item=>({
    id:String(item.id),
    language_tag:String(item.language_tag),
    qualification_scope:String(item.qualification_scope) as ReviewerQualification["qualification_scope"],
    active:Boolean(item.active)
  }));
}

async function assertLanguageReviewQualificationsCurrent(
  staging:AnyClient,
  projectId:string,
  runs:Array<{
    gate:CertificationGate;
    passed:boolean;
    results:unknown;
    actor_user_id:string|null;
  }>
){
  const languageRuns=runs.filter(run=>run.gate==="LANGUAGE_REVIEW");
  const latestRun=languageRuns.at(-1);
  if(!latestRun||latestRun.passed!==true){
    throw new Error("A current passing LANGUAGE_REVIEW is required.");
  }
  const results=typeof latestRun.results==="object"&&latestRun.results!==null
    ?latestRun.results as Record<string,unknown>
    :{};
  if(String(results.language_review_policy||"")!=="datanest-language-review-v3"){
    throw new Error("LANGUAGE_REVIEW predates the current reviewer qualification policy; repeat the review.");
  }
  const reviewerUserId=String(latestRun.actor_user_id||"");
  const qualificationIds=Array.isArray(results.reviewer_qualification_ids)
    ?[...new Set(results.reviewer_qualification_ids.map(value=>String(value)).filter(Boolean))]
    :[];
  const reviewedLanguages=Array.isArray(results.reviewed_languages)
    ?results.reviewed_languages.map(value=>String(value)).filter(Boolean)
    :[];
  if(!reviewerUserId||!qualificationIds.length||!reviewedLanguages.length){
    throw new Error("LANGUAGE_REVIEW is missing bound reviewer qualification evidence; repeat the review.");
  }

  const {data,error}=await staging
    .from("ai_language_reviewer_qualifications")
    .select("id,language_tag,qualification_scope,active")
    .eq("project_id",projectId)
    .eq("user_id",reviewerUserId)
    .eq("active",true)
    .in("id",qualificationIds);
  if(error)throw error;

  const activeQualifications=(data||[]).map(item=>({
    id:String(item.id),
    language_tag:String(item.language_tag),
    qualification_scope:String(item.qualification_scope) as ReviewerQualification["qualification_scope"],
    active:Boolean(item.active)
  }));
  const activeIds=new Set(activeQualifications.map(item=>item.id));
  const recordedQualificationsStillActive=qualificationIds.every(id=>activeIds.has(id));
  const coverage=qualificationCoverageForReviewedLanguages(
    activeQualifications,
    reviewedLanguages,
    "source_language_review"
  );
  if(!recordedQualificationsStillActive||!coverage.covered){
    throw new Error("A reviewer qualification bound to LANGUAGE_REVIEW is no longer active; repeat the review before certification.");
  }
}
async function currentValidationRuns(staging:AnyClient,candidate:Candidate){
  const [runs,evidenceIds,derivationReviews]=await Promise.all([
    loadValidationRuns(staging,candidate.id),
    loadCandidateEvidenceIds(staging,candidate.id),
    loadDerivationReviewByCandidate(staging,candidate.project_id,[candidate.id])
  ]);
  const evidenceHash=await sha256Text(evidenceIds.join("\n"));
  const derivationReview=derivationReviews.get(candidate.id)||emptyDerivationReview;
  const seal=candidateValidationSeal({
    contentHash:candidate.content_hash,
    policyVersion:candidate.policy_version,
    evidenceHash,
    evidenceCount:candidate.evidence_count,
    riskClass:candidate.risk_class,
    hasConflict:candidate.has_conflict,
    derivationReviewHash:derivationReview.reviewHash
  });
  return {
    seal,
    derivationReview,
    runs:runs.filter(run=>validationRunMatchesSeal(run.results,seal))
  };
}
function latestGateState(runs:Array<{gate:CertificationGate;passed:boolean}>){
  const state=new Map<CertificationGate,boolean>();
  for(const run of runs)state.set(run.gate,run.passed);
  return state;
}
function assertGatePrerequisites(
  gate:CertificationGate,
  runs:Array<{gate:CertificationGate;passed:boolean}>,
  languageReviewRequired:boolean
){
  const order=requiredGateOrder(languageReviewRequired);
  const index=order.indexOf(gate);
  if(index<0)throw new Error("Invalid certification gate.");
  const latest=latestGateState(runs);
  for(const prior of order.slice(0,index)){
    if(latest.get(prior)!==true){
      throw new Error(`${prior} must pass before ${gate}.`);
    }
  }
}
async function existingCertification(staging:AnyClient,candidateId:string){
  const {data,error}=await staging
    .from("ai_certification_decisions")
    .select("*")
    .eq("candidate_id",candidateId)
    .eq("decision","certified")
    .order("created_at",{ascending:false})
    .limit(1)
    .maybeSingle();
  if(error)throw error;
  return data as Record<string,unknown>|null;
}
async function certifyCandidate(input:{
  staging:AnyClient;
  candidate:Candidate;
  authority:"automation"|"admin"|"owner";
  actorUserId:string|null;
  reason:string;
  runs:Array<{id:string;gate:CertificationGate;passed:boolean}>;
  derivationReviewHash:string;
}){
  const existing=await existingCertification(input.staging,input.candidate.id);
  if(existing){
    assertCertificationDecisionCurrent(
      existing,
      input.candidate,
      input.derivationReviewHash
    );
    const {error:updateError}=await input.staging
      .from("ai_learning_candidates")
      .update({
        lifecycle_state:"CERTIFIED",
        certified_at:input.candidate.certified_at||new Date().toISOString(),
        updated_at:new Date().toISOString()
      })
      .eq("id",input.candidate.id);
    if(updateError)throw updateError;
    return existing;
  }

  const {data:decision,error:decisionError}=await input.staging
    .from("ai_certification_decisions")
    .insert({
      candidate_id:input.candidate.id,
      decision:"certified",
      authority:input.authority,
      actor_user_id:input.actorUserId,
      risk_class:input.candidate.risk_class,
      reason:input.reason,
      policy_version:input.candidate.policy_version,
      content_hash:input.candidate.content_hash,
      evidence:{
        validation_run_ids:input.runs.filter(run=>run.passed).map(run=>run.id),
        required_authority:requiredCertificationAuthority({
          category:input.candidate.category,
          riskClass:input.candidate.risk_class,
          hasConflict:input.candidate.has_conflict
        })
      },
      evidence_context:{
        derivation_review_hash:input.derivationReviewHash||null,
        derivation_review_policy:"datanest-evidence-derivation-v1"
      }
    })
    .select("*")
    .single();
  if(decisionError||!decision)throw decisionError||new Error("Unable to record certification decision.");

  const {error:updateError}=await input.staging
    .from("ai_learning_candidates")
    .update({
      lifecycle_state:"CERTIFIED",
      certified_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    })
    .eq("id",input.candidate.id);
  if(updateError)throw updateError;
  return decision as Record<string,unknown>;
}
function assertCertificationDecisionCurrent(
  decision:Record<string,unknown>,
  candidate:Candidate,
  derivationReviewHash=""
){
  const required=requiredCertificationAuthority({
    category:candidate.category,
    riskClass:candidate.risk_class,
    hasConflict:candidate.has_conflict
  });
  const authority=String(decision.authority||"");
  const authorityValid=
    required==="owner"
      ?authority==="owner"
      :required==="admin"
        ?authority==="owner"||authority==="admin"
        :authority==="owner"||authority==="admin"||authority==="automation";

  const evidenceContext=
    typeof decision.evidence_context==="object"&&decision.evidence_context!==null
      ?decision.evidence_context as Record<string,unknown>
      :{};
  if(
    String(decision.content_hash||"")!==candidate.content_hash ||
    String(decision.policy_version||"")!==candidate.policy_version ||
    String(decision.risk_class||"")!==candidate.risk_class ||
    (
      derivationReviewHash &&
      String(evidenceContext.derivation_review_hash||"")!==derivationReviewHash
    ) ||
    !authorityValid
  ){
    throw new Error("Certification decision is stale for the current candidate seal or required authority.");
  }
}

async function sourceLineage(staging:AnyClient,candidateId:string){
  const {data:links,error:linksError}=await staging
    .from("ai_candidate_evidence")
    .select("event_id")
    .eq("candidate_id",candidateId);
  if(linksError)throw linksError;
  const ids=(links||[]).map(item=>String(item.event_id)).filter(Boolean);
  if(!ids.length)return {jobIds:[] as string[],traceIds:[] as string[]};
  const {data:events,error:eventsError}=await staging
    .from("ai_intake_events")
    .select("id,job_id,trace_id")
    .in("id",ids);
  if(eventsError)throw eventsError;
  return {
    jobIds:[...new Set((events||[]).map(item=>String(item.job_id)).filter(Boolean))],
    traceIds:[...new Set((events||[]).map(item=>String(item.trace_id)).filter(Boolean))]
  };
}

async function loadActiveCertifiedMemory(
  serviceClient:AnyClient,
  projectId:string,
  category:string
):Promise<Array<{id:string;normalized_knowledge:string;content_hash:string}>>{
  const {data,error}=await serviceClient
    .from("certified_memory")
    .select("id,normalized_knowledge,content_hash")
    .eq("project_id",projectId)
    .eq("category",category)
    .eq("active",true)
    .limit(200);
  if(error)throw error;
  return (data||[]).map(item=>({
    id:String(item.id),
    normalized_knowledge:String(item.normalized_knowledge||""),
    content_hash:String(item.content_hash||"")
  }));
}

function certifiedMemoryRelationHints(
  candidate:Candidate,
  memories:Array<{id:string;normalized_knowledge:string;content_hash:string}>
){
  return memories
    .filter(memory=>memory.content_hash!==candidate.content_hash)
    .map(memory=>({
      memoryId:memory.id,
      ...classifyCertifiedMemoryRelation(
        candidate.normalized_knowledge,
        memory.normalized_knowledge
      )
    }))
    .filter(item=>item.relation!=="none")
    .sort((a,b)=>b.similarity-a.similarity||a.memoryId.localeCompare(b.memoryId));
}

async function loadCanonicalMemoryConsolidationSuggestions(
  serviceClient:AnyClient,
  projectId:string
){
  const {data,error}=await serviceClient
    .from("certified_memory")
    .select("id,normalized_knowledge,category,effective_version,certification_class,confidence,content_hash,promoted_at")
    .eq("project_id",projectId)
    .eq("active",true)
    .order("promoted_at",{ascending:false})
    .limit(120);
  if(error)throw error;
  const memories=(data||[]).map(item=>({
    id:String(item.id),
    normalized_knowledge:String(item.normalized_knowledge||""),
    category:String(item.category||""),
    effective_version:Number(item.effective_version||0),
    certification_class:String(item.certification_class||""),
    confidence:item.confidence==null?null:Number(item.confidence),
    content_hash:String(item.content_hash||""),
    promoted_at:String(item.promoted_at||"")
  }));
  const suggestions:Array<Record<string,unknown>>=[];
  for(let leftIndex=0;leftIndex<memories.length;leftIndex+=1){
    const first=memories[leftIndex];
    for(let rightIndex=leftIndex+1;rightIndex<memories.length;rightIndex+=1){
      const second=memories[rightIndex];
      if(first.category!==second.category)continue;
      const hint=classifyCertifiedMemoryRelation(
        first.normalized_knowledge,
        second.normalized_knowledge
      );
      if(hint.relation!=="duplicates")continue;
      suggestions.push({
        id:[first.id,second.id].sort().join(":"),
        first,
        second,
        similarity:hint.similarity,
        polarityConflict:hint.polarityConflict,
        scalarConflict:hint.scalarConflict,
        classifier:"datanest-certified-memory-relation-v1"
      });
      if(suggestions.length>=30)return suggestions;
    }
  }
  return suggestions;
}

async function loadCanonicalMemoryConsolidationProposals(
  serviceClient:AnyClient,
  projectId:string
){
  const {data:proposals,error:proposalError}=await serviceClient
    .from("certified_memory_consolidations")
    .select("id,project_id,canonical_memory_id,status,reason,evidence,proposed_by,proposer_role,decided_by,decision_reason,proposed_at,decided_at,executed_at")
    .eq("project_id",projectId)
    .order("proposed_at",{ascending:false})
    .limit(100);
  if(proposalError){
    const unavailable=
      ["42P01","PGRST205"].includes(String((proposalError as {code?:unknown}).code||"")) ||
      /certified_memory_consolidations/i.test(String((proposalError as {message?:unknown}).message||""));
    if(unavailable)return [] as Array<Record<string,unknown>>;
    throw proposalError;
  }
  const proposalIds=(proposals||[]).map(item=>String(item.id)).filter(Boolean);
  if(!proposalIds.length)return [] as Array<Record<string,unknown>>;
  const {data:members,error:memberError}=await serviceClient
    .from("certified_memory_consolidation_members")
    .select("consolidation_id,memory_id,member_role,normalized_knowledge_snapshot,content_hash_snapshot,category_snapshot,effective_version_snapshot,active_snapshot")
    .in("consolidation_id",proposalIds)
    .order("effective_version_snapshot",{ascending:false});
  if(memberError)throw memberError;
  return (proposals||[]).map(proposal=>({
    ...proposal,
    members:(members||[]).filter(member=>String(member.consolidation_id)===String(proposal.id))
  })) as Array<Record<string,unknown>>;
}

async function loadCertifiedMemoryReviewQueue(
  serviceClient:AnyClient,
  projectId:string
){
  const now=new Date().toISOString();
  const {data,error}=await serviceClient
    .from("certified_memory")
    .select("id,normalized_knowledge,category,effective_version,certification_class,confidence,review_after,last_verified_at,promoted_at")
    .eq("project_id",projectId)
    .eq("active",true)
    .not("review_after","is",null)
    .lte("review_after",now)
    .order("review_after",{ascending:true})
    .limit(100);
  if(error)throw error;
  return (data||[]) as Array<Record<string,unknown>>;
}

async function loadRecentMemoryOutcomes(
  serviceClient:AnyClient,
  projectId:string
){
  const {data,error}=await serviceClient
    .from("certified_memory_outcome_evidence")
    .select("id,memory_id,usage_receipt_id,signal,outcome_kind,summary,review_triggered,recorded_by,recorder_role,created_at")
    .eq("project_id",projectId)
    .order("created_at",{ascending:false})
    .limit(100);
  if(error){
    const missingTable=
      String((error as {code?:unknown}).code||"")==="42P01" ||
      /certified_memory_outcome_evidence/i.test(String((error as {message?:unknown}).message||""));
    if(missingTable)return [] as Array<Record<string,unknown>>;
    throw error;
  }
  return (data||[]) as Array<Record<string,unknown>>;
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
    const serviceClient=createClient(supabaseUrl,serviceKey,{
      auth:{persistSession:false,autoRefreshToken:false}
    });
    const staging=createClient(stagingEnv.url,stagingEnv.key,{
      auth:{persistSession:false,autoRefreshToken:false}
    });

    const {data:userData,error:userError}=await userClient.auth.getUser();
    if(userError||!userData.user)return json({error:"Authentication is required."},401,origin);
    const user=userData.user;

    const body=await request.json().catch(()=>({})) as Record<string,unknown>;
    const action=String(body.action||"workspace");
    const projectId=String(body.projectId||"");
    if(!projectId)return json({error:"projectId is required."},400,origin);

    const member=await loadMember(userClient,projectId,user.id);
    if(!["owner","admin"].includes(member.role)){
      return json({error:"Owner or admin access is required."},403,origin);
    }

    if(action==="workspace"){
      const [
        candidateResult,
        memoryReviewItems,
        memoryOutcomeItems,
        qualificationResult,
        memoryConsolidationSuggestions,
        memoryConsolidationProposals
      ]=await Promise.all([
        staging
          .from("ai_learning_candidates")
          .select("*")
          .eq("project_id",projectId)
          .neq("lifecycle_state","REJECTED")
          .order("updated_at",{ascending:false})
          .limit(100),
        loadCertifiedMemoryReviewQueue(serviceClient,projectId),
        loadRecentMemoryOutcomes(serviceClient,projectId),
        staging
          .from("ai_language_reviewer_qualifications")
          .select("*")
          .eq("project_id",projectId)
          .eq("active",true)
          .order("language_tag",{ascending:true}),
        loadCanonicalMemoryConsolidationSuggestions(serviceClient,projectId),
        loadCanonicalMemoryConsolidationProposals(serviceClient,projectId)
      ]);
      const {data:candidates,error:candidatesError}=candidateResult;
      if(candidatesError)throw candidatesError;
      if(qualificationResult.error)throw qualificationResult.error;
      const candidateIds=(candidates||[]).map(candidate=>String(candidate.id));
      let runs:Record<string,unknown>[]=[];
      let decisions:Record<string,unknown>[]=[];
      let languageReviews=new Map<string,LanguageReviewSummary>();
      let derivationReviews=new Map<string,CandidateDerivationReviewSummary>();
      if(candidateIds.length){
        const [runsResult,decisionsResult,loadedLanguageReviews,loadedDerivationReviews]=await Promise.all([
          staging.from("ai_validation_runs").select("*").in("candidate_id",candidateIds).order("created_at",{ascending:false}).limit(500),
          staging.from("ai_certification_decisions").select("*").in("candidate_id",candidateIds).order("created_at",{ascending:false}).limit(500),
          loadLanguageReviewByCandidate(staging,candidateIds),
          loadDerivationReviewByCandidate(staging,projectId,candidateIds)
        ]);
        if(runsResult.error)throw runsResult.error;
        if(decisionsResult.error)throw decisionsResult.error;
        runs=(runsResult.data||[]) as Record<string,unknown>[];
        decisions=(decisionsResult.data||[]) as Record<string,unknown>[];
        languageReviews=loadedLanguageReviews;
        derivationReviews=loadedDerivationReviews;
      }
      return json({
        role:member.role,
        candidates:(candidates||[]).map(candidate=>{
          const languageReview=languageReviews.get(String(candidate.id))||emptyLanguageReview;
          const derivationReview=derivationReviews.get(String(candidate.id))||emptyDerivationReview;
          return {
            ...candidate,
            language_review:languageReview,
            derivation_review:derivationReview,
            required_authority:languageReview.required||derivationReview.required
              ?"owner"
              :requiredCertificationAuthority({
                category:String(candidate.category),
                riskClass:candidate.risk_class as RiskClass,
                hasConflict:Boolean(candidate.has_conflict)
              })
          };
        }),
        validationRuns:runs||[],
        certificationDecisions:decisions||[],
        languageReviewerQualifications:qualificationResult.data||[],
        currentUserId:user.id,
        memoryReviewItems,
        memoryOutcomeItems,
        memoryConsolidationSuggestions,
        memoryConsolidationProposals
      },200,origin);
    }

    if(action==="review_memory"){
      const memoryId=String(body.memoryId||"");
      if(!memoryId)return json({error:"memoryId is required."},400,origin);
      const decision=String(body.decision||"reaffirmed");
      if(!["reaffirmed","review_required","retired"].includes(decision)){
        return json({error:"Unsupported Certified Memory review decision."},400,origin);
      }
      if(decision==="retired"&&member.role!=="owner"){
        return json({error:"Owner authority is required to retire Certified Memory."},403,origin);
      }
      const nextReviewAfter=typeof body.nextReviewAfter==="string"&&body.nextReviewAfter
        ?body.nextReviewAfter
        :null;
      const {data:review,error:reviewError}=await serviceClient.rpc(
        "service_review_certified_memory_v1",{
          target_project:projectId,
          target_memory:memoryId,
          target_actor:user.id,
          target_decision:decision,
          target_reason:String(body.reason||"Governed Certified Memory review.").slice(0,2000),
          target_next_review_after:nextReviewAfter,
          target_evidence:{
            source:"datanest_ai_certification_console",
            policy_version:currentPolicyVersion
          }
        }
      );
      if(reviewError)throw reviewError;
      return json({review},200,origin);
    }

    if(action==="record_memory_outcome"){
      const memoryId=String(body.memoryId||"");
      const usageReceiptId=String(body.usageReceiptId||"");
      const signal=String(body.signal||"unknown");
      const outcomeKind=String(body.outcomeKind||"operator_observation");
      const summary=String(body.summary||"").trim().slice(0,2000);
      if(!memoryId||!usageReceiptId||!summary){
        return json({error:"memoryId, usageReceiptId and summary are required."},400,origin);
      }
      if(!["supported","neutral","challenged","contradicted","unknown"].includes(signal)){
        return json({error:"Unsupported Certified Memory outcome signal."},400,origin);
      }
      if(!["human_review","external_audit","test_result","job_result","operator_observation"].includes(outcomeKind)){
        return json({error:"Unsupported Certified Memory outcome kind."},400,origin);
      }
      const {data:outcome,error:outcomeError}=await serviceClient.rpc(
        "service_record_certified_memory_outcome_v1",{
          target_project:projectId,
          target_memory:memoryId,
          target_usage_receipt:usageReceiptId,
          target_actor:user.id,
          target_signal:signal,
          target_outcome_kind:outcomeKind,
          target_summary:summary,
          target_evidence:{
            source:"datanest_ai_certification_gateway",
            policy_version:currentPolicyVersion,
            non_authoritative_outcome_signal:true
          }
        }
      );
      if(outcomeError)throw outcomeError;
      return json({outcome},200,origin);
    }

    if(action==="register_language_reviewer"){
      if(member.role!=="owner"){
        return json({error:"Owner authority is required to register language reviewer qualifications."},403,origin);
      }
      const reviewerUserId=String(body.reviewerUserId||user.id);
      const reviewerMember=await loadMember(userClient,projectId,reviewerUserId);
      if(!["owner","admin"].includes(reviewerMember.role)){
        return json({error:"Language reviewer must be an active Owner or Admin project member."},403,origin);
      }
      const languageTag=canonicalizeDeclaredLanguage(body.languageTag);
      const qualificationScope=String(body.qualificationScope||"source_language_review");
      if(!["source_language_review","semantic_equivalence"].includes(qualificationScope)){
        return json({error:"Unsupported language reviewer qualification scope."},400,origin);
      }
      const evidence=typeof body.evidence==="object"&&body.evidence!==null
        ?body.evidence as Record<string,unknown>
        :{};
      if(String(evidence.basis||"").trim().length<12){
        return json({error:"Qualification evidence must include a substantive basis."},400,origin);
      }
      const {data:existingQualification,error:existingQualificationError}=await staging
        .from("ai_language_reviewer_qualifications")
        .select("id")
        .eq("project_id",projectId)
        .eq("user_id",reviewerUserId)
        .eq("language_tag",languageTag)
        .eq("qualification_scope",qualificationScope)
        .eq("active",true)
        .maybeSingle();
      if(existingQualificationError)throw existingQualificationError;
      if(existingQualification){
        return json({
          error:"An active reviewer qualification already exists for this language and scope. Revoke it before registering a replacement."
        },409,origin);
      }
      const now=new Date().toISOString();
      const {data:qualification,error:qualificationError}=await staging
        .from("ai_language_reviewer_qualifications")
        .insert({
          project_id:projectId,
          user_id:reviewerUserId,
          language_tag:languageTag,
          qualification_scope:qualificationScope,
          evidence:{...evidence,recorded_by_owner:user.id},
          active:true,
          verified_by:user.id,
          verified_at:now,
          created_at:now,
          updated_at:now
        })
        .select("*")
        .single();
      if(qualificationError||!qualification){
        throw qualificationError||new Error("Unable to register language reviewer qualification.");
      }
      return json({qualification},200,origin);
    }

    if(action==="revoke_language_reviewer"){
      if(member.role!=="owner"){
        return json({error:"Owner authority is required to revoke language reviewer qualifications."},403,origin);
      }
      const qualificationId=String(body.qualificationId||"");
      if(!qualificationId)return json({error:"qualificationId is required."},400,origin);
      const now=new Date().toISOString();
      const {data:qualification,error:qualificationError}=await staging
        .from("ai_language_reviewer_qualifications")
        .update({
          active:false,
          revoked_by:user.id,
          revoked_at:now,
          revocation_reason:String(body.reason||"Owner revoked language reviewer qualification.").slice(0,2000),
          updated_at:now
        })
        .eq("id",qualificationId)
        .eq("project_id",projectId)
        .eq("active",true)
        .select("*")
        .single();
      if(qualificationError||!qualification){
        throw qualificationError||new Error("Language reviewer qualification not found.");
      }
      return json({qualification},200,origin);
    }

    if(action==="propose_memory_consolidation"){
      const canonicalMemoryId=String(body.canonicalMemoryId||"");
      const requestedIds=Array.isArray(body.memoryIds)
        ?body.memoryIds.map(value=>String(value||"")).filter(Boolean)
        :[];
      const memoryIds=[...new Set(requestedIds)];
      if(!canonicalMemoryId||memoryIds.length<2){
        return json({error:"canonicalMemoryId and at least two distinct memoryIds are required."},400,origin);
      }
      if(memoryIds.length>8){
        return json({error:"A single canonical memory consolidation is limited to eight memories."},400,origin);
      }
      if(!memoryIds.includes(canonicalMemoryId)){
        return json({error:"canonicalMemoryId must be included in memoryIds."},400,origin);
      }
      const {data:memories,error:memoryError}=await serviceClient
        .from("certified_memory")
        .select("id,normalized_knowledge,category,content_hash")
        .eq("project_id",projectId)
        .eq("active",true)
        .in("id",memoryIds);
      if(memoryError)throw memoryError;
      if((memories||[]).length!==memoryIds.length){
        return json({error:"Every consolidation member must be active Verified Memory in this project."},409,origin);
      }
      const canonical=(memories||[]).find(item=>String(item.id)===canonicalMemoryId);
      if(!canonical)return json({error:"Canonical Verified Memory was not found."},409,origin);
      const relationHints=(memories||[])
        .filter(item=>String(item.id)!==canonicalMemoryId)
        .map(item=>({
          memoryId:String(item.id),
          ...classifyCertifiedMemoryRelation(
            String(canonical.normalized_knowledge||""),
            String(item.normalized_knowledge||"")
          )
        }));
      if(
        (memories||[]).some(item=>String(item.category)!==String(canonical.category)) ||
        relationHints.some(item=>item.relation!=="duplicates")
      ){
        return json({
          error:"Canonical consolidation requires same-category memory that the governed relation classifier identifies as equivalent duplicates.",
          relationHints
        },409,origin);
      }
      const reason=String(
        body.reason||
        "Governed canonical consolidation of historically equivalent Certified Memory."
      ).trim().slice(0,2000);
      const {data:proposalId,error:proposalError}=await serviceClient.rpc(
        "service_propose_certified_memory_consolidation_v1",{
          target_project:projectId,
          target_canonical_memory:canonicalMemoryId,
          target_memory_ids:memoryIds,
          target_actor:user.id,
          target_reason:reason,
          target_evidence:{
            source:"datanest_ai_certification_gateway",
            policy_version:currentPolicyVersion,
            classifier:"datanest-certified-memory-relation-v1",
            relation_hints:relationHints,
            canonical_is_existing_certified_memory:true,
            no_new_knowledge_certified:true
          }
        }
      );
      if(proposalError)throw proposalError;
      return json({proposalId,relationHints},200,origin);
    }

    if(action==="decide_memory_consolidation"){
      if(member.role!=="owner"){
        return json({
          error:"Owner authority is required to execute or reject a canonical memory consolidation."
        },403,origin);
      }
      const consolidationId=String(body.consolidationId||"");
      const decision=String(body.decision||"");
      if(!consolidationId||!["execute","reject"].includes(decision)){
        return json({error:"consolidationId and an execute or reject decision are required."},400,origin);
      }
      const reason=String(
        body.reason||
        (decision==="execute"
          ?"Owner authorized canonical memory consolidation after review."
          :"Owner rejected canonical memory consolidation after review.")
      ).trim().slice(0,2000);
      const {data:result,error:decisionError}=await serviceClient.rpc(
        "service_decide_certified_memory_consolidation_v1",{
          target_project:projectId,
          target_consolidation:consolidationId,
          target_actor:user.id,
          target_decision:decision,
          target_reason:reason
        }
      );
      if(decisionError)throw decisionError;
      return json({result},200,origin);
    }

    if(action==="review_evidence_derivation"){
      const derivationId=String(body.derivationId||"").trim();
      const decision=String(body.decision||"").trim();
      const reviewBasis=String(body.reviewBasis||"").trim().slice(0,2000);
      if(!derivationId||!["equivalent","changed"].includes(decision)){
        return json({error:"derivationId and an equivalent or changed decision are required."},400,origin);
      }
      if(reviewBasis.length<12){
        return json({error:"Semantic-equivalence review requires a substantive review basis."},400,origin);
      }

      const {data:derivation,error:derivationError}=await staging
        .from("ai_evidence_derivations")
        .select("id,child_event_id,parent_event_id,root_event_id,derivation_kind,transformation_version")
        .eq("id",derivationId)
        .eq("project_id",projectId)
        .single();
      if(derivationError||!derivation){
        throw derivationError||new Error("Evidence derivation was not found.");
      }

      const eventIds=[String(derivation.parent_event_id),String(derivation.child_event_id)];
      const {data:events,error:eventsError}=await staging
        .from("ai_intake_events")
        .select("id,metadata")
        .eq("project_id",projectId)
        .in("id",eventIds);
      if(eventsError)throw eventsError;
      const languageByEvent=new Map(
        (events||[]).map(event=>[
          String(event.id),
          canonicalEvidenceLanguage(event.metadata)
        ] as const)
      );
      const sourceLanguage=languageByEvent.get(String(derivation.parent_event_id))||null;
      const targetLanguage=languageByEvent.get(String(derivation.child_event_id))||null;
      if(!sourceLanguage||!targetLanguage){
        return json({
          error:"Semantic-equivalence review requires explicit source-language metadata on both source and derived evidence."
        },409,origin);
      }
      const reviewedLanguages=[...new Set([sourceLanguage,targetLanguage])];
      const qualifications=await loadReviewerQualifications(staging,projectId,user.id);
      const coverage=qualificationCoverageForReviewedLanguages(
        qualifications,
        reviewedLanguages,
        "semantic_equivalence"
      );
      if(!coverage.covered){
        return json({
          error:"Active semantic-equivalence reviewer qualification is required for every source/target language.",
          missingLanguages:coverage.missingLanguages
        },403,origin);
      }

      const {data:review,error:reviewError}=await staging
        .from("ai_evidence_derivation_reviews")
        .insert({
          project_id:projectId,
          derivation_id:derivationId,
          decision,
          review_basis:reviewBasis,
          language_tags:reviewedLanguages,
          qualification_ids:coverage.qualificationIds,
          reviewer_user_id:user.id
        })
        .select("*")
        .single();
      if(reviewError||!review){
        throw reviewError||new Error("Unable to record semantic-equivalence review.");
      }
      return json({review},200,origin);
    }

    const candidateId=String(body.candidateId||"");
    if(!candidateId)return json({error:"candidateId is required."},400,origin);
    const candidate=await loadCandidate(staging,projectId,candidateId);

    if(action==="record_validation"){
      const gate=String(body.gate||"") as CertificationGate;
      const languageReview=(await loadLanguageReviewByCandidate(staging,[candidate.id]))
        .get(candidate.id)||emptyLanguageReview;
      const gateOrder=requiredGateOrder(languageReview.required);
      if(!gateOrder.includes(gate))return json({error:"Invalid certification gate."},400,origin);
      if(gate==="STRESS_TEST"){
        return json({error:"STRESS_TEST evidence must be recorded by the governed stress suite."},403,origin);
      }
      if(gate==="LANGUAGE_REVIEW"&&!languageReview.required){
        return json({error:"This candidate does not require a language review gate."},409,origin);
      }
      const current=await currentValidationRuns(staging,candidate);
      assertGatePrerequisites(gate,current.runs,languageReview.required);
      let passed=Boolean(body.passed);
      const providedResults=typeof body.results==="object"&&body.results!==null
        ?body.results as Record<string,unknown>
        :{};
      let governedResults:Record<string,unknown>=providedResults;
      if(gate==="LANGUAGE_REVIEW"){
        const review=governedLanguageReviewResult({
          reviewedLanguages:body.reviewedLanguages,
          reviewBasis:body.reviewBasis,
          meaningPreserved:body.meaningPreserved,
          unresolvedAmbiguity:body.unresolvedAmbiguity
        });
        if(!reviewedLanguageCoverageSatisfied(
          languageReview.sourceLanguages,
          review.reviewedLanguages
        )){
          throw new Error("Reviewed languages must cover every specific declared source language.");
        }
        const qualifications=await loadReviewerQualifications(staging,projectId,user.id);
        const qualificationCoverage=qualificationCoverageForReviewedLanguages(
          qualifications,
          review.reviewedLanguages,
          "source_language_review"
        );
        if(!qualificationCoverage.covered){
          return json({
            error:"Active language reviewer qualification is required for every reviewed language.",
            missingLanguages:qualificationCoverage.missingLanguages
          },403,origin);
        }
        passed=review.passed;
        governedResults={
          ...providedResults,
          reviewed_languages:review.reviewedLanguages,
          review_basis:review.reviewBasis,
          meaning_preserved:review.meaningPreserved,
          unresolved_ambiguity:review.unresolvedAmbiguity,
          source_languages:languageReview.sourceLanguages,
          review_reasons:languageReview.reasons,
          reviewed_evidence_ids:languageReview.evidenceIds,
          reviewer_qualification_status:"registry_verified",
          reviewer_qualification_ids:qualificationCoverage.qualificationIds,
          language_review_policy:"datanest-language-review-v3"
        };
      }
      const {data:run,error:runError}=await staging
        .from("ai_validation_runs")
        .insert({
          candidate_id:candidate.id,
          gate,
          suite_version:String(body.suiteVersion||candidate.policy_version||currentPolicyVersion),
          passed,
          results:{...governedResults,...current.seal},
          actor_type:"human",
          actor_user_id:user.id
        })
        .select("*")
        .single();
      if(runError||!run)throw runError||new Error("Unable to record validation run.");

      const nextState=gate==="LANGUAGE_REVIEW"
        ?(passed?candidate.lifecycle_state:"NEEDS_EVIDENCE")
        :(passed?(lifecycleAfterGate[gate]||candidate.lifecycle_state):"NEEDS_EVIDENCE");
      const {error:updateError}=await staging
        .from("ai_learning_candidates")
        .update({lifecycle_state:nextState,updated_at:new Date().toISOString()})
        .eq("id",candidate.id);
      if(updateError)throw updateError;

      const refreshedCandidate=await loadCandidate(staging,projectId,candidate.id);
      const refreshedValidation=await currentValidationRuns(staging,refreshedCandidate);
      const refreshedRuns=refreshedValidation.runs;
      let autoCertification:Record<string,unknown>|null=null;
      const refreshedDerivationReview=refreshedValidation.derivationReview;
      if(
        !languageReview.required &&
        !refreshedDerivationReview.required &&
        allAutomatedCertificationGatesPassed(refreshedRuns) &&
        canAutoCertify({
          category:refreshedCandidate.category,
          riskClass:refreshedCandidate.risk_class,
          hasConflict:refreshedCandidate.has_conflict,
          allGatesPassed:true,
          evidenceCount:refreshedCandidate.evidence_count,
          confidence:refreshedCandidate.confidence
        })
      ){
        autoCertification=await certifyCandidate({
          staging,
          candidate:refreshedCandidate,
          authority:"automation",
          actorUserId:null,
          reason:"All automated gates passed for repeated low-risk non-conflicting evidence.",
          runs:refreshedRuns,
          derivationReviewHash:refreshedDerivationReview.reviewHash
        });
      }
      return json({run,autoCertification},200,origin);
    }

    if(action==="certify"){
      const [{runs,derivationReview},languageReviews]=await Promise.all([
        currentValidationRuns(staging,candidate),
        loadLanguageReviewByCandidate(staging,[candidate.id])
      ]);
      const languageReview=languageReviews.get(candidate.id)||emptyLanguageReview;
      const latest=latestGateState(runs);
      if(
        !allCertificationGatesPassed(runs) ||
        (languageReview.required&&latest.get("LANGUAGE_REVIEW")!==true)
      ){
        return json({
          error:"All required audit, verify, language-review, validate and stress-test gates must pass before certification."
        },409,origin);
      }
      if((languageReview.required||derivationReview.required)&&member.role!=="owner"){
        return json({error:"Owner authority is required for language or derivation-review candidates."},403,origin);
      }
      if(derivationReview.required&&derivationReview.blocked){
        return json({
          error:"All derived evidence must have a current qualified semantic-equivalence review before certification.",
          derivationReview
        },409,origin);
      }
      if(languageReview.required){
        try{
          await assertLanguageReviewQualificationsCurrent(staging,projectId,runs);
        }catch(qualificationError){
          return json({
            error:qualificationError instanceof Error
              ?qualificationError.message
              :"Reviewer qualification is no longer current; repeat LANGUAGE_REVIEW."
          },409,origin);
        }
      }
      const policyInput={
        category:candidate.category,
        riskClass:candidate.risk_class,
        hasConflict:candidate.has_conflict
      };
      if(!canHumanCertify(member.role,policyInput)){
        return json({error:"Certification authority is insufficient."},403,origin);
      }
      const decision=await certifyCandidate({
        staging,
        candidate,
        authority:member.role==="owner"?"owner":"admin",
        actorUserId:user.id,
        reason:String(body.reason||"Human certification after required gates passed.").slice(0,2000),
        runs,
        derivationReviewHash:derivationReview.reviewHash
      });
      return json({decision},200,origin);
    }

    if(action==="promote"||action==="supersede"){
      const supersedesMemoryId=typeof body.supersedesMemoryId==="string"&&body.supersedesMemoryId
        ?body.supersedesMemoryId
        :null;
      if((action==="supersede"||supersedesMemoryId)&&member.role!=="owner"){
        return json({error:"Owner access is required for explicit knowledge supersession."},403,origin);
      }
      if(action==="supersede"&&!supersedesMemoryId){
        return json({error:"supersedesMemoryId is required for explicit knowledge supersession."},400,origin);
      }
      if(candidate.lifecycle_state!=="CERTIFIED"){
        return json({error:"Only certified candidates can be promoted."},409,origin);
      }
      const decision=await existingCertification(staging,candidate.id);
      if(!decision)return json({error:"Certified candidate has no certification decision."},409,origin);
      const promotionDerivationReview=(
        await loadDerivationReviewByCandidate(staging,projectId,[candidate.id])
      ).get(candidate.id)||emptyDerivationReview;
      if(promotionDerivationReview.required&&promotionDerivationReview.blocked){
        return json({
          error:"Derived evidence review is no longer current; recertification is required before promotion.",
          derivationReview:promotionDerivationReview
        },409,origin);
      }
      assertCertificationDecisionCurrent(
        decision,
        candidate,
        promotionDerivationReview.reviewHash
      );

      const activeMemory=await loadActiveCertifiedMemory(
        serviceClient,
        projectId,
        candidate.category
      );
      const relationHints=certifiedMemoryRelationHints(candidate,activeMemory);
      const contradictions=relationHints.filter(item=>item.relation==="contradicts");
      const duplicates=relationHints.filter(item=>item.relation==="duplicates");

      if(contradictions.length&&!supersedesMemoryId){
        return json({
          error:"Candidate conflicts with active Verified Memory. Owner supersession is required before promotion.",
          conflictMemoryIds:contradictions.map(item=>item.memoryId),
          relationHints
        },409,origin);
      }
      if(duplicates.length&&!supersedesMemoryId){
        return json({
          error:"Candidate substantially duplicates active Verified Memory. Reuse the existing memory or supersede it explicitly.",
          duplicateMemoryIds:duplicates.map(item=>item.memoryId),
          relationHints
        },409,origin);
      }

      const lineage=await sourceLineage(staging,candidate.id);
      const applicability=
        typeof body.applicability==="object"&&body.applicability!==null&&!Array.isArray(body.applicability)
          ?body.applicability as Record<string,unknown>
          :{};
      const validFrom=typeof body.validFrom==="string"&&body.validFrom?body.validFrom:null;
      const validUntil=typeof body.validUntil==="string"&&body.validUntil?body.validUntil:null;
      const reviewAfter=typeof body.reviewAfter==="string"&&body.reviewAfter?body.reviewAfter:null;

      const {data:memoryId,error:promotionError}=await serviceClient.rpc(
        "service_promote_certified_memory_v2",{
          target_project:projectId,
          target_knowledge:candidate.normalized_knowledge,
          target_category:candidate.category,
          target_certification_id:String(decision.id),
          target_source_job_ids:lineage.jobIds,
          target_source_trace_ids:lineage.traceIds,
          target_certification_class:String(decision.authority),
          target_confidence:candidate.confidence,
          target_policy_version:candidate.policy_version,
          target_content_hash:candidate.content_hash,
          target_applicability:applicability,
          target_valid_from:validFrom,
          target_valid_until:validUntil,
          target_review_after:reviewAfter,
          target_supersedes:supersedesMemoryId
        }
      );
      if(promotionError)throw promotionError;

      if(supersedesMemoryId){
        const {error:supersessionError}=await staging
          .from("ai_memory_supersessions")
          .insert({
            project_id:projectId,
            candidate_id:candidate.id,
            production_memory_id:String(memoryId),
            supersedes_memory_id:supersedesMemoryId,
            reason:String(body.reason||"Certified knowledge supersession.").slice(0,2000),
            created_by:user.id
          });
        if(supersessionError)throw supersessionError;
      }
      return json({
        memoryId,
        sourceJobIds:lineage.jobIds,
        sourceTraceIds:lineage.traceIds,
        relationHints
      },200,origin);
    }

    return json({error:"Unsupported certification action."},400,origin);
  }catch(error){
    const message=error instanceof Error?error.message:"Unable to process DataNest AI certification.";
    const status=/membership|access|required|authority/i.test(message)?403:400;
    return json({error:message},status,origin);
  }
});
