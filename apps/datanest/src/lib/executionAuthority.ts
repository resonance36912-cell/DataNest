export type AutonomyLevel="A0"|"A1"|"A2"|"A3"|"A4";

// Legacy V1 operation vocabulary remains exported for compatibility/history.
// Canonical Phase D authorization also requires an explicit ConsequenceClass.
export type ExecutionOperation="observe"|"prepare"|"write"|"execute"|"promote"|"destruct";
export type ConsequenceClass=
  |"read_only"
  |"advisory"
  |"preparatory"
  |"reversible_write"
  |"external_communication"
  |"externally_visible_change"
  |"resource_execution"
  |"production_change"
  |"destructive"
  |"legal_commitment"
  |"financial_commitment"
  |"ownership_or_governance"
  |"constitutional";

export type AuthorityEnvelopeState=
  |"draft"|"proposed"|"approved"|"active"|"paused"|"exhausted"
  |"expired"|"revoked"|"superseded"|"rejected";
export type CapabilityLeaseState=
  |"proposed"|"active"|"exhausted"|"expired"|"paused"|"revoked"|"superseded"|"cancelled";
export type ExecutionCircuitBreakerCategory=
  |"autonomous_writes"
  |"external_communications"
  |"deployments"
  |"resource_execution";
export type ExecutionCircuitBreakerState="enabled"|"paused"|"blocked";
export type AuthorityRouteKey="external_ai_provider"|"job_start";
export type AuthorityRouteMode="report_only"|"enforced";
export type ExecutionAuthorityRole="owner"|"admin"|"operator"|"viewer";

export const autonomyLevels:AutonomyLevel[]=["A0","A1","A2","A3","A4"];
export const executionOperations:ExecutionOperation[]=["observe","prepare","write","execute","promote","destruct"];
export const consequenceClasses:ConsequenceClass[]=[
  "read_only","advisory","preparatory","reversible_write",
  "external_communication","externally_visible_change","resource_execution",
  "production_change","destructive","legal_commitment","financial_commitment",
  "ownership_or_governance","constitutional"
];
export const authorityRouteKeys:AuthorityRouteKey[]=["external_ai_provider","job_start"];
export const breakerCategories:ExecutionCircuitBreakerCategory[]=[
  "autonomous_writes","external_communications","deployments","resource_execution"
];

export const autonomyLabels:Record<AutonomyLevel,string>={
  A0:"Observe",
  A1:"Advise",
  A2:"Prepare",
  A3:"Execute",
  A4:"High-impact"
};

export const autonomyDescriptions:Record<AutonomyLevel,string>={
  A0:"Retrieve, monitor, inspect and summarize already-authorized information.",
  A1:"Analyze and recommend without creating an external side effect.",
  A2:"Prepare actionable work while execution remains separately governed.",
  A3:"Perform bounded execution only under active canonical authority and any required Capability Lease.",
  A4:"High-impact action. Exact-action human approval is mandatory and generic autonomous execution is unavailable."
};

// Retained as legacy presentation vocabulary only.
export const permissionGradient:ExecutionOperation[]=[
  "observe","prepare","write","execute","promote","destruct"
];

export function canProposeExecutionAuthority(role:ExecutionAuthorityRole){
  return role==="owner"||role==="admin"||role==="operator";
}

export function canApproveExecutionAuthority(role:ExecutionAuthorityRole,_level?:AutonomyLevel){
  return role==="owner"||role==="admin";
}

export function canManageCircuitBreakers(role:ExecutionAuthorityRole){
  return role==="owner"||role==="admin";
}

export function executionAuthorityLabel(value:string|null|undefined){
  if(!value)return "—";
  return value.replaceAll("_"," ").replace(/\b\w/g,match=>match.toUpperCase());
}
