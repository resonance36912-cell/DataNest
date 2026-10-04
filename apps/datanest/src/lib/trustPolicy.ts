export type TrustPolicyRole="owner"|"admin"|"operator"|"viewer";

export type VisibilityClass=
  |"public"
  |"nest_private"
  |"project_restricted"
  |"organization_restricted"
  |"high_sensitivity"
  |"local_only";

export type ReuseState=
  |"runtime_only"
  |"session_context"
  |"project_learning_eligible"
  |"project_certified_memory"
  |"platform_learning_eligible"
  |"datanest_certified_knowledge"
  |"publicly_reusable";

export type TrustEvidenceState="verified"|"partial"|"planned"|"unknown";
export type ProviderTrustStatus="draft"|"active"|"restricted"|"suspended"|"retired";
export type RetentionDispositionIntent="retain"|"review_due"|"archive"|"minimize"|"delete_when_authorized"|"legal_hold";

export const visibilityClasses:VisibilityClass[]=[
  "public","nest_private","project_restricted","organization_restricted","high_sensitivity","local_only"
];

export const reuseStates:ReuseState[]=[
  "runtime_only","session_context","project_learning_eligible","project_certified_memory",
  "platform_learning_eligible","datanest_certified_knowledge","publicly_reusable"
];

export const evidenceStates:TrustEvidenceState[]=["verified","partial","planned","unknown"];

export const retentionDispositionIntents:RetentionDispositionIntent[]=[
  "retain","review_due","archive","minimize","delete_when_authorized","legal_hold"
];

const labels:Record<string,string>={
  public:"Public",
  nest_private:"Nest Private",
  project_restricted:"Project Restricted",
  organization_restricted:"Organization Restricted",
  high_sensitivity:"High Sensitivity",
  local_only:"Local Only",
  runtime_only:"Runtime Only",
  session_context:"Session Context",
  project_learning_eligible:"Project Learning Eligible",
  project_certified_memory:"Project Certified Memory",
  platform_learning_eligible:"Platform Learning Eligible",
  datanest_certified_knowledge:"DataNest Certified Knowledge",
  publicly_reusable:"Publicly Reusable",
  verified:"Verified",
  partial:"Partial",
  planned:"Planned / target state",
  unknown:"Unknown",
  retain:"Retain",
  review_due:"Review Due",
  archive:"Archive candidate",
  minimize:"Minimize candidate",
  delete_when_authorized:"Delete when separately authorized",
  legal_hold:"Legal Hold"
};

export function trustPolicyLabel(value:string|null|undefined){
  if(!value)return "—";
  return labels[value]||value.replaceAll("_"," ");
}

export function canProposeTrustPolicy(role:TrustPolicyRole){
  return role==="owner"||role==="admin"||role==="operator";
}

export function canApproveTrustPolicy(role:TrustPolicyRole){
  return role==="owner"||role==="admin";
}
