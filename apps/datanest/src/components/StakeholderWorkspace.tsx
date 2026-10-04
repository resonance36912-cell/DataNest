"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { WORK_FOCUS_AREAS, normalizeWorkFocusKeys, workFocusKeysFromRequirements, type WorkFocusKey } from "@/lib/workFocus";
import PageHeader from "@/components/platform/PageHeader";
import StatusIndicator from "@/components/platform/StatusIndicator";
import EvidencePanel from "@/components/platform/EvidencePanel";

type Workspace = {
  profile: Record<string,unknown>;
  stakeholder: Record<string,unknown>;
  counts: Record<string,number>;
  spark_balances: Array<{account_type:string;project_id:string|null;balance:number}>;
  scoring_model_version:string|null;
  ui_complexity:"simple"|"detailed";
  economic_boundary:Record<string,boolean>;
};

type InterestDemandJob = { requirements:Record<string,unknown>; status:string };

type Contribution = {
  id:string;
  trace_key:string|null;
  contribution_type:string;
  lifecycle_state:string;
  contribution_state:string;
  scoring_state:string;
  certification_state:string;
  minting_state:string;
  points:number;
  proposed_points:number;
  source_ref:string|null;
  occurred_at:string;
  created_at:string;
};

type ReputationSnapshot = {
  aggregate_score?:number;
  trust_score?:number;
  anomaly_score?:number;
  rank?:number|null;
  eligible_for_ranking?:boolean;
  exclusion_reasons?:string[];
  certified_contributions?:number;
  approved_reviews?:number;
  model_version?:string;
  dimensions?:Record<string,unknown>;
  frozen_at?:string;
};

type IntelligenceWorkspace = {
  rolling_90:ReputationSnapshot;
  lifetime:ReputationSnapshot;
  progression:Record<string,unknown>;
  active_squad_membership:Record<string,unknown>;
  squad:Array<{member_code:string;rank:number;aggregate_score:number;trust_score:number}>;
  anomaly_signals:Array<{
    id:string;
    signal_type:string;
    severity:string;
    confidence:number;
    status:string;
    detected_at:string;
    evidence:Record<string,unknown>;
    resolution_notes?:string|null;
  }>;
  preferences:{
    ui_complexity:"simple"|"detailed";
    ranking_opt_in:boolean;
    squad_opt_in:boolean;
  };
  model:{
    model_version?:string;
    weights?:Record<string,number>;
    minimum_certified_for_rank?:number;
    minimum_certified_for_squad?:number;
    trusted_score_threshold?:number;
    reviewer_score_threshold?:number;
  };
  can_manage:boolean;
  boundaries:Record<string,boolean>;
};

function fmt(value:unknown){
  const n=Number(value||0);
  return Number.isFinite(n)?new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(n):"0";
}

function date(value:string){
  return new Intl.DateTimeFormat(undefined,{month:"short",day:"2-digit",year:"numeric"}).format(new Date(value));
}

function score(value:unknown){
  const n=Number(value);
  return Number.isFinite(n)?n.toFixed(1):"—";
}

function rank(value:unknown){
  const n=Number(value);
  return Number.isFinite(n)&&n>0?"#"+n:"—";
}

function label(value:unknown){
  return String(value||"").replaceAll("_"," ");
}

const interestDemandFinalStates=new Set(["COMPLETED","FAILED","CANCELLED"]);

function emptyInterestDemand():Record<WorkFocusKey,number>{
  return Object.fromEntries(WORK_FOCUS_AREAS.map(item=>[item.key,0])) as Record<WorkFocusKey,number>;
}

export default function StakeholderWorkspace({
  projectId,
  currentUserId,
  canReview,
  onOpenMatchedJobs,
  onOpenRequirementJobs
}:{
  projectId:string;
  currentUserId:string;
  canReview:boolean;
  onOpenMatchedJobs:()=>void;
  onOpenRequirementJobs:(key:WorkFocusKey)=>void;
}) {
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [intelligence,setIntelligence]=useState<IntelligenceWorkspace|null>(null);
  const [contributions,setContributions]=useState<Contribution[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [savingPreference,setSavingPreference]=useState(false);
  const [interestKeys,setInterestKeys]=useState<WorkFocusKey[]>([]);
  const [interestDemand,setInterestDemand]=useState<Record<WorkFocusKey,number>>(()=>emptyInterestDemand());
  const [interestDemandJobCount,setInterestDemandJobCount]=useState(0);
  const [refreshingIntelligence,setRefreshingIntelligence]=useState(false);

  const load=useCallback(async()=>{
    const supabase=getSupabase();
    if(!supabase)return;
    setLoading(true);
    setError("");

    const [workspaceResult,contributionResult,intelligenceResult,interestResult,interestDemandResult]=await Promise.all([
      supabase.rpc("get_contribution_workspace",{target_project:projectId}),
      supabase
        .from("contribution_ledger")
        .select("id,trace_key,contribution_type,lifecycle_state,contribution_state,scoring_state,certification_state,minting_state,points,proposed_points,source_ref,occurred_at,created_at")
        .eq("project_id",projectId)
        .eq("user_id",currentUserId)
        .order("created_at",{ascending:false})
        .limit(50),
      supabase.rpc("get_contribution_intelligence_workspace",{target_project:projectId}),
      supabase.from("datanest_user_preferences").select("interest_keys").eq("user_id",currentUserId).maybeSingle(),
      supabase.from("jobs").select("requirements,status").eq("project_id",projectId)
    ]);

    if(workspaceResult.error){
      setError(workspaceResult.error.message);
      setWorkspace(null);
    }else{
      setWorkspace((workspaceResult.data||null) as Workspace|null);
    }

    if(contributionResult.error){
      setError(current=>current||contributionResult.error!.message);
      setContributions([]);
    }else{
      setContributions((contributionResult.data||[]) as Contribution[]);
    }

    if(intelligenceResult.error){
      setError(current=>current||intelligenceResult.error!.message);
      setIntelligence(null);
    }else{
      setIntelligence((intelligenceResult.data||null) as IntelligenceWorkspace|null);
    }

    if(interestResult.error){
      setError(current=>current||interestResult.error!.message);
      setInterestKeys([]);
    }else{
      setInterestKeys(normalizeWorkFocusKeys((interestResult.data as {interest_keys?:unknown}|null)?.interest_keys));
    }

    if(interestDemandResult.error){
      setError(current=>current||interestDemandResult.error!.message);
      setInterestDemand(emptyInterestDemand());
      setInterestDemandJobCount(0);
    }else{
      const openJobs=((interestDemandResult.data||[]) as InterestDemandJob[]).filter(job=>!interestDemandFinalStates.has(job.status));
      const nextDemand=emptyInterestDemand();
      for(const job of openJobs){
        for(const key of workFocusKeysFromRequirements(job.requirements))nextDemand[key]+=1;
      }
      setInterestDemand(nextDemand);
      setInterestDemandJobCount(openJobs.length);
    }

    setLoading(false);
  },[projectId,currentUserId]);

  useEffect(()=>{void load();},[load]);

  const projectSparks=useMemo(
    ()=>workspace?.spark_balances.find(item=>item.account_type==="project"&&item.project_id===projectId)?.balance||0,
    [workspace,projectId]
  );
  const platformSparks=useMemo(
    ()=>workspace?.spark_balances.find(item=>item.account_type==="platform")?.balance||0,
    [workspace]
  );
  const lockedSparks=useMemo(
    ()=>workspace?.spark_balances.find(item=>item.account_type==="locked"&&item.project_id===projectId)?.balance||0,
    [workspace,projectId]
  );

  async function setComplexity(mode:"simple"|"detailed"){
    const supabase=getSupabase();
    if(!supabase)return;
    setSavingPreference(true);
    setError("");
    const {error:prefError}=await supabase
      .from("datanest_user_preferences")
      .upsert({user_id:currentUserId,ui_complexity:mode,updated_at:new Date().toISOString()},{onConflict:"user_id"});
    if(prefError)setError(prefError.message);
    else {
      setWorkspace(current=>current?{...current,ui_complexity:mode}:current);
      setIntelligence(current=>current?{
        ...current,
        preferences:{...current.preferences,ui_complexity:mode}
      }:current);
    }
    setSavingPreference(false);
  }

  async function setIntelligencePreference(field:"ranking_opt_in"|"squad_opt_in",value:boolean){
    const supabase=getSupabase();
    if(!supabase)return;
    setSavingPreference(true);
    setError("");
    const {error:prefError}=await supabase
      .from("datanest_user_preferences")
      .upsert({
        user_id:currentUserId,
        [field]:value,
        updated_at:new Date().toISOString()
      },{onConflict:"user_id"});
    if(prefError)setError(prefError.message);
    else setIntelligence(current=>current?{
      ...current,
      preferences:{...current.preferences,[field]:value}
    }:current);
    setSavingPreference(false);
  }

  async function toggleInterest(key:WorkFocusKey){
    const supabase=getSupabase();
    if(!supabase)return;
    const next=interestKeys.includes(key)
      ? interestKeys.filter(item=>item!==key)
      : normalizeWorkFocusKeys([...interestKeys,key]);
    setSavingPreference(true);
    setError("");
    const {error:prefError}=await supabase
      .from("datanest_user_preferences")
      .upsert({
        user_id:currentUserId,
        interest_keys:next,
        updated_at:new Date().toISOString()
      },{onConflict:"user_id"});
    if(prefError)setError(prefError.message);
    else setInterestKeys(next);
    setSavingPreference(false);
  }

  async function refreshIntelligence(){
    const supabase=getSupabase();
    if(!supabase||!canReview)return;
    setRefreshingIntelligence(true);
    setError("");
    const {error:refreshError}=await supabase.rpc("refresh_contribution_intelligence_v1",{
      target_project:projectId
    });
    if(refreshError)setError(refreshError.message);
    else await load();
    setRefreshingIntelligence(false);
  }

  if(loading)return <section className="panel"><p className="muted">Loading stakeholder workspace…</p></section>;
  if(error&&!workspace)return <section className="panel" role="alert"><h2>Stakeholder workspace needs attention</h2><p>Contribution profiles, governed evidence and participation state appear here when the project workspace is available.</p><div className="notice errorNotice">{error}</div><button className="secondaryButton compact" type="button" onClick={()=>void load()}>Retry stakeholder workspace</button></section>;
  if(!workspace)return <section className="panel"><h2>Stakeholder workspace unavailable</h2><p>Contribution profiles, evidence, reputation and governed participation state belong here. Retry the workspace before making contribution decisions.</p><button className="secondaryButton compact" type="button" onClick={()=>void load()}>Retry stakeholder workspace</button></section>;

  const simple=workspace.ui_complexity!=="detailed";
  const stakeholder=workspace.stakeholder||{};
  const profile=workspace.profile||{};
  const counts=workspace.counts||{};
  const rolling=intelligence?.rolling_90||{};
  const lifetime=intelligence?.lifetime||{};
  const progression=intelligence?.progression||{};
  const squadMembership=intelligence?.active_squad_membership||{};
  const weights=intelligence?.model?.weights||{};

  return <>
    {error&&<div className="notice errorNotice">{error}</div>}

    <section className="panel" aria-label="Stakeholder workspace overview">
      <PageHeader
        eyebrow="DISCOVER · STAKEHOLDER"
        title="Contribution discovery workspace"
        description="Review contribution evidence, reputation and work interests without conflating participation with legal ownership or authority."
        primaryAction={<button className="secondaryButton compact" type="button" onClick={()=>void load()}>Refresh</button>}
        meta={<StatusIndicator label={simple?"Simple view":"Detailed view"} tone="info" detail={canReview?"Human review controls available":"Contribution evidence view"}/>}
      />
    </section>
    <EvidencePanel
      title="Stakeholder evidence"
      items={[
        {label:"Project Sparks",value:fmt(projectSparks)},
        {label:"Submitted contributions",value:String(Number(counts.submitted||0))},
        {label:"Verified contributions",value:String(Number(counts.verified||0))},
        {label:"Certified · rolling 90 days",value:String(Number(rolling.certified_contributions||0))}
      ]}
    />

    <section className="heroPanel">
      <div>
        <p className="eyebrow">STAKEHOLDER CONTRIBUTION</p>
        <h2>Your DataNest contribution workspace</h2>
        <p>Accepted impact, evidence, reputation and Sparks are governed separately from legal ownership, royalties and project authority.</p>
        <div className="heroActions">
          <button
            className={simple?"primaryButton compact":"secondaryButton compact"}
            disabled={savingPreference}
            onClick={()=>void setComplexity("simple")}
          >Simple UI</button>
          <button
            className={!simple?"primaryButton compact":"secondaryButton compact"}
            disabled={savingPreference}
            onClick={()=>void setComplexity("detailed")}
          >Detailed UI</button>
          <button className="secondaryButton compact" onClick={()=>void load()}>Refresh</button>
          {canReview&&<button
            className="secondaryButton compact"
            disabled={refreshingIntelligence}
            onClick={()=>void refreshIntelligence()}
          >{refreshingIntelligence?"Refreshing intelligence…":"Refresh Intelligence"}</button>}
        </div>
      </div>
      <div className="stackDiagram">
        <div>Evidence <b>Submitted</b></div>
        <span>↓</span>
        <div>Contribution <b>Verified + Accepted</b></div>
        <span>↓</span>
        <div>Value <b>Scored + Certified</b></div>
        <span>↓</span>
        <div>Reputation <b>Human-governed intelligence</b></div>
      </div>
    </section>

    <section className="metricGrid">
      <article className="metricCard"><span>Project Sparks</span><strong>{fmt(projectSparks)}</strong><small>Internal project utility</small></article>
      <article className="metricCard"><span>Contribution share</span><strong>{fmt(stakeholder.contribution_share_percent)}%</strong><small>Not legal ownership</small></article>
      <article className="metricCard"><span>90-day reputation</span><strong>{score(rolling.aggregate_score)}</strong><small>{rolling.eligible_for_ranking?"Eligible for ranking":"Not currently ranked"}</small></article>
      <article className="metricCard"><span>Project rank</span><strong>{rank(rolling.rank)}</strong><small>Rolling 90-day window</small></article>
    </section>

    <section className="panel">
      <div className="panelHead">
        <div><p className="eyebrow">CONTRIBUTION INTELLIGENCE</p><h3>Impact, trust and progression</h3></div>
        <span className="countPill">{String(intelligence?.model?.model_version||"Awaiting first snapshot")}</span>
      </div>
      <div className="metricGrid">
        <article className="metricCard"><span>Lifetime reputation</span><strong>{score(lifetime.aggregate_score)}</strong><small>Frozen snapshot history</small></article>
        <article className="metricCard"><span>Trust score</span><strong>{score(rolling.trust_score)}</strong><small>Only confirmed signals reduce trust</small></article>
        <article className="metricCard"><span>Anomaly score</span><strong>{score(rolling.anomaly_score)}</strong><small>Open signals are review flags, not penalties</small></article>
        <article className="metricCard"><span>Certified contributions</span><strong>{Number(rolling.certified_contributions||0)}</strong><small>Rolling 90 days</small></article>
      </div>
      <dl className="settingsList">
        <div><dt>Ranking participation</dt><dd><button className="secondaryButton compact" disabled={savingPreference} onClick={()=>void setIntelligencePreference("ranking_opt_in",!(intelligence?.preferences?.ranking_opt_in??true))}>{intelligence?.preferences?.ranking_opt_in===false?"Opt in":"Opt out"}</button></dd></div>
        <div><dt>N0nymous Squad consideration</dt><dd><button className="secondaryButton compact" disabled={savingPreference} onClick={()=>void setIntelligencePreference("squad_opt_in",!(intelligence?.preferences?.squad_opt_in??false))}>{intelligence?.preferences?.squad_opt_in?"Leave consideration":"Join consideration"}</button></dd></div>
        <div><dt>Current lifecycle</dt><dd>{label(profile.lifecycle_stage||"active_stakeholder")}</dd></div>
        <div><dt>Progression recommendation</dt><dd>{progression.recommended_stage?label(progression.recommended_stage):"No pending recommendation"}</dd></div>
      </dl>
      <p className="muted">Reputation weights: impact {fmt(Number(weights.impact||0)*100)}%, quality {fmt(Number(weights.quality||0)*100)}%, collaboration/mentoring {fmt(Number(weights.collaboration_mentoring||0)*100)}%, governance {fmt(Number(weights.governance||0)*100)}%, reusable knowledge {fmt(Number(weights.reusable_knowledge||0)*100)}%. Progression recommendations require human approval and never grant a project role automatically.</p>
    </section>

    <section className="panel">
      <div className="panelHead"><div><p className="eyebrow">USER INTERESTS</p><h3>Work areas you want to see</h3></div><span className="countPill">{interestKeys.length+" selected"}</span></div>
      <p className="muted">These interests connect directly to UNIFI Job requirement sections and TranScheduler relevance matching. They do not change Job priority, execution authority, contribution scores, or access permissions.</p>
      <p className="interestDemandSummary">{interestDemandJobCount?interestDemandJobCount+" open Jobs mapped across requirement sections.":"No open Jobs currently expose requirement-section demand."}</p>
      <div className="workFocusGrid stakeholderInterestGrid">
        {WORK_FOCUS_AREAS.map(item=><label key={item.key} title={item.description}><input type="checkbox" disabled={savingPreference} checked={interestKeys.includes(item.key)} onChange={()=>void toggleInterest(item.key)}/><span><b>{item.label}</b><small>{item.description}</small><button className="interestDemandBadge" type="button" disabled={interestDemand[item.key]===0} aria-label={interestDemand[item.key]+" open Jobs require "+item.label} onClick={event=>{event.preventDefault();event.stopPropagation();onOpenRequirementJobs(item.key);}}>{interestDemand[item.key]+" open "+(interestDemand[item.key]===1?"Job":"Jobs")}</button></span></label>)}
      </div>
      <div className="heroActions">
        <button className="primaryButton compact" type="button" disabled={interestKeys.length===0||savingPreference} onClick={onOpenMatchedJobs}>Open matched Jobs</button>
        <span className="muted">{interestKeys.length===0?"Select at least one interest to open a matched TranScheduler view.":"Opens TranScheduler with My interests enabled and Interest relevance selected."}</span>
      </div>
    </section>

    <section className="panel">
      <div className="panelHead"><div><p className="eyebrow">N0NYMOUS SQUAD</p><h3>Rolling top contributors</h3></div><span className="countPill">{intelligence?.squad?.length||0}/10</span></div>
      {Boolean(squadMembership.member_code)&&<div className="notice goodNotice">You are currently {String(squadMembership.member_code)} at rank #{String(squadMembership.rank)}.</div>}
      {intelligence?.squad?.length?<div className="dataTable">
        <div className="dataRow headerRow"><span>Member</span><span>Rank</span><span>Reputation</span><span>Trust</span><span>Authority</span></div>
        {intelligence.squad.map(member=><div className="dataRow" key={member.member_code}>
          <b>{member.member_code}</b>
          <span>#{member.rank}</span>
          <span>{score(member.aggregate_score)}</span>
          <span>{score(member.trust_score)}</span>
          <span>None granted</span>
        </div>)}
      </div>:<div className="emptyState"><div>◇</div><h3>No active Squad snapshot yet</h3><p>An owner/admin can refresh Contribution Intelligence after certified contributions exist.</p></div>}
      <p className="muted">Squad membership is pseudonymous recognition only. It does not grant admin, reviewer, legal ownership or financial authority.</p>
    </section>

    <section className="panel">
      <div className="panelHead">
        <div><p className="eyebrow">PIPELINE</p><h3>Contribution lifecycle</h3></div>
        <span className="countPill">{String(workspace.scoring_model_version||"No active model")}</span>
      </div>
      <div className="metricGrid">
        <article className="metricCard"><span>Submitted / review</span><strong>{Number(counts.submitted||0)}</strong><small>Not yet accepted</small></article>
        <article className="metricCard"><span>Verified</span><strong>{Number(counts.verified||0)}</strong><small>Evidence confirmed</small></article>
        <article className="metricCard"><span>Scored</span><strong>{Number(counts.scored||0)}</strong><small>Versioned scoring applied</small></article>
        <article className="metricCard"><span>Minted</span><strong>{Number(counts.minted||0)}</strong><small>Sparks issued</small></article>
      </div>
    </section>

    {!simple&&<>
      <section className="panel">
        <div className="panelHead"><div><p className="eyebrow">PROFILE</p><h3>Stakeholder state</h3></div>{canReview&&<span className="countPill">Owner/admin review controls</span>}</div>
        <dl className="settingsList">
          <div><dt>Lifecycle</dt><dd>{label(profile.lifecycle_stage||"active_stakeholder")}</dd></div>
          <div><dt>Status</dt><dd>{String(profile.status||"active")}</dd></div>
          <div><dt>Origin</dt><dd>{String(profile.origin||"invite")}</dd></div>
          <div><dt>Tracked points</dt><dd>{fmt(stakeholder.tracked_points)}</dd></div>
          <div><dt>Pending contributions</dt><dd>{fmt(stakeholder.pending_contributions)}</dd></div>
          <div><dt>Platform Sparks</dt><dd>{fmt(platformSparks)}</dd></div>
          <div><dt>Locked Sparks</dt><dd>{fmt(lockedSparks)}</dd></div>
          <div><dt>Approved peer reviews</dt><dd>{Number(lifetime.approved_reviews||0)}</dd></div>
        </dl>
      </section>

      <section className="panel">
        <div className="panelHead"><div><p className="eyebrow">ANTI-GAMING REVIEW</p><h3>Your active anomaly signals</h3></div><span className="countPill">{intelligence?.anomaly_signals?.length||0}</span></div>
        {intelligence?.anomaly_signals?.length?<div className="dataTable">
          <div className="dataRow headerRow"><span>Type</span><span>Severity</span><span>Status</span><span>Confidence</span><span>Detected</span></div>
          {intelligence.anomaly_signals.map(item=><div className="dataRow" key={item.id}>
            <b>{label(item.signal_type)}</b>
            <span>{item.severity}</span>
            <span>{item.status}</span>
            <span>{fmt(Number(item.confidence||0)*100)}%</span>
            <span>{date(item.detected_at)}</span>
          </div>)}
        </div>:<div className="emptyState"><div>✓</div><h3>No active anomaly signals</h3><p>Open signals are review evidence only; they do not reduce reputation until confirmed by an authorized human reviewer.</p></div>}
      </section>

      <section className="panel">
        <div className="panelHead"><div><p className="eyebrow">AUDITABLE CONTRIBUTIONS</p><h3>Your latest contribution events</h3></div><span className="countPill">{contributions.length}</span></div>
        {contributions.length?<div className="dataTable">
          <div className="dataRow headerRow"><span>Trace</span><span>Type</span><span>Lifecycle</span><span>Points</span><span>Date</span></div>
          {contributions.map(item=><div className="dataRow" key={item.id}>
            <b>{item.trace_key||item.id.slice(0,12)}</b>
            <span>{item.contribution_type.replaceAll("_"," ")}</span>
            <span>{item.lifecycle_state.replaceAll("_"," ")}</span>
            <span>{fmt(item.points)}</span>
            <span>{date(item.created_at)}</span>
          </div>)}
        </div>:<div className="emptyState"><div>◇</div><h3>No contribution events yet</h3><p>Accepted project work will appear here as it moves through the governed pipeline.</p></div>}
      </section>

      <section className="panel">
        <p className="eyebrow">ECONOMIC + GOVERNANCE BOUNDARY</p>
        <h3>Separate ledgers, separate meanings</h3>
        <p className="muted">Contribution share is a DataNest calculation. It does not by itself create legal ownership. Sparks are internal utility entries and remain separate from contractual royalty entitlements or royalties payable. Reputation, N0nymous Squad membership and lifecycle recognition do not grant project roles or financial authority.</p>
      </section>
    </>}
  </>;
}
