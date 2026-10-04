"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {getSupabase} from "@/lib/supabase";

type MonitorRun={
  id:string;
  trigger_kind:"cron"|"owner"|"release";
  status:"running"|"succeeded"|"failed";
  check_count:number;
  failed_count:number;
  summary:string|null;
  started_at:string;
  completed_at:string|null;
};

type MonitorAlert={
  id:string;
  trace_key:string;
  check_key:string;
  control_key:string;
  control_title:string;
  severity:"low"|"moderate"|"high"|"critical";
  state:"open"|"acknowledged"|"resolved";
  summary:string;
  details:Record<string,unknown>;
  occurrence_count:number;
  first_detected_at:string;
  last_detected_at:string;
  acknowledged_at:string|null;
  acknowledgement_rationale:string|null;
  resolved_at:string|null;
};

type RuntimeEvent={
  id:string;
  control_key:string;
  event_type:string;
  target_kind:string;
  target_id:string|null;
  outcome:string|null;
  metadata:Record<string,unknown>;
  observed_at:string;
};

type MonitorWorkspace={
  latest_run:MonitorRun|null;
  runs:MonitorRun[];
  alerts:MonitorAlert[];
  runtime_events:RuntimeEvent[];
  open_alert_count:number;
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

export default function GovernanceControlMonitor({projectId}:{projectId:string}){
  const [workspace,setWorkspace]=useState<MonitorWorkspace|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [rationales,setRationales]=useState<Record<string,string>>({});

  const load=useCallback(async(silent=false)=>{
    const supabase=getSupabase();
    if(!supabase)return;
    if(!silent)setLoading(true);
    const {data,error:loadError}=await supabase.rpc("get_owner_governance_control_monitor_v1",{
      target_project:projectId
    });
    if(loadError){
      setError(loadError.message);
      if(!silent)setLoading(false);
      return;
    }
    setWorkspace(data as unknown as MonitorWorkspace);
    if(!silent)setLoading(false);
  },[projectId]);

  useEffect(()=>{
    void load();
    const timer=window.setInterval(()=>void load(true),30000);
    return ()=>window.clearInterval(timer);
  },[load]);

  const activeAlerts=useMemo(
    ()=>workspace?.alerts.filter(item=>item.state!=="resolved")||[],
    [workspace]
  );

  async function runNow(){
    setBusy("run");setError("");setNotice("");
    try{
      const supabase=getSupabase();
      if(!supabase)throw new Error("DataNest backend is not configured.");
      const {data,error:runError}=await supabase.rpc("run_governance_control_monitor_v1",{
        target_project:projectId
      });
      if(runError)throw runError;
      await load(true);
      setNotice(`Control monitor run ${String(data).slice(0,8)} completed. Findings remain advisory until a human acts.`);
    }catch(err){
      setError(err instanceof Error?err.message:"Control monitor run failed.");
    }finally{
      setBusy("");
    }
  }

  async function acknowledge(alert:MonitorAlert){
    const rationale=(rationales[alert.id]||"").trim();
    if(rationale.length<3){
      setError("Add a short owner acknowledgement rationale first.");
      return;
    }
    setBusy(`ack:${alert.id}`);setError("");setNotice("");
    try{
      const supabase=getSupabase();
      if(!supabase)throw new Error("DataNest backend is not configured.");
      const {error:ackError}=await supabase.rpc("acknowledge_governance_control_alert_v1",{
        target_alert:alert.id,
        target_rationale:rationale
      });
      if(ackError)throw ackError;
      await load(true);
      setNotice("Alert acknowledged. Acknowledgement does not resolve the underlying control condition.");
    }catch(err){
      setError(err instanceof Error?err.message:"Alert acknowledgement failed.");
    }finally{
      setBusy("");
    }
  }

  if(loading&&!workspace){
    return <section className="panel"><p className="muted">Loading governance control monitor…</p></section>;
  }

  const latest=workspace?.latest_run;

  return <section className="panel" aria-label="Governance Control Effectiveness Monitor">
    <div className="panelHead">
      <div>
        <p className="eyebrow">OWNER ADMIN · CONTROL EFFECTIVENESS</p>
        <h2>Governance Control Monitor</h2>
        <p className="muted">
          Hourly probes record audit-safe control evidence and surface anomalies for owner review.
          Monitoring cannot vote, ratify, close governance, or deploy changes.
        </p>
      </div>
      <span className="countPill">{activeAlerts.length} active</span>
    </div>

    {error&&<div className="errorBanner" role="alert">{error}</div>}
    {notice&&<div className="noticeBanner" role="status">{notice}</div>}

    <div className="settingsGrid">
      <div className="panel">
        <p className="eyebrow">LATEST CONTROL RUN</p>
        <h3>{latest?label(latest.status):"No run yet"}</h3>
        <div className="settingsList">
          <div><dt>Started</dt><dd>{date(latest?.started_at)}</dd></div>
          <div><dt>Checks</dt><dd>{latest?.check_count??0}</dd></div>
          <div><dt>Findings</dt><dd>{latest?.failed_count??0}</dd></div>
          <div><dt>Completed</dt><dd>{date(latest?.completed_at)}</dd></div>
        </div>
        {latest?.summary&&<p className="muted">{latest.summary}</p>}
        <div className="rowActions">
          <button className="primaryButton" type="button" disabled={Boolean(busy)} onClick={()=>void runNow()}>
            {busy==="run"?"Checking…":"Run control check now"}
          </button>
          <button className="secondaryButton" type="button" disabled={Boolean(busy)} onClick={()=>void load()}>
            Refresh
          </button>
        </div>
      </div>

      <div className="panel">
        <p className="eyebrow">MONITORED BOUNDARIES</p>
        <h3>Non-authoritative by design</h3>
        <div className="settingsList">
          <div><dt>Can vote</dt><dd>No</dd></div>
          <div><dt>Can ratify</dt><dd>No</dd></div>
          <div><dt>Can deploy</dt><dd>No</dd></div>
          <div><dt>Evidence equals truth</dt><dd>No</dd></div>
        </div>
        <p className="securityNote">
          Alerts describe detected conditions. Owner acknowledgement records review; it does not mark the condition fixed.
        </p>
      </div>
    </div>

    <div className="panelHead">
      <div><p className="eyebrow">CONTROL ALERTS</p><h3>Owner review queue</h3></div>
      <span className="countPill">{workspace?.open_alert_count||0} open</span>
    </div>

    {activeAlerts.length===0
      ?<div className="emptyState"><div>◇</div><h3>No active control alerts</h3><p>The latest checks did not detect an unresolved monitored condition.</p></div>
      :<div className="timeline">
        {activeAlerts.map(alert=><article className="timelineItem" key={alert.id}>
          <div className="timelineDot"/>
          <div>
            <div className="rowBetween">
              <div><b>{alert.control_title}</b><small>{alert.trace_key}</small></div>
              <span className="badge neutral">{label(alert.severity)} · {label(alert.state)}</span>
            </div>
            <p>{alert.summary}</p>
            <p className="muted">
              Check: {label(alert.check_key)} · first {date(alert.first_detected_at)} · last {date(alert.last_detected_at)} · occurrences {alert.occurrence_count}
            </p>
            <details>
              <summary>Audit-safe details</summary>
              <pre>{JSON.stringify(alert.details,null,2)}</pre>
            </details>
            {alert.state==="open"&&<>
              <label>
                Owner acknowledgement
                <textarea
                  rows={2}
                  value={rationales[alert.id]||""}
                  onChange={event=>setRationales(current=>({...current,[alert.id]:event.target.value}))}
                  placeholder="Record what is being reviewed or remediated."
                />
              </label>
              <button
                className="secondaryButton"
                type="button"
                disabled={Boolean(busy)||(rationales[alert.id]||"").trim().length<3}
                onClick={()=>void acknowledge(alert)}
              >
                {busy===`ack:${alert.id}`?"Recording…":"Acknowledge alert"}
              </button>
            </>}
          </div>
        </article>)}
      </div>
    }

    <div className="panelHead">
      <div><p className="eyebrow">RUNTIME EVIDENCE</p><h3>Recent control-point events</h3></div>
      <span className="countPill">{workspace?.runtime_events.length||0}</span>
    </div>
    {workspace?.runtime_events.length
      ?<div className="dataTable">
        <div className="dataRow headerRow"><span>Control</span><span>Event</span><span>Outcome</span><span>Observed</span><span>Target</span></div>
        {workspace.runtime_events.slice(0,12).map(event=><div className="dataRow" key={event.id}>
          <b data-label="Control">{event.control_key}</b>
          <span data-label="Event">{label(event.event_type)}</span>
          <span data-label="Outcome">{event.outcome?label(event.outcome):"—"}</span>
          <span data-label="Observed">{date(event.observed_at)}</span>
          <span data-label="Target">{label(event.target_kind)}</span>
        </div>)}
      </div>
      :<p className="muted">No runtime control-point events recorded yet.</p>
    }
  </section>;
}
