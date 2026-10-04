import { derivationRequiresHumanReview, evidenceIndependenceIdentity, type EvidenceDerivationKind } from "./datanestEvidenceDerivation.ts";

const stopWords=new Set([
  "the","a","an","and","or","to","of","for","in","on","with","is","be","as",
  "this","that","these","those","it","its","from","by","at","into","than","then",
  "must","should","could","would","can","may","before","after","please","keep"
]);

const tokenAliases:Record<string,string>={
  automatic:"auto",
  automatically:"auto",
  automated:"auto",
  requires:"require",
  required:"require",
  requiring:"require",
  permissions:"permission",
  identifiers:"id",
  identifier:"id",
  ids:"id"
};

const negationWords=new Set([
  "no","not","never","avoid","without","disable","disabled","disallow","forbid",
  "forbidden","prohibit","prohibited","dont","don't","cannot","cant","can't"
]);

export type LearningEvidence={
  id:string;
  content:string;
  sessionId?:string|null;
  jobId?:string|null;
  sourceType?:string|null;
  sourceUserId?:string|null;
  independenceKey?:string|null;
  derivationFamilyId?:string|null;
  derivationKind?:EvidenceDerivationKind|null;
  metadata?:Record<string,unknown>|null;
};

function canonicalToken(token:string):string{
  return tokenAliases[token]||token;
}

export function normalizeTrendTokens(value:string):string[] {
  // Normalize only the derived search representation; retain original evidence.
  const scrubbed=value.normalize("NFC").toLowerCase().normalize("NFC")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi," ")
    .replace(/\b[0-9a-f]{16,}\b/gi," ")
    .replace(/\b\d{6,}\b/g," ")
    .replace(/[^\p{L}\p{M}\p{N}'\s]+/gu," ");

  return [...new Set(
    scrubbed
      .split(/\s+/)
      .map(token=>token.replace(/^'+|'+$/g,""))
      .filter(token=>/[\p{L}\p{N}]/u.test(token))
      .filter(token=>Array.from(token).length>2||/[^\x00-\x7f]/.test(token))
      .map(canonicalToken)
      .filter(token=>!stopWords.has(token))
  )].sort();
}

/** Conservative review signal, not language detection or a trust score. */
export function requiresLanguageReview(event:LearningEvidence):boolean{
  const metadata=event.metadata||{};
  if(metadata.language_review_required===true)return true;
  for(const key of ["source_language","language"]){
    if(metadata[key]===undefined)continue;
    if(typeof metadata[key]!=="string"||!metadata[key].trim())return true;
    try{
      const language=Intl.getCanonicalLocales(metadata[key].trim())[0];
      if(!/^en(?:-|$)/i.test(language))return true;
    }catch{
      return true;
    }
  }
  // Existing risk/negation rules have only been tested for English. An English
  // tag cannot bypass review of non-ASCII letters, marks or numbers.
  return Array.from(event.content).some(character=>
    character.codePointAt(0)!>127&&/[\p{L}\p{M}\p{N}]/u.test(character)
  );
}

export function evidenceSimilarity(a:string[],b:string[]):number {
  const left=new Set(a);
  const right=new Set(b);
  const intersection=[...left].filter(token=>right.has(token)).length;
  const union=new Set([...left,...right]).size;
  return union===0?0:intersection/union;
}

export function trendKeyForTokens(tokens:string[]):string {
  return [...new Set(tokens)].sort().join("|").slice(0,512);
}

export function isSyntheticLearningEvidence(event:LearningEvidence):boolean {
  const text=event.content.trim();
  const metadata=event.metadata||{};
  if(
    metadata.test_fixture ||
    metadata.synthetic===true ||
    metadata.synthetic_fixture===true
  )return true;

  return (
    /^stress-\d{10,}-[a-f0-9]{6,}-message-\d+$/i.test(text) ||
    /^backend-acceptance-[0-9a-f-]{16,}(?:-|$)/i.test(text)
  );
}

export function isUsefulLearningEvidence(event:LearningEvidence):boolean {
  if(isSyntheticLearningEvidence(event))return false;
  const text=event.content.trim();
  if(text.length<12||text.length>6000)return false;
  return normalizeTrendTokens(text).length>=3;
}

function evidenceIdentity(event:LearningEvidence):string{
  return evidenceIndependenceIdentity(event);
}

function scalarSignatures(value:string):string[]{
  const normalized=value.toLowerCase().replace(/,/g,"");
  const matches=normalized.matchAll(/\b(-?\d+(?:\.\d+)?)\s*(%|ms|s|sec|secs|seconds?|min|mins|minutes?|day|days|h|hr|hrs|hours?|kb|mb|gb|tb|mg|g|kg|ml|l|zar|usd|eur|r)\b/g);
  return [...new Set([...matches].map(match=>{
    const number=Number(match[1]);
    const unit=String(match[2]||"").toLowerCase();
    return Number.isFinite(number)?number+"|"+unit:"";
  }).filter(Boolean))].sort();
}

function hasScalarConflict(events:LearningEvidence[]):boolean{
  const signatures=events
    .map(event=>scalarSignatures(event.content))
    .filter(values=>values.length);
  if(signatures.length<2)return false;
  return new Set(signatures.map(values=>values.join(","))).size>1;
}

function negationPolarity(value:string):boolean{
  const tokens=value.toLowerCase()
    .replace(/[^a-z0-9' ]+/g," ")
    .split(/\s+/)
    .filter(Boolean);
  if(/\bdo\s+not\b/i.test(value))return true;
  return tokens.some(token=>negationWords.has(token));
}

function representativeEvidence(events:LearningEvidence[]):LearningEvidence{
  const scored=events.map(event=>{
    const tokens=normalizeTrendTokens(event.content);
    const peers=events.filter(peer=>peer.id!==event.id);
    const mean=peers.length
      ?peers.reduce((sum,peer)=>sum+evidenceSimilarity(tokens,normalizeTrendTokens(peer.content)),0)/peers.length
      :1;
    return {event,mean,length:event.content.trim().length};
  });
  scored.sort((a,b)=>b.mean-a.mean||a.length-b.length||a.event.id.localeCompare(b.event.id));
  return scored[0].event;
}

function sharedTrendTokens(events:LearningEvidence[]):string[]{
  const counts=new Map<string,number>();
  for(const event of events){
    for(const token of normalizeTrendTokens(event.content)){
      counts.set(token,(counts.get(token)||0)+1);
    }
  }
  const threshold=Math.max(2,Math.ceil(events.length*0.6));
  return [...counts.entries()]
    .filter(([,count])=>count>=threshold)
    .map(([token])=>token)
    .sort();
}

function candidateConfidence(events:LearningEvidence[],representative:LearningEvidence,hasConflict:boolean):number{
  const baseTokens=normalizeTrendTokens(representative.content);
  const meanSimilarity=events.reduce(
    (sum,event)=>sum+evidenceSimilarity(baseTokens,normalizeTrendTokens(event.content)),
    0
  )/Math.max(1,events.length);
  const evidenceFactor=Math.min(1,events.length/5);
  const independence=Math.min(1,new Set(events.map(evidenceIdentity)).size/3);
  const raw=(meanSimilarity*0.55)+(evidenceFactor*0.25)+(independence*0.20);
  const adjusted=hasConflict?raw*0.45:raw;
  return Math.max(0,Math.min(1,Number(adjusted.toFixed(4))));
}

export function classifyLearningRisk(value:string):{
  category:string;
  riskClass:"low"|"normal"|"high";
} {
  const text=value.toLowerCase();
  if(/\b(auth|authentication|authorization|rls|permission|permissions|role|roles)\b/.test(text)){
    return {category:"authorization",riskClass:"high"};
  }
  if(/\b(security|secret|secrets|credential|credentials|encryption)\b/.test(text)){
    return {category:"security",riskClass:"high"};
  }
  if(/\b(architecture|schema|migration|migrations)\b/.test(text)){
    return {category:"architecture",riskClass:"high"};
  }
  if(/\b(delete|destroy|drop|purge)\b/.test(text)){
    return {category:"destructive",riskClass:"high"};
  }
  if(/\b(policy|policies|governance|production)\b/.test(text)){
    return {category:"governance",riskClass:"high"};
  }
  return {category:"workflow",riskClass:"low"};
}

export function candidateFromRepeatedEvidence(
  events:LearningEvidence[]
):{
  normalizedKnowledge:string;
  category:string;
  riskClass:"low"|"normal"|"high";
  lifecycleState:"INTAKE";
  evidenceIds:string[];
  trendKey:string;
  confidence:number;
  hasConflict:boolean;
  independentEvidenceCount:number;
  languageReviewRequired:boolean;
  derivationReviewRequired:boolean;
}|null {
  if(events.length<2)return null;
  const anchor=events[0];
  if(!isUsefulLearningEvidence(anchor))return null;

  const anchorTokens=normalizeTrendTokens(anchor.content);
  const eligible=events.filter(isUsefulLearningEvidence);
  const similar=eligible.filter(event=>
    evidenceSimilarity(anchorTokens,normalizeTrendTokens(event.content))>=0.5
  );
  if(similar.length<2)return null;

  const representative=representativeEvidence(similar);
  const shared=sharedTrendTokens(similar);
  const trendTokens=shared.length>=2?shared:normalizeTrendTokens(representative.content);
  if(trendTokens.length<2)return null;

  const polarities=new Set(similar.map(event=>negationPolarity(event.content)));
  const explicitConflict=similar.some(event=>
    event.metadata?.certified_memory_conflict===true||
    event.metadata?.scalar_conflict===true||
    event.metadata?.explicit_conflict===true
  );
  const hasConflict=polarities.size>1||hasScalarConflict(similar)||explicitConflict;
  const risk=classifyLearningRisk(similar.map(item=>item.content).join(" "));
  const languageReviewRequired=similar.some(requiresLanguageReview);
  const derivationReviewRequired=similar.some(derivationRequiresHumanReview);
  const normalizedKnowledge=representative.content.trim().replace(/\s+/g," ");
  const independentEvidenceCount=new Set(similar.map(evidenceIdentity)).size;

  return {
    normalizedKnowledge,
    category:risk.category,
    riskClass:languageReviewRequired||derivationReviewRequired?"high":risk.riskClass,
    lifecycleState:"INTAKE",
    evidenceIds:similar.map(item=>item.id),
    trendKey:trendKeyForTokens(trendTokens),
    confidence:candidateConfidence(similar,representative,hasConflict),
    hasConflict,
    independentEvidenceCount,
    languageReviewRequired,
    derivationReviewRequired
  };
}


export type CertifiedMemoryRelationKind="none"|"related"|"duplicates"|"contradicts";

export function classifyCertifiedMemoryRelation(
  candidate:string,
  existing:string
):{
  relation:CertifiedMemoryRelationKind;
  similarity:number;
  polarityConflict:boolean;
  scalarConflict:boolean;
}{
  const candidateTokens=normalizeTrendTokens(candidate);
  const existingTokens=normalizeTrendTokens(existing);
  const similarity=evidenceSimilarity(candidateTokens,existingTokens);
  const polarityConflict=negationPolarity(candidate)!==negationPolarity(existing);
  const scalarConflict=hasScalarConflict([
    {id:"candidate",content:candidate},
    {id:"existing",content:existing}
  ]);

  if(similarity<0.5){
    return {relation:"none",similarity,polarityConflict,scalarConflict};
  }
  if(similarity>=0.55&&(polarityConflict||scalarConflict)){
    return {relation:"contradicts",similarity,polarityConflict,scalarConflict};
  }
  if(similarity>=0.9&&!polarityConflict&&!scalarConflict){
    const uncertainLanguage=[candidate,existing].some(content=>
      requiresLanguageReview({id:"relation",content})
    );
    if(uncertainLanguage&&candidate.normalize("NFC")!==existing.normalize("NFC")){
      return {relation:"related",similarity,polarityConflict,scalarConflict};
    }
    return {relation:"duplicates",similarity,polarityConflict,scalarConflict};
  }
  return {relation:"related",similarity,polarityConflict,scalarConflict};
}

export function bestCandidateByEvidenceOverlap(
  links:Array<{candidateId:string;eventId:string}>,
  evidenceIds:string[],
  minimumOverlap=Math.max(2,Math.ceil(evidenceIds.length*0.5))
):string|null {
  const evidence=new Set(evidenceIds);
  const counts=new Map<string,number>();
  for(const link of links){
    if(!evidence.has(link.eventId))continue;
    counts.set(link.candidateId,(counts.get(link.candidateId)||0)+1);
  }
  const ranked=[...counts.entries()]
    .filter(([,count])=>count>=minimumOverlap)
    .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  return ranked[0]?.[0]||null;
}

export function stableCandidateIdFromHash(sha256Digest:string):string {
  const digest=sha256Digest.toLowerCase();
  if(!/^[0-9a-f]{64}$/.test(digest)){
    throw new Error("Stable candidate ids require a SHA-256 digest.");
  }
  const hex=digest.slice(0,32).split("");
  hex[12]="5";
  hex[16]=((Number.parseInt(hex[16],16)&0x3)|0x8).toString(16);
  const value=hex.join("");
  return [
    value.slice(0,8),
    value.slice(8,12),
    value.slice(12,16),
    value.slice(16,20),
    value.slice(20,32)
  ].join("-");
}
