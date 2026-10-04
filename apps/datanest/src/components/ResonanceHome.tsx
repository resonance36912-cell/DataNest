"use client";

import { useMemo } from "react";
import CollaborationVisual, { type ProductHeroTarget } from "./CollaborationVisual";
import PurposeJourney from "./PurposeJourney";
import PageHeader from "@/components/platform/PageHeader";
import StatusIndicator from "@/components/platform/StatusIndicator";

type HomeDestination = "ai" | "unifi" | "scheduler" | "governance" | "thinktank" | "sparks" | "products" | "transparency";
type ProjectLike = { id:string; name:string; description:string|null };
type JobLike = { id:string; status:string; created_at:string };
type SummaryLike = { total:number; active:number; running:number; blocked:number; available:number; registered:number };

const dayFormatter = new Intl.DateTimeFormat(undefined,{weekday:"short",timeZone:"UTC"});

function statusTone(status:string) {
  const value=status.toUpperCase();
  if(["COMPLETED","READY"].includes(value)) return "complete";
  if(["RUNNING","QUEUED","MATCHING"].includes(value)) return "live";
  if(["BLOCKED","MANUAL_ACTION","PAUSED"].includes(value)) return "warn";
  return "quiet";
}

export default function ResonanceHome({
  project,
  jobs,
  counts,
  canOperate,
  onNavigate
}:{
  project:ProjectLike;
  jobs:JobLike[];
  counts:SummaryLike;
  canOperate:boolean;
  onNavigate:(view:HomeDestination)=>void;
}) {
  const pulse=useMemo(()=>{
    const today=new Date();
    today.setUTCHours(0,0,0,0);
    return Array.from({length:7},(_,offset)=>{
      const date=new Date(today);
      date.setUTCDate(today.getUTCDate()-(6-offset));
      const next=new Date(date);
      next.setUTCDate(date.getUTCDate()+1);
      const value=jobs.filter(job=>{
        const created=new Date(job.created_at);
        return created>=date&&created<next;
      }).length;
      return {label:dayFormatter.format(date),date:date.toISOString().slice(0,10),value};
    });
  },[jobs]);

  const maxPulse=Math.max(1,...pulse.map(item=>item.value));
  const points=pulse.map((item,index)=>{
    const x=8+(index/(pulse.length-1))*84;
    const y=56-(item.value/maxPulse)*42;
    return {x,y,...item};
  });
  const polyline=points.map(point=>point.x+","+point.y).join(" ");

  const states=useMemo(()=>{
    const tally=new Map<string,number>();
    jobs.forEach(job=>tally.set(job.status,(tally.get(job.status)||0)+1));
    return Array.from(tally.entries())
      .sort((a,b)=>b[1]-a[1])
      .map(([status,value])=>({status,value,tone:statusTone(status)}));
  },[jobs]);
  const maxState=Math.max(1,...states.map(item=>item.value));

  const activeRate=counts.total ? Math.round((counts.active/counts.total)*100) : 0;
  const runningRate=counts.active ? Math.round((counts.running/counts.active)*100) : 0;

  const currentObjective=counts.blocked>0
    ?counts.blocked+" blocked Job"+(counts.blocked===1?"":"s")+" need operational attention."
    :counts.running>0
      ?counts.running+" Job"+(counts.running===1?" is":"s are")+" currently executing."
      :"Review the current project state and continue governed work.";

  return <div className="resonanceHome">
    <section className="panel homeIntentBar" aria-label="Current project intent">
      <PageHeader
        eyebrow="ACTIVE PROJECT"
        title={project.name}
        description={currentObjective}
        primaryAction={<button className="primaryButton compact" type="button" onClick={()=>{
          if(counts.blocked>0) onNavigate("scheduler");
          else if(!counts.total && canOperate) onNavigate("unifi");
          else onNavigate("ai");
        }}>{counts.blocked>0?"Review blocked work":!counts.total&&canOperate?"Create governed work":"Open DataNest AI"}</button>}
        meta={<StatusIndicator label={canOperate?"Operator access":"Viewer access"} tone={canOperate?"success":"neutral"} detail={counts.blocked>0?"Operational attention required":"Human direction remains authoritative"}/>}
      />
      <div className="homeIntentMeta">
        <span>{counts.total} total manifests</span>
        <i aria-hidden="true">·</i>
        <span>{counts.running} running</span>
        <i aria-hidden="true">·</i>
        <span>{counts.blocked} blocked</span>
      </div>
    </section>

    <section className="aiIHero" aria-labelledby="ai-i-title">
      <div className="aiIAmbient" aria-hidden="true">
        <span className="ambientOrb orbOne"/>
        <span className="ambientOrb orbTwo"/>
        <span className="ambientGrid"/>
      </div>

      <div className="aiIHeroCopy">
        <div className="aiIEyebrow"><span className="signalDot"/> RESONANCE DATANEST · AI &amp; I</div>
        <h2 id="ai-i-title">Human intent.<br/><span>AI amplification.</span></h2>
        <p>{project.description||"A governed workspace where human direction and DataNest AI meet in one traceable operating system."}</p>
        <div className="aiIHeroActions">
          <button className="aiIPrimary" type="button" onClick={()=>onNavigate("ai")}>
            <span>Enter DataNest AI</span><b aria-hidden="true">↗</b>
          </button>
          <button className="aiIGhost" type="button" disabled={!canOperate} onClick={()=>onNavigate("unifi")}>
            {canOperate?"Create governed work":"Viewer mode"}
          </button>
        </div>
        <div className="datanextTelemetry" aria-label="DataNest workspace status">
          <span className="datanextTelemetryItem"><i aria-hidden="true" className="datanextPulse" /> WORKSPACE <b>READY</b></span>
          <span className="datanextTelemetryDivider" aria-hidden="true">/</span>
          <span className="datanextTelemetryItem">WORK <b>{counts.active}</b> ACTIVE</span>
          <span className="datanextTelemetryDivider" aria-hidden="true">/</span>
          <span className={"datanextTelemetryItem "+(counts.blocked>0?"warn":"")} >BLOCKED <b>{counts.blocked}</b></span>
          <span className="datanextTelemetryDivider" aria-hidden="true">/</span>
          <span className="datanextTelemetryItem">MODE <b>{canOperate?"OPERATOR":"VIEWER"}</b></span>
        </div>
        <div className="aiIMicroStats" aria-label="Current DataNest operating state">
          <span><b>{counts.active}</b> active</span>
          <span><b>{counts.running}</b> running</span>
          <span><b>{counts.blocked}</b> blocked</span>
        </div>
      </div>

      <CollaborationVisual
        projectId={project.id}
        onOpenProducts={(target?:ProductHeroTarget)=>{
          const url=new URL(window.location.href);
          if(target?.product)url.searchParams.set("product",target.product);
          else url.searchParams.delete("product");
          if(target?.recordType)url.searchParams.set("recordType",target.recordType);
          else url.searchParams.delete("recordType");
          if(target?.q)url.searchParams.set("q",target.q);
          else url.searchParams.delete("q");
          window.history.replaceState(window.history.state,"",url.toString());
          onNavigate("products");
        }}
      />
    </section>

    <PurposeJourney onNavigate={onNavigate}/>

    <section className="aiIStatsGrid" aria-label="DataNest project metrics">
      <article>
        <span className="metricSignal cyan"/>
        <div><small>Total work</small><strong>{counts.total}</strong><em>job manifests</em></div>
      </article>
      <article>
        <span className="metricSignal blue"/>
        <div><small>Active field</small><strong>{activeRate}%</strong><em>{counts.active} of {counts.total||0}</em></div>
      </article>
      <article>
        <span className="metricSignal green"/>
        <div><small>Execution</small><strong>{runningRate}%</strong><em>{counts.running} of {counts.active||0} active</em></div>
      </article>
      <article>
        <span className="metricSignal amber"/>
        <div><small>Constraint load</small><strong>{counts.blocked}</strong><em>need attention</em></div>
      </article>
    </section>

    <section className="aiIDataGrid">
      <article className="aiIGraphCard pulseCard">
        <div className="aiICardHead">
          <div><p className="eyebrow">WORK PULSE</p><h3>Recent creation signal</h3></div>
          <span className="aiILiveBadge">LOADED SNAPSHOT · UTC</span>
        </div>
        <div className="pulsePlot" role="img" aria-label={"Loaded jobs created over seven UTC days: "+pulse.map(item=>item.date+" "+item.value).join(", ")}>
          <svg viewBox="0 0 100 62" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="pulseFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity=".25"/>
                <stop offset="100%" stopColor="currentColor" stopOpacity="0"/>
              </linearGradient>
            </defs>
            {[14,35,56].map(y=><line key={y} x1="8" x2="92" y1={y} y2={y} className="pulseGridLine"/>)}
            <path className="pulseArea" d={"M "+points[0].x+" 58 L "+points.map(point=>point.x+" "+point.y).join(" L ")+" L "+points[points.length-1].x+" 58 Z"}/>
            <polyline className="pulseLine" points={polyline}/>
            {points.map(point=><circle key={point.x} className="pulsePoint" cx={point.x} cy={point.y} r="1.4"/>)}
          </svg>
          <div className="pulseAxis">{pulse.map(item=><span key={item.date}><b>{item.value}</b>{item.label}</span>)}</div>
        </div>
        <p className="aiIGraphNote">{jobs.length} latest loaded jobs; this is a sample, not the full project history. Day boundaries use Universal Time (UTC).</p>
      </article>

      <article className="aiIGraphCard stateCard">
        <div className="aiICardHead">
          <div><p className="eyebrow">STATE FIELD</p><h3>Recent work distribution</h3></div>
          <button className="aiITextButton" type="button" onClick={()=>onNavigate("scheduler")}>Open queue →</button>
        </div>
        <div className="stateBars">
          {states.length?states.map(item=><div className="stateBarRow" key={item.status}>
            <div className="stateBarMeta"><span>{item.status.replaceAll("_"," ")}</span><b>{item.value}</b></div>
            <div className="stateBarTrack"><span className={item.tone} style={{width:Math.max(7,(item.value/maxState)*100)+"%"}}/></div>
          </div>):<div className="aiIEmptyGraph">No work loaded yet. Create your first governed job to start the timeline.</div>}
        </div>
      </article>
    </section>

  </div>;
}
