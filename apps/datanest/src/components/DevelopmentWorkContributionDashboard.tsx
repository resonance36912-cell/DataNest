"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";

type TrendSignal="quiet"|"new"|"rising"|"steady"|"cooling";

type DevelopmentSection={
  expertise_section:string;
  expertise_label:string;
  verification_track:string;
  input_count:number;
  pending_count:number;
  verified_count:number;
  rejected_count:number;
  verified_project_impact:number;
  avg_impact:number;
  latest_verification_state:string;
  trend_signal:TrendSignal;
  recent_7d_inputs:number;
  previous_7d_inputs:number;
};

type QueueItem={
  id:string;
  job_id:string|null;
  expertise_section:string;
  expertise_label:string;
  verification_track:string;
  verification_state:string;
  lifecycle_state:string;
  certification_state:string;
  impact_score:number;
  verified_project_impact:number;
  content:string;
  created_at:string;
};

type Dashboard={
  routing_version:string;
  scoring_version:string;
  viewer_scope:"project"|"user";
  summary:{
    input_count:number;
    pending_count:number;
    verified_count:number;
    rejected_count:number;
    verified_project_impact:number;
    avg_impact:number;
  };
  sections:DevelopmentSection[];
  queue:QueueItem[];
  policy:{
    trend_window_days:number;
    trend_signal_is_activity_only:boolean;
    raw_activity_never_awards_points:boolean;
    verification_source:string;
    impact_source:string;
  };
};

function isDashboard(value:unknown):value is Dashboard{
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const candidate=value as Partial<Dashboard>;
  return Boolean(
    candidate.summary&&typeof candidate.summary==="object"&&
    Array.isArray(candidate.sections)&&
    Array.isArray(candidate.queue)&&
    candidate.policy&&typeof candidate.policy==="object"
  );
}

function trendLabel(signal:TrendSignal){
  if(signal==="new")return "NEW";
  if(signal==="rising")return "RISING";
  if(signal==="cooling")return "COOLING";
  if(signal==="steady")return "STEADY";
  return "QUIET";
}

function stateLabel(item:QueueItem){
  if(item.certification_state==="CERTIFIED")return "CERTIFIED";
  if(item.verification_state==="REJECTED"||item.lifecycle_state==="REJECTED")return "REJECTED";
  if(item.verification_state==="VERIFIED")return "VERIFIED";
  return item.lifecycle_state.replaceAll("_"," ");
}

export default function DevelopmentWorkContributionDashboard({
  projectId,
  refreshToken
}:{projectId:string;refreshToken:string|number}){
  const [dashboard,setDashboard]=useState<Dashboard|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [selectedSection,setSelectedSection]=useState("ALL");

  const load=useCallback(async()=>{
    const supabase=getSupabase();
    if(!supabase)return;
    setLoading(true);
    const {data,error:rpcError}=await supabase.rpc("get_development_work_contribution_dashboard_v1",{
      target_project:projectId
    });
    if(rpcError){
      setError(rpcError.message);
      setLoading(false);
      return;
    }
    if(!isDashboard(data)){
      setDashboard(null);
      setError("Development Work contribution dashboard is not available in this environment yet.");
      setLoading(false);
      return;
    }
    setDashboard(data);
    setError("");
    setLoading(false);
  },[projectId]);

  useEffect(()=>{void load();},[load,refreshToken]);

  const visibleQueue=useMemo(()=>{
    if(!dashboard)return [];
    const scoped=selectedSection==="ALL"
      ?dashboard.queue
      :dashboard.queue.filter(item=>item.expertise_section===selectedSection);
    return scoped.slice(0,8);
  },[dashboard,selectedSection]);

  if(loading&&!dashboard)return <details className="datanestAiContributionDashboard">
    <summary><span><small>DEVELOPMENT WORK · CONTRIBUTIONS</small><b>Synchronising verification queue…</b></span></summary>
  </details>;

  if(error&&!dashboard)return <details className="datanestAiContributionDashboard">
    <summary><span><small>DEVELOPMENT WORK · CONTRIBUTIONS</small><b>Verification dashboard unavailable</b></span></summary>
    <div className="datanestAiContributionBody"><p className="muted">{error}</p><button type="button" className="secondaryButton compact" onClick={()=>void load()}>Retry</button></div>
  </details>;

  if(!dashboard)return null;
  const summary=dashboard.summary;

  return <details className="datanestAiContributionDashboard">
    <summary>
      <span className="datanestAiContributionTitle">
        <small>DEVELOPMENT WORK · CONTRIBUTIONS</small>
        <b>Verification queue &amp; project impact</b>
      </span>
      <span className="datanestAiContributionPulse" aria-label="Development Work contribution status">
        <i>{summary.pending_count} pending</i>
        <i>{summary.verified_count} verified</i>
        <i>{Math.round(summary.verified_project_impact)} impact pts</i>
      </span>
    </summary>
    <div className="datanestAiContributionBody">
      <div className="datanestAiContributionHead">
        <p>Each expertise route is read from governed contribution evidence. The trend pulse measures recent routed activity only; it never creates points or verification.</p>
        <button type="button" className="secondaryButton compact" disabled={loading} onClick={()=>void load()}>{loading?"Refreshing…":"Refresh"}</button>
      </div>

      <div className="datanestAiContributionSections" aria-label="Development Work verification by expertise">
        <button type="button" className={selectedSection==="ALL"?"active":""} onClick={()=>setSelectedSection("ALL")}>
          <span><b>All expertise</b><small>{summary.input_count} routed inputs</small></span>
          <strong>{Math.round(summary.verified_project_impact)} pts</strong>
        </button>
        {dashboard.sections.map(section=><button
          type="button"
          key={section.expertise_section}
          className={selectedSection===section.expertise_section?"active":""}
          onClick={()=>setSelectedSection(section.expertise_section)}
        >
          <span>
            <b>{section.expertise_label}</b>
            <small>{section.pending_count} pending · {section.verified_count} verified</small>
          </span>
          <span className="datanestAiContributionSectionMeta">
            <i className={"trend "+section.trend_signal}>{trendLabel(section.trend_signal)}</i>
            <strong>{Math.round(section.verified_project_impact)} pts</strong>
          </span>
        </button>)}
      </div>

      <div className="datanestAiContributionQueue">
        <div className="datanestAiContributionQueueHead">
          <span><b>Verification queue</b><small>{selectedSection==="ALL"?"Latest routed Development Work":dashboard.sections.find(item=>item.expertise_section===selectedSection)?.expertise_label}</small></span>
          <small>{dashboard.viewer_scope==="project"?"PROJECT SCOPE":"YOUR CONTRIBUTIONS"}</small>
        </div>
        {visibleQueue.length?visibleQueue.map(item=><article key={item.id}>
          <div>
            <span className="datanestAiContributionState">{stateLabel(item)}</span>
            <b>{item.expertise_label}</b>
            <small>{new Date(item.created_at).toLocaleString()}</small>
          </div>
          <p>{item.content}</p>
          <div className="datanestAiContributionImpact">
            <span>Impact <b>{Math.round(item.impact_score)}</b></span>
            <span>Verified project impact <b>{Math.round(item.verified_project_impact)} pts</b></span>
            <span>Track <b>{item.verification_track.replaceAll("_"," ")}</b></span>
          </div>
        </article>):<div className="emptyState datanestAiContributionEmpty"><div>◇</div><h3>No routed inputs here yet</h3><p>Choose another expertise section or submit Development Work through the command channel.</p></div>}
      </div>

      <p className="datanestAiContributionPolicy">
        {dashboard.scoring_version} · 7-day trend pulse vs prior 7 days · raw activity never awards points · verification evidence remains separate from scoring.
      </p>
    </div>
  </details>;
}
