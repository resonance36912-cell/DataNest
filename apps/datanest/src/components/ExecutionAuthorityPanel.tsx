"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useSingleFlight } from "@/lib/singleFlight";
import PageHeader from "@/components/platform/PageHeader";
import GovernedAction, { type GovernedActionStage } from "@/components/platform/GovernedAction";
import {
  autonomyDescriptions,
  autonomyLabels,
  autonomyLevels,
  authorityRouteKeys,
  breakerCategories,
  canApproveExecutionAuthority,
  canManageCircuitBreakers,
  canProposeExecutionAuthority,
  consequenceClasses,
  executionAuthorityLabel,
  type AutonomyLevel,
  type AuthorityRouteKey,
  type AuthorityRouteMode,
  type ConsequenceClass,
  type ExecutionAuthorityRole,
  type ExecutionCircuitBreakerCategory,
  type ExecutionCircuitBreakerState
} from "@/lib/executionAuthority";

type Row=Record<string,unknown>;
export type ExecutionAuthorityJobOption={
  id:string;
  job_number:number;
  title:string;
  status:string;
  required_capabilities:string[];
};

type Workspace={
  envelopes:Row[];
  approvals:Row[];
  leases:Row[];
  circuit_breakers:Row[];
  route_modes:Record<string,unknown>;
  decisions:Row[];
  jobs:Row[];
  caller_role:string|null;
  can_propose:boolean;
  can_approve:boolean;
  can_control:boolean;
  boundaries:Record<string,unknown>;
};

function rows(value:unknown){return Array.isArray(value)?value as Row[]:[];}
function txt(value:unknown){return value==null?"":String(value);}
function list(value:unknown){return Array.isArray(value)?value.map(item=>String(item)):[];}
function splitList(value:string){return value.split(/[\n,]/).map(item=>item.trim()).filter(Boolean);}
function bool(value:unknown){return value===true;}
function toLocalInput(date:Date){
  const pad=(value:number)=>String(value).padStart(2,"0");
  return date.getFullYear()+"-"+pad(date.getMonth()+1)+"-"+pad(date.getDate())+"T"+pad(date.getHours())+":"+pad(date.getMinutes());
}
function prettyDate(value:unknown){
  const raw=txt(value); if(!raw)return "—";
  const date=new Date(raw);
  if(Number.isNaN(date.getTime()))return raw;
  return new Intl.DateTimeFormat(undefined,{year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(date);
}
function numberValue(value:unknown,fallback=0){
  const next=Number(value); return Number.isFinite(next)?next:fallback;
}
function statusTone(value:string){
  if(value==="active"||value==="approved"||value==="enabled"||value==="allow"||value==="authorized")return "good";
  if(value==="paused"||value==="review_required"||value==="report_only")return "warn";
  return "neutral";
}
function rowJob(item:Row):ExecutionAuthorityJobOption{
  return {
    id:txt(item.id),
    job_number:numberValue(item.job_number),
    title:txt(item.title),
    status:txt(item.status),
    required_capabilities:list(item.required_capabilities)
  };
}

export default function ExecutionAuthorityPanel({
  projectId,currentUserId,role,jobs=[],setNotice,setError
}:{
  projectId:string;
  currentUserId:string;
  role:ExecutionAuthorityRole;
  jobs?:ExecutionAuthorityJobOption[];
  setNotice:(value:string)=>void;
  setError:(value:string)=>void;
}){
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const {activeAction,run:runSingleFlight}=useSingleFlight();

  const [jobId,setJobId]=useState(jobs[0]?.id||"");
  const [actorType,setActorType]=useState("human");
  const [actorReference,setActorReference]=useState("user:"+currentUserId);
  const [sponsorUser,setSponsorUser]=useState(currentUserId);
  const [purpose,setPurpose]=useState("job_execution");
  const [autonomyLevel,setAutonomyLevel]=useState<AutonomyLevel>("A2");
  const [allowedConsequences,setAllowedConsequences]=useState<ConsequenceClass[]>(["preparatory"]);
  const [allowedOperations,setAllowedOperations]=useState("prepare");
  const [allowedCapabilities,setAllowedCapabilities]=useState(jobs[0]?.required_capabilities?.join(",")||"");
  const [allowedTargetTypes,setAllowedTargetTypes]=useState("job");
  const [allowedTargetReferences,setAllowedTargetReferences]=useState("");
  const [allowedDataClasses,setAllowedDataClasses]=useState("");
  const [allowedProviderKeys,setAllowedProviderKeys]=useState("");
  const [envelopeExpiry,setEnvelopeExpiry]=useState(()=>toLocalInput(new Date(Date.now()+60*60*1000)));
  const [reversibility,setReversibility]=useState("reversible");
  const [requireLease,setRequireLease]=useState(true);
  const [requireIndependent,setRequireIndependent]=useState(false);
  const [maxOperations,setMaxOperations]=useState("10");
  const [maxConcurrency,setMaxConcurrency]=useState("1");
  const [maxRuntime,setMaxRuntime]=useState("900");
  const [rationale,setRationale]=useState("");
  const [evidenceReference,setEvidenceReference]=useState("");

  const [leaseEnvelope,setLeaseEnvelope]=useState("");
  const [leaseJob,setLeaseJob]=useState("");
  const [leaseCapabilityKey,setLeaseCapabilityKey]=useState("");
  const [leaseOperations,setLeaseOperations]=useState("job_start");
  const [leaseConsequences,setLeaseConsequences]=useState("resource_execution");
  const [leaseTargetTypes,setLeaseTargetTypes]=useState("job");
  const [leaseTargetReferences,setLeaseTargetReferences]=useState("");
  const [leaseExpiry,setLeaseExpiry]=useState(()=>toLocalInput(new Date(Date.now()+30*60*1000)));
  const [leaseMaxOperations,setLeaseMaxOperations]=useState("1");

  const [exactEnvelope,setExactEnvelope]=useState("");
  const [exactJob,setExactJob]=useState("");
  const [exactOperation,setExactOperation]=useState("");
  const [exactTargetType,setExactTargetType]=useState("");
  const [exactTargetReference,setExactTargetReference]=useState("");
  const [exactEvidenceIdentity,setExactEvidenceIdentity]=useState("");
  const [exactExpiry,setExactExpiry]=useState(()=>toLocalInput(new Date(Date.now()+20*60*1000)));

  const [breakerReason,setBreakerReason]=useState("");
  const [routeReason,setRouteReason]=useState("");

  const canPropose=canProposeExecutionAuthority(role);
  const canApprove=canApproveExecutionAuthority(role);
  const canControl=canManageCircuitBreakers(role);
  const proposalAutonomyLevels=role==="operator"?autonomyLevels.filter(level=>level!=="A4"):autonomyLevels;

  const load=useCallback(async()=>{
    const supabase=getSupabase();
    if(!supabase){setError("Authority & Execution is unavailable.");setLoading(false);return;}
    setLoading(true);
    const {data,error}=await supabase.rpc("get_authority_execution_workspace_v1",{target_project:projectId});
    if(error){
      setError(error.message); setWorkspace(null);
    }else{
      const raw=(data||{}) as Record<string,unknown>;
      const next:Workspace={
        envelopes:rows(raw.envelopes),
        approvals:rows(raw.approvals),
        leases:rows(raw.leases),
        circuit_breakers:rows(raw.circuit_breakers),
        route_modes:(raw.route_modes&&typeof raw.route_modes==="object"?raw.route_modes:{}) as Record<string,unknown>,
        decisions:rows(raw.decisions),
        jobs:rows(raw.jobs),
        caller_role:raw.caller_role?String(raw.caller_role):null,
        can_propose:Boolean(raw.can_propose),
        can_approve:Boolean(raw.can_approve),
        can_control:Boolean(raw.can_control),
        boundaries:(raw.boundaries&&typeof raw.boundaries==="object"?raw.boundaries:{}) as Record<string,unknown>
      };
      setWorkspace(next);
      const availableJobs=(jobs.length?jobs:next.jobs.map(rowJob)).filter(item=>item.id);
      const firstJob=availableJobs[0];
      if(firstJob){
        setJobId(current=>current||firstJob.id);
        setLeaseJob(current=>current||firstJob.id);
        setExactJob(current=>current||firstJob.id);
        setAllowedCapabilities(current=>current||firstJob.required_capabilities.join(","));
      }
      const firstActive=next.envelopes.find(item=>txt(item.status)==="active"&&txt(item.granted_autonomy)!=="A4");
      const firstA4=next.envelopes.find(item=>txt(item.status)==="active"&&txt(item.granted_autonomy)==="A4");
      setLeaseEnvelope(current=>current||txt(firstActive?.id));
      setExactEnvelope(current=>current||txt(firstA4?.id));
    }
    setLoading(false);
  },[jobs,projectId,setError]);

  useEffect(()=>{void load();},[load]);

  const availableJobs=useMemo(
    ()=>jobs.length?jobs:(workspace?.jobs||[]).map(rowJob).filter(item=>item.id),
    [jobs,workspace]
  );
  const activeLeaseEnvelopes=useMemo(
    ()=>workspace?.envelopes.filter(item=>txt(item.status)==="active"&&txt(item.granted_autonomy)!=="A4")||[],
    [workspace]
  );
  const activeA4Envelopes=useMemo(
    ()=>workspace?.envelopes.filter(item=>txt(item.status)==="active"&&txt(item.granted_autonomy)==="A4")||[],
    [workspace]
  );
  const breakerMap=useMemo(
    ()=>new Map((workspace?.circuit_breakers||[]).map(item=>[txt(item.category),item])),
    [workspace]
  );

  async function rpc(name:string,args:Record<string,unknown>,notice:string){
    const supabase=getSupabase(); if(!supabase)return false;
    const result=await runSingleFlight(name,async()=>{
      setBusy(true);setError("");setNotice("Authority & Execution action in progress…");
      try{
        const {error}=await supabase.rpc(name,args);
        if(error)throw error;
        setNotice(notice);
        await load();
        return true;
      }catch(actionError){
        setError(actionError instanceof Error?actionError.message:"Authority & Execution action failed. You can retry safely.");
        return false;
      }finally{
        setBusy(false);
      }
    });
    return Boolean(result.started&&result.value);
  }

  function toggleConsequence(value:ConsequenceClass){
    setAllowedConsequences(current=>current.includes(value)?current.filter(item=>item!==value):[...current,value]);
  }

  async function proposeEnvelope(event:FormEvent){
    event.preventDefault();
    const limits:Record<string,unknown>={resource_limits:{}};
    if(Number(maxOperations)>0)limits.max_operation_count=Number(maxOperations);
    if(Number(maxConcurrency)>0)limits.max_concurrent_executions=Number(maxConcurrency);
    if(Number(maxRuntime)>0)limits.max_runtime_seconds=Number(maxRuntime);

    await rpc("propose_authority_envelope_v2",{
      target_project:projectId,
      target_actor_type:actorType,
      target_actor_reference:actorReference.trim(),
      target_accountable_human_user:sponsorUser,
      target_purpose:purpose.trim(),
      target_requested_autonomy:autonomyLevel,
      target_allowed_consequence_classes:allowedConsequences,
      target_allowed_operation_keys:splitList(allowedOperations),
      target_rationale:rationale.trim(),
      target_product:null,
      target_job:jobId||null,
      target_allowed_capability_keys:splitList(allowedCapabilities),
      target_allowed_tool_keys:[],
      target_allowed_target_types:splitList(allowedTargetTypes),
      target_allowed_target_references:splitList(allowedTargetReferences),
      target_allowed_data_classes:splitList(allowedDataClasses),
      target_allowed_purposes:[purpose.trim()],
      target_allowed_provider_keys:splitList(allowedProviderKeys),
      target_valid_from:null,
      target_expires_at:new Date(envelopeExpiry).toISOString(),
      target_limits:limits,
      target_reversibility:reversibility,
      target_require_capability_lease:requireLease,
      target_require_independent_approval:requireIndependent||autonomyLevel==="A4",
      target_exact_evidence_identity:null,
      target_evidence_reference:evidenceReference.trim()||null
    },"Canonical Authority Envelope proposal recorded.");
  }

  async function approveEnvelope(item:Row){
    await rpc("approve_authority_envelope_v2",{
      target_envelope:item.id,
      target_granted_autonomy:item.requested_autonomy,
      target_conditions:{},
      target_evidence_reference:null
    },"Authority Envelope approved; activation remains separate.");
  }

  async function issueLease(event:FormEvent){
    event.preventDefault();
    await rpc("issue_capability_lease_v2",{
      target_envelope:leaseEnvelope,
      target_capability_key:leaseCapabilityKey.trim(),
      target_allowed_operations:splitList(leaseOperations),
      target_expires_at:new Date(leaseExpiry).toISOString(),
      target_job:leaseJob||null,
      target_capability:null,
      target_allowed_target_types:splitList(leaseTargetTypes),
      target_allowed_target_references:splitList(leaseTargetReferences),
      target_allowed_consequence_classes:splitList(leaseConsequences),
      target_max_operation_count:Number(leaseMaxOperations),
      target_trace_identity:null,
      target_evidence_reference:null
    },"Canonical Capability Lease issued. Capacity reservation remains separate.");
  }

  async function exactApproval(event:FormEvent){
    event.preventDefault();
    await rpc("record_exact_action_approval_v1",{
      target_envelope:exactEnvelope,
      target_job:exactJob,
      target_operation:exactOperation.trim(),
      target_target_type:exactTargetType.trim(),
      target_target_reference:exactTargetReference.trim(),
      target_exact_evidence_identity:exactEvidenceIdentity.trim(),
      target_expires_at:new Date(exactExpiry).toISOString(),
      target_evidence_reference:null
    },"Exact-action approval recorded for this specific packet.");
  }

  if(loading)return <section className="panel"><p className="muted">Loading Authority & Execution…</p></section>;
  if(!workspace)return <section className="panel"><p className="muted">Authority & Execution workspace is unavailable.</p></section>;

  return <div className="executionAuthorityWorkspace">
    <PageHeader
      eyebrow="EXECUTE · AUTHORITY"
      title="Governed execution sequence"
      description="Intent → Plan → Dependencies → Authorization → Execution → Live status → Evidence"
      meta={<span>Authorization state is evaluated before consequential execution. Availability alone never grants authority.</span>}
    />
    {activeAction&&<p className="muted" role="status">Authority & Execution action in progress · duplicate submissions are blocked until the request finishes.</p>}
    <section className="executionAuthorityBoundary" aria-label="Execution authority boundaries">
      <p><b>Capacity reservation ≠ authorization lease.</b> A reservation allocates resource capacity; a Capability Lease authorizes a bounded operation.</p>
      <p><b>AVAILABLE does not mean authorized.</b> Capability health and execution permission are independent and both must allow.</p>
      <p><b>Authority Envelopes do not store credentials.</b> RLS, Phase C trust/data policy, provider authorization and file access remain independent prerequisites.</p>
      <p><b>A4 is human-gated.</b> High-impact execution requires exact-action human approval; no generic automated destructive, legal, financial or ownership executor is exposed.</p>
    </section>

    <section className="panel">
      <div className="panelHead"><div><p className="eyebrow">AUTONOMY + CONSEQUENCE</p><h3>Bounded execution authority</h3></div><span className="countPill">Phase D</span></div>
      <div className="autonomyGrid">{autonomyLevels.map(level=><article className={"manifestCard autonomyCard "+(level==="A4"?"highImpact":"")} key={level}>
        <div className="rowBetween"><b>{level+" · "+autonomyLabels[level]}</b>{level==="A4"&&<span className="badge neutral">Exact-action approval</span>}</div>
        <p>{autonomyDescriptions[level]}</p>
      </article>)}</div>
      <p className="muted">Autonomy level and consequence class are separate. An A3 grant does not authorize every A3 consequence.</p>
    </section>

    <section className="panel">
      <div className="panelHead"><div><p className="eyebrow">ROUTE ENFORCEMENT</p><h3>Report only → enforced</h3></div><span className="countPill">Owner / admin</span></div>
      <div className="executionAuthorityCards authorityRouteGrid">
        {authorityRouteKeys.map((routeKey:AuthorityRouteKey)=>{
          const mode=txt(workspace.route_modes[routeKey]) as AuthorityRouteMode||"report_only";
          return <article className="manifestCard" key={routeKey}>
            <div className="rowBetween"><b>{executionAuthorityLabel(routeKey)}</b><span className={"badge "+statusTone(mode)}>{mode==="enforced"?"Enforced":"Report only"}</span></div>
            <p>{mode==="enforced"?"Canonical Phase D non-allow decisions block this route.":"Phase D records the decision but does not block the existing route."}</p>
            {canControl&&<div className="rowActions">
              <button className="secondaryButton compact" disabled={busy||mode==="report_only"} onClick={()=>void rpc("set_authority_execution_route_mode_v1",{target_project:projectId,target_route_key:routeKey,target_mode:"report_only",target_reason:routeReason.trim()||"Returned to report-only governance.",target_evidence_reference:null},"Authority route set to report only.")}>Report only</button>
              <button className="primaryButton compact" disabled={busy||mode==="enforced"} onClick={()=>void rpc("set_authority_execution_route_mode_v1",{target_project:projectId,target_route_key:routeKey,target_mode:"enforced",target_reason:routeReason.trim()||"Enforcement enabled by owner/admin after review.",target_evidence_reference:null},"Authority route enforcement enabled.")}>Enforced</button>
            </div>}
          </article>;
        })}
      </div>
      {canControl&&<label className="authorityReasonField">Route reason<input value={routeReason} onChange={event=>setRouteReason(event.target.value)} placeholder="Reason/evidence for the next route-mode change"/></label>}
    </section>

    <section className="panel">
      <div className="panelHead"><div><p className="eyebrow">CIRCUIT BREAKERS</p><h3>Execution safety controls</h3></div><span className="countPill">Owner / admin</span></div>
      <div className="executionAuthorityCards">
        {breakerCategories.map((category:ExecutionCircuitBreakerCategory)=>{
          const item=breakerMap.get(category);
          const state=(txt(item?.state)||"blocked") as ExecutionCircuitBreakerState;
          return <article className="manifestCard" key={category}>
            <div className="rowBetween"><b>{executionAuthorityLabel(category)}</b><span className={"badge "+statusTone(state)}>{executionAuthorityLabel(state)}</span></div>
            <p>{txt(item?.reason)||"Explicit state required. Unknown execution safety fails closed."}</p>
            {canControl&&<div className="rowActions">
              {(["enabled","paused","blocked"] as ExecutionCircuitBreakerState[]).map(next=><button
                type="button"
                key={next}
                className={next==="blocked"?"primaryButton compact":"secondaryButton compact"}
                disabled={busy||state===next}
                onClick={()=>void rpc("set_execution_circuit_breaker_v2",{target_project:projectId,target_category:category,target_state:next,target_reason:breakerReason.trim()||("Set "+category+" to "+next+" by owner/admin."),target_evidence_reference:null},"Execution circuit breaker changed.")}
              >{executionAuthorityLabel(next)}</button>)}
            </div>}
          </article>;
        })}
      </div>
      {canControl&&<label className="authorityReasonField">Breaker reason<input value={breakerReason} onChange={event=>setBreakerReason(event.target.value)} placeholder="Reason applied to the next breaker change"/></label>}
    </section>

    <section className="panel">
      <div className="panelHead"><div><p className="eyebrow">AUTHORITY ENVELOPES</p><h3>Governed scope and lifecycle</h3></div><span className="countPill">{workspace.envelopes.length}</span></div>
      {workspace.envelopes.length?<div className="executionAuthorityCards">{workspace.envelopes.map(item=>{
        const state=txt(item.status)||"draft";
        const level=(txt(item.requested_autonomy)||txt(item.autonomy_level)||"A0") as AutonomyLevel;
        const isProposer=txt(item.proposed_by)===currentUserId;
        const independent=bool(item.require_independent_approval)||level==="A4";
        const mayApprove=state==="proposed"&&canApprove&&!((independent)&&isProposer);
        const approval=workspace.approvals.find(approval=>txt(approval.authority_envelope_id)===txt(item.id)&&txt(approval.status)==="approved");
        const requestedStage:GovernedActionStage=state==="approved"||state==="active"
          ?(independent&&!approval?"review-required":"authorized")
          :state==="paused"
            ?"checked"
            :["revoked","rejected","expired"].includes(state)
              ?"verified"
              :"review-required";
        const reviewer=requestedStage==="authorized"&&approval?txt(approval.approver_user_id)||undefined:undefined;
        const approvalEvidence=approval
          ?<span>{"Approval evidence · "+txt(approval.id)}</span>
          :requestedStage==="review-required"
            ?<span>Required authorization evidence has not been recorded for this envelope.</span>
            :undefined;
        return <article className="manifestCard" key={txt(item.id)}>
          <div className="rowBetween"><b>{level+" · "+txt(item.actor_key)}</b><span className={"badge "+statusTone(state)}>{executionAuthorityLabel(state)}</span></div>
          <GovernedAction
            stage={requestedStage}
            summary={requestedStage==="authorized"?"Recorded authority state and required approval evidence support this authorization presentation.":requestedStage==="review-required"?"Authorization evidence is incomplete or pending; this envelope must not be treated as executable authority.":"This authority record is non-authorizing in its current lifecycle state."}
            reviewer={reviewer}
            evidence={approvalEvidence}
          />
          <p>{txt(item.purpose)}</p>
          <div className="manifestMeta">
            <span>{txt(item.job_id)?"Job "+txt(item.job_id).slice(0,8):"Project scope"}</span>
            <span>Granted {txt(item.granted_autonomy)||"—"}</span>
            <span>Expires {prettyDate(item.expires_at)}</span>
          </div>
          <p className="muted">Allowed consequence classes: {list(item.allowed_consequence_classes).map(executionAuthorityLabel).join(", ")||"none"}</p>
          <p className="muted">Operations: {list(item.allowed_operation_keys).join(", ")||"none"}</p>
          {independent&&isProposer&&state==="proposed"&&<p className="authorityHighImpactNotice">Independent review required: the proposer cannot approve this authority widening.</p>}
          {level==="A4"&&<p className="authorityHighImpactNotice">A4 requires exact-action approval for the specific operation, target and evidence identity.</p>}
          <div className="rowActions">
            {mayApprove&&<button className="primaryButton compact" disabled={busy} onClick={()=>void approveEnvelope(item)}>Approve</button>}
            {state==="approved"&&canControl&&<button className="primaryButton compact" disabled={busy} onClick={()=>void rpc("activate_authority_envelope_v2",{target_envelope:item.id},"Authority Envelope activated.")}>Activate</button>}
            {state==="proposed"&&canControl&&<button className="textButton" disabled={busy} onClick={()=>void rpc("reject_authority_envelope_v2",{target_envelope:item.id,target_reason:"Rejected from Authority & Execution workspace."},"Authority Envelope rejected.")}>Reject</button>}
            {state==="active"&&canControl&&<button className="textButton" disabled={busy} onClick={()=>void rpc("pause_authority_envelope_v2",{target_envelope:item.id,target_reason:"Paused from Authority & Execution workspace."},"Authority Envelope paused.")}>Pause</button>}
            {["approved","active","paused"].includes(state)&&canControl&&<button className="textButton" disabled={busy} onClick={()=>void rpc("revoke_authority_envelope_v2",{target_envelope:item.id,target_reason:"Revoked from Authority & Execution workspace."},"Authority Envelope revoked.")}>Revoke</button>}
          </div>
        </article>;
      })}</div>:<p className="muted">No Authority Envelopes have been recorded for this project.</p>}
    </section>

    <section className="panel">
      <div className="panelHead"><div><p className="eyebrow">CAPABILITY LEASES</p><h3>Short-lived authorization budgets</h3></div><span className="countPill">{workspace.leases.length}</span></div>
      {workspace.leases.length?<div className="executionAuthorityCards">{workspace.leases.map(item=>{
        const state=txt(item.status);
        const max=numberValue(item.max_operations);
        const used=numberValue(item.consumed_operation_count,numberValue(item.used_operations));
        return <article className="manifestCard" key={txt(item.id)}>
          <div className="rowBetween"><b>{txt(item.capability_key)||txt(item.actor_key)}</b><span className={"badge "+statusTone(state)}>{executionAuthorityLabel(state)}</span></div>
          <p>{list(item.allowed_consequence_classes).map(executionAuthorityLabel).join(", ")||"No canonical consequence scope"}</p>
          <div className="manifestMeta"><span>{Math.max(0,max-used)+" operations remaining"}</span><span>Expires {prettyDate(item.expires_at)}</span></div>
          {state!=="active"&&<p className="muted">{executionAuthorityLabel(state)} leases are non-authorizing.</p>}
          {canControl&&state==="active"&&<div className="rowActions">
            <button className="secondaryButton compact" disabled={busy} onClick={()=>void rpc("pause_capability_lease_v1",{target_lease:item.id,target_reason:"Paused from Authority & Execution workspace."},"Capability Lease paused.")}>Pause</button>
            <button className="textButton" disabled={busy} onClick={()=>void rpc("revoke_capability_lease_v1",{target_lease:item.id,target_reason:"Revoked from Authority & Execution workspace."},"Capability Lease revoked.")}>Revoke</button>
          </div>}
        </article>;
      })}</div>:<p className="muted">No canonical Capability Leases are recorded.</p>}
    </section>

    <section className="panel">
      <div className="panelHead"><div><p className="eyebrow">EXECUTION DECISIONS</p><h3>Recent authority evidence</h3></div><span className="countPill">{workspace.decisions.length}</span></div>
      {workspace.decisions.length?<div className="dataTable">
        <div className="dataRow headerRow"><span>Route</span><span>Operation</span><span>Outcome</span><span>Reason</span><span>Time</span></div>
        {workspace.decisions.slice(0,30).map(item=><div className="dataRow" key={txt(item.id)}>
          <b>{executionAuthorityLabel(txt(item.route_key)||"legacy")}</b>
          <span>{txt(item.requested_operation)}</span>
          <span><span className={"badge "+statusTone(txt(item.outcome))}>{executionAuthorityLabel(txt(item.outcome))}</span></span>
          <span>{executionAuthorityLabel(txt(item.reason_code))}</span>
          <span>{prettyDate(item.created_at)}</span>
        </div>)}
      </div>:<p className="muted">No execution authority decisions are recorded.</p>}
    </section>

    {canPropose&&<section className="executionAuthorityActionGrid">
      <details className="panel quietDisclosure">
        <summary>Propose Authority Envelope</summary>
        <form className="settingsGrid" onSubmit={proposeEnvelope}>
          <label>Job scope<select value={jobId} onChange={event=>{const next=event.target.value;setJobId(next);const job=availableJobs.find(item=>item.id===next);if(job)setAllowedCapabilities(job.required_capabilities.join(","));}}>
            <option value="">Project scope</option>{availableJobs.map(job=><option key={job.id} value={job.id}>{"JOB-"+job.job_number+" · "+job.title}</option>)}
          </select></label>
          <label>Actor type<select value={actorType} onChange={event=>{const next=event.target.value;setActorType(next);if(next==="human")setActorReference("user:"+currentUserId);}}>{["human","agent","application","model","service","workflow"].map(value=><option key={value}>{value}</option>)}</select></label>
          <label>Actor reference<input value={actorReference} onChange={event=>setActorReference(event.target.value)} required/></label>
          <label>Accountable sponsor user ID<input value={sponsorUser} onChange={event=>setSponsorUser(event.target.value)} required/></label>
          <label>Purpose<input value={purpose} onChange={event=>setPurpose(event.target.value)} required/></label>
          <label>Requested autonomy<select value={autonomyLevel} onChange={event=>setAutonomyLevel(event.target.value as AutonomyLevel)}>{proposalAutonomyLevels.map(level=><option key={level} value={level}>{level+" · "+autonomyLabels[level]}</option>)}</select></label>
          <fieldset className="authorityConsequenceField"><legend>Allowed consequence classes</legend>{consequenceClasses.map(value=><label key={value}><input type="checkbox" checked={allowedConsequences.includes(value)} onChange={()=>toggleConsequence(value)}/>{executionAuthorityLabel(value)}</label>)}</fieldset>
          <label>Allowed operations<input value={allowedOperations} onChange={event=>setAllowedOperations(event.target.value)} placeholder="prepare, job_start"/></label>
          <label>Allowed capability keys<input value={allowedCapabilities} onChange={event=>setAllowedCapabilities(event.target.value)} placeholder="chat, external_ai:provider:host"/></label>
          <label>Allowed target types<input value={allowedTargetTypes} onChange={event=>setAllowedTargetTypes(event.target.value)} placeholder="job, provider"/></label>
          <label>Allowed target references<input value={allowedTargetReferences} onChange={event=>setAllowedTargetReferences(event.target.value)} placeholder="Optional exact targets"/></label>
          <label>Allowed data classes<input value={allowedDataClasses} onChange={event=>setAllowedDataClasses(event.target.value)} placeholder="project_restricted"/></label>
          <label>Allowed provider keys<input value={allowedProviderKeys} onChange={event=>setAllowedProviderKeys(event.target.value)} placeholder="Optional provider keys"/></label>
          <label>Expires<input type="datetime-local" value={envelopeExpiry} onChange={event=>setEnvelopeExpiry(event.target.value)} required/></label>
          <label>Reversibility<select value={reversibility} onChange={event=>setReversibility(event.target.value)}><option value="read_only">Read only</option><option value="reversible">Reversible</option><option value="compensatable">Compensatable</option><option value="conditionally_reversible">Conditionally reversible</option><option value="irreversible">Irreversible</option></select></label>
          <label>Max operations<input type="number" min="1" value={maxOperations} onChange={event=>setMaxOperations(event.target.value)}/></label>
          <label>Max concurrency<input type="number" min="1" value={maxConcurrency} onChange={event=>setMaxConcurrency(event.target.value)}/></label>
          <label>Max runtime seconds<input type="number" min="1" value={maxRuntime} onChange={event=>setMaxRuntime(event.target.value)}/></label>
          <label>Rationale<textarea rows={3} value={rationale} onChange={event=>setRationale(event.target.value)} required/></label>
          <label>Evidence reference<input value={evidenceReference} onChange={event=>setEvidenceReference(event.target.value)}/></label>
          <label><input type="checkbox" checked={requireLease} onChange={event=>setRequireLease(event.target.checked)}/> Require Capability Lease</label>
          <label><input type="checkbox" checked={requireIndependent} onChange={event=>setRequireIndependent(event.target.checked)}/> Require independent approval</label>
          <button className="primaryButton" disabled={busy||!actorReference.trim()||!sponsorUser||!purpose.trim()||!rationale.trim()||allowedConsequences.length===0}>Propose envelope</button>
        </form>
      </details>

      {canControl&&<details className="panel quietDisclosure">
        <summary>Issue Capability Lease · Owner / admin</summary>
        <form className="settingsGrid" onSubmit={issueLease}>
          <label>Active envelope<select value={leaseEnvelope} onChange={event=>setLeaseEnvelope(event.target.value)} required><option value="">Select envelope</option>{activeLeaseEnvelopes.map(item=><option key={txt(item.id)} value={txt(item.id)}>{txt(item.granted_autonomy)+" · "+txt(item.actor_key)+" · "+txt(item.id).slice(0,8)}</option>)}</select></label>
          <label>Job<select value={leaseJob} onChange={event=>setLeaseJob(event.target.value)}><option value="">Envelope scope</option>{availableJobs.map(job=><option key={job.id} value={job.id}>{"JOB-"+job.job_number+" · "+job.title}</option>)}</select></label>
          <label>Capability key<input value={leaseCapabilityKey} onChange={event=>setLeaseCapabilityKey(event.target.value)} required/></label>
          <label>Allowed operations<input value={leaseOperations} onChange={event=>setLeaseOperations(event.target.value)} required/></label>
          <label>Allowed consequence classes<input value={leaseConsequences} onChange={event=>setLeaseConsequences(event.target.value)} required/></label>
          <label>Allowed target types<input value={leaseTargetTypes} onChange={event=>setLeaseTargetTypes(event.target.value)}/></label>
          <label>Allowed target references<input value={leaseTargetReferences} onChange={event=>setLeaseTargetReferences(event.target.value)}/></label>
          <label>Max operations<input type="number" min="1" value={leaseMaxOperations} onChange={event=>setLeaseMaxOperations(event.target.value)} required/></label>
          <label>Expires<input type="datetime-local" value={leaseExpiry} onChange={event=>setLeaseExpiry(event.target.value)} required/></label>
          <button className="primaryButton" disabled={busy||!leaseEnvelope||!leaseCapabilityKey.trim()}>Issue authorization lease</button>
        </form>
      </details>}

      {canControl&&activeA4Envelopes.length>0&&<details className="panel quietDisclosure">
        <summary>Exact-action approval · A4 human control</summary>
        <form className="settingsGrid" onSubmit={exactApproval}>
          <label>Active A4 envelope<select value={exactEnvelope} onChange={event=>setExactEnvelope(event.target.value)} required>{activeA4Envelopes.map(item=><option key={txt(item.id)} value={txt(item.id)}>{txt(item.actor_key)+" · "+txt(item.id).slice(0,8)}</option>)}</select></label>
          <label>Job<select value={exactJob} onChange={event=>setExactJob(event.target.value)} required>{availableJobs.map(job=><option key={job.id} value={job.id}>{"JOB-"+job.job_number+" · "+job.title}</option>)}</select></label>
          <label>Operation<input value={exactOperation} onChange={event=>setExactOperation(event.target.value)} required/></label>
          <label>Target type<input value={exactTargetType} onChange={event=>setExactTargetType(event.target.value)} required/></label>
          <label>Target reference<input value={exactTargetReference} onChange={event=>setExactTargetReference(event.target.value)} required/></label>
          <label>Exact evidence identity<input value={exactEvidenceIdentity} onChange={event=>setExactEvidenceIdentity(event.target.value)} required/></label>
          <label>Expires<input type="datetime-local" value={exactExpiry} onChange={event=>setExactExpiry(event.target.value)} required/></label>
          <button className="primaryButton" disabled={busy||!exactEnvelope||!exactJob||!exactOperation.trim()||!exactTargetType.trim()||!exactTargetReference.trim()||!exactEvidenceIdentity.trim()}>Record exact-action approval</button>
        </form>
      </details>}
    </section>}
  </div>;
}
