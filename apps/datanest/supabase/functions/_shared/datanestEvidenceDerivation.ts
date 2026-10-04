export type EvidenceDerivationKind=
  "translation"|"paraphrase"|"summary"|"transcription"|"other";

export type SemanticEquivalenceDecision="equivalent"|"changed";

export type DerivationAwareEvidence={
  id:string;
  derivationFamilyId?:string|null;
  derivationKind?:EvidenceDerivationKind|null;
  semanticEquivalenceStatus?:
    "unreviewed"|"reviewed_equivalent"|"reviewed_changed"|"stale_review"|null;
  independenceKey?:string|null;
  jobId?:string|null;
  sessionId?:string|null;
  sourceUserId?:string|null;
  sourceType?:string|null;
};

const derivationKinds=new Set<EvidenceDerivationKind>([
  "translation","paraphrase","summary","transcription","other"
]);

export function canonicalDerivationKind(value:unknown):EvidenceDerivationKind{
  const normalized=String(value||"").trim().toLowerCase().replace(/[\s-]+/g,"_");
  if(!derivationKinds.has(normalized as EvidenceDerivationKind)){
    throw new Error("Unsupported evidence derivation kind.");
  }
  return normalized as EvidenceDerivationKind;
}

export function evidenceIndependenceIdentity(event:DerivationAwareEvidence):string{
  if(event.derivationFamilyId?.trim()){
    return "derivation-family:"+event.derivationFamilyId.trim();
  }
  if(event.independenceKey?.trim()){
    return "independence-key:"+event.independenceKey.trim();
  }
  return [
    event.jobId||"",
    event.sessionId||"",
    event.sourceUserId||"",
    event.sourceType||""
  ].join("|");
}

export function derivationRequiresHumanReview(event:DerivationAwareEvidence):boolean{
  return Boolean(event.derivationFamilyId?.trim()&&event.derivationKind);
}

export function semanticReviewStatus(
  decision:unknown,
  qualificationIdsCurrent:boolean
):"unreviewed"|"reviewed_equivalent"|"reviewed_changed"|"stale_review"{
  if(decision==="equivalent"){
    return qualificationIdsCurrent?"reviewed_equivalent":"stale_review";
  }
  if(decision==="changed")return "reviewed_changed";
  return "unreviewed";
}

export function canonicalEvidenceLanguage(metadata:unknown):string|null{
  if(!metadata||typeof metadata!=="object"||Array.isArray(metadata))return null;
  const value=(metadata as Record<string,unknown>).source_language;
  if(typeof value!=="string"||!value.trim())return null;
  try{
    return Intl.getCanonicalLocales(value.trim())[0]||null;
  }catch{
    return null;
  }
}
