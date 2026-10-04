"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";

type Candidate={
  id:string;
  normalized_knowledge:string;
  category:string;
  risk_class:"low"|"normal"|"high";
  lifecycle_state:string;
  evidence_count:number;
  has_conflict:boolean;
  confidence:number|null;
  required_authority:"automation"|"admin"|"owner";
  language_review:{
    required:boolean;
    sourceLanguages:string[];
    reasons:string[];
    evidenceIds:string[];
  };
  derivation_review:{
    required:boolean;
    blocked:boolean;
    reviewHash:string;
    items:DerivationReviewItem[];
  };
  updated_at:string;
};

type DerivationReviewItem={
  id:string;
  childEventId:string;
  parentEventId:string;
  rootEventId:string;
  derivationKind:string;
  transformationVersion:string;
  sourceLanguage:string|null;
  targetLanguage:string|null;
  status:"unreviewed"|"reviewed_equivalent"|"reviewed_changed"|"stale_review";
  reviewId:string|null;
  reviewBasis:string|null;
  reviewedBy:string|null;
  reviewedAt:string|null;
  qualificationIds:string[];
};

type ValidationRun={
  id:string;
  candidate_id:string;
  gate:"AUDIT"|"VERIFY"|"VALIDATE"|"STRESS_TEST"|"LANGUAGE_REVIEW";
  passed:boolean;
  created_at:string;
};

type MemoryReviewItem={
  id:string;
  normalized_knowledge:string;
  category:string;
  effective_version:number;
  certification_class:string;
  confidence:number|null;
  review_after:string;
  last_verified_at:string|null;
  promoted_at:string;
};

type MemoryOutcomeItem={
  id:string;
  memory_id:string;
  usage_receipt_id:string;
  signal:"supported"|"neutral"|"challenged"|"contradicted"|"unknown";
  outcome_kind:string;
  summary:string;
  review_triggered:boolean;
  recorder_role:"owner"|"admin";
  created_at:string;
};

type MemoryConsolidationMemory={
  id:string;
  normalized_knowledge:string;
  category:string;
  effective_version:number;
  certification_class:string;
  confidence:number|null;
  content_hash:string;
  promoted_at:string;
};

type MemoryConsolidationSuggestion={
  id:string;
  first:MemoryConsolidationMemory;
  second:MemoryConsolidationMemory;
  similarity:number;
  polarityConflict:boolean;
  scalarConflict:boolean;
  classifier:string;
};

type MemoryConsolidationMember={
  consolidation_id:string;
  memory_id:string;
  member_role:"canonical"|"equivalent";
  normalized_knowledge_snapshot:string;
  content_hash_snapshot:string;
  category_snapshot:string;
  effective_version_snapshot:number;
  active_snapshot:boolean;
};

type MemoryConsolidationProposal={
  id:string;
  canonical_memory_id:string;
  status:"proposed"|"executed"|"rejected";
  reason:string;
  proposer_role:"owner"|"admin";
  decision_reason:string|null;
  proposed_at:string;
  decided_at:string|null;
  executed_at:string|null;
  members:MemoryConsolidationMember[];
};

type LanguageReviewerQualification={
  id:string;
  project_id:string;
  user_id:string;
  language_tag:string;
  qualification_scope:"source_language_review"|"semantic_equivalence";
  evidence:Record<string,unknown>;
  active:boolean;
  verified_by:string;
  verified_at:string;
};

type WorkspaceResponse={
  role:"owner"|"admin";
  currentUserId:string;
  candidates:Candidate[];
  validationRuns:ValidationRun[];
  languageReviewerQualifications:LanguageReviewerQualification[];
  memoryReviewItems:MemoryReviewItem[];
  memoryOutcomeItems:MemoryOutcomeItem[];
  memoryConsolidationSuggestions:MemoryConsolidationSuggestion[];
  memoryConsolidationProposals:MemoryConsolidationProposal[];
};

type Props={
  projectId:string;
  role:"owner"|"admin"|"operator"|"viewer";
  onChanged:()=>Promise<void>;
  setNotice:(value:string)=>void;
  setError:(value:string)=>void;
};

const baseGateOrder=["AUDIT","VERIFY","VALIDATE","STRESS_TEST"] as const;
const languageGateOrder=["AUDIT","VERIFY","LANGUAGE_REVIEW","VALIDATE","STRESS_TEST"] as const;

type LanguageReviewDraft={
  languages:string;
  basis:string;
  meaningPreserved:boolean;
  noUnresolvedAmbiguity:boolean;
};

function candidateGateOrder(candidate:Candidate){
  return candidate.language_review?.required?languageGateOrder:baseGateOrder;
}

function formatDate(value:string){
  return new Intl.DateTimeFormat(undefined,{
    month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"
  }).format(new Date(value));
}

function normalizeWorkspaceResponse(data:unknown,fallbackRole:"owner"|"admin"):WorkspaceResponse{
  const record=data&&typeof data==="object"&&!Array.isArray(data)
    ?data as Record<string,unknown>
    :{};
  const responseRole=record.role==="owner"||record.role==="admin"
    ?record.role
    :fallbackRole;
  return {
    role:responseRole,
    currentUserId:typeof record.currentUserId==="string"?record.currentUserId:"",
    candidates:Array.isArray(record.candidates)?record.candidates as Candidate[]:[],
    validationRuns:Array.isArray(record.validationRuns)?record.validationRuns as ValidationRun[]:[],
    languageReviewerQualifications:Array.isArray(record.languageReviewerQualifications)
      ?record.languageReviewerQualifications as LanguageReviewerQualification[]
      :[],
    memoryReviewItems:Array.isArray(record.memoryReviewItems)?record.memoryReviewItems as MemoryReviewItem[]:[],
    memoryOutcomeItems:Array.isArray(record.memoryOutcomeItems)?record.memoryOutcomeItems as MemoryOutcomeItem[]:[],
    memoryConsolidationSuggestions:Array.isArray(record.memoryConsolidationSuggestions)
      ?record.memoryConsolidationSuggestions as MemoryConsolidationSuggestion[]
      :[],
    memoryConsolidationProposals:Array.isArray(record.memoryConsolidationProposals)
      ?record.memoryConsolidationProposals as MemoryConsolidationProposal[]
      :[]
  };
}

export default function DataNestAiCertificationPanel({
  projectId,role,onChanged,setNotice,setError
}:Props){
  const [workspace,setWorkspace]=useState<WorkspaceResponse|null>(null);
  const [busyId,setBusyId]=useState("");
  const [busyMemoryId,setBusyMemoryId]=useState("");
  const [busyQualificationId,setBusyQualificationId]=useState("");
  const [busyDerivationId,setBusyDerivationId]=useState("");
  const [derivationReviewDrafts,setDerivationReviewDrafts]=useState<Record<string,string>>({});
  const [qualificationLanguage,setQualificationLanguage]=useState("");
  const [qualificationScope,setQualificationScope]=useState<"source_language_review"|"semantic_equivalence">("source_language_review");
  const [qualificationBasis,setQualificationBasis]=useState("");
  const [busyConsolidationId,setBusyConsolidationId]=useState("");
  const [languageReviewDrafts,setLanguageReviewDrafts]=useState<Record<string,LanguageReviewDraft>>({});

  const canReview=role==="owner"||role==="admin";

  const load=useCallback(async()=>{
    if(!canReview){setWorkspace(null);return;}
    const supabase=getSupabase();
    if(!supabase)return;
    const {data,error}=await supabase.functions.invoke("datanest-ai-certification",{
      body:{action:"workspace",projectId}
    });
    if(error){setError(error.message);return;}
    const fallbackRole:"owner"|"admin"=role==="owner"?"owner":"admin";
    setWorkspace(normalizeWorkspaceResponse(data,fallbackRole));
  },[canReview,projectId,role,setError]);

  useEffect(()=>{void load()},[load]);

  const runsByCandidate=useMemo(()=>{
    const map=new Map<string,Map<string,boolean>>();
    for(const run of workspace?.validationRuns||[]){
      if(!map.has(run.candidate_id))map.set(run.candidate_id,new Map());
      const candidateRuns=map.get(run.candidate_id)!;
      if(!candidateRuns.has(run.gate))candidateRuns.set(run.gate,run.passed);
    }
    return map;
  },[workspace]);

  async function invoke(action:string,candidate:Candidate,extra:Record<string,unknown>={}){
    const supabase=getSupabase();
    if(!supabase)return;
    setBusyId(candidate.id);
    setError("");
    try{
      const {error}=await supabase.functions.invoke("datanest-ai-certification",{
        body:{action,projectId,candidateId:candidate.id,...extra}
      });
      if(error)throw error;
      setNotice(
        action==="promote"
          ?"Certified DataNest AI memory promoted to project-wide context."
          :action==="certify"
            ?"Learning candidate certified."
            :extra.gate==="LANGUAGE_REVIEW"
              ?"Governed language review recorded."
              :"Certification evidence recorded."
      );
      await load();
      await onChanged();
    }catch(actionError){
      setError(actionError instanceof Error?actionError.message:"Certification action failed.");
    }finally{
      setBusyId("");
    }
  }

  function languageReviewDraft(candidate:Candidate):LanguageReviewDraft{
    return languageReviewDrafts[candidate.id]||{
      languages:(candidate.language_review?.sourceLanguages||[]).join(", "),
      basis:"",
      meaningPreserved:false,
      noUnresolvedAmbiguity:false
    };
  }

  function updateLanguageReviewDraft(candidate:Candidate,patch:Partial<LanguageReviewDraft>){
    setLanguageReviewDrafts(current=>{
      const base=current[candidate.id]||{
        languages:(candidate.language_review?.sourceLanguages||[]).join(", "),
        basis:"",
        meaningPreserved:false,
        noUnresolvedAmbiguity:false
      };
      return {...current,[candidate.id]:{...base,...patch}};
    });
  }

  async function registerLanguageQualification(){
    const supabase=getSupabase();
    if(!supabase||role!=="owner")return;
    setBusyQualificationId("new");
    setError("");
    try{
      const {error}=await supabase.functions.invoke("datanest-ai-certification",{
        body:{
          action:"register_language_reviewer",
          projectId,
          reviewerUserId:workspace?.currentUserId,
          languageTag:qualificationLanguage.trim(),
          qualificationScope,
          evidence:{
            basis:qualificationBasis.trim(),
            source:"DataNest AI certification console"
          }
        }
      });
      if(error)throw error;
      setNotice("Language reviewer qualification registered.");
      setQualificationLanguage("");
      setQualificationBasis("");
      await load();
    }catch(actionError){
      setError(actionError instanceof Error?actionError.message:"Unable to register language reviewer qualification.");
    }finally{
      setBusyQualificationId("");
    }
  }

  async function revokeLanguageQualification(qualification:LanguageReviewerQualification){
    const supabase=getSupabase();
    if(!supabase||role!=="owner")return;
    setBusyQualificationId(qualification.id);
    setError("");
    try{
      const {error}=await supabase.functions.invoke("datanest-ai-certification",{
        body:{
          action:"revoke_language_reviewer",
          projectId,
          qualificationId:qualification.id
        }
      });
      if(error)throw error;
      setNotice("Language reviewer qualification revoked.");
      await load();
    }catch(actionError){
      setError(actionError instanceof Error?actionError.message:"Unable to revoke language reviewer qualification.");
    }finally{
      setBusyQualificationId("");
    }
  }

  async function reviewEvidenceDerivation(
    derivation:DerivationReviewItem,
    decision:"equivalent"|"changed"
  ){
    const supabase=getSupabase();
    if(!supabase)return;
    const reviewBasis=(derivationReviewDrafts[derivation.id]||"").trim();
    setBusyDerivationId(derivation.id);
    setError("");
    try{
      const {error}=await supabase.functions.invoke("datanest-ai-certification",{
        body:{
          action:"review_evidence_derivation",
          projectId,
          derivationId:derivation.id,
          decision,
          reviewBasis
        }
      });
      if(error)throw error;
      setNotice(
        decision==="equivalent"
          ?"Qualified semantic-equivalence review recorded. The evidence remains in its original source family."
          :"Material semantic change recorded. The derived evidence remains blocked from certification as equivalent support."
      );
      setDerivationReviewDrafts(current=>({...current,[derivation.id]:""}));
      await load();
      await onChanged();
    }catch(actionError){
      setError(actionError instanceof Error?actionError.message:"Semantic-equivalence review failed.");
    }finally{
      setBusyDerivationId("");
    }
  }

  async function recordLanguageReview(candidate:Candidate){
    const draft=languageReviewDraft(candidate);
    const reviewedLanguages=draft.languages
      .split(",")
      .map(value=>value.trim())
      .filter(Boolean);
    await invoke("record_validation",candidate,{
      gate:"LANGUAGE_REVIEW",
      suiteVersion:"datanest-language-review-v1",
      reviewedLanguages,
      reviewBasis:draft.basis,
      meaningPreserved:draft.meaningPreserved,
      unresolvedAmbiguity:!draft.noUnresolvedAmbiguity,
      results:{source:"DataNest AI certification console"}
    });
  }

  async function reviewMemory(memory:MemoryReviewItem,decision:"reaffirmed"|"retired"){
    const supabase=getSupabase();
    if(!supabase)return;
    setBusyMemoryId(memory.id);
    setError("");
    try{
      const {error}=await supabase.functions.invoke("datanest-ai-certification",{
        body:{
          action:"review_memory",
          projectId,
          memoryId:memory.id,
          decision,
          reason:decision==="reaffirmed"
            ?"Human review reaffirmed active Certified Memory under the governed review lifecycle."
            :"Owner retired Certified Memory after governed review."
        }
      });
      if(error)throw error;
      setNotice(
        decision==="reaffirmed"
          ?"Verified Memory reaffirmed and its review schedule refreshed."
          :"Verified Memory retired from active project context."
      );
      await load();
      await onChanged();
    }catch(actionError){
      setError(actionError instanceof Error?actionError.message:"Verified Memory review failed.");
    }finally{
      setBusyMemoryId("");
    }
  }

  async function proposeMemoryConsolidation(
    suggestion:MemoryConsolidationSuggestion,
    canonicalMemoryId:string
  ){
    const supabase=getSupabase();
    if(!supabase)return;
    setBusyConsolidationId(suggestion.id);
    setError("");
    try{
      const {error}=await supabase.functions.invoke("datanest-ai-certification",{
        body:{
          action:"propose_memory_consolidation",
          projectId,
          canonicalMemoryId,
          memoryIds:[suggestion.first.id,suggestion.second.id],
          reason:"Human-selected canonical candidate for governed consolidation of equivalent Certified Memory."
        }
      });
      if(error)throw error;
      setNotice("Canonical memory consolidation proposal recorded for governed owner decision.");
      await load();
      await onChanged();
    }catch(actionError){
      setError(actionError instanceof Error?actionError.message:"Canonical memory consolidation proposal failed.");
    }finally{
      setBusyConsolidationId("");
    }
  }

  async function decideMemoryConsolidation(
    proposal:MemoryConsolidationProposal,
    decision:"execute"|"reject"
  ){
    const supabase=getSupabase();
    if(!supabase)return;
    setBusyConsolidationId(proposal.id);
    setError("");
    try{
      const {error}=await supabase.functions.invoke("datanest-ai-certification",{
        body:{
          action:"decide_memory_consolidation",
          projectId,
          consolidationId:proposal.id,
          decision,
          reason:decision==="execute"
            ?"Owner authorized canonical consolidation after reviewing equivalent Certified Memory and preserved lineage."
            :"Owner rejected canonical consolidation after review."
        }
      });
      if(error)throw error;
      setNotice(
        decision==="execute"
          ?"Canonical consolidation executed. Historical source memories remain traceable."
          :"Canonical consolidation proposal rejected."
      );
      await load();
      await onChanged();
    }catch(actionError){
      setError(actionError instanceof Error?actionError.message:"Canonical memory consolidation decision failed.");
    }finally{
      setBusyConsolidationId("");
    }
  }

  if(!canReview){
    return <section className="panel datanestAiCertificationPanel">
      <div className="panelHead">
        <div>
          <p className="eyebrow">LEARNING & CERTIFICATION</p>
          <h3>Governed promotion</h3>
        </div>
      </div>
      <p className="muted">
        Owner or Admin access is required to review learning candidates. Your current role can use certified memory but cannot certify it.
      </p>
    </section>;
  }

  return <section className="panel datanestAiCertificationPanel">
    <div className="panelHead">
      <div>
        <p className="eyebrow">LEARNING & CERTIFICATION</p>
        <h3>Audit → verify → source-family and language review when required → validate → stress-test → certify</h3>
      </div>
      <button className="textButton" type="button" onClick={()=>void load()}>Refresh</button>
    </div>

    <div className="rowBetween">
      <div>
        <h4>Language reviewer qualifications</h4>
        <p className="muted">
          LANGUAGE REVIEW can pass only when the reviewer has active registry coverage for every reviewed language. Registry entries are project governance evidence, not external accreditation.
        </p>
      </div>
      <span className="countPill">{workspace?.languageReviewerQualifications.length||0}</span>
    </div>
    {(workspace?.languageReviewerQualifications.length||0)>0&&<div className="manifestList">
      {(workspace?.languageReviewerQualifications||[]).map(qualification=><article className="manifestCard" key={qualification.id}>
        <div className="rowBetween">
          <div>
            <b>{qualification.language_tag}</b>
            <small>{qualification.qualification_scope.replaceAll("_"," ")}</small>
          </div>
          <span className="badge good">ACTIVE</span>
        </div>
        <p>{String(qualification.evidence?.basis||"Qualification evidence recorded.")}</p>
        <div className="manifestMeta">
          <span>{"reviewer "+qualification.user_id.slice(0,8)}</span>
          <span>{"verified "+formatDate(qualification.verified_at)}</span>
        </div>
        {role==="owner"&&<div className="rowActions">
          <button
            className="secondaryButton compact"
            type="button"
            disabled={busyQualificationId===qualification.id}
            onClick={()=>void revokeLanguageQualification(qualification)}
          >Revoke qualification</button>
        </div>}
      </article>)}
    </div>}
    {role==="owner"&&<div className="plannerForm">
      <div>
        <b>Register my reviewer qualification</b>
        <p className="muted">
          Record the language scope and evidence basis. This authorizes governed project review only; it does not assert professional accreditation.
        </p>
      </div>
      <label>
        BCP 47 language
        <input
          value={qualificationLanguage}
          placeholder="e.g. af or zu-ZA"
          onChange={event=>setQualificationLanguage(event.target.value)}
        />
      </label>
      <label>
        Qualification scope
        <select
          value={qualificationScope}
          onChange={event=>setQualificationScope(event.target.value as "source_language_review"|"semantic_equivalence")}
        >
          <option value="source_language_review">Source language review</option>
          <option value="semantic_equivalence">Semantic equivalence</option>
        </select>
      </label>
      <label>
        Qualification evidence basis
        <textarea
          rows={3}
          value={qualificationBasis}
          placeholder="Describe relevant fluency, domain experience, assessment, or other review evidence and limitations."
          onChange={event=>setQualificationBasis(event.target.value)}
        />
      </label>
      <button
        className="secondaryButton compact"
        type="button"
        disabled={
          busyQualificationId==="new"||
          !qualificationLanguage.trim()||
          qualificationBasis.trim().length<12||
          !workspace?.currentUserId
        }
        onClick={()=>void registerLanguageQualification()}
      >Register qualification</button>
    </div>}

    {(workspace?.memoryConsolidationSuggestions.length||0)>0&&<>
      <div className="rowBetween">
        <div>
          <h4>Equivalent Verified Memory</h4>
          <p className="muted">
            Similarity creates a review suggestion only. Choose which already-certified memory should remain canonical; DataNest does not synthesize new truth during consolidation.
          </p>
        </div>
        <span className="countPill">{workspace?.memoryConsolidationSuggestions.length||0}</span>
      </div>
      <div className="manifestList">
        {(workspace?.memoryConsolidationSuggestions||[]).map(suggestion=><article className="manifestCard" key={suggestion.id}>
          <div className="rowBetween">
            <div>
              <b>{suggestion.first.category.replaceAll("_"," ")}</b>
              <small>{"equivalence hint · "+Math.round(suggestion.similarity*100)+"% lexical similarity"}</small>
            </div>
            <span className="badge warn">HUMAN CANONICAL CHOICE REQUIRED</span>
          </div>
          <div className="plannerForm">
            <div>
              <b>{"First · memory v"+suggestion.first.effective_version}</b>
              <p>{suggestion.first.normalized_knowledge}</p>
              <div className="manifestMeta">
                <span>{suggestion.first.certification_class}</span>
                <span>{suggestion.first.confidence==null?"confidence —":"confidence "+Math.round(suggestion.first.confidence*100)+"%"}</span>
              </div>
            </div>
            <div>
              <b>{"Second · memory v"+suggestion.second.effective_version}</b>
              <p>{suggestion.second.normalized_knowledge}</p>
              <div className="manifestMeta">
                <span>{suggestion.second.certification_class}</span>
                <span>{suggestion.second.confidence==null?"confidence —":"confidence "+Math.round(suggestion.second.confidence*100)+"%"}</span>
              </div>
            </div>
          </div>
          <div className="rowActions">
            <button
              className="secondaryButton compact"
              type="button"
              disabled={busyConsolidationId===suggestion.id}
              onClick={()=>void proposeMemoryConsolidation(suggestion,suggestion.first.id)}
            >Keep first as canonical</button>
            <button
              className="secondaryButton compact"
              type="button"
              disabled={busyConsolidationId===suggestion.id}
              onClick={()=>void proposeMemoryConsolidation(suggestion,suggestion.second.id)}
            >Keep second as canonical</button>
          </div>
        </article>)}
      </div>
    </>}

    {(workspace?.memoryConsolidationProposals.length||0)>0&&<>
      <div className="rowBetween">
        <div>
          <h4>Canonical consolidation proposals</h4>
          <p className="muted">
            Proposals preserve every source record. Only the Owner can execute consolidation; the selected canonical record must already be Certified Memory.
          </p>
        </div>
        <span className="countPill">{workspace?.memoryConsolidationProposals.length||0}</span>
      </div>
      <div className="manifestList">
        {(workspace?.memoryConsolidationProposals||[]).map(proposal=>{
          const canonical=proposal.members.find(member=>member.member_role==="canonical");
          const equivalents=proposal.members.filter(member=>member.member_role==="equivalent");
          return <article className="manifestCard" key={proposal.id}>
            <div className="rowBetween">
              <div>
                <b>{canonical?.category_snapshot.replaceAll("_"," ")||"Certified Memory"}</b>
                <small>{proposal.status.toUpperCase()+" · proposed "+formatDate(proposal.proposed_at)}</small>
              </div>
              <span className={"badge "+(proposal.status==="executed"?"good":proposal.status==="rejected"?"bad":"warn")}>
                {proposal.status.toUpperCase()}
              </span>
            </div>
            <p><b>Canonical:</b>{" "+(canonical?.normalized_knowledge_snapshot||proposal.canonical_memory_id)}</p>
            {equivalents.map(member=><p key={member.memory_id}>
              <b>Equivalent source:</b>{" "+member.normalized_knowledge_snapshot}
            </p>)}
            <div className="manifestMeta">
              <span>{"proposed by "+proposal.proposer_role}</span>
              <span>{equivalents.length+" historical source"+(equivalents.length===1?"":"s")+" preserved"}</span>
              {proposal.decision_reason&&<span>{proposal.decision_reason}</span>}
            </div>
            {proposal.status==="proposed"&&role==="owner"&&<div className="rowActions">
              <button
                className="primaryButton compact"
                type="button"
                disabled={busyConsolidationId===proposal.id}
                onClick={()=>void decideMemoryConsolidation(proposal,"execute")}
              >Execute canonical consolidation</button>
              <button
                className="secondaryButton compact"
                type="button"
                disabled={busyConsolidationId===proposal.id}
                onClick={()=>void decideMemoryConsolidation(proposal,"reject")}
              >Reject proposal</button>
            </div>}
            {proposal.status==="proposed"&&role!=="owner"&&<p className="muted">
              Awaiting Owner authorization. Admin proposal authority does not include execution authority.
            </p>}
          </article>;
        })}
      </div>
    </>}

    {(workspace?.memoryReviewItems.length||0)>0&&<>
      <div className="rowBetween">
        <div>
          <h4>Verified Memory review queue</h4>
          <p className="muted">Review-due memory stays historically certified, but receives a lower retrieval weight until it is reaffirmed or retired.</p>
        </div>
        <span className="countPill">{workspace?.memoryReviewItems.length||0}</span>
      </div>
      <div className="manifestList">
        {(workspace?.memoryReviewItems||[]).map(memory=><article className="manifestCard" key={memory.id}>
          <div className="rowBetween">
            <div>
              <b>{memory.category.replaceAll("_"," ")}</b>
              <small>{"Memory v"+memory.effective_version+" · review due "+formatDate(memory.review_after)}</small>
            </div>
            <span className="badge warn">CERTIFIED · REVIEW DUE</span>
          </div>
          <p>{memory.normalized_knowledge}</p>
          <div className="manifestMeta">
            <span>{memory.certification_class}</span>
            <span>{memory.confidence==null?"confidence —":"confidence "+Math.round(memory.confidence*100)+"%"}</span>
            <span>{memory.last_verified_at?"last reviewed "+formatDate(memory.last_verified_at):"initial certification "+formatDate(memory.promoted_at)}</span>
          </div>
          <div className="rowActions">
            <button
              className="primaryButton compact"
              type="button"
              disabled={busyMemoryId===memory.id}
              onClick={()=>void reviewMemory(memory,"reaffirmed")}
            >Reaffirm reviewed memory</button>
            {role==="owner"&&<button
              className="secondaryButton compact"
              type="button"
              disabled={busyMemoryId===memory.id}
              onClick={()=>void reviewMemory(memory,"retired")}
            >Retire from active memory</button>}
          </div>
        </article>)}
      </div>
    </>}

    {(workspace?.memoryOutcomeItems.length||0)>0&&<>
      <div className="rowBetween">
        <div>
          <h4>Verified Memory outcome evidence</h4>
          <p className="muted">Outcome signals are audit evidence, not automatic truth. Challenges can accelerate review; positive use never raises certification authority by itself.</p>
        </div>
        <span className="countPill">{workspace?.memoryOutcomeItems.length||0}</span>
      </div>
      <div className="manifestList">
        {(workspace?.memoryOutcomeItems||[]).slice(0,12).map(item=><article className="manifestCard" key={item.id}>
          <div className="rowBetween">
            <div>
              <b>{item.signal.replaceAll("_"," ")}</b>
              <small>{item.outcome_kind.replaceAll("_"," ")+" · "+formatDate(item.created_at)}</small>
            </div>
            <span className={"badge "+(item.signal==="contradicted"||item.signal==="challenged"?"warn":"good")}>
              {item.review_triggered?"REVIEW TRIGGERED":"EVIDENCE ONLY"}
            </span>
          </div>
          <p>{item.summary}</p>
          <div className="manifestMeta">
            <span>{"memory "+item.memory_id.slice(0,8)}</span>
            <span>{"receipt "+item.usage_receipt_id.slice(0,8)}</span>
            <span>{"recorded by "+item.recorder_role}</span>
          </div>
        </article>)}
      </div>
    </>}

    <div className="manifestList">
      {(workspace?.candidates||[]).map(candidate=>{
        const gateState=runsByCandidate.get(candidate.id)||new Map<string,boolean>();
        const gates=candidateGateOrder(candidate);
        const allPassed=gates.every(gate=>gateState.get(gate)===true);
        const canHumanCertify=candidate.required_authority!=="owner"||role==="owner";
        const languageDraft=languageReviewDraft(candidate);
        return <article className="manifestCard" key={candidate.id}>
          <div className="rowBetween">
            <div>
              <b>{candidate.category.replaceAll("_"," ")}</b>
              <small>{candidate.lifecycle_state+" · "+candidate.evidence_count+" evidence item"+(candidate.evidence_count===1?"":"s")}</small>
            </div>
            <span className={"badge "+(candidate.has_conflict?"bad":candidate.lifecycle_state==="CERTIFIED"?"good":"warn")}>
              {candidate.has_conflict?"CONFLICT":candidate.lifecycle_state}
            </span>
          </div>

          <p>{candidate.normalized_knowledge}</p>
          <div className="manifestMeta">
            <span>{"risk "+candidate.risk_class}</span>
            <span>{"requires "+candidate.required_authority}</span>
            <span>{candidate.confidence==null?"confidence —":"confidence "+Math.round(candidate.confidence*100)+"%"}</span>
          </div>

          {candidate.derivation_review?.required&&<div className="plannerForm">
            <div>
              <b>Source-family derivation review required</b>
              <p className="muted">
                Translations, paraphrases, summaries and other declared derivations remain dependent evidence from one root source. Certification requires a current qualified semantic-equivalence review; review never makes a derivation independent corroboration.
              </p>
            </div>
            {(candidate.derivation_review.items||[]).map(derivation=>{
              const basis=derivationReviewDrafts[derivation.id]||"";
              const languagesReady=Boolean(derivation.sourceLanguage&&derivation.targetLanguage);
              return <div className="manifestCard" key={derivation.id}>
                <div className="rowBetween">
                  <div>
                    <b>{derivation.derivationKind.replaceAll("_"," ")}</b>
                    <small>
                      {(derivation.sourceLanguage||"source language missing")+" → "+(derivation.targetLanguage||"target language missing")}
                    </small>
                  </div>
                  <span className={"badge "+(derivation.status==="reviewed_equivalent"?"good":derivation.status==="reviewed_changed"?"bad":"warn")}>
                    {derivation.status.replaceAll("_"," ").toUpperCase()}
                  </span>
                </div>
                <div className="manifestMeta">
                  <span>{"family "+derivation.rootEventId.slice(0,8)}</span>
                  <span>{"transform "+derivation.transformationVersion}</span>
                  {derivation.reviewedAt&&<span>{"reviewed "+formatDate(derivation.reviewedAt)}</span>}
                </div>
                <label>
                  Semantic-equivalence review basis
                  <textarea
                    rows={3}
                    value={basis}
                    placeholder="Compare source and derived evidence; note terminology, negation, quantities, modal force, and limitations."
                    onChange={event=>setDerivationReviewDrafts(current=>({
                      ...current,
                      [derivation.id]:event.target.value
                    }))}
                  />
                </label>
                {!languagesReady&&<p className="muted">
                  Explicit BCP 47 language metadata is required on both source and derived evidence before semantic-equivalence review can be recorded.
                </p>}
                <div className="rowActions">
                  <button
                    className="secondaryButton compact"
                    type="button"
                    disabled={busyDerivationId===derivation.id||basis.trim().length<12||!languagesReady}
                    onClick={()=>void reviewEvidenceDerivation(derivation,"equivalent")}
                  >Confirm semantic equivalence</button>
                  <button
                    className="secondaryButton compact"
                    type="button"
                    disabled={busyDerivationId===derivation.id||basis.trim().length<12||!languagesReady}
                    onClick={()=>void reviewEvidenceDerivation(derivation,"changed")}
                  >Record material change</button>
                </div>
              </div>;
            })}
          </div>}

          {candidate.language_review?.required&&<div className="plannerForm">
            <div>
              <b>Language review required</b>
              <p className="muted">
                Review the preserved source evidence before certification. A passing review requires active reviewer-registry coverage for every reviewed language and remains bound to the current candidate evidence.
              </p>
              <div className="manifestMeta">
                <span>{"source languages "+(candidate.language_review.sourceLanguages.join(", ")||"not supplied")}</span>
                <span>{"signals "+(candidate.language_review.reasons.join(", ")||"review required")}</span>
              </div>
            </div>
            <label>
              Reviewed BCP 47 languages
              <input
                value={languageDraft.languages}
                placeholder="e.g. af, en-ZA"
                onChange={event=>updateLanguageReviewDraft(candidate,{languages:event.target.value})}
              />
            </label>
            <label>
              Review basis and limitations
              <textarea
                rows={3}
                value={languageDraft.basis}
                placeholder="Describe the source comparison, terminology checks, and any limitations."
                onChange={event=>updateLanguageReviewDraft(candidate,{basis:event.target.value})}
              />
            </label>
            <div className="checkRow">
              <label>
                <input
                  type="checkbox"
                  checked={languageDraft.meaningPreserved}
                  onChange={event=>updateLanguageReviewDraft(candidate,{meaningPreserved:event.target.checked})}
                />
                Meaning, negation, quantities and modal force are preserved.
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={languageDraft.noUnresolvedAmbiguity}
                  onChange={event=>updateLanguageReviewDraft(candidate,{noUnresolvedAmbiguity:event.target.checked})}
                />
                No unresolved semantic ambiguity remains.
              </label>
            </div>
            <button
              className="secondaryButton compact"
              type="button"
              disabled={
                busyId===candidate.id||
                gateState.get("LANGUAGE_REVIEW")===true||
                candidate.lifecycle_state==="CERTIFIED"||
                !languageDraft.meaningPreserved||
                !languageDraft.noUnresolvedAmbiguity||
                languageDraft.basis.trim().length<12||
                !languageDraft.languages.trim()
              }
              onClick={()=>void recordLanguageReview(candidate)}
            >{gateState.get("LANGUAGE_REVIEW")===true?"✓ LANGUAGE REVIEW":"Record language review"}</button>
          </div>}

          <div className="datanestAiGateRow">
            {gates.map(gate=>{
              const passed=gateState.get(gate)===true;
              if(gate==="STRESS_TEST"){
                return <span
                  className={passed?"secondaryButton compact active":"secondaryButton compact"}
                  key={gate}
                  title="Recorded by governed stress suite"
                >{passed?"✓ ":""}STRESS TEST · Recorded by governed stress suite</span>;
              }
              if(gate==="LANGUAGE_REVIEW"){
                return <span
                  className={passed?"secondaryButton compact active":"secondaryButton compact"}
                  key={gate}
                  title="Recorded through the governed language review form"
                >{passed?"✓ ":""}LANGUAGE REVIEW · Human evidence</span>;
              }
              return <button
                key={gate}
                className={passed?"secondaryButton compact active":"secondaryButton compact"}
                type="button"
                disabled={busyId===candidate.id||passed||candidate.lifecycle_state==="CERTIFIED"}
                onClick={()=>void invoke("record_validation",candidate,{
                  gate,
                  passed:true,
                  suiteVersion:"datanest-ai-governed-memory-v1",
                  results:{source:"DataNest AI certification console"}
                })}
              >{passed?"✓ ":""}{gate.replace("_"," ")}</button>;
            })}
          </div>

          <div className="rowActions">
            {candidate.lifecycle_state!=="CERTIFIED"&&<button
              className="primaryButton compact"
              type="button"
              disabled={busyId===candidate.id||!allPassed||!canHumanCertify}
              onClick={()=>void invoke("certify",candidate,{
                reason:"Human certification after required governed gates passed."
              })}
            >Certify</button>}
            {candidate.lifecycle_state==="CERTIFIED"&&<button
              className="primaryButton compact"
              type="button"
              disabled={busyId===candidate.id}
              onClick={()=>void invoke("promote",candidate)}
            >Promote to project memory</button>}
          </div>
        </article>;
      })}

      {workspace&&workspace.candidates.length===0&&workspace.memoryReviewItems.length===0&&workspace.memoryOutcomeItems.length===0&&workspace.memoryConsolidationSuggestions.length===0&&workspace.memoryConsolidationProposals.length===0&&<div className="emptyState">
        <div>◇</div>
        <h3>No learning or memory-review work queued</h3>
        <p>Repeated staged evidence creates learning candidates; Certified Memory enters this queue when its governed review date is due.</p>
      </div>}
    </div>
  </section>;
}
