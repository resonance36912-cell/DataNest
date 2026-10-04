export type ResourceKind=
  |"local_node"
  |"cloud_worker"
  |"gpu_runtime"
  |"browser_runtime"
  |"model_endpoint"
  |"storage_endpoint"
  |"api_endpoint"
  |"external_service"
  |"agent_runtime"
  |"product_capability"
  |"human_specialist";

export type ResourceTrustLevel="unknown"|"declared"|"verified"|"governed";
export type ResourceHealthStatus="unknown"|"healthy"|"degraded"|"unhealthy";
export type ResourceBindingState="proposed"|"active"|"suspended"|"retired";
export type ResourceFabricRole="owner"|"admin"|"operator"|"viewer";
export type ResourceVisibilityClass=
  |"public"
  |"nest_private"
  |"project_restricted"
  |"organization_restricted"
  |"high_sensitivity"
  |"local_only";

export const resourceKinds:ResourceKind[]=[
  "local_node","cloud_worker","gpu_runtime","browser_runtime","model_endpoint",
  "storage_endpoint","api_endpoint","external_service","agent_runtime",
  "product_capability","human_specialist"
];

export const resourceTrustLevels:ResourceTrustLevel[]=["unknown","declared","verified","governed"];
export const resourceHealthStatuses:ResourceHealthStatus[]=["unknown","healthy","degraded","unhealthy"];
export const resourceBindingStates:ResourceBindingState[]=["proposed","active","suspended","retired"];
export const resourceVisibilityClasses:ResourceVisibilityClass[]=[
  "public","nest_private","project_restricted","organization_restricted","high_sensitivity","local_only"
];

export const resourceLocationClasses=[
  "unknown","local_device","local_network","private_cloud","managed_cloud","public_cloud","external","human"
] as const;

export function canManageResourceFabric(role:ResourceFabricRole){
  return role==="owner"||role==="admin";
}

export function resourceFabricLabel(value:string|null|undefined){
  if(!value)return "—";
  return value.replaceAll("_"," ").replace(/\b\w/g,match=>match.toUpperCase());
}

export function resourceHealthTone(value:string|null|undefined){
  if(value==="healthy")return "good";
  if(value==="degraded")return "warn";
  if(value==="unhealthy")return "bad";
  return "neutral";
}

export function resourceTrustTone(value:string|null|undefined){
  if(value==="governed"||value==="verified")return "good";
  if(value==="declared")return "warn";
  return "neutral";
}
