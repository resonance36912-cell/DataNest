"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {getSupabase} from "@/lib/supabase";
import OwnerDevelopmentAnalytics from "@/components/OwnerDevelopmentAnalytics";

type DashboardDestination=
  |"ai"|"unifi"|"scheduler"|"runs"|"audit"|"governance"
  |"external_auditor"|"transparency"|"settings";

type SummaryLike={
  total:number;
  active:number;
  running:number;
  blocked:number;
  available:number;
  registered:number;
};

type JobLike={
  id:string;
  job_number:number;
  title:string;
  status:string;
  priority:number;
  updated_at:string;
  deadline:string|null;
};

type HealthLike={
  state:"checking"|"online"|"degraded"|"offline";
  checkedAt:string|null;
  message:string;
};

type OptimizerWorkspace={
  settings:{
    enabled:boolean;
    cadence_hours:number;
    last_run_at:string|null;
    last_success_at:string|null;
    next_run_after:string|null;
  };
  pending_count:number;
  runs:Array<{
    id:string;
    status:string;
    suggestion_count:number;
    started_at:string;
  }>;
};

type MonitorWorkspace={
  latest_run:{
    status:string;
    check_count:number;
    failed_count:number;
    started_at:string;
    completed_at:string|null;
  }|null;
  open_alert_count:number;
};

function date(value:string|null|undefined){
  if(!value)return "—";
  return new Intl.DateTimeFormat(undefined,{
    month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"
  }).format(new Date(value));
}

function label(value:string){
  return value.replaceAll("_"," ");
}

function statusClass(value:string){
  const state=value.toLowerCase();
  if(["online","succeeded","active","completed","ready","running"].includes(state))return "good";
  if(["checking","queued","planned","monitor"].includes(state))return "quiet";
  if(["degraded","blocked","manual_action","moderate"].includes(state))return "warn";
  if(["offline","failed","critical","high"].includes(state))return "bad";
  return "quiet";
}

export default function DataNestDashboard({
  projectId,
  projectName,
  role,
  counts,
  jobs,
  runCount,
  checkpointCount,
  eventCount,
  health,
  onNavigate
}:{
  projectId:string;
  projectName:string;
  role:"owner"|"admin"|"operator"|"viewer";
  counts:SummaryLike;
  jobs:JobLike[];
  runCount:number;
  checkpointCount:number;
  eventCount:number;
  health:HealthLike;
  onNavigate:(view:DashboardDestination)=>void;
}){
  const isOwner=role==="owner";
  const [optimizer,setOptimizer]=useState<OptimizerWorkspace|null>(null);
  const [monitor,setMonitor]=useState<MonitorWorkspace|null>(null);
  const [adminLoading,setAdminLoading]=useState(isOwner);
  const [adminError,setAdminError]=useState("");

  const loadAdminState=useCallback(async(silent=false)=>{
    if(!isOwner)return;
    const supabase=getSupabase();
    if(!supabase){
      setAdminError("DataNest backend is not configured.");
      return;
    }
    if(!silent)setAdminLoading(true);
    const [optimizerResult,monitorResult]=await Promise.all([
      supabase.rpc("get_owner_optimizer_workspace_v1",{target_project:projectId}),
      supabase.rpc("get_owner_governance_control_monitor_v1",{target_project:projectId})
    ]);
    const messages=[
      optimizerResult.error?.message,
      monitorResult.error?.message
    ].filter(Boolean);
    if(messages.length){
      setAdminError(messages.join(" · "));
    }else{
      setAdminError("");
      setOptimizer(optimizerResult.data as unknown as OptimizerWorkspace);
      setMonitor(monitorResult.data as unknown as MonitorWorkspace);
    }
    if(!silent)setAdminLoading(false);
  },[isOwner,projectId]);

  useEffect(()=>{
    if(!isOwner)return;
    void loadAdminState();
    const timer=window.setInterval(()=>void loadAdminState(true),30000);
    return()=>window.clearInterval(timer);
  },[isOwner,loadAdminState]);

  const stateCounts=useMemo(()=>{
    const map=new Map<string,number>();
    for(const job of jobs)map.set(job.status,(map.get(job.status)||0)+1);
    return Array.from(map.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5);
  },[jobs]);

  const recent=useMemo(
    ()=>[...jobs].sort((a,b)=>new Date(b.updated_at).getTime()-new Date(a.updated_at).getTime()).slice(0,6),
    [jobs]
  );

  const attentionCount=counts.blocked+(monitor?.open_alert_count||0)+(optimizer?.pending_count||0);
  const operatingTone=health.state==="offline"?"bad":health.state==="degraded"||attentionCount>0?"warn":"good";
  const operatingLabel=health.state==="offline"
    ?"Control plane offline"
    :health.state==="degraded"
      ?"Control plane degraded"
      :attentionCount>0
        ?attentionCount+" item"+(attentionCount===1?"":"s")+" need review"
        :"Operating cleanly";

  const maxState=Math.max(1,...stateCounts.map(([,value])=>value));

  return <div className="controlCenter">
    <section className="controlCenterHero">
      <div className="controlCenterHeroGlow" aria-hidden="true"/>
      <div className="controlCenterHeroCopy">
        <p className="eyebrow">DATANEST CONTROL CENTER</p>
        <h2>{projectName}</h2>
        <p>Live operational view across work, execution, governance, AI optimization, control health and evidence.</p>
        <div className="controlCenterHeroActions">
          <button className="primaryButton" type="button" onClick={()=>onNavigate("ai")}>Open DataNest AI</button>
          <button className="secondaryButton" type="button" onClick={()=>onNavigate("scheduler")}>Open TranScheduler</button>
          <button className="secondaryButton" type="button" onClick={()=>onNavigate("governance")}>Governance</button>
        </div>
      </div>
      <div className="controlCenterStatus">
        <span className={"controlCenterStatusOrb "+operatingTone} aria-hidden="true"/>
        <small>LIVE OPERATING STATE</small>
        <strong>{operatingLabel}</strong>
        <span>{health.message}</span>
        <em>Access · {role}</em>
      </div>
    </section>

    <section className="controlCenterMetrics" aria-label="Project operating metrics">
      <article>
        <span>WORK</span><strong>{counts.active}</strong><small>{counts.total} total manifests</small>
      </article>
      <article>
        <span>EXECUTION</span><strong>{counts.running}</strong><small>{runCount} recorded runs</small>
      </article>
      <article className={counts.blocked>0?"attention":undefined}>
        <span>BLOCKED</span><strong>{counts.blocked}</strong><small>{counts.blocked?"needs scheduling attention":"queue clear"}</small>
      </article>
      <article>
        <span>CAPABILITY</span><strong>{counts.available}</strong><small>{counts.registered} registered</small>
      </article>
      <article>
        <span>CONTINUITY</span><strong>{checkpointCount}</strong><small>durable checkpoints</small>
      </article>
      <article>
        <span>AUDIT</span><strong>{eventCount}</strong><small>loaded event records</small>
      </article>
    </section>

    <section className="controlCenterGrid">
      <article className="controlCenterCard controlCenterFlow">
        <div className="controlCenterCardHead">
          <div><p className="eyebrow">OPERATIONS</p><h3>Work state</h3></div>
          <button className="aiITextButton" type="button" onClick={()=>onNavigate("scheduler")}>Open queue →</button>
        </div>
        <div className="controlCenterStateBars">
          {stateCounts.length?stateCounts.map(([state,value])=><div key={state}>
            <div><span>{label(state)}</span><b>{value}</b></div>
            <i><span className={statusClass(state)} style={{width:Math.max(8,(value/maxState)*100)+"%"}}/></i>
          </div>):<p className="muted">No work has been created yet.</p>}
        </div>
        <div className="controlCenterMiniStats">
          <span><b>{counts.running}</b> running</span>
          <span><b>{counts.blocked}</b> blocked</span>
          <span><b>{counts.active-counts.running}</b> active / not running</span>
        </div>
      </article>

      <article className="controlCenterCard">
        <div className="controlCenterCardHead">
          <div><p className="eyebrow">RECENT WORK</p><h3>Latest Job Manifests</h3></div>
          <button className="aiITextButton" type="button" onClick={()=>onNavigate("unifi")}>Open UNIFI →</button>
        </div>
        <div className="controlCenterJobs">
          {recent.length?recent.map(job=><button key={job.id} type="button" onClick={()=>onNavigate("scheduler")}>
            <span className="controlCenterJobCode">JOB-{job.job_number}</span>
            <span className="controlCenterJobTitle"><b>{job.title}</b><small>Updated {date(job.updated_at)}{job.deadline?" · due "+date(job.deadline):""}</small></span>
            <span className={"controlCenterState "+statusClass(job.status)}>{label(job.status)}</span>
          </button>):<p className="muted">No recent Job Manifests.</p>}
        </div>
      </article>

      <article className="controlCenterCard">
        <div className="controlCenterCardHead">
          <div><p className="eyebrow">GOVERNANCE &amp; AI</p><h3>Human approval boundary</h3></div>
          {isOwner&&<button className="aiITextButton" type="button" onClick={()=>void loadAdminState()}>Refresh →</button>}
        </div>

        {!isOwner&&<div className="controlCenterRestricted">
          <span>◆</span>
          <div>
            <b>{role==="admin"?"Owner approval and control monitor restricted":"Owner controls restricted"}</b>
            <p>{role==="admin"
              ?"Admin can configure and run the DataNest AI System Optimizer in Admin settings. Owner approval and control-monitor administration remain restricted."
              :`Your ${role} role can work in DataNest without receiving optimizer or owner-only control-monitor administration.`}
            </p>
          </div>
        </div>}

        {isOwner&&adminLoading&&!optimizer&&!monitor&&<p className="muted">Loading owner governance state…</p>}
        {isOwner&&adminError&&<div className="errorBanner" role="alert">{adminError}</div>}

        {isOwner&&<div className="controlCenterGovernance">
          <div>
            <small>AUDIT OPTIMIZER</small>
            <strong>{optimizer?.settings.enabled?"Enabled":"Disabled"}</strong>
            <span>{optimizer?.pending_count||0} pending · {optimizer?.settings.cadence_hours||6}h cadence</span>
            <em>Last success {date(optimizer?.settings.last_success_at)}</em>
          </div>
          <div>
            <small>CONTROL MONITOR</small>
            <strong>{monitor?.latest_run?label(monitor.latest_run.status):"No run"}</strong>
            <span>{monitor?.open_alert_count||0} active alerts · {monitor?.latest_run?.check_count||0} checks</span>
            <em>{monitor?.latest_run?.failed_count||0} findings in latest run</em>
          </div>
        </div>}

        <div className="controlCenterBoundary">
          <span><b>Human approval</b><small>Required</small></span>
          <span><b>AI vote</b><small>Not allowed</small></span>
          <span><b>Auto deploy</b><small>Not allowed</small></span>
          <span><b>Evidence = truth</b><small>No</small></span>
        </div>

        <div className="rowActions">
          <button className="secondaryButton compact" type="button" onClick={()=>onNavigate("governance")}>Governance workspace</button>
          {(role==="owner"||role==="admin")&&<button className="secondaryButton compact" type="button" onClick={()=>onNavigate("settings")}>Admin settings</button>}
        </div>
      </article>

      <article className="controlCenterCard controlCenterEvidence">
        <div className="controlCenterCardHead">
          <div><p className="eyebrow">EVIDENCE</p><h3>Verification surface</h3></div>
          <button className="aiITextButton" type="button" onClick={()=>onNavigate("transparency")}>Transparency →</button>
        </div>
        <div className="controlCenterEvidenceGrid">
          <button type="button" onClick={()=>onNavigate("runs")}><span>▶</span><b>Runs</b><small>{runCount} execution records</small></button>
          <button type="button" onClick={()=>onNavigate("audit")}><span>≡</span><b>Audit</b><small>{eventCount} loaded events</small></button>
          <button type="button" onClick={()=>onNavigate("external_auditor")}><span>◫</span><b>External Auditor</b><small>Evidence-linked assessments</small></button>
          <button type="button" onClick={()=>onNavigate("transparency")}><span>◎</span><b>Transparency</b><small>Published methods &amp; findings</small></button>
        </div>
      </article>
    </section>

    {isOwner&&<OwnerDevelopmentAnalytics projectId={projectId}/>}


  </div>;
}
