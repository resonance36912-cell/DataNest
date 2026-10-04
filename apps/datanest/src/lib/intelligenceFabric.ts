export type IlmProfileStatus="draft"|"active"|"suspended"|"superseded"|"retired";
export type IntelligenceRouteKind="provider_model"|"local_model"|"managed_model"|"tool_agent"|"memory_only";
export type IntelligenceRouteDecision="selected"|"rejected"|"review_required";
export type IntelligenceEvaluatorKind="deterministic"|"policy"|"human_review"|"certification_suite";
export type IntelligenceEvaluationStatus="passed"|"failed"|"review_required";
export type IntelligenceCapabilityEvidenceKind="route_result"|"evaluation"|"certification"|"operator_review";
export type IntelligenceCapabilityEvidenceStatus="supported"|"degraded"|"unsupported"|"unknown";
export type IntelligenceFabricRole="owner"|"admin"|"operator"|"viewer";

export const ilmProfileStatuses:IlmProfileStatus[]=["draft","active","suspended","retired"];
export const intelligenceResourceKinds=[
  "local_node","cloud_worker","gpu_runtime","browser_runtime","model_endpoint",
  "storage_endpoint","api_endpoint","external_service","agent_runtime",
  "product_capability","human_specialist"
] as const;

export function canManageIntelligenceFabric(role:IntelligenceFabricRole){
  return role==="owner"||role==="admin";
}

export function intelligenceLabel(value:string|null|undefined){
  if(!value)return "—";
  return value.replaceAll("_"," ").replace(/\b\w/g,match=>match.toUpperCase());
}

export function routeDecisionTone(value:string|null|undefined){
  if(value==="selected"||value==="passed"||value==="supported")return "good";
  if(value==="review_required"||value==="degraded"||value==="unknown")return "warn";
  if(value==="rejected"||value==="failed"||value==="unsupported")return "bad";
  return "neutral";
}
