"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useSingleFlight } from "@/lib/singleFlight";
import GovernedAction, { type GovernedActionStage } from "@/components/platform/GovernedAction";

type StandardItem={
  id:string;
  standard_key:string;
  version:number;
  title:string;
  authority:string;
  edition:string;
  applicability_state:"reference"|"applicable"|"monitor"|"not_applicable";
  rationale:string;
  source_url:string|null;
  review_after:string;
  last_reviewed_at:string|null;
  review_due:boolean;
};

type Observation={
  id:string;
  trace_key:string;
  source_kind:string;
  source_ref:string|null;
  summary:string;
  severity:"info"|"low"|"moderate"|"high"|"critical";
  confidence:number|null;
  observed_at:string;
  recorder_role:string;
  authoritative_change:boolean;
};

type Candidate={
  id:string;
  trace_key:string;
  title:string;
  problem_statement:string;
  hypothesis:string;
  desired_outcome:string;
  source_observation_ids:string[];
  standard_refs:string[];
  risk_class:"low"|"moderate"|"high"|"critical";
  confidence:number|null;
  status:"proposed"|"needs_evidence"|"ready_for_governance"|"converted_to_proposal"|"dismissed";
  linked_governance_proposal_id:string|null;
  governance_effect:boolean;
  updated_at:string;
};


function candidateGovernedStage(status:Candidate["status"]):GovernedActionStage{
  if(status==="ready_for_governance"||status==="converted_to_proposal")return "checked";
  if(status==="dismissed")return "verified";
  return "review-required";
}

type Cycle={
  id:string;
  trace_key:string;
  window_start:string;
  window_end:string;
  previous_cycle_id:string|null;
  metrics:Record<string,unknown>;
  signals:Array<Record<string,unknown>>;
  governance_effect:boolean;
  created_at:string;
};

type Control={
  id:string;
  control_key:string;
  version:number;
  title:string;
  purpose:string;
  control_kind:string;
  standard_refs:string[];
  implementation_refs:string[];
  rationale:string;
  governance_effect:boolean;
  evidence_count:number;
  latest_evidence_at:string|null;
};

type ControlEvidence={
  id:string;
  control_id:string;
  trace_key:string;
  evidence_kind:string;
  evidence_ref:string;
  evidence_digest:string|null;
  summary:string;
  evidence_state:"observed"|"passed"|"failed"|"superseded";
  observed_at:string;
  recorder_role:string;
  authoritative_change:boolean;
};

type StandardWatchEvent={
  id:string;
  standard_id:string;
  standard_key:string;
  observation_id:string;
  trace_key:string;
  event_type:string;
  source_authority:string;
  source_url:string;
  observed_edition:string|null;
  summary:string;
  observed_at:string;
  recorder_role:string;
  authoritative_change:boolean;
};

type ImpactAssessment={
  id:string;
  assessment_key:string;
  version:number;
  subject_kind:string;
  subject_ref:string;
  title:string;
  scope:string;
  lifecycle_stage:string;
  trigger_kind:string;
  materiality:"low"|"moderate"|"high"|"critical";
  affected_parties:string[];
  intended_benefits:unknown;
  potential_harms:unknown;
  mitigations:unknown;
  residual_risk:"unknown"|"low"|"moderate"|"high"|"critical";
  evidence_refs:string[];
  standard_refs:string[];
  status:"draft"|"needs_evidence"|"needs_action"|"monitor"|"closed";
  review_after:string;
  review_due:boolean;
  reviewed_at:string|null;
  linked_improvement_candidate_id:string|null;
  governance_effect:boolean;
  deployment_authority:boolean;
  conformity_claim:boolean;
  updated_at:string;
};

type OutcomeFeedback={
  outcome_evidence_id:string;
  memory_id:string;
  usage_receipt_id:string;
  signal:"challenged"|"contradicted";
  outcome_kind:string;
  summary:string;
  review_triggered:boolean;
  created_at:string;
  feedback_link_id:string|null;
  observation_id:string|null;
  routing_rationale:string|null;
  routed_at:string|null;
  routed:boolean;
};

type Workspace={
  role:string|null;
  can_manage:boolean;
  can_record_control_evidence:boolean;
  can_author_impact_assessment:boolean;
  can_route_outcome_feedback:boolean;
  standards:StandardItem[];
  observations:Observation[];
  candidates:Candidate[];
  cycles:Cycle[];
  controls:Control[];
  control_evidence:ControlEvidence[];
  standard_watch:StandardWatchEvent[];
  impact_assessments:ImpactAssessment[];
  impact_reviews:Array<Record<string,unknown>>;
  outcome_feedback:OutcomeFeedback[];
  boundaries:Record<string,unknown>;
};

function date(value:string|null){
  if(!value)return "—";
  return new Intl.DateTimeFormat(undefined,{
    year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"
  }).format(new Date(value));
}

function label(value:string){
  return value.replaceAll("_"," ");
}

function metric(value:unknown){
  return typeof value==="number"||typeof value==="string"?String(value):"—";
}

export default function GovernanceImprovementPanel({
  projectId,setNotice,setError
}:{
  projectId:string;
  setNotice:(value:string)=>void;
  setError:(value:string)=>void;
}){
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [loading,setLoading]=useState(true);
  const {activeAction,run}=useSingleFlight();

  const [observationKind,setObservationKind]=useState("manual");
  const [observationSummary,setObservationSummary]=useState("");
  const [observationSeverity,setObservationSeverity]=useState("info");
  const [observationSourceRef,setObservationSourceRef]=useState("");

  const [candidateTitle,setCandidateTitle]=useState("");
  const [candidateProblem,setCandidateProblem]=useState("");
  const [candidateHypothesis,setCandidateHypothesis]=useState("");
  const [candidateOutcome,setCandidateOutcome]=useState("");
  const [candidateObservation,setCandidateObservation]=useState("");
  const [candidateStandards,setCandidateStandards]=useState("");
  const [candidateRisk,setCandidateRisk]=useState("moderate");

  const [standardId,setStandardId]=useState("");
  const [standardState,setStandardState]=useState<StandardItem["applicability_state"]>("reference");
  const [standardRationale,setStandardRationale]=useState("");
  const [reviewRationales,setReviewRationales]=useState<Record<string,string>>({});

  const [controlEvidenceControlId,setControlEvidenceControlId]=useState("");
  const [controlEvidenceKind,setControlEvidenceKind]=useState("repository");
  const [controlEvidenceRef,setControlEvidenceRef]=useState("");
  const [controlEvidenceSummary,setControlEvidenceSummary]=useState("");
  const [controlEvidenceState,setControlEvidenceState]=useState<ControlEvidence["evidence_state"]>("observed");

  const [watchStandardId,setWatchStandardId]=useState("");
  const [watchEventType,setWatchEventType]=useState("status_checked");
  const [watchSourceUrl,setWatchSourceUrl]=useState("");
  const [watchObservedEdition,setWatchObservedEdition]=useState("");
  const [watchSummary,setWatchSummary]=useState("");

  const [impactKey,setImpactKey]=useState("");
  const [impactSubjectKind,setImpactSubjectKind]=useState("ai_system");
  const [impactSubjectRef,setImpactSubjectRef]=useState("datanest-ai");
  const [impactTitle,setImpactTitle]=useState("");
  const [impactScope,setImpactScope]=useState("");
  const [impactLifecycleStage,setImpactLifecycleStage]=useState("operation");
  const [impactTriggerKind,setImpactTriggerKind]=useState("material_change");
  const [impactMateriality,setImpactMateriality]=useState("moderate");
  const [impactAffectedParties,setImpactAffectedParties]=useState("");
  const [impactBenefits,setImpactBenefits]=useState("");
  const [impactHarms,setImpactHarms]=useState("");
  const [impactMitigations,setImpactMitigations]=useState("");
  const [impactResidualRisk,setImpactResidualRisk]=useState("unknown");
  const [impactEvidenceRefs,setImpactEvidenceRefs]=useState("");
  const [impactReviewRationales,setImpactReviewRationales]=useState<Record<string,string>>({});
  const [outcomeGovernanceSummaries,setOutcomeGovernanceSummaries]=useState<Record<string,string>>({});
  const [outcomeRoutingRationales,setOutcomeRoutingRationales]=useState<Record<string,string>>({});

  const load=useCallback(async()=>{
    const supabase=getSupabase();
    if(!supabase)return;
    setLoading(true);
    const {data,error}=await supabase.rpc("get_governance_improvement_workspace_v1",{
      target_project:projectId
    });
    if(error){
      setError(error.message);
      setWorkspace(null);
    }else{
      const raw=(data||null) as Partial<Workspace>|null;
      const next=raw?({
        ...raw,
        can_manage:Boolean(raw.can_manage),
        can_record_control_evidence:Boolean(raw.can_record_control_evidence),
        can_author_impact_assessment:Boolean(raw.can_author_impact_assessment),
        can_route_outcome_feedback:Boolean(raw.can_route_outcome_feedback),
        standards:raw.standards||[],
        observations:raw.observations||[],
        candidates:raw.candidates||[],
        cycles:raw.cycles||[],
        controls:raw.controls||[],
        control_evidence:raw.control_evidence||[],
        standard_watch:raw.standard_watch||[],
        impact_assessments:raw.impact_assessments||[],
        impact_reviews:raw.impact_reviews||[],
        outcome_feedback:raw.outcome_feedback||[],
        boundaries:raw.boundaries||{}
      } as Workspace):null;
      setWorkspace(next);
      setStandardId(current=>
        current&&next?.standards.some(item=>item.id===current)
          ?current
          :next?.standards[0]?.id||""
      );
      setCandidateObservation(current=>
        current&&next?.observations.some(item=>item.id===current)
          ?current
          :next?.observations[0]?.id||""
      );
      setControlEvidenceControlId(current=>
        current&&next?.controls.some(item=>item.id===current)
          ?current
          :next?.controls[0]?.id||""
      );
      setWatchStandardId(current=>
        current&&next?.standards.some(item=>item.id===current)
          ?current
          :next?.standards[0]?.id||""
      );
    }
    setLoading(false);
  },[projectId,setError]);

  useEffect(()=>{void load();},[load]);

  const latestCycle=workspace?.cycles[0]||null;
  const dueStandards=useMemo(
    ()=>workspace?.standards.filter(item=>item.review_due)||[],
    [workspace]
  );
  const openCandidates=useMemo(
    ()=>workspace?.candidates.filter(item=>["proposed","needs_evidence","ready_for_governance"].includes(item.status))||[],
    [workspace]
  );

  async function action(key:string,work:()=>Promise<void>){
    await run(key,async()=>{
      setError("");
      await work();
      await load();
    }).catch(error=>{
      setError(error instanceof Error?error.message:"Governance improvement action failed.");
    });
  }

  async function runCycle(){
    const supabase=getSupabase();if(!supabase||!workspace?.can_manage)return;
    await action("run-governance-cycle",async()=>{
      setNotice("Recording governed 90-day improvement snapshot…");
      const {error}=await supabase.rpc("run_governance_improvement_cycle_v1",{
        target_project:projectId,
        target_window_days:90
      });
      if(error)throw error;
      setNotice("Governance review snapshot recorded. Signals are review evidence only; no governance rule changed.");
    });
  }

  async function recordObservation(event:FormEvent){
    event.preventDefault();
    const supabase=getSupabase();if(!supabase)return;
    await action("record-governance-observation",async()=>{
      const {error}=await supabase.rpc("record_governance_observation_v1",{
        target_project:projectId,
        target_source_kind:observationKind,
        target_summary:observationSummary.trim(),
        target_severity:observationSeverity,
        target_confidence:null,
        target_source_ref:observationSourceRef.trim()||null,
        target_evidence:{source:"governance_improvement_workspace"},
        target_observed_at:new Date().toISOString()
      });
      if(error)throw error;
      setObservationSummary("");
      setObservationSourceRef("");
      setNotice("Governance observation recorded as append-only evidence.");
    });
  }

  async function createCandidate(event:FormEvent){
    event.preventDefault();
    const supabase=getSupabase();if(!supabase)return;
    const standardRefs=candidateStandards
      .split(",")
      .map(item=>item.trim())
      .filter(Boolean);
    const observationIds=candidateObservation?[candidateObservation]:[];
    await action("create-governance-improvement",async()=>{
      const {error}=await supabase.rpc("create_governance_improvement_candidate_v1",{
        target_project:projectId,
        target_title:candidateTitle.trim(),
        target_problem_statement:candidateProblem.trim(),
        target_hypothesis:candidateHypothesis.trim(),
        target_desired_outcome:candidateOutcome.trim(),
        target_source_observation_ids:observationIds,
        target_standard_refs:standardRefs,
        target_risk_class:candidateRisk,
        target_confidence:null,
        target_proposed_change:{source:"human_governance_improvement"},
        target_guardrails:{preserve_sovereign_governance:true}
      });
      if(error)throw error;
      setCandidateTitle("");
      setCandidateProblem("");
      setCandidateHypothesis("");
      setCandidateOutcome("");
      setCandidateStandards("");
      setNotice("Improvement candidate recorded. It has no governance effect until human review and the formal proposal process.");
    });
  }

  async function reviewCandidate(candidate:Candidate,decision:"needs_evidence"|"ready_for_governance"|"dismissed"){
    const supabase=getSupabase();if(!supabase||!workspace?.can_manage)return;
    const rationale=(reviewRationales[candidate.id]||"").trim();
    if(rationale.length<3){
      setError("Enter a review rationale before recording the decision.");
      return;
    }
    await action("review-governance-improvement:"+candidate.id,async()=>{
      const {error}=await supabase.rpc("review_governance_improvement_candidate_v1",{
        target_candidate:candidate.id,
        target_decision:decision,
        target_rationale:rationale,
        target_evidence:{source:"governance_improvement_workspace"}
      });
      if(error)throw error;
      setReviewRationales(current=>({...current,[candidate.id]:""}));
      setNotice("Improvement review recorded. Formal governance authority remains unchanged.");
    });
  }

  async function routeCandidate(candidate:Candidate){
    const supabase=getSupabase();if(!supabase||!workspace?.can_manage)return;
    await action("route-governance-improvement:"+candidate.id,async()=>{
      const {error}=await supabase.rpc("convert_governance_improvement_to_proposal_v1",{
        target_candidate:candidate.id,
        target_proposal_type:"process_change"
      });
      if(error)throw error;
      setNotice("Improvement routed into a normal Governance proposal. It still requires formal voting and decision controls.");
    });
  }

  async function reviewStandard(event:FormEvent){
    event.preventDefault();
    const supabase=getSupabase();if(!supabase||!workspace?.can_manage||!standardId)return;
    await action("review-governance-standard:"+standardId,async()=>{
      const {error}=await supabase.rpc("review_governance_standard_v1",{
        target_standard:standardId,
        target_applicability_state:standardState,
        target_rationale:standardRationale.trim(),
        target_review_days:90,
        target_metadata:{source:"governance_improvement_workspace"}
      });
      if(error)throw error;
      setStandardRationale("");
      setNotice("Standards assessment versioned. This records applicability review, not ISO certification.");
    });
  }

  async function recordControlEvidence(event:FormEvent){
    event.preventDefault();
    const supabase=getSupabase();
    if(!supabase||!workspace?.can_record_control_evidence||!controlEvidenceControlId)return;
    await action("record-control-evidence:"+controlEvidenceControlId,async()=>{
      const {error}=await supabase.rpc("record_governance_control_evidence_v1",{
        target_control:controlEvidenceControlId,
        target_evidence_kind:controlEvidenceKind,
        target_evidence_ref:controlEvidenceRef.trim(),
        target_summary:controlEvidenceSummary.trim(),
        target_evidence_state:controlEvidenceState,
        target_evidence_digest:null,
        target_provenance:{source:"governance_improvement_workspace"},
        target_observed_at:new Date().toISOString()
      });
      if(error)throw error;
      setControlEvidenceRef("");
      setControlEvidenceSummary("");
      setControlEvidenceState("observed");
      setNotice("Control evidence recorded as append-only provenance. Evidence does not create governance authority or a conformity claim.");
    });
  }

  async function recordStandardsWatch(event:FormEvent){
    event.preventDefault();
    const supabase=getSupabase();
    if(!supabase||!workspace?.can_manage||!watchStandardId)return;
    await action("record-standards-watch:"+watchStandardId,async()=>{
      const {error}=await supabase.rpc("record_governance_standard_watch_event_v1",{
        target_standard:watchStandardId,
        target_event_type:watchEventType,
        target_source_url:watchSourceUrl.trim(),
        target_summary:watchSummary.trim(),
        target_observed_edition:watchObservedEdition.trim()||null,
        target_evidence:{source:"governance_improvement_workspace"},
        target_observed_at:new Date().toISOString()
      });
      if(error)throw error;
      setWatchSourceUrl("");
      setWatchObservedEdition("");
      setWatchSummary("");
      setNotice("Standards lifecycle evidence recorded. The standards register and applicability state were not changed automatically.");
    });
  }

  async function versionImpactAssessment(event:FormEvent){
    event.preventDefault();
    const supabase=getSupabase();
    if(!supabase||!workspace?.can_author_impact_assessment)return;
    const list=(value:string)=>value.split(",").map(item=>item.trim()).filter(Boolean);
    const lines=(value:string)=>value.split("\n").map(item=>item.trim()).filter(Boolean);
    await action("version-impact-assessment:"+impactKey.trim(),async()=>{
      const {error}=await supabase.rpc("version_governance_ai_impact_assessment_v1",{
        target_project:projectId,
        target_assessment_key:impactKey.trim(),
        target_subject_kind:impactSubjectKind,
        target_subject_ref:impactSubjectRef.trim(),
        target_title:impactTitle.trim(),
        target_scope:impactScope.trim(),
        target_lifecycle_stage:impactLifecycleStage,
        target_trigger_kind:impactTriggerKind,
        target_materiality:impactMateriality,
        target_affected_parties:list(impactAffectedParties),
        target_intended_benefits:lines(impactBenefits),
        target_potential_harms:lines(impactHarms),
        target_mitigations:lines(impactMitigations),
        target_residual_risk:impactResidualRisk,
        target_evidence_refs:list(impactEvidenceRefs),
        target_standard_refs:["iso-iec-42005-2025","iso-iec-23894-2023","nist-ai-rmf-1-0"],
        target_review_days:90,
        target_metadata:{source:"governance_improvement_workspace"}
      });
      if(error)throw error;
      setImpactTitle("");
      setImpactScope("");
      setImpactAffectedParties("");
      setImpactBenefits("");
      setImpactHarms("");
      setImpactMitigations("");
      setImpactEvidenceRefs("");
      setNotice("AI impact assessment version recorded as decision-support evidence. It does not authorize deployment or change governance.");
    });
  }

  async function reviewImpactAssessment(assessment:ImpactAssessment,decision:"needs_evidence"|"needs_action"|"monitor"|"closed"){
    const supabase=getSupabase();
    if(!supabase||!workspace?.can_manage)return;
    const rationale=(impactReviewRationales[assessment.id]||"").trim();
    if(rationale.length<3){
      setError("Enter an impact-assessment review rationale before recording the decision.");
      return;
    }
    await action("review-impact-assessment:"+assessment.id,async()=>{
      const {error}=await supabase.rpc("review_governance_ai_impact_assessment_v1",{
        target_assessment:assessment.id,
        target_decision:decision,
        target_rationale:rationale,
        target_evidence:{source:"governance_improvement_workspace"},
        target_review_days:90
      });
      if(error)throw error;
      setImpactReviewRationales(current=>({...current,[assessment.id]:""}));
      setNotice("Impact assessment review recorded. Review status is not deployment approval or standards conformity.");
    });
  }

  async function routeImpactAssessment(assessment:ImpactAssessment){
    const supabase=getSupabase();
    if(!supabase||!workspace?.can_manage)return;
    await action("route-impact-assessment:"+assessment.id,async()=>{
      const {error}=await supabase.rpc("route_governance_ai_impact_to_improvement_v1",{
        target_assessment:assessment.id
      });
      if(error)throw error;
      setNotice("Reviewed impact assessment routed to a non-authoritative improvement candidate. Formal governance remains required.");
    });
  }

  async function routeOutcomeFeedback(item:OutcomeFeedback){
    const supabase=getSupabase();
    if(!supabase||!workspace?.can_route_outcome_feedback)return;
    const governanceSummary=(outcomeGovernanceSummaries[item.outcome_evidence_id]||"").trim();
    const rationale=(outcomeRoutingRationales[item.outcome_evidence_id]||"").trim();
    if(governanceSummary.length<3||rationale.length<3){
      setError("Enter a governance summary and routing rationale before routing adverse outcome evidence.");
      return;
    }
    await action("route-outcome-feedback:"+item.outcome_evidence_id,async()=>{
      const {error}=await supabase.rpc("route_certified_memory_outcome_to_governance_v1",{
        target_outcome_evidence:item.outcome_evidence_id,
        target_governance_summary:governanceSummary,
        target_rationale:rationale
      });
      if(error)throw error;
      setOutcomeGovernanceSummaries(current=>({...current,[item.outcome_evidence_id]:""}));
      setOutcomeRoutingRationales(current=>({...current,[item.outcome_evidence_id]:""}));
      setNotice("Adverse Certified Memory outcome routed to an append-only governance observation. Memory truth, certification and confidence were not changed.");
    });
  }

  if(loading)return <section className="panel"><p className="muted">Loading continuous governance evidence…</p></section>;
  if(!workspace)return <section className="panel"><p className="muted">Continuous governance workspace is unavailable.</p></section>;

  return <div>
    <section className="heroPanel">
      <div>
        <p className="eyebrow">CONTINUOUS GOVERNANCE OPTIMIZATION</p>
        <h2>Learn about governance without learning around governance</h2>
        <p>
          Evidence sensors detect standards drift, operational outcomes, disputes and improvement opportunities.
          The learning layer can create reviewed proposals, but it cannot vote, decide, ratify, grant authority or rewrite history.
        </p>
        <div className="heroActions">
          <button className="secondaryButton compact" onClick={()=>void load()}>Refresh evidence</button>
          {workspace.can_manage&&<button className="primaryButton compact" disabled={Boolean(activeAction)} onClick={()=>void runCycle()}>
            Record 90-day review snapshot
          </button>}
        </div>
      </div>
    </section>

    <section className="metricGrid">
      <article className="metricCard"><span>Standards tracked</span><strong>{workspace.standards.length}</strong><small>{dueStandards.length} due for DataNest review</small></article>
      <article className="metricCard"><span>Controls mapped</span><strong>{workspace.controls.length}</strong><small>{workspace.control_evidence.length} provenance links</small></article>
      <article className="metricCard"><span>Standards watch</span><strong>{workspace.standard_watch.length}</strong><small>Lifecycle observations</small></article>
      <article className="metricCard"><span>Impact assessments</span><strong>{workspace.impact_assessments.length}</strong><small>{workspace.impact_assessments.filter(item=>item.status==="needs_action").length} need action</small></article>
      <article className="metricCard"><span>Adverse outcomes</span><strong>{workspace.outcome_feedback.length}</strong><small>{workspace.outcome_feedback.filter(item=>!item.routed).length} awaiting governance routing review</small></article>
      <article className="metricCard"><span>Evidence observations</span><strong>{workspace.observations.length}</strong><small>Append-only review evidence</small></article>
      <article className="metricCard"><span>Open improvements</span><strong>{openCandidates.length}</strong><small>Non-authoritative hypotheses</small></article>
      <article className="metricCard"><span>Review cycles</span><strong>{workspace.cycles.length}</strong><small>Longitudinal governance evidence</small></article>
    </section>

    <section className="panel">
      <div className="panelHead">
        <div><p className="eyebrow">GOVERNANCE CHANGE FIREWALL</p><h3>Authority boundaries</h3></div>
        <span className="badge good">ENFORCED</span>
      </div>
      <div className="manifestMeta">
        <span>learning can vote: no</span>
        <span>learning can close proposals: no</span>
        <span>learning can ratify: no</span>
        <span>evidence repetition raises truth: no</span>
        <span>outcome feedback changes memory truth: no</span>
      </div>
      <p className="muted">Human-reviewed improvements enter the existing Sovereign Governance proposal process; they never bypass it.</p>
    </section>

    <section className="panel">
      <div className="panelHead">
        <div><p className="eyebrow">CONTROL-EVIDENCE GRAPH</p><h3>Standards → controls → implementation → evidence</h3></div>
        <span className="countPill">{workspace.controls.length} controls</span>
      </div>
      <p className="muted">Mapped controls describe implementation intent and provenance. A mapped standard, passing test or repeated observation is not a conformity claim and does not increase authority.</p>
      {workspace.controls.length?<div className="manifestList">
        {workspace.controls.map(item=><article className="manifestCard" key={item.id}>
          <div className="rowBetween">
            <div><b>{item.control_key} · {item.title}</b><small>{label(item.control_kind)} · v{item.version}</small></div>
            <span className="badge neutral">{item.evidence_count} evidence</span>
          </div>
          <p>{item.purpose}</p>
          <div className="manifestMeta">
            <span>standards · {item.standard_refs.join(", ")||"none"}</span>
            <span>latest evidence · {date(item.latest_evidence_at)}</span>
            <span>governance effect: no</span>
          </div>
          <small>implementation · {item.implementation_refs.join(" · ")||"not recorded"}</small>
        </article>)}
      </div>:<p className="muted">No active governance controls are mapped yet.</p>}

      {workspace.control_evidence.length>0&&<details className="quietDisclosure">
        <summary>Recent control evidence · {workspace.control_evidence.length}</summary>
        <div className="manifestList">
          {workspace.control_evidence.slice(0,20).map(item=><article className="manifestCard" key={item.id}>
            <div className="rowBetween"><b>{label(item.evidence_kind)}</b><span className="badge neutral">{label(item.evidence_state)}</span></div>
            <p>{item.summary}</p>
            <div className="manifestMeta"><span>{item.evidence_ref}</span><span>{item.trace_key}</span><span>{date(item.observed_at)}</span></div>
          </article>)}
        </div>
      </details>}

      {workspace.can_record_control_evidence&&workspace.controls.length>0&&<form className="settingsGrid" onSubmit={recordControlEvidence}>
        <label>Control<select value={controlEvidenceControlId} onChange={event=>setControlEvidenceControlId(event.target.value)}>
          {workspace.controls.map(item=><option key={item.id} value={item.id}>{item.control_key} · {item.title}</option>)}
        </select></label>
        <label>Evidence kind<select value={controlEvidenceKind} onChange={event=>setControlEvidenceKind(event.target.value)}>
          <option value="repository">Repository</option><option value="migration">Migration</option><option value="test">Test</option>
          <option value="workflow">Workflow</option><option value="deployment">Deployment</option><option value="observation">Observation</option>
          <option value="incident">Incident</option><option value="external_audit">External audit</option>
          <option value="certified_memory">Certified Memory</option><option value="manual">Manual</option>
        </select></label>
        <label>Evidence state<select value={controlEvidenceState} onChange={event=>setControlEvidenceState(event.target.value as ControlEvidence["evidence_state"])}>
          <option value="observed">Observed</option><option value="passed">Passed</option><option value="failed">Failed</option><option value="superseded">Superseded</option>
        </select></label>
        <label>Evidence reference<input value={controlEvidenceRef} onChange={event=>setControlEvidenceRef(event.target.value)} placeholder="Commit, migration, test, workflow run, deployment or trace reference"/></label>
        <label>Evidence summary<textarea rows={3} value={controlEvidenceSummary} onChange={event=>setControlEvidenceSummary(event.target.value)} placeholder="State exactly what this evidence supports and its limitations."/></label>
        <button className="primaryButton" disabled={Boolean(activeAction)||!controlEvidenceControlId||controlEvidenceRef.trim().length<1||controlEvidenceSummary.trim().length<3}>Record control evidence</button>
      </form>}
    </section>

    <section className="panel">
      <div className="panelHead">
        <div><p className="eyebrow">AI IMPACT ASSESSMENT</p><h3>Version impacts across material lifecycle changes</h3></div>
        <span className="countPill">{workspace.impact_assessments.length} active</span>
      </div>
      <p className="muted">Assessments document affected parties, intended benefits, foreseeable harms, mitigations and residual risk. Review status is decision-support evidence only; it never authorizes deployment or asserts ISO conformity.</p>

      {workspace.impact_assessments.length?<div className="manifestList">
        {workspace.impact_assessments.map(item=><article className="manifestCard" key={item.id}>
          <div className="rowBetween">
            <div><b>{item.assessment_key} · {item.title}</b><small>{label(item.subject_kind)} · {item.subject_ref} · v{item.version}</small></div>
            <span className={"badge "+(["high","critical"].includes(item.materiality)?"warn":"neutral")}>{label(item.status)} · {item.materiality}</span>
          </div>
          <p>{item.scope}</p>
          <div className="manifestMeta">
            <span>{label(item.lifecycle_stage)} · {label(item.trigger_kind)}</span>
            <span>residual risk · {item.residual_risk}</span>
            <span>{item.review_due?"review due":"review by "+date(item.review_after)}</span>
            <span>deployment authority: no</span>
          </div>
          <small>affected parties · {item.affected_parties.join(", ")||"not recorded"} · standards · {item.standard_refs.join(", ")}</small>
          {item.linked_improvement_candidate_id&&<p className="muted">Linked improvement candidate · {item.linked_improvement_candidate_id}</p>}
          {workspace.can_manage&&<div className="settingsGrid">
            <label>Review rationale<textarea rows={2} value={impactReviewRationales[item.id]||""} onChange={event=>setImpactReviewRationales(current=>({...current,[item.id]:event.target.value}))} placeholder="Record evidence checked, uncertainty, affected-party considerations and why this review state is appropriate."/></label>
            <div className="heroActions">
              <button type="button" className="secondaryButton compact" disabled={Boolean(activeAction)} onClick={()=>void reviewImpactAssessment(item,"needs_evidence")}>Needs evidence</button>
              <button type="button" className="secondaryButton compact" disabled={Boolean(activeAction)} onClick={()=>void reviewImpactAssessment(item,"monitor")}>Monitor</button>
              <button type="button" className="primaryButton compact" disabled={Boolean(activeAction)} onClick={()=>void reviewImpactAssessment(item,"needs_action")}>Needs governed action</button>
              <button type="button" className="secondaryButton compact" disabled={Boolean(activeAction)} onClick={()=>void reviewImpactAssessment(item,"closed")}>Close review</button>
              {item.status==="needs_action"&&!item.linked_improvement_candidate_id&&<button type="button" className="primaryButton compact" disabled={Boolean(activeAction)} onClick={()=>void routeImpactAssessment(item)}>Route to improvement candidate</button>}
            </div>
          </div>}
        </article>)}
      </div>:<p className="muted">No active AI impact assessment has been recorded yet.</p>}

      {workspace.can_author_impact_assessment&&<details className="quietDisclosure">
        <summary>Version an AI impact assessment</summary>
        <form className="settingsGrid" onSubmit={versionImpactAssessment}>
          <label>Assessment key<input value={impactKey} onChange={event=>setImpactKey(event.target.value)} placeholder="datanest-ai-core"/></label>
          <label>Subject kind<select value={impactSubjectKind} onChange={event=>setImpactSubjectKind(event.target.value)}>
            <option value="platform">Platform</option><option value="ai_system">AI system</option><option value="model">Model</option>
            <option value="provider">Provider</option><option value="workflow">Workflow</option><option value="product">Product</option>
            <option value="feature">Feature</option><option value="use_case">Use case</option><option value="release">Release</option>
          </select></label>
          <label>Subject reference<input value={impactSubjectRef} onChange={event=>setImpactSubjectRef(event.target.value)} placeholder="datanest-ai"/></label>
          <label>Title<input value={impactTitle} onChange={event=>setImpactTitle(event.target.value)} placeholder="Impact assessment title"/></label>
          <label>Lifecycle stage<select value={impactLifecycleStage} onChange={event=>setImpactLifecycleStage(event.target.value)}>
            <option value="design">Design</option><option value="development">Development</option><option value="testing">Testing</option>
            <option value="deployment">Deployment</option><option value="operation">Operation</option><option value="retirement">Retirement</option>
          </select></label>
          <label>Trigger<select value={impactTriggerKind} onChange={event=>setImpactTriggerKind(event.target.value)}>
            <option value="baseline">Baseline</option><option value="material_change">Material change</option><option value="new_use_case">New use case</option>
            <option value="provider_change">Provider change</option><option value="model_change">Model change</option><option value="data_change">Data change</option>
            <option value="policy_change">Policy change</option><option value="incident">Incident</option><option value="periodic_review">Periodic review</option><option value="other">Other</option>
          </select></label>
          <label>Materiality<select value={impactMateriality} onChange={event=>setImpactMateriality(event.target.value)}>
            <option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option><option value="critical">Critical</option>
          </select></label>
          <label>Residual risk<select value={impactResidualRisk} onChange={event=>setImpactResidualRisk(event.target.value)}>
            <option value="unknown">Unknown</option><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option><option value="critical">Critical</option>
          </select></label>
          <label>Scope<textarea rows={3} value={impactScope} onChange={event=>setImpactScope(event.target.value)} placeholder="System boundary, intended context, lifecycle change and assessment limits."/></label>
          <label>Affected parties<input value={impactAffectedParties} onChange={event=>setImpactAffectedParties(event.target.value)} placeholder="Comma-separated groups or stakeholders"/></label>
          <label>Intended benefits<textarea rows={3} value={impactBenefits} onChange={event=>setImpactBenefits(event.target.value)} placeholder="One benefit per line"/></label>
          <label>Foreseeable harms<textarea rows={3} value={impactHarms} onChange={event=>setImpactHarms(event.target.value)} placeholder="One potential harm or adverse impact per line"/></label>
          <label>Mitigations<textarea rows={3} value={impactMitigations} onChange={event=>setImpactMitigations(event.target.value)} placeholder="One mitigation or safeguard per line"/></label>
          <label>Evidence references<input value={impactEvidenceRefs} onChange={event=>setImpactEvidenceRefs(event.target.value)} placeholder="Comma-separated audits, tests, commits, incidents or documents"/></label>
          <button className="primaryButton" disabled={Boolean(activeAction)||impactKey.trim().length<3||impactSubjectRef.trim().length<1||impactTitle.trim().length<3||impactScope.trim().length<3}>Record versioned impact assessment</button>
        </form>
      </details>}
    </section>

    {latestCycle&&<section className="panel">
      <div className="panelHead">
        <div><p className="eyebrow">LATEST REVIEW SNAPSHOT</p><h3>{latestCycle.trace_key}</h3></div>
        <span className="countPill">{date(latestCycle.created_at)}</span>
      </div>
      <div className="metricGrid">
        <article className="metricCard"><span>Proposals</span><strong>{metric(latestCycle.metrics.proposal_count)}</strong><small>Window activity</small></article>
        <article className="metricCard"><span>Decisions</span><strong>{metric(latestCycle.metrics.decision_count)}</strong><small>{metric(latestCycle.metrics.accepted_decision_count)} accepted</small></article>
        <article className="metricCard"><span>Distinct voters</span><strong>{metric(latestCycle.metrics.distinct_voter_count)}</strong><small>{metric(latestCycle.metrics.eligible_member_count)} current eligible members</small></article>
        <article className="metricCard"><span>Open disputes</span><strong>{metric(latestCycle.metrics.open_dispute_count)}</strong><small>Source records preserved</small></article>
      </div>
      {latestCycle.signals.length>0?<div className="manifestList">
        {latestCycle.signals.map((signal,index)=><article className="manifestCard" key={index}>
          <b>{label(String(signal.signal||"review signal"))}</b>
          <p>{String(signal.meaning||"Human review required.")}</p>
          <small>count {metric(signal.count)}</small>
        </article>)}
      </div>:<p className="muted">No deterministic review triggers were present in this snapshot. That is not a claim that governance is risk-free.</p>}
    </section>}

    <details className="panel quietDisclosure" open={dueStandards.length>0}>
      <summary>Living standards register · {workspace.standards.length} references</summary>
      <div className="manifestList">
        {workspace.standards.map(item=><article className="manifestCard" key={item.id}>
          <div className="rowBetween">
            <div><b>{item.title}</b><small>{item.authority} · {item.edition} · v{item.version}</small></div>
            <span className={"badge "+(item.review_due?"warn":"neutral")}>{item.review_due?"REVIEW DUE":label(item.applicability_state)}</span>
          </div>
          <p>{item.rationale}</p>
          <div className="manifestMeta">
            <span>{item.standard_key}</span>
            <span>review by {date(item.review_after)}</span>
            <span>conformity claim: no</span>
          </div>
        </article>)}
      </div>
      {workspace.can_manage&&<form className="settingsGrid" onSubmit={reviewStandard}>
        <label>Standard<select value={standardId} onChange={event=>setStandardId(event.target.value)}>
          {workspace.standards.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
        </select></label>
        <label>Applicability<select value={standardState} onChange={event=>setStandardState(event.target.value as StandardItem["applicability_state"])}>
          <option value="reference">Reference</option>
          <option value="applicable">Applicable</option>
          <option value="monitor">Monitor</option>
          <option value="not_applicable">Not applicable</option>
        </select></label>
        <label>Assessment rationale<textarea rows={3} value={standardRationale} onChange={event=>setStandardRationale(event.target.value)} placeholder="Record scope, evidence checked, limitations and why this state applies."/></label>
        <button className="primaryButton" disabled={Boolean(activeAction)||!standardId||standardRationale.trim().length<3}>Record versioned standards review</button>
      </form>}
    </details>

    <details className="panel quietDisclosure" open={workspace.standard_watch.length>0}>
      <summary>Standards lifecycle watch · {workspace.standard_watch.length} observations</summary>
      <p className="muted">Record authoritative-source lifecycle changes as evidence. Watch events never rewrite the standards register, applicability, or certification state automatically.</p>
      {workspace.standard_watch.length>0&&<div className="manifestList">
        {workspace.standard_watch.slice(0,20).map(item=><article className="manifestCard" key={item.id}>
          <div className="rowBetween">
            <div><b>{item.standard_key} · {label(item.event_type)}</b><small>{item.source_authority} · {date(item.observed_at)}</small></div>
            <span className="badge neutral">REVIEW EVIDENCE</span>
          </div>
          <p>{item.summary}</p>
          <div className="manifestMeta">
            <span>{item.observed_edition?("observed edition · "+item.observed_edition):"edition unchanged/unspecified"}</span>
            <span>{item.trace_key}</span>
            <span>automatic applicability change: no</span>
          </div>
        </article>)}
      </div>}
      {workspace.can_manage&&<form className="settingsGrid" onSubmit={recordStandardsWatch}>
        <label>Standard<select value={watchStandardId} onChange={event=>setWatchStandardId(event.target.value)}>
          {workspace.standards.map(item=><option key={item.id} value={item.id}>{item.title} · {item.edition}</option>)}
        </select></label>
        <label>Lifecycle event<select value={watchEventType} onChange={event=>setWatchEventType(event.target.value)}>
          <option value="status_checked">Status checked</option>
          <option value="revision_announced">Revision announced</option>
          <option value="new_edition_published">New edition published</option>
          <option value="amendment_published">Amendment published</option>
          <option value="withdrawn">Withdrawn</option>
          <option value="superseded">Superseded</option>
          <option value="guidance_updated">Guidance updated</option>
          <option value="other">Other</option>
        </select></label>
        <label>Authoritative HTTPS source<input type="url" value={watchSourceUrl} onChange={event=>setWatchSourceUrl(event.target.value)} placeholder="https://official-authority.example/..."/></label>
        <label>Observed edition<input value={watchObservedEdition} onChange={event=>setWatchObservedEdition(event.target.value)} placeholder="Optional published/revision edition"/></label>
        <label>Lifecycle observation<textarea rows={3} value={watchSummary} onChange={event=>setWatchSummary(event.target.value)} placeholder="Describe the source-backed lifecycle change and what requires human review."/></label>
        <button className="primaryButton" disabled={Boolean(activeAction)||!watchStandardId||!watchSourceUrl.trim().toLowerCase().startsWith("https://")||watchSummary.trim().length<3}>Record standards watch evidence</button>
      </form>}
    </details>

    <section className="panel">
      <div className="panelHead">
        <div><p className="eyebrow">OUTCOME FEEDBACK</p><h3>Certified Memory outcomes → Governance observations</h3></div>
        <span className="countPill">{workspace.outcome_feedback.length} adverse</span>
      </div>
      <p className="muted">Only challenged or contradicted Certified Memory outcomes appear here, and only Owner/Admin can see or route them. Routing creates one append-only governance observation; it does not change memory truth status, certification, confidence, or create an improvement candidate automatically.</p>
      {workspace.outcome_feedback.length?<div className="manifestList">
        {workspace.outcome_feedback.map(item=><article className="manifestCard" key={item.outcome_evidence_id}>
          <div className="rowBetween">
            <div><b>{label(item.outcome_kind)} · {item.signal}</b><small>{date(item.created_at)} · memory {item.memory_id}</small></div>
            <span className={"badge "+(item.signal==="contradicted"?"warn":"neutral")}>{item.routed?"ROUTED":"REVIEW"}</span>
          </div>
          <p>{item.summary}</p>
          <div className="manifestMeta">
            <span>usage receipt · {item.usage_receipt_id}</span>
            <span>memory review triggered · {item.review_triggered?"yes":"no"}</span>
            <span>truth status changed: no</span>
          </div>
          {item.routed&&<p className="muted">Governance observation · {item.observation_id} · routed {date(item.routed_at)}</p>}
          {!item.routed&&workspace.can_route_outcome_feedback&&<div className="settingsGrid">
            <label>Governance summary<textarea rows={2} value={outcomeGovernanceSummaries[item.outcome_evidence_id]||""} onChange={event=>setOutcomeGovernanceSummaries(current=>({...current,[item.outcome_evidence_id]:event.target.value}))} placeholder="State the governance-relevant observation without treating the source outcome as automatic truth."/></label>
            <label>Routing rationale<textarea rows={2} value={outcomeRoutingRationales[item.outcome_evidence_id]||""} onChange={event=>setOutcomeRoutingRationales(current=>({...current,[item.outcome_evidence_id]:event.target.value}))} placeholder="Why should this adverse outcome enter governance review, and what limitations remain?"/></label>
            <button type="button" className="primaryButton compact" disabled={Boolean(activeAction)} onClick={()=>void routeOutcomeFeedback(item)}>Route to governance observation</button>
          </div>}
        </article>)}
      </div>:<p className="muted">No challenged or contradicted Certified Memory outcome evidence is awaiting governance review.</p>}
    </section>

    <details className="panel quietDisclosure">
      <summary>Record governance observation</summary>
      <form className="settingsGrid" onSubmit={recordObservation}>
        <label>Evidence source<select value={observationKind} onChange={event=>setObservationKind(event.target.value)}>
          <option value="manual">Manual review</option>
          <option value="stakeholder_feedback">Stakeholder feedback</option>
          {workspace.can_manage&&<>
            <option value="audit">Audit</option>
            <option value="external_audit">External audit</option>
            <option value="incident">Incident</option>
            <option value="metric">Metric</option>
            <option value="dispute">Dispute</option>
            <option value="decision_outcome">Decision outcome</option>
            <option value="standards_change">Standards change</option>
            <option value="certified_memory_review">Certified Memory review</option>
          </>}
        </select></label>
        <label>Severity<select value={observationSeverity} onChange={event=>setObservationSeverity(event.target.value)}>
          <option value="info">Info</option><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option><option value="critical">Critical</option>
        </select></label>
        <label>Source reference<input value={observationSourceRef} onChange={event=>setObservationSourceRef(event.target.value)} placeholder="Optional trace, audit finding, incident or document reference"/></label>
        <label>Observation<textarea rows={4} value={observationSummary} onChange={event=>setObservationSummary(event.target.value)} placeholder="What was observed? Separate facts from interpretation and uncertainty."/></label>
        <button className="primaryButton" disabled={Boolean(activeAction)||observationSummary.trim().length<3}>Record evidence</button>
      </form>
    </details>

    <section className="panel">
      <div className="panelHead"><div><p className="eyebrow">OBSERVATION LEDGER</p><h3>Governance evidence</h3></div><span className="countPill">{workspace.observations.length}</span></div>
      {workspace.observations.length?<div className="manifestList">
        {workspace.observations.slice(0,20).map(item=><article className="manifestCard" key={item.id}>
          <div className="rowBetween"><b>{label(item.source_kind)}</b><span className={"badge "+(["high","critical"].includes(item.severity)?"warn":"neutral")}>{item.severity}</span></div>
          <p>{item.summary}</p>
          <div className="manifestMeta"><span>{item.trace_key}</span><span>{date(item.observed_at)}</span><span>authority change: no</span></div>
        </article>)}
      </div>:<p className="muted">No continuous-governance observations have been recorded yet.</p>}
    </section>

    <details className="panel quietDisclosure">
      <summary>Create evidence-linked improvement candidate</summary>
      <form className="settingsGrid" onSubmit={createCandidate}>
        <label>Title<input value={candidateTitle} onChange={event=>setCandidateTitle(event.target.value)} placeholder="Improvement hypothesis title"/></label>
        <label>Risk class<select value={candidateRisk} onChange={event=>setCandidateRisk(event.target.value)}>
          <option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option><option value="critical">Critical</option>
        </select></label>
        <label>Source observation<select value={candidateObservation} onChange={event=>setCandidateObservation(event.target.value)}>
          <option value="">No observation selected</option>
          {workspace.observations.map(item=><option key={item.id} value={item.id}>{item.trace_key} · {item.summary.slice(0,80)}</option>)}
        </select></label>
        <label>Standards references<input value={candidateStandards} onChange={event=>setCandidateStandards(event.target.value)} placeholder="Comma-separated standard keys, e.g. iso-iec-42001-2023"/></label>
        <label>Problem statement<textarea rows={3} value={candidateProblem} onChange={event=>setCandidateProblem(event.target.value)} placeholder="Evidence-backed governance problem or opportunity"/></label>
        <label>Hypothesis<textarea rows={3} value={candidateHypothesis} onChange={event=>setCandidateHypothesis(event.target.value)} placeholder="What change might improve the outcome, and why?"/></label>
        <label>Desired outcome<textarea rows={3} value={candidateOutcome} onChange={event=>setCandidateOutcome(event.target.value)} placeholder="Observable result that would support or challenge the hypothesis"/></label>
        <button className="primaryButton" disabled={
          Boolean(activeAction)||
          candidateTitle.trim().length<3||
          candidateProblem.trim().length<3||
          candidateHypothesis.trim().length<3||
          candidateOutcome.trim().length<3||
          (!candidateObservation&&!candidateStandards.trim())
        }>Create non-authoritative candidate</button>
      </form>
    </details>

    <section className="panel">
      <div className="panelHead"><div><p className="eyebrow">IMPROVEMENT PIPELINE</p><h3>Evidence → human review → formal governance</h3></div><span className="countPill">{workspace.candidates.length}</span></div>
      {workspace.candidates.length?<div className="manifestList">
        {workspace.candidates.map(candidate=>{
          const governedStage=candidate.status==="converted_to_proposal"?"checked":"review-required";
          return <article className="manifestCard" key={candidate.id}>
          <div className="rowBetween">
            <div><b>{candidate.title}</b><small>{candidate.trace_key} · {candidate.risk_class} risk</small></div>
            <span className={"badge "+(candidate.status==="ready_for_governance"?"good":"neutral")}>{label(candidate.status)}</span>
          </div>
          <GovernedAction
            stage={governedStage}
            summary={candidate.status==="converted_to_proposal"?"The candidate has entered the formal governance process; it is still not deployment authorization.":"This learning candidate remains review-required and has no governance effect on its own."}
            evidence={<span>{candidate.source_observation_ids.length+" observation refs · "+candidate.standard_refs.length+" standards refs"}</span>}
          />
          <p><b>Problem:</b> {candidate.problem_statement}</p>
          <p><b>Hypothesis:</b> {candidate.hypothesis}</p>
          <p><b>Desired outcome:</b> {candidate.desired_outcome}</p>
          <GovernedAction
            stage={candidateGovernedStage(candidate.status)}
            summary={candidate.status==="converted_to_proposal"
              ?"Candidate has entered the formal governance process; this is not production authorization."
              :candidate.status==="ready_for_governance"
                ?"Evidence review is sufficient to enter formal governance, which remains the decision authority."
                :"Human review remains required; continuous learning cannot adopt governance changes autonomously."}
            evidence={<span>{candidate.trace_key} · governance effect: no</span>}
          />
          <div className="manifestMeta">
            <span>{candidate.source_observation_ids.length} observation refs</span>
            <span>{candidate.standard_refs.length} standards refs</span>
            <span>governance effect: no</span>
          </div>
          {workspace.can_manage&&["proposed","needs_evidence","ready_for_governance"].includes(candidate.status)&&<>
            <label>Review rationale<input value={reviewRationales[candidate.id]||""} onChange={event=>setReviewRationales(current=>({...current,[candidate.id]:event.target.value}))} placeholder="Evidence checked, limitations and reason for the review decision"/></label>
            <div className="rowActions">
              <button className="secondaryButton compact" disabled={Boolean(activeAction)} onClick={()=>void reviewCandidate(candidate,"needs_evidence")}>Needs evidence</button>
              <button className="secondaryButton compact" disabled={Boolean(activeAction)} onClick={()=>void reviewCandidate(candidate,"ready_for_governance")}>Ready for governance</button>
              <button className="textButton" disabled={Boolean(activeAction)} onClick={()=>void reviewCandidate(candidate,"dismissed")}>Dismiss</button>
              {candidate.status==="ready_for_governance"&&<button className="primaryButton compact" disabled={Boolean(activeAction)} onClick={()=>void routeCandidate(candidate)}>Open formal process-change proposal</button>}
            </div>
          </>}
          {candidate.linked_governance_proposal_id&&<small>Formal proposal {candidate.linked_governance_proposal_id}</small>}
        </article>;
        })}
      </div>:<p className="muted">No governance improvement candidates have been recorded.</p>}
    </section>

    <p className="muted">
      Continuous learning here means continuous evidence and reviewability, not autonomous constitutional change.
      Formal adoption remains in Sovereign Governance.
    </p>
  </div>;
}
