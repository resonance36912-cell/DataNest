export type IlmRouteDecision="selected"|"rejected"|"review_required";
export type IlmRouteKind="provider_model"|"local_model"|"managed_model"|"tool_agent"|"memory_only";

export type IlmProfile={
  id:string;
  projectId:string;
  version:number;
  profileKey:string;
  allowedPurposes:string[];
  defaultCapability:string;
  allowedResourceKinds:string[];
  memoryPolicy:Record<string,unknown>;
  routingPolicy:Record<string,unknown>;
  evaluationPolicy:Record<string,unknown>;
};

export type IlmMemoryItem={
  id:string;
  normalizedKnowledge?:string;
};

export type IlmPolicyResult={
  outcome:"allow"|"deny"|"review_required";
  enforcementMode?:string;
  reasonCode?:string;
  evidence?:Record<string,unknown>;
};

export type IlmResourceCandidate={
  resourceId:string;
  capabilityId:string;
  resourceKind:string;
  resourceKey?:string;
  outcome?:"eligible"|"ineligible"|"review_required";
  reasonCode?:string;
};

export type IlmResourceResult={
  eligibleCandidates:IlmResourceCandidate[];
  decisions?:Array<Record<string,unknown>>;
};

export type IlmProviderRoute={
  connectionId:string;
  providerKey:string;
  modelLabel:string;
  resourceId?:string|null;
  capabilityId?:string|null;
  routeKind?:IlmRouteKind;
  policyEvidence?:Record<string,unknown>;
};

export type IlmRecordedRoute={
  id:string;
};

export type ResolveIlm1RouteInput={
  projectId:string;
  jobId:string|null;
  aiUsageRequestId:string|null;
  traceId:string;
  profile:IlmProfile;
  purpose:string;
  visibilityClass:string;
  requestedOperation:string;
  requestedCapability:string;
};

export type ResolveIlm1RouteDeps={
  loadCertifiedMemory:(input:ResolveIlm1RouteInput)=>Promise<IlmMemoryItem[]>;
  evaluateDataPolicy:(input:ResolveIlm1RouteInput&{certifiedMemoryIds:string[]})=>Promise<IlmPolicyResult>;
  resolveResourceCandidates:(input:ResolveIlm1RouteInput&{
    certifiedMemoryIds:string[];
    policy:IlmPolicyResult;
  })=>Promise<IlmResourceResult>;
  resolveProviderConnection:(input:ResolveIlm1RouteInput&{
    certifiedMemoryIds:string[];
    policy:IlmPolicyResult;
    resources:IlmResourceResult;
  })=>Promise<IlmProviderRoute|null>;
  recordRouteDecision:(input:{
    projectId:string;
    jobId:string|null;
    aiUsageRequestId:string|null;
    traceId:string;
    profileId:string;
    purpose:string;
    visibilityClass:string;
    requestedOperation:string;
    requestedCapability:string;
    certifiedMemoryIds:string[];
    resourceId:string|null;
    capabilityId:string|null;
    providerConnectionId:string|null;
    providerKey:string|null;
    modelLabel:string|null;
    routeKind:IlmRouteKind;
    decision:IlmRouteDecision;
    reasonCodes:string[];
    policyEvidence:Record<string,unknown>;
    resourceEvidence:Record<string,unknown>;
  })=>Promise<IlmRecordedRoute>;
};

export type Ilm1RouteResult={
  decision:IlmRouteDecision;
  routeDecisionId:string;
  routeKind:IlmRouteKind;
  certifiedMemoryIds:string[];
  resourceId:string|null;
  capabilityId:string|null;
  providerConnectionId:string|null;
  providerKey:string|null;
  modelLabel:string|null;
  reasonCodes:string[];
};

/**
 * ILM-1 is DataNest's governed orchestration layer over approved memory, policy, resources, providers, tools and agents.
 * ILM-1 is not a trained foundation model and it does not execute side effects.
 */
export async function resolveIlm1Route(
  deps:ResolveIlm1RouteDeps,
  input:ResolveIlm1RouteInput
):Promise<Ilm1RouteResult>{
  let effectiveVisibilityClass=input.visibilityClass;
  if(!input.profile.allowedPurposes.includes(input.purpose)){
    const recorded=await deps.recordRouteDecision({
      projectId:input.projectId,
      jobId:input.jobId,
      aiUsageRequestId:input.aiUsageRequestId,
      traceId:input.traceId,
      profileId:input.profile.id,
      purpose:input.purpose,
      visibilityClass:effectiveVisibilityClass,
      requestedOperation:input.requestedOperation,
      requestedCapability:input.requestedCapability,
      certifiedMemoryIds:[],
      resourceId:null,
      capabilityId:null,
      providerConnectionId:null,
      providerKey:null,
      modelLabel:null,
      routeKind:"memory_only",
      decision:"rejected",
      reasonCodes:["purpose_not_allowed"],
      policyEvidence:{},
      resourceEvidence:{}
    });
    return {
      decision:"rejected",
      routeDecisionId:recorded.id,
      routeKind:"memory_only",
      certifiedMemoryIds:[],
      resourceId:null,
      capabilityId:null,
      providerConnectionId:null,
      providerKey:null,
      modelLabel:null,
      reasonCodes:["purpose_not_allowed"]
    };
  }

  const memory=await deps.loadCertifiedMemory(input);
  const certifiedMemoryIds=memory.map(item=>item.id).filter(Boolean);

  const policy=await deps.evaluateDataPolicy({...input,certifiedMemoryIds});
  effectiveVisibilityClass=String(
    policy.evidence?.visibility_class||input.visibilityClass
  );
  if(policy.outcome==="deny"){
    const recorded=await deps.recordRouteDecision({
      projectId:input.projectId,
      jobId:input.jobId,
      aiUsageRequestId:input.aiUsageRequestId,
      traceId:input.traceId,
      profileId:input.profile.id,
      purpose:input.purpose,
      visibilityClass:effectiveVisibilityClass,
      requestedOperation:input.requestedOperation,
      requestedCapability:input.requestedCapability,
      certifiedMemoryIds,
      resourceId:null,
      capabilityId:null,
      providerConnectionId:null,
      providerKey:null,
      modelLabel:null,
      routeKind:"memory_only",
      decision:"rejected",
      reasonCodes:[policy.reasonCode||"data_policy_denied"],
      policyEvidence:policy.evidence||{},
      resourceEvidence:{}
    });
    return {
      decision:"rejected",
      routeDecisionId:recorded.id,
      routeKind:"memory_only",
      certifiedMemoryIds,
      resourceId:null,
      capabilityId:null,
      providerConnectionId:null,
      providerKey:null,
      modelLabel:null,
      reasonCodes:[policy.reasonCode||"data_policy_denied"]
    };
  }

  const resources=await deps.resolveResourceCandidates({...input,visibilityClass:effectiveVisibilityClass,certifiedMemoryIds,policy});
  const eligible=resources.eligibleCandidates.filter(candidate=>
    input.profile.allowedResourceKinds.length===0 ||
    input.profile.allowedResourceKinds.includes(candidate.resourceKind)
  );

  if(policy.outcome==="review_required"){
    const candidate=eligible[0]||null;
    const recorded=await deps.recordRouteDecision({
      projectId:input.projectId,
      jobId:input.jobId,
      aiUsageRequestId:input.aiUsageRequestId,
      traceId:input.traceId,
      profileId:input.profile.id,
      purpose:input.purpose,
      visibilityClass:effectiveVisibilityClass,
      requestedOperation:input.requestedOperation,
      requestedCapability:input.requestedCapability,
      certifiedMemoryIds,
      resourceId:candidate?.resourceId||null,
      capabilityId:candidate?.capabilityId||null,
      providerConnectionId:null,
      providerKey:null,
      modelLabel:null,
      routeKind:candidate?.resourceKind==="local_node"?"local_model":"memory_only",
      decision:"review_required",
      reasonCodes:[policy.reasonCode||"data_policy_review_required"],
      policyEvidence:policy.evidence||{},
      resourceEvidence:{decisions:resources.decisions||[]}
    });
    return {
      decision:"review_required",
      routeDecisionId:recorded.id,
      routeKind:candidate?.resourceKind==="local_node"?"local_model":"memory_only",
      certifiedMemoryIds,
      resourceId:candidate?.resourceId||null,
      capabilityId:candidate?.capabilityId||null,
      providerConnectionId:null,
      providerKey:null,
      modelLabel:null,
      reasonCodes:[policy.reasonCode||"data_policy_review_required"]
    };
  }

  const provider=await deps.resolveProviderConnection({...input,visibilityClass:effectiveVisibilityClass,certifiedMemoryIds,policy,resources});
  const candidate=eligible[0]||null;

  if(effectiveVisibilityClass==="local_only"&&provider){
    const recorded=await deps.recordRouteDecision({
      projectId:input.projectId,
      jobId:input.jobId,
      aiUsageRequestId:input.aiUsageRequestId,
      traceId:input.traceId,
      profileId:input.profile.id,
      purpose:input.purpose,
      visibilityClass:effectiveVisibilityClass,
      requestedOperation:input.requestedOperation,
      requestedCapability:input.requestedCapability,
      certifiedMemoryIds,
      resourceId:candidate?.resourceId||null,
      capabilityId:candidate?.capabilityId||null,
      providerConnectionId:null,
      providerKey:null,
      modelLabel:null,
      routeKind:candidate?.resourceKind==="local_node"?"local_model":"memory_only",
      decision:"rejected",
      reasonCodes:["local_only_external_route_rejected"],
      policyEvidence:policy.evidence||{},
      resourceEvidence:{decisions:resources.decisions||[]}
    });
    return {
      decision:"rejected",
      routeDecisionId:recorded.id,
      routeKind:candidate?.resourceKind==="local_node"?"local_model":"memory_only",
      certifiedMemoryIds,
      resourceId:candidate?.resourceId||null,
      capabilityId:candidate?.capabilityId||null,
      providerConnectionId:null,
      providerKey:null,
      modelLabel:null,
      reasonCodes:["local_only_external_route_rejected"]
    };
  }

  if(!provider&&!candidate){
    const recorded=await deps.recordRouteDecision({
      projectId:input.projectId,
      jobId:input.jobId,
      aiUsageRequestId:input.aiUsageRequestId,
      traceId:input.traceId,
      profileId:input.profile.id,
      purpose:input.purpose,
      visibilityClass:effectiveVisibilityClass,
      requestedOperation:input.requestedOperation,
      requestedCapability:input.requestedCapability,
      certifiedMemoryIds,
      resourceId:null,
      capabilityId:null,
      providerConnectionId:null,
      providerKey:null,
      modelLabel:null,
      routeKind:"memory_only",
      decision:"review_required",
      reasonCodes:["no_eligible_intelligence_route"],
      policyEvidence:policy.evidence||{},
      resourceEvidence:{decisions:resources.decisions||[]}
    });
    return {
      decision:"review_required",
      routeDecisionId:recorded.id,
      routeKind:"memory_only",
      certifiedMemoryIds,
      resourceId:null,
      capabilityId:null,
      providerConnectionId:null,
      providerKey:null,
      modelLabel:null,
      reasonCodes:["no_eligible_intelligence_route"]
    };
  }

  const routeKind:IlmRouteKind=provider?.routeKind
    ||(candidate?.resourceKind==="local_node"?"local_model":"managed_model");
  const resourceId=provider?.resourceId||candidate?.resourceId||null;
  const capabilityId=provider?.capabilityId||candidate?.capabilityId||null;

  const recorded=await deps.recordRouteDecision({
    projectId:input.projectId,
    jobId:input.jobId,
    aiUsageRequestId:input.aiUsageRequestId,
    traceId:input.traceId,
    profileId:input.profile.id,
    purpose:input.purpose,
    visibilityClass:effectiveVisibilityClass,
    requestedOperation:input.requestedOperation,
    requestedCapability:input.requestedCapability,
    certifiedMemoryIds,
    resourceId,
    capabilityId,
    providerConnectionId:provider?.connectionId||null,
    providerKey:provider?.providerKey||null,
    modelLabel:provider?.modelLabel||null,
    routeKind,
    decision:"selected",
    reasonCodes:["ilm_route_selected"],
    policyEvidence:{...(policy.evidence||{}),...(provider?.policyEvidence||{})},
    resourceEvidence:{decisions:resources.decisions||[]}
  });

  return {
    decision:"selected",
    routeDecisionId:recorded.id,
    routeKind,
    certifiedMemoryIds,
    resourceId,
    capabilityId,
    providerConnectionId:provider?.connectionId||null,
    providerKey:provider?.providerKey||null,
    modelLabel:provider?.modelLabel||null,
    reasonCodes:["ilm_route_selected"]
  };
}
