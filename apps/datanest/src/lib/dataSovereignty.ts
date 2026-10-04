export type SovereigntyBoundary="unresolved"|"local_only"|"region_constrained"|"provider_governed";
export type SovereigntyExternalProcessing="unresolved"|"denied"|"report_only"|"approved_profiles_only"|"review_required";
export type SovereigntyCrossBorder="unresolved"|"denied"|"no_external_route"|"governed_by_region_allowlist"|"review_required";
export type SovereigntyReusePosture="restricted_by_default"|"immediate_operation_only"|"session_only"|"project_governed"|"platform_governed"|"public_reuse_governed";
export type SovereigntyRollout="unresolved"|"report_only"|"enforced";

export type DataSovereigntyModel={
  rollout:SovereigntyRollout;
  boundary:SovereigntyBoundary;
  externalProcessing:SovereigntyExternalProcessing;
  crossBorder:SovereigntyCrossBorder;
  reusePosture:SovereigntyReusePosture;
  authorityModel:"project_governed";
  platformOwnershipEffect:"none";
  visibilityClass:string;
  reuseState:string;
  exportPolicy:string;
  evidenceState:string;
  approvedProviderKeys:string[];
  activeApprovedProviderKeys:string[];
  unresolvedProviderKeys:string[];
  allowedRegions:string[];
  retentionPolicyKey:string|null;
  retentionDisposition:string|null;
  activeHoldCount:number;
  knownLimitations:string|null;
};

type Row=Record<string,unknown>;

function text(value:unknown){
  return value==null?"":String(value).trim();
}

function list(value:unknown){
  return Array.isArray(value)?value.map(item=>String(item).trim()).filter(Boolean):[];
}

function reusePosture(value:string):SovereigntyReusePosture{
  if(value==="runtime_only")return "immediate_operation_only";
  if(value==="session_context")return "session_only";
  if(value==="project_learning_eligible"||value==="project_certified_memory")return "project_governed";
  if(value==="platform_learning_eligible"||value==="datanest_certified_knowledge")return "platform_governed";
  if(value==="publicly_reusable")return "public_reuse_governed";
  return "restricted_by_default";
}

function activeHoldCount(retentionHolds:Row[]){
  return retentionHolds.filter(item=>text(item.status)!=="released").length;
}

function unresolvedDataSovereigntyModel(retentionHolds:Row[]):DataSovereigntyModel{
  return {
    rollout:"unresolved",
    boundary:"unresolved",
    externalProcessing:"unresolved",
    crossBorder:"unresolved",
    reusePosture:"restricted_by_default",
    authorityModel:"project_governed",
    platformOwnershipEffect:"none",
    visibilityClass:"unknown",
    reuseState:"unknown",
    exportPolicy:"unknown",
    evidenceState:"unknown",
    approvedProviderKeys:[],
    activeApprovedProviderKeys:[],
    unresolvedProviderKeys:[],
    allowedRegions:[],
    retentionPolicyKey:null,
    retentionDisposition:null,
    activeHoldCount:activeHoldCount(retentionHolds),
    knownLimitations:null
  };
}

export function deriveDataSovereigntyModel({
  manifest,
  providerProfiles,
  retentionPolicies,
  retentionHolds
}:{
  manifest:Row|null|undefined;
  providerProfiles:Row[];
  retentionPolicies:Row[];
  retentionHolds:Row[];
}):DataSovereigntyModel{
  if(!manifest)return unresolvedDataSovereigntyModel(retentionHolds);

  const visibilityClass=text(manifest.default_visibility_class)||"unknown";
  const reuseState=text(manifest.default_reuse_state)||"unknown";
  const rollout:SovereigntyRollout=text(manifest.enforcement_mode)==="enforced"?"enforced":"report_only";
  const approvedProviderKeys=[...new Set(list(manifest.approved_provider_keys))].sort();

  const activeProfiles=providerProfiles.filter(item=>text(item.status)==="active");
  const activeProfileByKey=new Map(activeProfiles.map(item=>[text(item.provider_key),item] as const));
  const activeApprovedProviderKeys=approvedProviderKeys.filter(key=>activeProfileByKey.has(key));
  const unresolvedProviderKeys=approvedProviderKeys.filter(key=>!activeProfileByKey.has(key));
  const approvedProfiles=activeApprovedProviderKeys.map(key=>activeProfileByKey.get(key)!).filter(Boolean);
  const allowedRegions=[...new Set(approvedProfiles.flatMap(profile=>list(profile.allowed_regions)))].sort();
  const completeRegionCoverage=
    approvedProviderKeys.length>0 &&
    unresolvedProviderKeys.length===0 &&
    approvedProfiles.every(profile=>list(profile.allowed_regions).length>0);

  let boundary:SovereigntyBoundary="provider_governed";
  if(visibilityClass==="local_only")boundary="local_only";
  else if(completeRegionCoverage)boundary="region_constrained";

  let externalProcessing:SovereigntyExternalProcessing;
  let crossBorder:SovereigntyCrossBorder;
  if(visibilityClass==="local_only"){
    externalProcessing="denied";
    crossBorder="denied";
  }else if(approvedProviderKeys.length===0){
    externalProcessing="denied";
    crossBorder="no_external_route";
  }else if(unresolvedProviderKeys.length>0){
    externalProcessing="review_required";
    crossBorder="review_required";
  }else if(rollout==="report_only"){
    externalProcessing="report_only";
    crossBorder=completeRegionCoverage?"governed_by_region_allowlist":"review_required";
  }else{
    externalProcessing="approved_profiles_only";
    crossBorder=completeRegionCoverage?"governed_by_region_allowlist":"review_required";
  }

  const retentionPolicyId=text(manifest.retention_policy_id);
  const retentionPolicy=retentionPolicies.find(item=>
    text(item.id)===retentionPolicyId && text(item.status)==="active"
  )||null;

  return {
    rollout,
    boundary,
    externalProcessing,
    crossBorder,
    reusePosture:reusePosture(reuseState),
    authorityModel:"project_governed",
    platformOwnershipEffect:"none",
    visibilityClass,
    reuseState,
    exportPolicy:text(manifest.export_policy)||"governed_only",
    evidenceState:text(manifest.evidence_state)||"unknown",
    approvedProviderKeys,
    activeApprovedProviderKeys,
    unresolvedProviderKeys,
    allowedRegions,
    retentionPolicyKey:retentionPolicy?text(retentionPolicy.policy_key)||null:null,
    retentionDisposition:retentionPolicy?text(retentionPolicy.default_disposition_intent)||null:null,
    activeHoldCount:activeHoldCount(retentionHolds),
    knownLimitations:text(manifest.known_limitations)||null
  };
}
