export type ProjectRole = "owner" | "admin" | "operator" | "viewer";
export type RiskClass = "low" | "normal" | "high";
export type CertificationAuthority = "automation" | "admin" | "owner";
export type TrustState = "uncertified" | "certified";

const ownerOnly = new Set([
  "architecture",
  "security",
  "authentication",
  "authorization",
  "governance",
  "destructive",
  "production_policy"
]);

export function requiredCertificationAuthority(input: {
  category: string;
  riskClass: RiskClass;
  hasConflict: boolean;
}): CertificationAuthority {
  if (input.hasConflict || input.riskClass === "high" || ownerOnly.has(input.category)) return "owner";
  if (input.riskClass === "normal") return "admin";
  return "automation";
}

export function canAutoCertify(input: {
  category: string;
  riskClass: RiskClass;
  hasConflict: boolean;
  allGatesPassed: boolean;
  evidenceCount: number;
  confidence?: number|null;
}): boolean {
  return (
    input.allGatesPassed &&
    input.evidenceCount >= 3 &&
    typeof input.confidence === "number" &&
    input.confidence >= 0.78 &&
    requiredCertificationAuthority(input) === "automation"
  );
}

export function canUseUncertifiedEvidence(
  evidence: { projectId: string; jobId: string; sessionId: string },
  context: { projectId: string; jobId: string; sessionId: string }
): boolean {
  return evidence.projectId === context.projectId &&
    evidence.jobId === context.jobId &&
    evidence.sessionId === context.sessionId;
}

export function contextTrustLabel(state: TrustState): "UNCERTIFIED" | "CERTIFIED" {
  return state === "certified" ? "CERTIFIED" : "UNCERTIFIED";
}


export function canHumanCertify(
  role:ProjectRole,
  candidate:{category:string;riskClass:RiskClass;hasConflict:boolean}
):boolean {
  const required=requiredCertificationAuthority(candidate);
  if(required==="owner")return role==="owner";
  if(required==="admin")return role==="owner"||role==="admin";
  return role==="owner"||role==="admin";
}

export type CertificationGate="AUDIT"|"VERIFY"|"VALIDATE"|"STRESS_TEST"|"LANGUAGE_REVIEW";

export function allCertificationGatesPassed(
  runs:Array<{gate:CertificationGate;passed:boolean}>
):boolean {
  const required=new Set<CertificationGate>(["AUDIT","VERIFY","VALIDATE","STRESS_TEST"]);
  const latest=new Map<CertificationGate,boolean>();
  for(const run of runs)latest.set(run.gate,run.passed);
  for(const gate of required){
    if(latest.get(gate)!==true)return false;
  }
  return true;
}


export function allAutomatedCertificationGatesPassed(
  runs:Array<{gate:CertificationGate;passed:boolean;actor_type:string}>
):boolean {
  const latest=new Map<CertificationGate,{passed:boolean;actor_type:string}>();
  for(const run of runs)latest.set(run.gate,{passed:run.passed,actor_type:run.actor_type});
  for(const gate of ["AUDIT","VERIFY","VALIDATE","STRESS_TEST"] as CertificationGate[]){
    const state=latest.get(gate);
    if(!state||state.passed!==true||state.actor_type!=="automation")return false;
  }
  return true;
}
