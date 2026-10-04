export type AuditDraftFinding={
  criterionId:string;
  evidenceIds:string[];
  observation:string;
  limitation:string|null;
  claimKind:"observed"|"inferred"|"unknown";
  severity:"info"|"low"|"medium"|"high"|"critical";
  confidence:number;
  draftAction:string|null;
};

export type AuditDraft={summary:string;limitations:string[];findings:AuditDraftFinding[]};

export function validateAuditDraft(raw:unknown,context:{sourceIds:string[];criterionIds:string[]}):AuditDraft{
  if(!raw||typeof raw!=="object")throw new Error("audit_draft_object_required");
  const record=raw as Record<string,unknown>;
  if(!Array.isArray(record.findings))throw new Error("audit_findings_required");
  const sourceSet=new Set(context.sourceIds);
  const criterionSet=new Set(context.criterionIds);
  const findings=record.findings.map((item,index)=>{
    if(!item||typeof item!=="object")throw new Error("invalid_finding_"+index);
    const value=item as Record<string,unknown>;
    const criterionId=String(value.criterionId||"").trim();
    if(!criterionSet.has(criterionId))throw new Error("invalid_criterion_id:"+criterionId);
    const evidenceIds=Array.isArray(value.evidenceIds)?value.evidenceIds.map(String):[];
    if(evidenceIds.some(id=>!sourceSet.has(id)))throw new Error("invalid_evidence_id");
    const observation=String(value.observation||"").trim();
    if(!observation)throw new Error("observation_required");
    const requestedClaim=String(value.claimKind||"unknown");
    const claimKind:AuditDraftFinding["claimKind"]=
      evidenceIds.length===0
        ?"inferred"
        :requestedClaim==="observed"||requestedClaim==="inferred"||requestedClaim==="unknown"
          ?requestedClaim
          :"unknown";
    const severityRaw=String(value.severity||"info");
    const severity=(["info","low","medium","high","critical"].includes(severityRaw)?severityRaw:"info") as AuditDraftFinding["severity"];
    const confidenceRaw=Number(value.confidence??0);
    const confidence=Number.isFinite(confidenceRaw)?Math.max(0,Math.min(1,confidenceRaw)):0;
    return {
      criterionId,evidenceIds,observation,
      limitation:value.limitation==null?null:String(value.limitation).trim()||null,
      claimKind,severity,confidence,
      draftAction:value.draftAction==null?null:String(value.draftAction).trim()||null
    };
  });
  return {
    summary:String(record.summary||"").trim(),
    limitations:Array.isArray(record.limitations)?record.limitations.map(String).filter(Boolean):[],
    findings
  };
}