"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getDurableRecoveryDiagnostics, type DurableRecoveryDiagnostics } from "@/lib/durableRecovery";

function date(value:string|null){
  if(!value)return "—";
  return new Intl.DateTimeFormat(undefined,{month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(value));
}

function age(seconds:number){
  if(seconds<60)return Math.max(0,Math.floor(seconds))+"s";
  if(seconds<60*60)return Math.floor(seconds/60)+"m";
  if(seconds<24*60*60)return Math.floor(seconds/(60*60))+"h";
  return Math.floor(seconds/(24*60*60))+"d";
}

function kindLabel(kind:string){
  if(kind==="unifi_job")return "UNIFI Job";
  if(kind==="spark_redemption")return "Spark reservation";
  if(kind==="product_test_run")return "Product Lab evidence";
  return kind.replaceAll("_"," ");
}

function verificationLabel(value:string){
  if(value==="confirmed_absent")return "safe retry";
  return value.replaceAll("_"," ");
}

export default function RecoveryDiagnosticsPanel({
  projectId,hydrated,ledgerError,lastSyncedAt,syncing,onSync
}:{
  projectId:string;
  hydrated:boolean;
  ledgerError:string;
  lastSyncedAt:string|null;
  syncing:boolean;
  onSync:()=>Promise<void>;
}){
  const [diagnostics,setDiagnostics]=useState<DurableRecoveryDiagnostics|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const next=await getDurableRecoveryDiagnostics(projectId);
      setDiagnostics(next);
      setError("");
    }catch(loadError){
      setError(loadError instanceof Error?loadError.message:"Unable to load recovery diagnostics.");
    }finally{
      setLoading(false);
    }
  },[projectId]);

  useEffect(()=>{void load();},[load,lastSyncedAt]);

  const state=useMemo(()=>{
    if(ledgerError||error)return {label:"SYNC ISSUE",tone:"bad"};
    if(!hydrated||loading)return {label:"CHECKING",tone:"warn"};
    if((diagnostics?.staleTotal||0)>0||(diagnostics?.unconfirmedTotal||0)>0)return {label:"ATTENTION",tone:"bad"};
    if((diagnostics?.safeRetryTotal||0)>0)return {label:"SAFE RETRY",tone:"good"};
    if((diagnostics?.unresolvedTotal||0)>0)return {label:"ACTIVE",tone:"warn"};
    return {label:"CLEAR",tone:"good"};
  },[diagnostics,error,hydrated,ledgerError,loading]);

  async function syncNow(){
    try{
      await onSync();
      await load();
    }catch(syncError){
      setError(syncError instanceof Error?syncError.message:"Unable to synchronize recovery diagnostics.");
    }
  }

  const unresolved=diagnostics?.items||[];
  const resolutions=diagnostics?.recentResolutions||[];

  return <section className="panel fullWidth recoveryDiagnostics" aria-label="Recovery diagnostics">
    <div className="panelHead recoveryDiagnosticsHead">
      <div>
        <p className="eyebrow">RECOVERY OBSERVABILITY</p>
        <h3>Durable mutation continuity</h3>
        <p className="muted">Read-only diagnostics for this signed-in project member. These signals describe recovery continuity only; authoritative domain records still determine whether a mutation succeeded.</p>
      </div>
      <span className={"badge "+state.tone}>{state.label}</span>
    </div>

    <div className="recoveryDiagnosticActions">
      <button className="secondaryButton compact" type="button" disabled={syncing} onClick={()=>void syncNow()}>{syncing?"Synchronizing…":"Sync recovery ledger"}</button>
      {(diagnostics?.unresolvedTotal||0)>0&&<button className="textButton" type="button" onClick={()=>document.getElementById("mutation-recovery-center")?.scrollIntoView({behavior:"smooth",block:"start"})}>Review open recoveries ↑</button>}
      <small>Last client sync {lastSyncedAt?date(lastSyncedAt):"not completed"}{diagnostics?.generatedAt?" · diagnostics "+date(diagnostics.generatedAt):""}</small>
    </div>

    {(ledgerError||error)&&<div className="notice errorNotice" role="status"><b>Recovery diagnostics unavailable.</b> {ledgerError||error}</div>}

    <div className="recoveryDiagnosticMetrics" aria-label="Recovery telemetry">
      <article><span>Open identities</span><strong>{diagnostics?.unresolvedTotal??"—"}</strong><small>{diagnostics?.oldestStartedAt?"Oldest "+date(diagnostics.oldestStartedAt):"No unresolved continuity"}</small></article>
      <article><span>Stale ≥ 1h</span><strong>{diagnostics?.staleTotal??"—"}</strong><small>{diagnostics?.agingTotal??0} aging · {diagnostics?.recentTotal??0} recent</small></article>
      <article><span>Unconfirmed</span><strong>{diagnostics?.unconfirmedTotal??"—"}</strong><small>{diagnostics?.unverifiedTotal??0} not yet verified</small></article>
      <article><span>Safe retry</span><strong>{diagnostics?.safeRetryTotal??"—"}</strong><small>Authoritative absence confirmed</small></article>
      <article><span>Peak attempts</span><strong>{diagnostics?.maxAttemptCount??"—"}</strong><small>Registration attempts on one open identity</small></article>
      <article><span>Resolved 24h</span><strong>{diagnostics?.resolved24h??"—"}</strong><small>Continuity resolutions, not business outcomes</small></article>
    </div>

    <div className="recoveryDiagnosticSection">
      <div className="rowBetween"><div><p className="eyebrow">OPEN IDENTITIES</p><h4>Unresolved continuity</h4></div><span className="countPill">{unresolved.length}</span></div>
      {unresolved.length?<div className="recoveryDiagnosticTable" role="table" aria-label="Open recovery identities">
        <div className="recoveryDiagnosticRow headerRow" role="row"><span>Workflow</span><span>Request</span><span>State</span><span>Age</span><span>Attempts</span><span>Last attempt</span></div>
        {unresolved.map(item=><div className="recoveryDiagnosticRow" role="row" key={item.id}>
          <b data-label="Workflow">{kindLabel(item.mutationKind)}</b>
          <code data-label="Request">…{item.requestSuffix}</code>
          <span data-label="State">{verificationLabel(item.verificationState)}</span>
          <span data-label="Age">{age(item.ageSeconds)}</span>
          <span data-label="Attempts">{item.attemptCount}</span>
          <span data-label="Last attempt">{date(item.lastAttemptAt)}{item.lastCheckedAt?<small>Checked {date(item.lastCheckedAt)}</small>:null}</span>
        </div>)}
      </div>:<div className="recoveryDiagnosticEmpty">No unresolved durable mutation identities for this account and project.</div>}
    </div>

    <details className="recoveryResolutionHistory">
      <summary>Recent continuity resolutions <span>{diagnostics?.resolved24h??0} in 24h</span></summary>
      <p className="muted">Resolution history records recovery lifecycle cleanup. It does not replace the underlying UNIFI, Sparks, or Product Lab evidence.</p>
      {resolutions.length?<div className="recoveryResolutionList">
        {resolutions.map(item=><article key={item.id}>
          <div><b>{kindLabel(item.mutationKind)}</b><code>…{item.requestSuffix}</code></div>
          <span>{item.resolution==="confirmed"?"confirmed continuity":"superseded after absence"}</span>
          <small>{item.attemptCount} attempt{item.attemptCount===1?"":"s"} · {age(item.elapsedSeconds)} elapsed · {date(item.resolvedAt)}</small>
        </article>)}
      </div>:<div className="recoveryDiagnosticEmpty">No continuity resolutions in the last 24 hours.</div>}
    </details>
  </section>;
}
