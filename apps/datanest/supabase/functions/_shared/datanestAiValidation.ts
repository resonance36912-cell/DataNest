export type AutomatedLearningGate="AUDIT"|"VERIFY"|"VALIDATE";

export type CandidateValidationSeal={
  candidate_content_hash:string;
  candidate_policy_version:string;
  candidate_evidence_hash:string;
  candidate_evidence_count:number;
  candidate_risk_class:string;
  candidate_has_conflict:boolean;
  candidate_derivation_review_hash:string;
};

export type AutomatedLearningAssessment={
  normalizedKnowledge:string;
  riskClass:"low"|"normal"|"high";
  evidenceCount:number;
  independentEvidenceCount:number;
  confidence:number;
  hasConflict:boolean;
  contentHash:string;
  policyVersion:string;
  evidenceHash:string;
  derivationReviewHash?:string;
};

export function candidateValidationSeal(
  input:Pick<
    AutomatedLearningAssessment,
    "contentHash"|"policyVersion"|"evidenceHash"|"evidenceCount"|"riskClass"|"hasConflict"
  > & {derivationReviewHash?:string}
):CandidateValidationSeal{
  return {
    candidate_content_hash:input.contentHash,
    candidate_policy_version:input.policyVersion,
    candidate_evidence_hash:input.evidenceHash,
    candidate_evidence_count:input.evidenceCount,
    candidate_risk_class:input.riskClass,
    candidate_has_conflict:input.hasConflict,
    candidate_derivation_review_hash:input.derivationReviewHash||""
  };
}

export function automatedLearningGateResults(
  input:AutomatedLearningAssessment
):Array<{
  gate:AutomatedLearningGate;
  passed:boolean;
  checks:Record<string,boolean|number|string>;
}>{
  if(input.riskClass!=="low"||input.evidenceCount<3)return [];

  const auditChecks={
    enough_evidence:input.evidenceCount>=3,
    knowledge_length_valid:
      input.normalizedKnowledge.trim().length>=12 &&
      input.normalizedKnowledge.trim().length<=6000,
    content_hash_valid:/^[0-9a-f]{64}$/i.test(input.contentHash),
    evidence_hash_valid:/^[0-9a-f]{64}$/i.test(input.evidenceHash),
    policy_version_present:input.policyVersion.trim().length>0
  };
  const verifyChecks={
    independent_evidence:input.independentEvidenceCount>=2,
    confidence_floor:input.confidence>=0.70
  };
  const validateChecks={
    no_conflict:!input.hasConflict,
    confidence_threshold:input.confidence>=0.78
  };

  const passed=(checks:Record<string,boolean|number|string>)=>
    Object.values(checks).every(value=>value===true||typeof value!=="boolean");

  return [
    {gate:"AUDIT",passed:passed(auditChecks),checks:auditChecks},
    {gate:"VERIFY",passed:passed(verifyChecks),checks:verifyChecks},
    {gate:"VALIDATE",passed:passed(validateChecks),checks:validateChecks}
  ];
}

export function validationRunMatchesSeal(
  results:unknown,
  seal:CandidateValidationSeal
):boolean{
  if(!results||typeof results!=="object")return false;
  const value=results as Record<string,unknown>;
  return (
    String(value.candidate_content_hash||"")===seal.candidate_content_hash &&
    String(value.candidate_policy_version||"")===seal.candidate_policy_version &&
    String(value.candidate_evidence_hash||"")===seal.candidate_evidence_hash &&
    Number(value.candidate_evidence_count)===seal.candidate_evidence_count &&
    String(value.candidate_risk_class||"")===seal.candidate_risk_class &&
    Boolean(value.candidate_has_conflict)===seal.candidate_has_conflict &&
    (
      !seal.candidate_derivation_review_hash ||
      String(value.candidate_derivation_review_hash||"")===seal.candidate_derivation_review_hash
    )
  );
}
