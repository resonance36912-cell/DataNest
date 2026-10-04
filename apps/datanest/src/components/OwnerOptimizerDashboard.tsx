"use client";

import { useCallback,useEffect,useMemo,useState } from "react";
import { getSupabase } from "@/lib/supabase";
import GovernanceControlMonitor from "@/components/GovernanceControlMonitor";

type OptimizerSettings={
  project_id:string;
  enabled:boolean;
  cadence_hours:number;
  max_suggestions:number;
  last_run_at:string|null;
  last_success_at:string|null;
  next_run_after:string|null;
  updated_at:string;
};

type OptimizerRun={
  id:string;
  request_key:string;
  trigger_kind:"cron"|"owner"|"admin";
  status:"running"|"succeeded"|"failed"|"denied";
  summary:string|null;
  limitations:string[];
  suggestion_count:number;
  error_category:string|null;
  error_message:string|null;
  started_at:string;
  completed_at:string|null;
  created_at:string;
};

type OptimizerSuggestion={
  id:string;
  run_id:string;
  trace_key:string;
  title:string;
  problem_statement:string;
  hypothesis:string;
  desired_outcome:string;
  proposed_change:Record<string,unknown>;
  guardrails:Record<string,unknown>;
  evidence_refs:string[];
  standard_refs:string[];
  risk_class:"low"|"moderate"|"high"|"critical";
  confidence:number|null;
  status:"proposed"|"approved"|"rejected";
  reviewed_at:string|null;
  review_rationale:string|null;
  linked_observation_id:string|null;
  linked_improvement_candidate_id:string|null;
  governance_effect:boolean;
  deployment_authority:boolean;
  created_at:string;
};

type OptimizerWorkspace={
  role:"owner"|"admin";
  can_manage:boolean;
  can_approve:boolean;
  settings:OptimizerSettings;
  runs:OptimizerRun[];
  suggestions:OptimizerSuggestion[];
  pending_count:number;
  boundaries:Record<string,unknown>;
};

function date(value:string|null|undefined){
  if(!value)return "—";
  return new Intl.DateTimeFormat(undefined,{
    year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"
  }).format(new Date(value));
}

function label(value:string){
  return value.replaceAll("_"," ");
}

function suggestionLane(item:OptimizerSuggestion){
  const lane=String(item.proposed_change?.lane||"cross_system");
  const labels:Record<string,string>={
    audit_optimizer:"Audit Optimizer",
    workflow_reviewer:"Workflow Reviewer",
    code_cleaner:"Code Cleaner",
    cross_system:"Cross-system"
  };
  return labels[lane]||label(lane);
}

export default function OwnerOptimizerDashboard({projectId}:{projectId:string}){
  const [workspace,setWorkspace]=useState<OptimizerWorkspace|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState("");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [enabled,setEnabled]=useState(true);
  const [cadence,setCadence]=useState(6);
  const [maxSuggestions,setMaxSuggestions]=useState(5);
  const [rationales,setRationales]=useState<Record<string,string>>({});

  const load=useCallback(async(silent=false)=>{
    const supabase=getSupabase();
    if(!supabase)return;
    if(!silent)setLoading(true);
    const {data,error:loadError}=await supabase.rpc("get_owner_optimizer_workspace_v1",{
      target_project:projectId
    });
    if(loadError){
      setError(loadError.message);
      if(!silent)setLoading(false);
      return;
    }
    const next=data as unknown as OptimizerWorkspace;
    setWorkspace(next);
    setEnabled(Boolean(next.settings?.enabled));
    setCadence(Number(next.settings?.cadence_hours||6));
    setMaxSuggestions(Number(next.settings?.max_suggestions||5));
    if(!silent)setLoading(false);
  },[projectId]);

  useEffect(()=>{
    void load();
    const timer=window.setInterval(()=>void load(true),30000);
    return ()=>window.clearInterval(timer);
  },[load]);

  const pending=useMemo(
    ()=>workspace?.suggestions.filter(item=>item.status==="proposed")||[],
    [workspace]
  );

  async function runAction(key:string,task:()=>Promise<void>){
    setBusy(key);setError("");setNotice("");
    try{await task();}
    catch(err){setError(err instanceof Error?err.message:"Optimizer operation failed.");}
    finally{setBusy("");}
  }

  function saveSettings(){
    void runAction("settings",async()=>{
      const supabase=getSupabase();
      if(!supabase)throw new Error("DataNest backend is not configured.");
      const {error:saveError}=await supabase.rpc("set_optimizer_settings_v1",{
        target_project:projectId,
        target_enabled:enabled,
        target_cadence_hours:cadence,
        target_max_suggestions:maxSuggestions
      });
      if(saveError)throw saveError;
      await load(true);
      setNotice(enabled
        ?`Continuous optimization enabled every ${cadence} hours. Suggestions still require owner approval.`
        :"Continuous optimizer scheduling disabled. Existing suggestions remain available for review."
      );
    });
  }

  function runNow(){
    void runAction("run",async()=>{
      const supabase=getSupabase();
      if(!supabase)throw new Error("DataNest backend is not configured.");
      const {data,error:invokeError}=await supabase.functions.invoke("audit-optimizer",{
        body:{action:"run",projectId,requestKey:crypto.randomUUID()}
      });
      if(invokeError)throw invokeError;
      if(data?.error)throw new Error(String(data.error));
      await load(true);
      setNotice(data?.skipped
        ?`Optimizer did not start: ${String(data.reason||"not due")}.`
        :`Optimizer run completed with ${Number(data?.suggestionCount||0)} new suggestion(s).`
      );
    });
  }

  function review(item:OptimizerSuggestion,decision:"approve"|"reject"){
    void runAction(`review:${item.id}`,async()=>{
      const rationale=(rationales[item.id]||"").trim();
      if(rationale.length<3)throw new Error("Add a short owner review rationale first.");
      const supabase=getSupabase();
      if(!supabase)throw new Error("DataNest backend is not configured.");
      const {data,error:reviewError}=await supabase.rpc("review_optimizer_suggestion_v1",{
        target_suggestion:item.id,
        target_decision:decision,
        target_rationale:rationale
      });
      if(reviewError)throw reviewError;
      await load(true);
      if(decision==="approve"){
        const candidateId=String((data as Record<string,unknown>)?.candidate_id||"");
        setNotice(candidateId
          ?`Approved for formal governance. Improvement candidate ${candidateId} was created; no deployment occurred.`
          :"Approved for formal governance. No deployment occurred."
        );
      }else{
        setNotice("Suggestion rejected and retained in the audit history.");
      }
    });
  }

  if(loading&&!workspace){
    return <section className="panel"><p className="muted">Loading Owner Optimizer Console…</p></section>;
  }

  return <section className="panel" aria-label="Owner Optimizer Console">
    <div className="panelHead">
      <div>
        <p className="eyebrow">ADMIN · DATANEST AI SYSTEM OPTIMIZATION</p>
        <h2>DataNest AI System Optimizer</h2>
        <p className="muted">DataNest AI coordinates Audit Optimizer, Workflow Reviewer, and Code Cleaner across governed system evidence. Admins can configure and run reviews; only Owners can approve suggestions into formal governance.</p>
      </div>
      <span className="countPill">{workspace?.pending_count||0} pending</span>
    </div>

    {error&&<div className="errorBanner" role="alert">{error}</div>}
    {notice&&<div className="noticeBanner" role="status">{notice}</div>}

    <div className="settingsGrid">
      <div className="panel">
        <p className="eyebrow">COLLABORATION</p>
        <h3>DataNest AI controller</h3>
        <div className="settingsList">
          <div><dt>Audit Optimizer</dt><dd>Evidence · controls · risk</dd></div>
          <div><dt>Workflow Reviewer</dt><dd>Flow · handoffs · scheduling</dd></div>
          <div><dt>Code Cleaner</dt><dd>Maintainability · tests · cleanup</dd></div>
        </div>
        <p className="securityNote">Code Cleaner produces evidence-linked patch plans only. It cannot edit, merge, deploy, or weaken controls automatically.</p>
      </div>
      <div className="panel">
        <p className="eyebrow">ACCESS BOUNDARY</p>
        <h3>{workspace?.role==="owner"?"Owner":"Admin"} session</h3>
        <div className="settingsList">
          <div><dt>Configure optimizer</dt><dd>{workspace?.can_manage?"Allowed":"Restricted"}</dd></div>
          <div><dt>Run system review</dt><dd>{workspace?.can_manage?"Allowed":"Restricted"}</dd></div>
          <div><dt>Approve to governance</dt><dd>{workspace?.can_approve?"Owner allowed":"Owner required"}</dd></div>
        </div>
      </div>
    </div>

    <div className="settingsGrid">
      <div className="panel">
        <p className="eyebrow">AUTONOMOUS SUGGESTION LOOP</p>
        <h3>{workspace?.settings?.enabled?"Enabled":"Disabled"}</h3>
        <div className="settingsList">
          <div><dt>Last run</dt><dd>{date(workspace?.settings?.last_run_at)}</dd></div>
          <div><dt>Last success</dt><dd>{date(workspace?.settings?.last_success_at)}</dd></div>
          <div><dt>Next due</dt><dd>{date(workspace?.settings?.next_run_after)}</dd></div>
        </div>
        <div className="rowActions">
          <button className="primaryButton" type="button" disabled={Boolean(busy)||!workspace?.can_manage} onClick={runNow}>
            {busy==="run"?"Analyzing…":"Run optimization now"}
          </button>
          <button className="secondaryButton" type="button" disabled={Boolean(busy)} onClick={()=>void load()}>
            Refresh
          </button>
        </div>
      </div>

      <div className="panel">
        <p className="eyebrow">OWNER CONTROLS</p>
        <h3>Continuous review policy</h3>
        <label>
          Status
          <select value={enabled?"enabled":"disabled"} onChange={event=>setEnabled(event.target.value==="enabled")}>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
        <label>
          AI review cadence
          <select value={cadence} onChange={event=>setCadence(Number(event.target.value))}>
            <option value={1}>Every hour</option>
            <option value={3}>Every 3 hours</option>
            <option value={6}>Every 6 hours</option>
            <option value={12}>Every 12 hours</option>
            <option value={24}>Daily</option>
            <option value={72}>Every 3 days</option>
            <option value={168}>Weekly</option>
          </select>
        </label>
        <label>
          Maximum suggestions per run
          <select value={maxSuggestions} onChange={event=>setMaxSuggestions(Number(event.target.value))}>
            {[1,2,3,4,5,6,7,8,9,10].map(value=><option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <button className="primaryButton" type="button" disabled={Boolean(busy)||!workspace?.can_manage} onClick={saveSettings}>
          {busy==="settings"?"Saving…":"Save optimizer policy"}
        </button>
      </div>
    </div>

    <div className="panelHead">
      <div><p className="eyebrow">APPROVAL QUEUE</p><h3>Owner review required</h3></div>
      <span className="countPill">{pending.length}</span>
    </div>

    {pending.length===0
      ?<div className="emptyState"><div>◇</div><h3>No pending optimizer suggestions</h3><p>New evidence-linked proposals will appear here after a scheduled or owner-triggered run.</p></div>
      :<div className="timeline">
        {pending.map(item=><article className="timelineItem" key={item.id}>
          <div className="timelineDot"/>
          <div>
            <div className="rowBetween">
              <div><b>{item.title}</b><small>{item.trace_key}</small></div>
              <span className="badge neutral">{suggestionLane(item)} · {label(item.risk_class)} · {item.confidence==null?"confidence n/a":Math.round(item.confidence*100)+"%"}</span>
            </div>
            <p><b>Problem:</b> {item.problem_statement}</p>
            <p><b>Hypothesis:</b> {item.hypothesis}</p>
            <p><b>Desired outcome:</b> {item.desired_outcome}</p>
            <details>
              <summary>Proposed change &amp; evidence</summary>
              <pre>{JSON.stringify(item.proposed_change,null,2)}</pre>
              <p className="muted">Evidence: {item.evidence_refs.length?item.evidence_refs.join(" · "):"No explicit evidence refs returned; review carefully."}</p>
              {item.standard_refs.length>0&&<p className="muted">Standards: {item.standard_refs.join(" · ")}</p>}
            </details>
            {workspace?.can_approve?<>
              <label>
                Owner rationale
                <textarea
                  rows={3}
                  value={rationales[item.id]||""}
                  onChange={event=>setRationales(current=>({...current,[item.id]:event.target.value}))}
                  placeholder="Why should this move forward, or why should it be rejected?"
                />
              </label>
              <div className="rowActions">
                <button
                  className="primaryButton"
                  type="button"
                  disabled={Boolean(busy)||(rationales[item.id]||"").trim().length<3}
                  onClick={()=>review(item,"approve")}
                >
                  {busy===`review:${item.id}`?"Recording…":"Approve → Governance"}
                </button>
                <button
                  className="secondaryButton"
                  type="button"
                  disabled={Boolean(busy)||(rationales[item.id]||"").trim().length<3}
                  onClick={()=>review(item,"reject")}
                >
                  Reject
                </button>
              </div>
            </>:<p className="securityNote">Admin review is read-only at this gate. An Owner must approve or reject this suggestion before it can enter formal governance.</p>}
          </div>
        </article>)}
      </div>
    }

    <div className="panelHead">
      <div><p className="eyebrow">RUN HISTORY</p><h3>Optimizer audit trail</h3></div>
      <span className="countPill">{workspace?.runs.length||0}</span>
    </div>
    {workspace?.runs.length
      ?<div className="dataTable">
        <div className="dataRow headerRow"><span>Run</span><span>Trigger</span><span>Status</span><span>Suggestions</span><span>Started</span></div>
        {workspace.runs.map(run=><div className="dataRow" key={run.id}>
          <b data-label="Run">{run.id.slice(0,8)}</b>
          <span data-label="Trigger">{label(run.trigger_kind)}</span>
          <span data-label="Status"><span className="badge neutral">{label(run.status)}</span></span>
          <span data-label="Suggestions">{run.suggestion_count}</span>
          <span data-label="Started">{date(run.started_at)}</span>
        </div>)}
      </div>
      :<p className="muted">No optimizer runs recorded yet.</p>
    }

    <GovernanceControlMonitor projectId={projectId}/>

    <p className="securityNote">Admin/Owner runs create evidence-linked proposals only. Owner approval creates a governance improvement candidate; no optimizer lane can deploy code, change production, cast votes, or ratify a decision.</p>
  </section>;
}
