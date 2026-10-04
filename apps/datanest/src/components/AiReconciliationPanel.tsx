"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

type ReconciliationRequest = {
  id:string;
  job_id:string;
  user_id:string;
  provider:string|null;
  model:string|null;
  status:string;
  reserved_tokens:number;
  reservation_state:string;
  estimated_cost_minor:number|null;
  provider_reported_cost_minor:number|null;
  currency:string|null;
  error_category:string|null;
  error_message:string|null;
  started_at:string|null;
  completed_at:string|null;
  reconciliation_state:string;
};

function formatDate(value:string|null){
  if(!value)return "—";
  return new Intl.DateTimeFormat(undefined,{
    month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"
  }).format(new Date(value));
}

export default function AiReconciliationPanel({projectId}:{projectId:string}){
  const [items,setItems]=useState<ReconciliationRequest[]>([]);
  const [loading,setLoading]=useState(true);
  const [busyId,setBusyId]=useState("");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    const supabase=getSupabase();
    if(!supabase)return;
    setLoading(true);
    const {data,error:loadError}=await supabase.rpc("get_ai_reconciliation_queue",{
      target_project:projectId
    });
    setLoading(false);
    if(loadError){setError(loadError.message);return;}
    setItems((data||[]) as ReconciliationRequest[]);
  },[projectId]);

  useEffect(()=>{void load()},[load]);

  useEffect(()=>{
    const supabase=getSupabase();
    if(!supabase)return;
    const channel=supabase.channel("ai-reconciliation-"+projectId)
      .on("postgres_changes",{
        event:"*",schema:"public",table:"ai_usage_requests",filter:"project_id=eq."+projectId
      },()=>void load())
      .subscribe();
    return()=>{void supabase.removeChannel(channel)};
  },[projectId,load]);

  async function resolveNoCharge(item:ReconciliationRequest){
    const supabase=getSupabase();
    if(!supabase)return;
    const note=window.prompt(
      "Reconciliation note confirming no provider completion/charge:",
      "Confirmed no provider completion or charge."
    );
    if(!note?.trim())return;

    setBusyId(item.id);setError("");setNotice("");
    const {error:rpcError}=await supabase.rpc("reconcile_unknown_ai_request",{
      target_request:item.id,
      target_outcome:"no_charge",
      target_input_tokens:0,
      target_output_tokens:0,
      target_reconciled_cost_minor:null,
      target_note:note.trim()
    });
    setBusyId("");
    if(rpcError){setError(rpcError.message);return;}
    setNotice("Unknown provider request reconciled as no completion/no charge; its reservation was released.");
    await load();
  }

  async function resolveSucceeded(item:ReconciliationRequest){
    const supabase=getSupabase();
    if(!supabase)return;

    const inputRaw=window.prompt("Confirmed input tokens:", "0");
    if(inputRaw==null)return;
    const outputRaw=window.prompt("Confirmed output tokens:", "0");
    if(outputRaw==null)return;
    const costRaw=window.prompt(
      "Reconciled provider cost in minor currency units (e.g. cents), or leave blank if unknown:",
      ""
    );
    if(costRaw==null)return;
    const note=window.prompt("Reconciliation evidence/note:", "Provider completion confirmed.");
    if(!note?.trim())return;

    const inputTokens=Math.max(0,Number(inputRaw)||0);
    const outputTokens=Math.max(0,Number(outputRaw)||0);
    const cost=costRaw.trim()===""?null:Math.max(0,Math.round(Number(costRaw)||0));

    setBusyId(item.id);setError("");setNotice("");
    const {error:rpcError}=await supabase.rpc("reconcile_unknown_ai_request",{
      target_request:item.id,
      target_outcome:"succeeded",
      target_input_tokens:inputTokens,
      target_output_tokens:outputTokens,
      target_reconciled_cost_minor:cost,
      target_note:note.trim()
    });
    setBusyId("");
    if(rpcError){setError(rpcError.message);return;}
    setNotice("Unknown provider request reconciled as completed; actual usage was recorded and the reservation was released.");
    await load();
  }

  return <section className="panel">
    <div className="panelHead">
      <div>
        <p className="eyebrow">AI RECONCILIATION</p>
        <h3>Unknown provider outcomes</h3>
      </div>
      <span className="countPill">{loading?"…":items.length}</span>
    </div>

    <p className="muted">
      Interrupted provider calls remain non-retryable and keep their token reservation until an owner/admin confirms the outcome.
      Reconciliation records usage and cost evidence while preserving provider-request integrity.
    </p>

    {notice&&<div className="notice goodNotice">{notice}</div>}
    {error&&<div className="notice errorNotice" role="alert">{error}</div>}

    <div className="manifestList">
      {items.map(item=><article className="manifestCard" key={item.id}>
        <div className="rowBetween">
          <div>
            <b>{item.provider||"provider"} · {item.model||"model"}</b>
            <small>Request {item.id.slice(0,8)} · started {formatDate(item.started_at)}</small>
          </div>
          <span className="badge warn">UNKNOWN</span>
        </div>
        <div className="manifestMeta">
          <span>{item.reserved_tokens.toLocaleString()} tokens reserved</span>
          <span>{item.reservation_state}</span>
          <span>{item.reconciliation_state}</span>
          {item.currency&&<span>{item.currency}</span>}
        </div>
        {item.error_category&&<p className="muted">{item.error_category}{item.error_message?" · "+item.error_message:""}</p>}
        <div className="rowActions">
          <button
            className="primaryButton compact"
            type="button"
            disabled={busyId===item.id}
            onClick={()=>void resolveSucceeded(item)}
          >Reconcile as completed</button>
          <button
            className="secondaryButton compact"
            type="button"
            disabled={busyId===item.id}
            onClick={()=>void resolveNoCharge(item)}
          >Confirm no completion / charge</button>
        </div>
      </article>)}

      {!loading&&!items.length&&<div className="emptyState">
        <div>✓</div>
        <h3>No unknown AI requests</h3>
        <p>There are no provider calls awaiting reconciliation.</p>
      </div>}
    </div>
  </section>;
}
