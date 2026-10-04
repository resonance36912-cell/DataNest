import { sha256Text } from "./datanestAiRuntime.ts";
import {
  bestCandidateByEvidenceOverlap,
  candidateFromRepeatedEvidence,
  stableCandidateIdFromHash
} from "./datanestAiTrends.ts";
import {
  automatedLearningGateResults,
  candidateValidationSeal
} from "./datanestAiValidation.ts";

const mutableLearningStates=new Set([
  "INTAKE","NEEDS_EVIDENCE","AUDITED","VERIFIED","VALIDATED"
]);
const projectLearningReuseStates=new Set([
  "project_learning_eligible","project_certified_memory",
  "platform_learning_eligible","datanest_certified_knowledge","publicly_reusable"
]);

export async function updateTrendCandidate(input:{
  staging:any;
  projectId:string;
  inputEventId:string;
  policyVersion:string;
  sourceTypes?:string[];
}):Promise<{candidateId:string|null;trendKey:string|null;evidenceCount:number}>{
  const {data,error}=await input.staging
    .from("ai_intake_events")
    .select("id,content,job_id,session_id,source_type,source_user_id,metadata")
    .eq("project_id",input.projectId)
    .in("source_type",input.sourceTypes||["human","ai_companion","document_evidence"])
    .order("created_at",{ascending:false})
    .limit(250);
  if(error)throw error;

  const rawEvidence=data||[];
  const eventIds=rawEvidence.map((item:any)=>String(item.id)).filter(Boolean);
  const derivationByChild=new Map<string,Record<string,unknown>>();
  if(eventIds.length){
    const {data:derivations,error:derivationsError}=await input.staging
      .from("ai_evidence_derivations")
      .select("child_event_id,root_event_id,derivation_kind")
      .eq("project_id",input.projectId)
      .in("child_event_id",eventIds);
    if(derivationsError)throw derivationsError;
    for(const row of derivations||[]){
      derivationByChild.set(String(row.child_event_id),row as Record<string,unknown>);
    }
  }

  const evidence=rawEvidence.map((item:any)=>({
    id:String(item.id),
    content:String(item.content),
    jobId:String(item.job_id||""),
    sessionId:String(item.session_id||""),
    sourceType:String(item.source_type||""),
    sourceUserId:item.source_user_id?String(item.source_user_id):null,
    independenceKey:typeof item.metadata?.independence_key==="string"
      ?String(item.metadata.independence_key)
      :null,
    derivationFamilyId:derivationByChild.has(String(item.id))
      ?String(derivationByChild.get(String(item.id))?.root_event_id||"")
      :null,
    derivationKind:derivationByChild.has(String(item.id))
      ?String(derivationByChild.get(String(item.id))?.derivation_kind||"") as any
      :null,
    metadata:typeof item.metadata==="object"&&item.metadata!==null
      ?item.metadata as Record<string,unknown>
      :{}
  })).filter((item:any)=>item.metadata.learning_eligible===true)
    .filter((item:any)=>{
      const reuseState=String(item.metadata.reuse_state||"project_learning_eligible");
      return projectLearningReuseStates.has(reuseState);
    });
  const current=evidence.find((item:any)=>item.id===input.inputEventId);
  if(!current)return {candidateId:null,trendKey:null,evidenceCount:0};

  const ordered=[
    current,
    ...evidence.filter((item:any)=>item.id!==input.inputEventId)
  ];
  const candidate=candidateFromRepeatedEvidence(ordered);
  if(!candidate)return {candidateId:null,trendKey:null,evidenceCount:1};

  const {data:cluster,error:clusterError}=await input.staging
    .from("ai_trend_clusters")
    .upsert({
      project_id:input.projectId,
      trend_key:candidate.trendKey,
      category:candidate.category,
      normalized_label:candidate.normalizedKnowledge.slice(0,500),
      evidence_count:candidate.evidenceIds.length,
      last_seen_at:new Date().toISOString()
    },{onConflict:"project_id,trend_key"})
    .select("id")
    .single();
  if(clusterError||!cluster)throw clusterError||new Error("Unable to record DataNest AI trend.");

  const trendEvidence=candidate.evidenceIds.map(eventId=>({
    cluster_id:String(cluster.id),
    event_id:eventId
  }));
  const {error:trendEvidenceError}=await input.staging
    .from("ai_trend_evidence")
    .upsert(trendEvidence,{onConflict:"cluster_id,event_id"});
  if(trendEvidenceError)throw trendEvidenceError;

  const {data:overlapLinks,error:overlapLinksError}=await input.staging
    .from("ai_candidate_evidence")
    .select("candidate_id,event_id")
    .in("event_id",candidate.evidenceIds);
  if(overlapLinksError)throw overlapLinksError;

  const overlapCandidateId=bestCandidateByEvidenceOverlap(
    (overlapLinks||[]).map((link:any)=>({
      candidateId:String(link.candidate_id),
      eventId:String(link.event_id)
    })),
    candidate.evidenceIds
  );

  const contentHash=await sha256Text(candidate.normalizedKnowledge);
  const candidateIdentityHash=await sha256Text(`${input.projectId}\n${candidate.trendKey}`);
  const stableCandidateId=stableCandidateIdFromHash(candidateIdentityHash);
  type MutableCandidate={id:string;lifecycle_state:string;evidence_count:number};

  let existing:MutableCandidate|null=null;
  if(overlapCandidateId){
    const {data,error}=await input.staging
      .from("ai_learning_candidates")
      .select("id,lifecycle_state,evidence_count")
      .eq("id",overlapCandidateId)
      .eq("project_id",input.projectId)
      .maybeSingle();
    if(error)throw error;
    existing=data&&mutableLearningStates.has(String(data.lifecycle_state))
      ?data as MutableCandidate
      :null;
  }

  if(!existing){
    const {data,error}=await input.staging
      .from("ai_learning_candidates")
      .select("id,lifecycle_state,evidence_count")
      .eq("project_id",input.projectId)
      .eq("content_hash",contentHash)
      .limit(1)
      .maybeSingle();
    if(error)throw error;
    existing=data as MutableCandidate|null;
  }

  let candidateId=existing?.id?String(existing.id):"";
  if(!existing){
    const {data:created,error:createError}=await input.staging
      .from("ai_learning_candidates")
      .insert({
        id:stableCandidateId,
        project_id:input.projectId,
        normalized_knowledge:candidate.normalizedKnowledge,
        category:candidate.category,
        risk_class:candidate.riskClass,
        lifecycle_state:"INTAKE",
        evidence_count:candidate.evidenceIds.length,
        has_conflict:candidate.hasConflict,
        confidence:candidate.confidence,
        policy_version:input.policyVersion,
        content_hash:contentHash
      })
      .select("id,lifecycle_state,evidence_count")
      .single();

    if(createError){
      if(createError.code!=="23505")throw createError;
      const {data:concurrentCandidate,error:concurrentError}=await input.staging
        .from("ai_learning_candidates")
        .select("id,lifecycle_state,evidence_count")
        .eq("id",stableCandidateId)
        .eq("project_id",input.projectId)
        .maybeSingle();
      if(concurrentError)throw concurrentError;
      if(!concurrentCandidate){
        throw new Error("Deterministic candidate identity collided outside the current project.");
      }
      existing=concurrentCandidate as MutableCandidate;
      candidateId=String(concurrentCandidate.id);
    }else if(created){
      candidateId=String(created.id);
    }else{
      throw new Error("Unable to create DataNest AI learning candidate.");
    }
  }

  if(existing?.id){
    if(!mutableLearningStates.has(String(existing.lifecycle_state))){
      return {
        candidateId,
        trendKey:candidate.trendKey,
        evidenceCount:Number(existing.evidence_count||0)
      };
    }
    const {error:updateError}=await input.staging
      .from("ai_learning_candidates")
      .update({
        normalized_knowledge:candidate.normalizedKnowledge,
        content_hash:contentHash,
        evidence_count:candidate.evidenceIds.length,
        category:candidate.category,
        risk_class:candidate.riskClass,
        has_conflict:candidate.hasConflict,
        confidence:candidate.confidence,
        policy_version:input.policyVersion,
        lifecycle_state:"INTAKE",
        updated_at:new Date().toISOString()
      })
      .eq("id",candidateId);
    if(updateError)throw updateError;
  }

  if(!candidateId){
    throw new Error("Unable to resolve DataNest AI learning candidate.");
  }

  const candidateEvidence=candidate.evidenceIds.map(eventId=>({
    candidate_id:candidateId,
    event_id:eventId
  }));
  const {error:candidateEvidenceError}=await input.staging
    .from("ai_candidate_evidence")
    .upsert(candidateEvidence,{onConflict:"candidate_id,event_id"});
  if(candidateEvidenceError)throw candidateEvidenceError;

  const {data:linkedEvidence,error:linkedEvidenceError}=await input.staging
    .from("ai_candidate_evidence")
    .select("event_id")
    .eq("candidate_id",candidateId);
  if(linkedEvidenceError)throw linkedEvidenceError;
  const activeEvidence=new Set(candidate.evidenceIds);
  const staleEvidence=(linkedEvidence||[])
    .map((item:any)=>String(item.event_id))
    .filter((eventId:string)=>!activeEvidence.has(eventId));
  if(staleEvidence.length){
    const {error:staleEvidenceError}=await input.staging
      .from("ai_candidate_evidence")
      .delete()
      .eq("candidate_id",candidateId)
      .in("event_id",staleEvidence);
    if(staleEvidenceError)throw staleEvidenceError;
  }

  const evidenceHash=await sha256Text([...candidate.evidenceIds].sort().join("\n"));
  const automatedGates=automatedLearningGateResults({
    normalizedKnowledge:candidate.normalizedKnowledge,
    riskClass:candidate.riskClass,
    evidenceCount:candidate.evidenceIds.length,
    independentEvidenceCount:candidate.independentEvidenceCount,
    confidence:candidate.confidence,
    hasConflict:candidate.hasConflict,
    contentHash,
    policyVersion:input.policyVersion,
    evidenceHash
  });

  if(automatedGates.length){
    const seal=candidateValidationSeal({
      contentHash,
      policyVersion:input.policyVersion,
      evidenceHash,
      evidenceCount:candidate.evidenceIds.length,
      riskClass:candidate.riskClass,
      hasConflict:candidate.hasConflict
    });
    const {error:validationError}=await input.staging
      .from("ai_validation_runs")
      .insert(automatedGates.map(run=>({
        candidate_id:candidateId,
        gate:run.gate,
        suite_version:input.policyVersion,
        passed:run.passed,
        results:{
          ...run.checks,
          ...seal,
          automation_version:"datanest-ai-learning-validation-v3",
          derivation_family_independence:true
        },
        actor_type:"automation",
        actor_user_id:null
      })));
    if(validationError)throw validationError;

    const nextState=automatedGates.every(run=>run.passed)
      ?"VALIDATED"
      :"NEEDS_EVIDENCE";
    const {error:validationStateError}=await input.staging
      .from("ai_learning_candidates")
      .update({
        lifecycle_state:nextState,
        updated_at:new Date().toISOString()
      })
      .eq("id",candidateId);
    if(validationStateError)throw validationStateError;
  }

  return {
    candidateId,
    trendKey:candidate.trendKey,
    evidenceCount:candidate.evidenceIds.length
  };
}
