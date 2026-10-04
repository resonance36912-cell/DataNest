import { requiresLanguageReview } from "./datanestAiTrends.ts";
import { canonicalizeDeclaredLanguage } from "./datanestLanguageMetadata.ts";

export type LanguageReviewEvidence={
  id:string;
  content:string;
  metadata?:Record<string,unknown>|null;
};

export type LanguageReviewSummary={
  required:boolean;
  sourceLanguages:string[];
  reasons:string[];
  evidenceIds:string[];
};

export type ReviewerQualification={
  id:string;
  language_tag:string;
  qualification_scope:"source_language_review"|"semantic_equivalence";
  active:boolean;
};


function canonicalLanguageOrNull(value:unknown):string|null{
  if(typeof value!=="string"||!value.trim())return null;
  try{
    return canonicalizeDeclaredLanguage(value);
  }catch{
    return null;
  }
}

export function summarizeLanguageReviewEvidence(
  events:LanguageReviewEvidence[]
):LanguageReviewSummary{
  const sourceLanguages=new Set<string>();
  const reasons=new Set<string>();
  const evidenceIds:string[]=[];

  for(const event of events){
    const metadata=event.metadata||{};
    const required=requiresLanguageReview(event);
    const sourceLanguage=canonicalLanguageOrNull(metadata.source_language??metadata.language);
    if(sourceLanguage)sourceLanguages.add(sourceLanguage);
    if(!required)continue;

    evidenceIds.push(event.id);
    const declaredReasons=Array.isArray(metadata.language_review_reasons)
      ?metadata.language_review_reasons
      :[];
    for(const reason of declaredReasons){
      if(typeof reason==="string"&&reason.trim())reasons.add(reason.trim().slice(0,160));
    }
    if(metadata.language_review_required===true&&declaredReasons.length===0){
      reasons.add("explicit_language_review_required");
    }
    if(!sourceLanguage&&metadata.language_metadata_status==="declared"){
      reasons.add("invalid_declared_language_metadata");
    }
    if(!declaredReasons.length&&metadata.language_review_required!==true){
      reasons.add("unicode_or_language_signal_requires_review");
    }
  }

  return {
    required:evidenceIds.length>0,
    sourceLanguages:[...sourceLanguages].sort(),
    reasons:[...reasons].sort(),
    evidenceIds
  };
}

export function canonicalizeReviewedLanguages(value:unknown):string[]{
  if(!Array.isArray(value)||value.length===0){
    throw new Error("At least one reviewed BCP 47 language tag is required.");
  }
  const canonical=new Set<string>();
  for(const item of value){
    try{
      canonical.add(canonicalizeDeclaredLanguage(item));
    }catch{
      throw new Error("Every reviewed language must be a valid BCP 47 language tag.");
    }
  }
  return [...canonical].sort();
}

export function reviewedLanguageCoverageSatisfied(
  sourceLanguages:string[],
  reviewedLanguages:string[]
):boolean{
  const reviewedBases=new Set(reviewedLanguages.map(tag=>tag.split("-")[0].toLowerCase()));
  for(const sourceLanguage of sourceLanguages){
    const base=sourceLanguage.split("-")[0].toLowerCase();
    if(base==="und"||base==="mul")continue;
    if(!reviewedBases.has(base))return false;
  }
  return true;
}

export function governedLanguageReviewResult(input:{
  reviewedLanguages:unknown;
  reviewBasis:unknown;
  meaningPreserved:unknown;
  unresolvedAmbiguity:unknown;
}):{
  reviewedLanguages:string[];
  reviewBasis:string;
  meaningPreserved:boolean;
  unresolvedAmbiguity:boolean;
  passed:boolean;
}{
  const reviewedLanguages=canonicalizeReviewedLanguages(input.reviewedLanguages);
  const reviewBasis=typeof input.reviewBasis==="string"?input.reviewBasis.trim():"";
  if(reviewBasis.length<12){
    throw new Error("Language review basis must describe the review evidence or limitations.");
  }
  const meaningPreserved=input.meaningPreserved===true;
  const unresolvedAmbiguity=input.unresolvedAmbiguity===true;
  return {
    reviewedLanguages,
    reviewBasis:reviewBasis.slice(0,2000),
    meaningPreserved,
    unresolvedAmbiguity,
    passed:meaningPreserved&&!unresolvedAmbiguity
  };
}

export function qualificationCoverageForReviewedLanguages(
  qualifications:ReviewerQualification[],
  reviewedLanguages:string[],
  requiredScope?:"source_language_review"|"semantic_equivalence"
):{
  covered:boolean;
  qualificationIds:string[];
  missingLanguages:string[];
}{
  const active=qualifications.filter(item=>
    item.active!==false&&(!requiredScope||item.qualification_scope===requiredScope)
  );
  const byBase=new Map<string,string[]>();
  for(const qualification of active){
    let canonical:string;
    try{
      canonical=canonicalizeDeclaredLanguage(qualification.language_tag);
    }catch{
      continue;
    }
    const base=canonical.split("-")[0].toLowerCase();
    const ids=byBase.get(base)||[];
    ids.push(String(qualification.id));
    byBase.set(base,[...new Set(ids)].sort());
  }

  const missingLanguages:string[]=[];
  const qualificationIds=new Set<string>();
  for(const language of reviewedLanguages){
    const canonical=canonicalizeDeclaredLanguage(language);
    const base=canonical.split("-")[0].toLowerCase();
    const ids=byBase.get(base)||[];
    if(!ids.length){
      missingLanguages.push(canonical);
      continue;
    }
    qualificationIds.add(ids[0]);
  }

  return {
    covered:missingLanguages.length===0,
    qualificationIds:[...qualificationIds].sort(),
    missingLanguages:missingLanguages.sort()
  };
}
