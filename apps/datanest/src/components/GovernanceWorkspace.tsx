"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import ProjectMembersPanel from "@/components/ProjectMembersPanel";
import TrustPolicyPanel from "@/components/TrustPolicyPanel";
import ExecutionAuthorityPanel from "@/components/ExecutionAuthorityPanel";
import GovernanceImprovementPanel from "@/components/GovernanceImprovementPanel";
import GovernanceReleaseEvidencePanel from "@/components/GovernanceReleaseEvidencePanel";
import type { TrustPolicyRole } from "@/lib/trustPolicy";
import { useSessionDraftState } from "@/lib/sessionDraft";
import { useSingleFlight } from "@/lib/singleFlight";
import PageHeader from "@/components/platform/PageHeader";
import StatusIndicator from "@/components/platform/StatusIndicator";
import EvidencePanel from "@/components/platform/EvidencePanel";
import GovernedAction, { type GovernedActionStage } from "@/components/platform/GovernedAction";

type Protocol={
  id:string;project_id:string;protocol_key:string;version:number;title:string;mission:string|null;vision:string|null;
  body:string;principles:unknown[];status:string;content_hash:string;proposed_by:string;proposed_at:string;
  reviewed_by?:string|null;reviewed_at?:string|null;effective_from?:string|null;
};
type Proposal={
  id:string;trace_key:string;proposal_type:string;title:string;summary:string;body:string;status:string;
  proposed_by:string;based_on_protocol_id:string|null;target_protocol_id:string|null;quorum_count:number;
  decision_rule:string;opens_at:string;closes_at:string|null;closed_at:string|null;
  support_count:number;oppose_count:number;abstain_count:number;my_vote:string|null;
};
type Decision={
  id:string;project_id:string;proposal_id:string;trace_key:string;outcome:string;support_count:number;
  oppose_count:number;abstain_count:number;eligible_voter_count:number;quorum_met:boolean;
  independent_support:boolean;decision_rule:string;summary:string|null;closed_by:string;
  protocol_version_id:string|null;decided_at:string;
};
type Resolution={
  id:string;trace_key:string;outcome:string;resolution_text:string;replacement_proposal_id:string|null;
  resolved_by:string;resolved_at:string;source_record_mutated:boolean;
};
type Dispute={
  id:string;trace_key:string;target_type:string;target_id:string;title:string;grounds:string;
  requested_remedy:string|null;status:string;filed_by:string;filed_at:string;closed_at:string|null;
  resolution:Resolution|null;
};
type Workspace={
  ratified_protocol:Protocol|null;
  draft_protocols:Protocol[];
  proposals:Proposal[];
  decisions:Decision[];
  disputes:Dispute[];
  can_manage:boolean;
  can_vote:boolean;
  member_role:string|null;
  boundaries:Record<string,unknown>;
};

function normalizeGovernanceWorkspace(value:unknown):Workspace|null{
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const item=value as Partial<Workspace>;
  const boundaries=item.boundaries;
  return {
    ratified_protocol:item.ratified_protocol&&typeof item.ratified_protocol==="object"
      ?item.ratified_protocol as Protocol
      :null,
    draft_protocols:Array.isArray(item.draft_protocols)?item.draft_protocols:[],
    proposals:Array.isArray(item.proposals)?item.proposals:[],
    decisions:Array.isArray(item.decisions)?item.decisions:[],
    disputes:Array.isArray(item.disputes)?item.disputes:[],
    can_manage:item.can_manage===true,
    can_vote:item.can_vote===true,
    member_role:typeof item.member_role==="string"?item.member_role:null,
    boundaries:boundaries&&typeof boundaries==="object"&&!Array.isArray(boundaries)
      ?boundaries as Record<string,unknown>
      :{}
  };
}

function date(value:string|null){
  if(!value)return "—";
  return new Intl.DateTimeFormat(undefined,{month:"short",day:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(value));
}
function label(value:string){return value.replaceAll("_"," ");}
function boolText(value:unknown){return value===true?"Yes":"No";}
function proposalGovernedStage(status:string):GovernedActionStage{
  if(status==="accepted")return "checked";
  if(["rejected","withdrawn","closed","dismissed"].includes(status))return "verified";
  return "review-required";
}


export default function GovernanceWorkspace({
  projectId,currentUserId,role,canManage,setNotice,setError
}:{
  projectId:string;
  currentUserId:string;
  role:TrustPolicyRole;
  canManage:boolean;
  setNotice:(value:string)=>void;
  setError:(value:string)=>void;
}){
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const {activeAction,run:runSingleFlight}=useSingleFlight();
  const [section,setSection]=useState<"sovereign"|"trust"|"authority"|"improvement"|"release">(()=>{
    if(typeof window==="undefined")return "sovereign";
    const requested=new URL(window.location.href).searchParams.get("section");
    if(requested==="trust")return "trust";
    if(requested==="authority")return "authority";
    if(requested==="improvement")return "improvement";
    if(requested==="release")return "release";
    return "sovereign";
  });

  useEffect(()=>{
    const sync=()=>{
      const url=new URL(window.location.href);
      const requested=url.searchParams.get("section");
      const next=requested==="trust"?"trust":requested==="authority"?"authority":requested==="improvement"?"improvement":requested==="release"?"release":"sovereign";
      if(requested&&requested!=="trust"&&requested!=="authority"&&requested!=="improvement"&&requested!=="release"){
        url.searchParams.delete("section");
        window.history.replaceState(window.history.state,"",url.toString());
      }
      setSection(next);
    };
    sync();
    window.addEventListener("popstate",sync);
    return ()=>window.removeEventListener("popstate",sync);
  },[]);

  const draftPrefix="governance:"+projectId+":"+currentUserId+":";
  const [protocolTitle,setProtocolTitle,protocolTitleDraft]=useSessionDraftState(draftPrefix+"protocol-title","");
  const [protocolMission,setProtocolMission,protocolMissionDraft]=useSessionDraftState(draftPrefix+"protocol-mission","");
  const [protocolVision,setProtocolVision,protocolVisionDraft]=useSessionDraftState(draftPrefix+"protocol-vision","");
  const [protocolBody,setProtocolBody,protocolBodyDraft]=useSessionDraftState(draftPrefix+"protocol-body","");
  const [protocolPrinciples,setProtocolPrinciples,protocolPrinciplesDraft]=useSessionDraftState(draftPrefix+"protocol-principles","");

  const [proposalType,setProposalType]=useState("operational_rule");
  const [proposalTitle,setProposalTitle,proposalTitleDraft]=useSessionDraftState(draftPrefix+"proposal-title","");
  const [proposalSummary,setProposalSummary,proposalSummaryDraft]=useSessionDraftState(draftPrefix+"proposal-summary","");
  const [proposalBody,setProposalBody,proposalBodyDraft]=useSessionDraftState(draftPrefix+"proposal-body","");
  const [proposalProtocolId,setProposalProtocolId]=useState("");

  const [disputeTargetType,setDisputeTargetType]=useState("decision");
  const [disputeTargetId,setDisputeTargetId]=useState("");
  const [disputeTitle,setDisputeTitle,disputeTitleDraft]=useSessionDraftState(draftPrefix+"dispute-title","");
  const [disputeGrounds,setDisputeGrounds,disputeGroundsDraft]=useSessionDraftState(draftPrefix+"dispute-grounds","");
  const [disputeRemedy,setDisputeRemedy,disputeRemedyDraft]=useSessionDraftState(draftPrefix+"dispute-remedy","");

  const [resolutionDisputeId,setResolutionDisputeId]=useState("");
  const [resolutionOutcome,setResolutionOutcome]=useState("clarified");
  const [resolutionText,setResolutionText,resolutionTextDraft]=useSessionDraftState(draftPrefix+"resolution-text","");
  const [replacementProposalId,setReplacementProposalId]=useState("");
  const hasSessionDraft=[
    protocolTitleDraft,protocolMissionDraft,protocolVisionDraft,protocolBodyDraft,protocolPrinciplesDraft,
    proposalTitleDraft,proposalSummaryDraft,proposalBodyDraft,
    disputeTitleDraft,disputeGroundsDraft,disputeRemedyDraft,resolutionTextDraft
  ].some(item=>item.hasStoredDraft);

  const load=useCallback(async()=>{
    if(section!=="sovereign"){setLoading(false);return;}
    const supabase=getSupabase();if(!supabase)return;
    setLoading(true);
    const {data,error}=await supabase.rpc("get_governance_workspace_v1",{target_project:projectId});
    if(error){
      setError(error.message);setWorkspace(null);
    }else{
      const next=normalizeGovernanceWorkspace(data);
      setWorkspace(next);
      const openDisputes=(next?.disputes||[]).filter(item=>item.status==="open");
      setResolutionDisputeId(current=>current&&openDisputes.some(item=>item.id===current)?current:openDisputes[0]?.id||"");
      const targets=getTargets(next,disputeTargetType);
      setDisputeTargetId(current=>current&&targets.some(item=>item.id===current)?current:targets[0]?.id||"");
    }
    setLoading(false);
  },[projectId,setError,disputeTargetType,section]);

  useEffect(()=>{void load();},[load]);

  const openProposals=useMemo(()=>workspace?.proposals.filter(item=>item.status==="open")||[],[workspace]);
  const openDisputes=useMemo(()=>workspace?.disputes.filter(item=>item.status==="open")||[],[workspace]);
  const acceptedProtocolProposals=useMemo(
    ()=>workspace?.proposals.filter(item=>item.status==="accepted"&&item.proposal_type==="protocol_change"&&item.target_protocol_id)||[],
    [workspace]
  );
  const targetOptions=useMemo(()=>getTargets(workspace,disputeTargetType),[workspace,disputeTargetType]);

  useEffect(()=>{
    setDisputeTargetId(current=>current&&targetOptions.some(item=>item.id===current)?current:targetOptions[0]?.id||"");
  },[targetOptions]);

  async function runGovernanceAction(key:string,action:()=>Promise<void>){
    await runSingleFlight(key,async()=>{
      setBusy(true);
      setError("");
      try{
        await action();
      }finally{
        setBusy(false);
      }
    }).catch(error=>{
      setError(error instanceof Error?error.message:"Governance action failed. You can retry safely.");
    });
  }

  async function createProtocolDraft(event:FormEvent){
    event.preventDefault();
    const supabase=getSupabase();if(!supabase||!canManage)return;
    const principles=protocolPrinciples.split("\n").map(item=>item.trim()).filter(Boolean);
    await runGovernanceAction("create-protocol-draft",async()=>{
      setNotice("Creating Governance protocol draft…");
      const {error}=await supabase.rpc("create_governance_protocol_draft_v1",{
        target_project:projectId,
        target_title:protocolTitle.trim(),
        target_mission:protocolMission.trim()||null,
        target_vision:protocolVision.trim()||null,
        target_body:protocolBody.trim(),
        target_principles:principles
      });
      if(error)throw error;
      setProtocolTitle("");setProtocolMission("");setProtocolVision("");setProtocolBody("");setProtocolPrinciples("");
      setNotice("Governance protocol draft created. It is not adopted until an accepted protocol-change proposal is ratified.");
      await load();
    });
  }

  async function createProposal(event:FormEvent){
    event.preventDefault();
    const supabase=getSupabase();if(!supabase)return;
    await runGovernanceAction("create-proposal",async()=>{
      setNotice("Opening Governance proposal…");
      const {error}=await supabase.rpc("create_governance_proposal_v1",{
        target_project:projectId,
        target_type:proposalType,
        target_title:proposalTitle.trim(),
        target_summary:proposalSummary.trim(),
        target_body:proposalBody.trim(),
        target_protocol:proposalType==="protocol_change"?(proposalProtocolId||null):null,
        target_closes_at:null
      });
      if(error)throw error;
      setProposalTitle("");setProposalSummary("");setProposalBody("");setProposalProtocolId("");
      setNotice("Governance proposal opened. Formal votes are one active project member, one vote.");
      await load();
    });
  }

  async function castVote(proposalId:string,choice:"support"|"oppose"|"abstain"){
    const supabase=getSupabase();if(!supabase)return;
    await runGovernanceAction("vote:"+proposalId,async()=>{
      setNotice("Recording Governance vote…");
      const {error}=await supabase.rpc("cast_governance_vote_v1",{
        target_proposal:proposalId,target_choice:choice,target_rationale:null
      });
      if(error)throw error;
      setNotice("Governance vote recorded as an append-only vote event.");
      await load();
    });
  }

  async function withdrawProposal(proposalId:string){
    const supabase=getSupabase();if(!supabase)return;
    await runGovernanceAction("withdraw:"+proposalId,async()=>{
      setNotice("Withdrawing Governance proposal…");
      const {error}=await supabase.rpc("withdraw_governance_proposal_v1",{
        target_proposal:proposalId,target_reason:"Withdrawn from the governance workspace."
      });
      if(error)throw error;
      setNotice("Governance proposal withdrawn.");
      await load();
    });
  }

  async function closeProposal(proposalId:string){
    const supabase=getSupabase();if(!supabase||!canManage)return;
    await runGovernanceAction("close:"+proposalId,async()=>{
      setNotice("Closing Governance vote…");
      const {error}=await supabase.rpc("close_governance_proposal_v1",{
        target_proposal:proposalId,target_summary:"Closed from the Sovereign Governance workspace."
      });
      if(error)throw error;
      setNotice("Governance decision recorded from the latest effective member votes.");
      await load();
    });
  }

  async function ratifyProtocol(protocolId:string,proposalId:string){
    const supabase=getSupabase();if(!supabase||!canManage)return;
    await runGovernanceAction("ratify:"+protocolId,async()=>{
      setNotice("Ratifying Governance protocol version…");
      const {error}=await supabase.rpc("ratify_governance_protocol_v1",{
        target_protocol:protocolId,target_proposal:proposalId
      });
      if(error)throw error;
      setNotice("Governance protocol version ratified and previous ratified version superseded, if any.");
      await load();
    });
  }

  async function fileDispute(event:FormEvent){
    event.preventDefault();
    const supabase=getSupabase();if(!supabase||!disputeTargetId)return;
    await runGovernanceAction("file-dispute",async()=>{
      setNotice("Filing Governance dispute…");
      const {error}=await supabase.rpc("file_governance_dispute_v1",{
        target_project:projectId,
        target_type:disputeTargetType,
        target_id:disputeTargetId,
        target_title:disputeTitle.trim(),
        target_grounds:disputeGrounds.trim(),
        target_requested_remedy:disputeRemedy.trim()||null
      });
      if(error)throw error;
      setDisputeTitle("");setDisputeGrounds("");setDisputeRemedy("");
      setNotice("Governance dispute filed. The source protocol/proposal/decision remains unchanged.");
      await load();
    });
  }

  async function resolveDispute(event:FormEvent){
    event.preventDefault();
    const supabase=getSupabase();if(!supabase||!canManage||!resolutionDisputeId)return;
    await runGovernanceAction("resolve-dispute:"+resolutionDisputeId,async()=>{
      setNotice("Resolving Governance dispute…");
      const {error}=await supabase.rpc("resolve_governance_dispute_v1",{
        target_dispute:resolutionDisputeId,
        target_outcome:resolutionOutcome,
        target_resolution:resolutionText.trim(),
        target_replacement_proposal:resolutionOutcome==="refer_to_new_proposal"?(replacementProposalId||null):null
      });
      if(error)throw error;
      setResolutionText("");setReplacementProposalId("");
      setNotice("Governance dispute resolved by append-only correction record; source history was not rewritten.");
      await load();
    });
  }

  function selectSection(next:"sovereign"|"trust"|"authority"|"improvement"|"release"){
    const url=new URL(window.location.href);
    if(next==="trust")url.searchParams.set("section","trust");
    else if(next==="authority")url.searchParams.set("section","authority");
    else if(next==="improvement")url.searchParams.set("section","improvement");
    else if(next==="release")url.searchParams.set("section","release");
    else url.searchParams.delete("section");
    window.history.pushState(window.history.state,"",url.toString());
    setSection(next);
  }

  const governanceModeTabs=<div className="governanceModeTabs" role="tablist" aria-label="Governance sections">
    <button type="button" role="tab" aria-selected={section==="sovereign"} className={section==="sovereign"?"active":""} onClick={()=>selectSection("sovereign")}>Sovereign Governance</button>
    <button type="button" role="tab" aria-selected={section==="trust"} className={section==="trust"?"active":""} onClick={()=>selectSection("trust")}>Trust & Data Policy</button>
    <button type="button" role="tab" aria-selected={section==="authority"} className={section==="authority"?"active":""} onClick={()=>selectSection("authority")}>Authority & Execution</button>
    <button type="button" role="tab" aria-selected={section==="improvement"} className={section==="improvement"?"active":""} onClick={()=>selectSection("improvement")}>Learning & Improvement</button>
    <button type="button" role="tab" aria-selected={section==="release"} className={section==="release"?"active":""} onClick={()=>selectSection("release")}>Production Evidence</button>
  </div>;

  if(section==="trust")return <div>{governanceModeTabs}<TrustPolicyPanel projectId={projectId} currentUserId={currentUserId} role={role} setNotice={setNotice} setError={setError}/></div>;
  if(section==="authority")return <div>{governanceModeTabs}<ExecutionAuthorityPanel projectId={projectId} currentUserId={currentUserId} role={role} setNotice={setNotice} setError={setError}/></div>;
  if(section==="improvement")return <div>{governanceModeTabs}<GovernanceImprovementPanel projectId={projectId} setNotice={setNotice} setError={setError}/></div>;
  if(section==="release")return <div>{governanceModeTabs}<GovernanceReleaseEvidencePanel/></div>;
  if(loading)return <section className="panel"><p className="muted">Loading Sovereign Governance…</p></section>;
  if(!workspace)return <section className="panel"><h2>Governance workspace unavailable</h2><p>Ratified protocol, proposals, decisions and dispute evidence belong here. Retry before treating any draft as adopted governance.</p><button className="secondaryButton compact" type="button" onClick={()=>void load()}>Retry governance workspace</button></section>;

  return <div>
    {governanceModeTabs}
    <section className="panel" aria-label="Governance workspace overview">
      <PageHeader
        eyebrow="GOVERN · SOVEREIGN GOVERNANCE"
        title="Governance decision workspace"
        description="Review protocol, proposals and immutable decisions while keeping legal ownership, contracts and financial authority outside participation signals."
        primaryAction={<button className="secondaryButton compact" type="button" onClick={()=>void load()}>Refresh</button>}
        meta={<StatusIndicator label={workspace.ratified_protocol?"Ratified protocol active":"Human ratification required"} tone={workspace.ratified_protocol?"success":"warning"} detail={canManage?"Authorized governance controls available":"Governance evidence view"}/>}
      />
      <GovernedAction
        stage={openProposals.length?"review-required":"checked"}
        summary={openProposals.length?"Open governance proposals remain review-required until formal voting and decision evidence is recorded.":"No open proposal is being presented as adopted governance."}
        evidence={<span>{workspace.decisions.length+" immutable decision record"+(workspace.decisions.length===1?"":"s")+" available"}</span>}
      />
    </section>
    <EvidencePanel
      title="Governance evidence"
      items={workspace.ratified_protocol||openProposals.length||workspace.decisions.length?[
        ...(workspace.ratified_protocol?[{label:"Ratified protocol",value:"v"+workspace.ratified_protocol.version+" · "+workspace.ratified_protocol.title}]:[]),
        ...(openProposals.length?[{label:"Open proposals",value:String(openProposals.length)}]:[]),
        ...(workspace.decisions.length?[{label:"Immutable decisions",value:String(workspace.decisions.length)}]:[])
      ]:[]}
      emptyState={<span>No ratified protocol, open proposal, or immutable decision is recorded yet. Review governance inputs and involve an authorized project member before adopting a change.</span>}
    />
    {activeAction&&<p className="muted" role="status">Governance action in progress · duplicate submissions are blocked until the request finishes.</p>}
    {hasSessionDraft&&<p className="muted" role="status">Browser-session draft active · unfinished Governance inputs are restored after workspace navigation or reload.</p>}
    <section className="heroPanel">
      <div>
        <p className="eyebrow">RESONANCE SOVEREIGN GOVERNANCE</p>
        <h2>Project governance</h2>
        <p>DataNest separates project governance from legal ownership, contracts, royalties, financial authority and project roles. Protocol text becomes adopted only after a governed proposal receives independent support and is ratified.</p>
        <div className="heroActions"><button className="secondaryButton compact" onClick={()=>void load()}>Refresh</button></div>
      </div>

    </section>

    <section className="metricGrid">
      <article className="metricCard"><span>Ratified protocol</span><strong>{workspace.ratified_protocol?"v"+workspace.ratified_protocol.version:"—"}</strong><small>{workspace.ratified_protocol?.title||"No human-ratified protocol yet"}</small></article>
      <article className="metricCard"><span>Open proposals</span><strong>{openProposals.length}</strong><small>Formal project governance</small></article>
      <article className="metricCard"><span>Decisions</span><strong>{workspace.decisions.length}</strong><small>Immutable decision records</small></article>
      <article className="metricCard"><span>Open disputes</span><strong>{openDisputes.length}</strong><small>Source history preserved</small></article>
    </section>

    <details className="panel quietDisclosure"><summary>Project members and invitations</summary><ProjectMembersPanel projectId={projectId} setNotice={setNotice} setError={setError}/></details>

    <details className="panel quietDisclosure">
      <summary>Governance rules and boundaries</summary>
      <dl className="settingsList">
        <div><dt>Formal vote basis</dt><dd>{String(workspace.boundaries.formal_vote_basis||"one_active_project_member_one_vote").replaceAll("_"," ")}</dd></div>
        <div><dt>Sparks or reputation weight votes</dt><dd>{boolText(workspace.boundaries.sparks_weight_votes||workspace.boundaries.reputation_weight_votes)}</dd></div>
        <div><dt>Amend contracts / legal ownership</dt><dd>{boolText(workspace.boundaries.governance_amends_contracts||workspace.boundaries.governance_changes_legal_ownership)}</dd></div>
        <div><dt>Create royalty entitlements</dt><dd>{boolText(workspace.boundaries.governance_creates_royalty_entitlements)}</dd></div>
        <div><dt>Grant project roles</dt><dd>{boolText(workspace.boundaries.governance_grants_project_roles)}</dd></div>
        <div><dt>Rewrite disputed source records</dt><dd>{boolText(workspace.boundaries.dispute_resolution_mutates_source_records)}</dd></div>
      </dl>
    </details>

    <section className="panel">
      <div className="panelHead"><div><p className="eyebrow">RATIFIED PROTOCOL</p><h3>{workspace.ratified_protocol?.title||"No adopted protocol yet"}</h3></div>{workspace.ratified_protocol&&<span className="countPill">v{workspace.ratified_protocol.version}</span>}</div>
      {workspace.ratified_protocol?<article className="manifestCard">
        {workspace.ratified_protocol.mission&&<p><b>Mission:</b> {workspace.ratified_protocol.mission}</p>}
        {workspace.ratified_protocol.vision&&<p><b>Vision:</b> {workspace.ratified_protocol.vision}</p>}
        <p>{workspace.ratified_protocol.body}</p>
        {workspace.ratified_protocol.principles?.length>0&&<div className="manifestMeta">{workspace.ratified_protocol.principles.map((item,index)=><span key={index}>{String(item)}</span>)}</div>}
        <small>Content hash {workspace.ratified_protocol.content_hash} · effective {date(workspace.ratified_protocol.effective_from||null)}</small>
      </article>:<div className="emptyState"><div>◇</div><h3>No human-ratified protocol</h3><p>DataNest has not invented mission, vision or governance text on your behalf. Create a draft, open a protocol-change proposal, obtain independent support, close the vote, then ratify it.</p></div>}
    </section>

    {canManage&&<details className="panel quietDisclosure">
      <summary>Create a protocol draft</summary>
      <form className="settingsGrid" onSubmit={createProtocolDraft}>
        <label>Title<input value={protocolTitle} onChange={e=>setProtocolTitle(e.target.value)} placeholder="Resonance Sovereign Governance Protocol"/></label>
        <label>Mission<input value={protocolMission} onChange={e=>setProtocolMission(e.target.value)} placeholder="Optional mission statement"/></label>
        <label>Vision<input value={protocolVision} onChange={e=>setProtocolVision(e.target.value)} placeholder="Optional vision statement"/></label>
        <label>Protocol body<textarea rows={5} value={protocolBody} onChange={e=>setProtocolBody(e.target.value)} placeholder="Authoritative project governance text"/></label>
        <label>Principles · one per line<textarea rows={5} value={protocolPrinciples} onChange={e=>setProtocolPrinciples(e.target.value)} placeholder={"Traceable decisions\nIndependent review\nHuman accountability"}/></label>
        <button className="primaryButton" disabled={busy||!protocolTitle.trim()||!protocolBody.trim()}>Create protocol draft</button>
      </form>
    </details>}

    <details className="panel quietDisclosure">
      <summary>Protocol drafts</summary>
      {workspace.draft_protocols.length?<div className="dataTable">
        <div className="dataRow headerRow"><span>Version</span><span>Title</span><span>Hash</span><span>Proposed</span><span>State</span></div>
        {workspace.draft_protocols.map(item=><div className="dataRow" key={item.id}>
          <b>v{item.version}</b><span>{item.title}</span><span>{item.content_hash.slice(0,12)}</span><span>{date(item.proposed_at)}</span><span>draft</span>
        </div>)}
      </div>:<p className="muted">No protocol drafts are awaiting governance.</p>}
    </details>

    <details className="panel quietDisclosure">
      <summary>Create a proposal</summary>
      {workspace.can_vote?<form className="settingsGrid" onSubmit={createProposal}>
        <label>Type<select value={proposalType} onChange={e=>setProposalType(e.target.value)}>
          <option value="operational_rule">Operational rule</option>
          <option value="process_change">Process change</option>
          <option value="clarification">Clarification</option>
          <option value="advisory">Advisory</option>
          <option value="dispute_followup">Dispute follow-up</option>
          <option value="protocol_change">Protocol change</option>
        </select></label>
        {proposalType==="protocol_change"&&<label>Protocol draft<select value={proposalProtocolId} onChange={e=>setProposalProtocolId(e.target.value)}>
          <option value="">Select a draft</option>
          {workspace.draft_protocols.map(item=><option key={item.id} value={item.id}>v{item.version} · {item.title}</option>)}
        </select></label>}
        <label>Title<input value={proposalTitle} onChange={e=>setProposalTitle(e.target.value)} placeholder="Proposal title"/></label>
        <label>Summary<input value={proposalSummary} onChange={e=>setProposalSummary(e.target.value)} placeholder="Concise proposal summary"/></label>
        <label>Body<textarea rows={4} value={proposalBody} onChange={e=>setProposalBody(e.target.value)} placeholder="Proposal details and intended project effect"/></label>
        <button className="primaryButton" disabled={busy||!proposalTitle.trim()||!proposalSummary.trim()||!proposalBody.trim()||(proposalType==="protocol_change"&&!proposalProtocolId)}>Open proposal</button>
      </form>:<p className="muted">Formal voting and proposal creation require active project membership. Project-access stakeholders may still review governance records and file disputes.</p>}
    </details>

    <section className="panel">
      <div className="panelHead"><div><p className="eyebrow">PROPOSAL REGISTER</p><h3>Votes and decisions</h3></div><span className="countPill">{workspace.proposals.length}</span></div>
      {workspace.proposals.length?<div className="timeline">
        {workspace.proposals.map(item=><div className="timelineItem" key={item.id}>
          <div className="timelineDot"/>
          <div>
            <div className="rowBetween"><b>{item.title}</b><span className="badge neutral">{label(item.status)}</span></div>
            <p>{item.summary}</p>
            <GovernedAction
              stage={proposalGovernedStage(item.status)}
              summary={item.status==="accepted"
                ?"Project governance decision is recorded; downstream production or legal authority remains separately controlled."
                :"Human governance review is required before this proposal can become an adopted project decision."}
              evidence={<span>{item.trace_key} · {label(item.proposal_type)}</span>}
            />
            <div className="manifestMeta">
              <span>{item.trace_key}</span><span>{label(item.proposal_type)}</span>
              <span>support {item.support_count}</span><span>oppose {item.oppose_count}</span><span>abstain {item.abstain_count}</span>
              {item.my_vote&&<span>your vote: {item.my_vote}</span>}
            </div>
            {item.status==="open"&&<div className="rowActions">
              {workspace.can_vote&&<>
                <button className="secondaryButton compact" disabled={busy} onClick={()=>void castVote(item.id,"support")}>Support</button>
                <button className="secondaryButton compact" disabled={busy} onClick={()=>void castVote(item.id,"oppose")}>Oppose</button>
                <button className="secondaryButton compact" disabled={busy} onClick={()=>void castVote(item.id,"abstain")}>Abstain</button>
              </>}
              {item.proposed_by===currentUserId&&<button className="textButton" disabled={busy} onClick={()=>void withdrawProposal(item.id)}>Withdraw</button>}
              {canManage&&<button className="textButton" disabled={busy} onClick={()=>void closeProposal(item.id)}>Close vote</button>}
            </div>}
            {item.status==="accepted"&&item.proposal_type==="protocol_change"&&item.target_protocol_id&&canManage&&workspace.draft_protocols.some(d=>d.id===item.target_protocol_id)&&
              <button className="primaryButton compact" disabled={busy} onClick={()=>void ratifyProtocol(item.target_protocol_id!,item.id)}>Ratify protocol version</button>}
          </div>
        </div>)}
      </div>:<div className="emptyState"><div>◇</div><h3>No governance proposals</h3><p>Formal proposals will appear here with DN-GOV-PROP traces.</p></div>}
    </section>

    <section className="panel">
      <div className="panelHead"><div><p className="eyebrow">DECISION REGISTER</p><h3>Recorded outcomes</h3></div><span className="countPill">{workspace.decisions.length}</span></div>
      {workspace.decisions.length?<div className="dataTable">
        <div className="dataRow headerRow"><span>Trace</span><span>Outcome</span><span>Votes</span><span>Independent support</span><span>Decided</span></div>
        {workspace.decisions.map(item=><div className="dataRow" key={item.id}>
          <b>{item.trace_key}</b><span>{item.outcome}</span>
          <span>{item.support_count} / {item.oppose_count} / {item.abstain_count}</span>
          <span>{item.independent_support?"yes":"no"}</span><span>{date(item.decided_at)}</span>
        </div>)}
      </div>:<p className="muted">No governance decisions have been recorded.</p>}
      <p className="muted">Accepted project governance decisions do not amend signed agreements, create legal ownership, create royalty entitlements, grant project roles or create financial authority.</p>
    </section>

    <section className="panel">
      <div className="panelHead"><div><p className="eyebrow">DISPUTES + APPEALS</p><h3>Challenge without rewriting history</h3></div><span className="countPill">{workspace.disputes.length}</span></div>
      {targetOptions.length?<form className="settingsGrid" onSubmit={fileDispute}>
        <label>Target type<select value={disputeTargetType} onChange={e=>setDisputeTargetType(e.target.value)}>
          <option value="decision">Decision</option><option value="proposal">Proposal</option><option value="protocol">Protocol</option>
        </select></label>
        <label>Target<select value={disputeTargetId} onChange={e=>setDisputeTargetId(e.target.value)}>
          {targetOptions.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        <label>Title<input value={disputeTitle} onChange={e=>setDisputeTitle(e.target.value)} placeholder="Dispute title"/></label>
        <label>Grounds<textarea rows={3} value={disputeGrounds} onChange={e=>setDisputeGrounds(e.target.value)} placeholder="Why the record should be reviewed"/></label>
        <label>Requested remedy<input value={disputeRemedy} onChange={e=>setDisputeRemedy(e.target.value)} placeholder="Clarification, follow-up proposal, etc."/></label>
        <button className="primaryButton" disabled={busy||!disputeTargetId||!disputeTitle.trim()||!disputeGrounds.trim()}>File dispute</button>
      </form>:<p className="muted">A protocol, proposal or decision must exist before a dispute can be filed.</p>}

      {workspace.disputes.length?<div className="timeline">
        {workspace.disputes.map(item=><div className="timelineItem" key={item.id}>
          <div className="timelineDot"/><div>
            <div className="rowBetween"><b>{item.title}</b><span className="badge neutral">{label(item.status)}</span></div>
            <p>{item.grounds}</p><div className="manifestMeta"><span>{item.trace_key}</span><span>{item.target_type}</span><span>{date(item.filed_at)}</span></div>
            {item.resolution&&<p><b>Resolution:</b> {item.resolution.resolution_text} · source mutated: {item.resolution.source_record_mutated?"yes":"no"}</p>}
          </div>
        </div>)}
      </div>:<p className="muted">No governance disputes have been filed.</p>}
    </section>

    {canManage&&openDisputes.length>0&&<section className="panel">
      <div className="panelHead"><div><p className="eyebrow">DISPUTE REVIEW</p><h3>Record an independent resolution</h3></div><span className="countPill">Owner / admin</span></div>
      <form className="settingsGrid" onSubmit={resolveDispute}>
        <label>Dispute<select value={resolutionDisputeId} onChange={e=>setResolutionDisputeId(e.target.value)}>
          {openDisputes.map(item=><option key={item.id} value={item.id}>{item.title} · {item.trace_key}</option>)}
        </select></label>
        <label>Outcome<select value={resolutionOutcome} onChange={e=>setResolutionOutcome(e.target.value)}>
          <option value="clarified">Clarified</option><option value="upheld">Upheld</option><option value="dismissed">Dismissed</option><option value="refer_to_new_proposal">Refer to new proposal</option>
        </select></label>
        {resolutionOutcome==="refer_to_new_proposal"&&<label>Replacement proposal<select value={replacementProposalId} onChange={e=>setReplacementProposalId(e.target.value)}>
          <option value="">Select proposal</option>{workspace.proposals.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
        </select></label>}
        <label>Resolution<textarea rows={4} value={resolutionText} onChange={e=>setResolutionText(e.target.value)} placeholder="Resolution statement; this creates a new record and does not overwrite the source."/></label>
        <button className="primaryButton" disabled={busy||!resolutionDisputeId||!resolutionText.trim()||(resolutionOutcome==="refer_to_new_proposal"&&!replacementProposalId)}>Resolve dispute</button>
      </form>
    </section>}
  </div>;
}

function getTargets(workspace:Workspace|null,type:string){
  if(!workspace)return [] as Array<{id:string;label:string}>;
  if(type==="protocol"){
    const items:Protocol[]=[];
    if(workspace.ratified_protocol)items.push(workspace.ratified_protocol);
    items.push(...workspace.draft_protocols);
    return items.map(item=>({id:item.id,label:"Protocol v"+item.version+" · "+item.title+" · "+item.status}));
  }
  if(type==="proposal"){
    return workspace.proposals.map(item=>({id:item.id,label:item.title+" · "+item.trace_key+" · "+item.status}));
  }
  return workspace.decisions.map(item=>({id:item.id,label:item.trace_key+" · "+item.outcome}));
}
