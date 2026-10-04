"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import {
  canManageIntelligenceFabric,
  ilmProfileStatuses,
  intelligenceLabel,
  intelligenceResourceKinds,
  routeDecisionTone,
  type IlmProfileStatus,
  type IntelligenceFabricRole
} from "@/lib/intelligenceFabric";

type Row=Record<string,unknown>;
type Workspace={
  profiles:Row[];
  routes:Row[];
  evaluations:Row[];
  capability_evidence:Row[];
  memory_receipts:Row[];
  certified_memory:Record<string,unknown>;
  resource_fabric:Record<string,unknown>;
  caller_role:string|null;
  can_manage:boolean;
  boundaries:Record<string,unknown>;
};

function obj(value:unknown){
  return value&&typeof value==="object"&&!Array.isArray(value)
    ?value as Record<string,unknown>
    :{};
}
function rows(value:unknown){return Array.isArray(value)?value as Row[]:[];}
function txt(value:unknown){return value==null?"":String(value);}
function arr(value:unknown){return Array.isArray(value)?value.map(item=>String(item)):[];}
function splitList(value:string){return value.split(/[\n,]/).map(item=>item.trim()).filter(Boolean);}
function parseObject(value:string){
  const parsed=JSON.parse(value||"{}") as unknown;
  if(!parsed||Array.isArray(parsed)||typeof parsed!=="object")throw new Error("JSON must be an object.");
  return parsed as Record<string,unknown>;
}
function prettyDate(value:unknown){
  const raw=txt(value);
  if(!raw)return "—";
  const date=new Date(raw);
  if(Number.isNaN(date.getTime()))return raw;
  return new Intl.DateTimeFormat(undefined,{year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:"UTC",timeZoneName:"short"}).format(date);
}

export default function IntelligenceFabricPanel({
  projectId,role,setNotice,setError
}:{
  projectId:string;
  role:IntelligenceFabricRole;
  setNotice:(value:string)=>void;
  setError:(value:string)=>void;
}){
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [profileKey,setProfileKey]=useState("ilm-1");
  const [displayName,setDisplayName]=useState("ILM-1");
  const [status,setStatus]=useState<IlmProfileStatus>("active");
  const [purposes,setPurposes]=useState("job_execution, user_requested_analysis");
  const [defaultCapability,setDefaultCapability]=useState("chat");
  const [resourceKinds,setResourceKinds]=useState("model_endpoint, external_service, agent_runtime, local_node");
  const [memoryPolicy,setMemoryPolicy]=useState('{"source":"certified_memory","uncertified_scope":"current_job_session"}');
  const [routingPolicy,setRoutingPolicy]=useState('{"enforcement_mode":"governed","provider_agnostic":true}');
  const [evaluationPolicy,setEvaluationPolicy]=useState('{"require_provenance":true,"record_capability_evidence":true}');
  const [metadata,setMetadata]=useState('{"identity":"DataNest AI","ilm_version":"ILM-1"}');

  const canManage=canManageIntelligenceFabric(role);

  const load=useCallback(async()=>{
    const supabase=getSupabase();
    if(!supabase){setError("Intelligence Fabric is unavailable.");setLoading(false);return;}
    setLoading(true);
    const {data,error}=await supabase.rpc("get_intelligence_fabric_workspace_v1",{target_project:projectId});
    if(error){
      setError(error.message);
      setWorkspace(null);
    }else{
      const raw=obj(data);
      setWorkspace({
        profiles:rows(raw.profiles),
        routes:rows(raw.routes),
        evaluations:rows(raw.evaluations),
        capability_evidence:rows(raw.capability_evidence),
        memory_receipts:rows(raw.memory_receipts),
        certified_memory:obj(raw.certified_memory),
        resource_fabric:obj(raw.resource_fabric),
        caller_role:raw.caller_role?String(raw.caller_role):null,
        can_manage:Boolean(raw.can_manage),
        boundaries:obj(raw.boundaries)
      });
    }
    setLoading(false);
  },[projectId,setError]);

  useEffect(()=>{void load();},[load]);

  const activeProfile=useMemo(
    ()=>workspace?.profiles.find(item=>txt(item.status)==="active")||workspace?.profiles[0]||null,
    [workspace]
  );

  async function saveProfile(event:FormEvent){
    event.preventDefault();
    const supabase=getSupabase();
    if(!supabase)return;
    setBusy(true);setError("");
    try{
      const {error}=await supabase.rpc("upsert_ilm_profile_v1",{
        target_project:projectId,
        target_profile_key:profileKey.trim(),
        target_display_name:displayName.trim(),
        target_status:status,
        target_allowed_purposes:splitList(purposes),
        target_default_capability:defaultCapability.trim(),
        target_allowed_resource_kinds:splitList(resourceKinds),
        target_memory_policy:parseObject(memoryPolicy),
        target_routing_policy:parseObject(routingPolicy),
        target_evaluation_policy:parseObject(evaluationPolicy),
        target_metadata:parseObject(metadata)
      });
      if(error)throw error;
      setNotice("A new governed ILM-1 profile version was recorded.");
      await load();
    }catch(error){
      setError(error instanceof Error?error.message:"Unable to record ILM-1 profile.");
    }finally{
      setBusy(false);
    }
  }

  if(loading)return <section className="panel"><p className="muted">Loading Intelligence Fabric…</p></section>;
  if(!workspace)return <section className="panel"><p className="muted">Intelligence Fabric workspace is unavailable.</p></section>;

  return <div className="intelligenceFabricWorkspace">
    <section className="intelligenceFabricBoundary" aria-label="ILM-1 boundaries">
      <p><b>ILM-1 = governed orchestration, not a trained foundation model.</b> It composes approved memory, providers, tools, agents and Resource Fabric capabilities.</p>
      <p><b>Routing ≠ authorization.</b> A selected intelligence route does not reserve capacity, create a Capability Lease, or authorize side effects.</p>
      <p><b>Evaluation evidence is read-only.</b> Browser clients can inspect route fitness but cannot fabricate service evidence or certify memory.</p>
    </section>

    <section className="panel">
      <div className="panelHead">
        <div>
          <p className="eyebrow">INTELLIGENCE FABRIC · ILM-1</p>
          <h3>Governed intelligence composition</h3>
        </div>
        <span className="countPill">{workspace.routes.length+" routes"}</span>
      </div>
      <div className="intelligenceFabricSummary">
        <article>
          <small>Active profile</small>
          <b>{activeProfile?txt(activeProfile.display_name):"Not configured"}</b>
          <span>{activeProfile?"v"+txt(activeProfile.version)+" · "+intelligenceLabel(txt(activeProfile.status)):"Legacy DataNest AI route remains unchanged"}</span>
        </article>
        <article>
          <small>Certified memory</small>
          <b>{txt(workspace.certified_memory.active_count)||"0"}</b>
          <span>{txt(workspace.certified_memory.review_due_count)||"0"} review due · reusable governed memory</span>
        </article>
        <article>
          <small>Memory receipts</small>
          <b>{txt(workspace.certified_memory.usage_receipt_count)||"0"}</b>
          <span>Audited verified-memory selections</span>
        </article>
        <article>
          <small>Resource Fabric</small>
          <b>{txt(workspace.resource_fabric.linked_capability_count)||"0"}</b>
          <span>{txt(workspace.resource_fabric.active_resource_count)||"0"} active resources</span>
        </article>
      </div>
    </section>

    <section className="intelligenceFabricEvidenceGrid">
      <div className="panel">
        <div className="panelHead"><div><p className="eyebrow">ROUTING</p><h3>Recent ILM-1 route decisions</h3></div><span className="countPill">{workspace.routes.length}</span></div>
        <div className="manifestList">
          {workspace.routes.slice(0,8).map(route=><article className="manifestCard intelligenceEvidenceCard" key={txt(route.id)}>
            <div className="rowBetween">
              <div><b>{intelligenceLabel(txt(route.route_kind))}</b><small>{prettyDate(route.created_at)}</small></div>
              <span className={"badge "+routeDecisionTone(txt(route.decision))}>{intelligenceLabel(txt(route.decision))}</span>
            </div>
            <div className="manifestMeta">
              <span>{txt(route.purpose)||"purpose —"}</span>
              <span>{txt(route.requested_capability)||"capability —"}</span>
              {Boolean(route.provider_key)&&<span>{txt(route.provider_key)}</span>}
              {Boolean(route.model_label)&&<span>{txt(route.model_label)}</span>}
            </div>
            <p className="muted">{arr(route.reason_codes).map(intelligenceLabel).join(" · ")||"No reason codes recorded."}</p>
          </article>)}
          {!workspace.routes.length&&<p className="muted">No ILM-1 route evidence has been recorded yet.</p>}
        </div>
      </div>

      <div className="panel">
        <div className="panelHead"><div><p className="eyebrow">EVALUATION</p><h3>Route evaluation evidence</h3></div><span className="countPill">{workspace.evaluations.length}</span></div>
        <div className="manifestList">
          {workspace.evaluations.slice(0,8).map(item=><article className="manifestCard intelligenceEvidenceCard" key={txt(item.id)}>
            <div className="rowBetween">
              <div><b>{txt(item.evaluation_key)}</b><small>{txt(item.evaluation_version)+" · "+prettyDate(item.evaluated_at)}</small></div>
              <span className={"badge "+routeDecisionTone(txt(item.status))}>{intelligenceLabel(txt(item.status))}</span>
            </div>
            <div className="manifestMeta"><span>{intelligenceLabel(txt(item.evaluator_kind))}</span><span>{txt(item.trace_id)}</span></div>
          </article>)}
          {!workspace.evaluations.length&&<p className="muted">No evaluation evidence has been recorded yet.</p>}
        </div>
      </div>

      <div className="panel">
        <div className="panelHead"><div><p className="eyebrow">MEMORY RECEIPTS</p><h3>Verified memory selection evidence</h3></div><span className="countPill">{workspace.memory_receipts.length}</span></div>
        <div className="manifestList">
          {workspace.memory_receipts.slice(0,8).map(item=><article className="manifestCard intelligenceEvidenceCard" key={txt(item.id)}>
            <div className="rowBetween">
              <div><b>{intelligenceLabel(txt(item.strategy))}</b><small>{prettyDate(item.created_at)}</small></div>
              <span className="badge good">{txt(item.selected_count)||"0"} selected</span>
            </div>
            <div className="manifestMeta">
              <span>{txt(item.product_scope)||"datanest_ai"}</span>
              {Boolean(item.projection_key)&&<span>{txt(item.projection_key)+" v"+(txt(item.projection_version)||"—")}</span>}
              <span>{txt(item.purpose)||"purpose —"}</span>
              <span>{txt(item.applicable_count)||"0"} applicable</span>
              <span>{txt(item.active_count)||"0"} active</span>
            </div>
            <p className="muted">
              {txt(item.review_due_count)||"0"} review due · trace {txt(item.trace_id).slice(0,24)}
            </p>
          </article>)}
          {!workspace.memory_receipts.length&&<p className="muted">No verified-memory selection receipts have been recorded yet.</p>}
        </div>
      </div>

      <div className="panel">
        <div className="panelHead"><div><p className="eyebrow">CAPABILITY EVIDENCE</p><h3>Observed intelligence fitness</h3></div><span className="countPill">{workspace.capability_evidence.length}</span></div>
        <div className="manifestList">
          {workspace.capability_evidence.slice(0,8).map(item=><article className="manifestCard intelligenceEvidenceCard" key={txt(item.id)}>
            <div className="rowBetween">
              <div><b>{intelligenceLabel(txt(item.evidence_kind))}</b><small>{prettyDate(item.observed_at)}</small></div>
              <span className={"badge "+routeDecisionTone(txt(item.status))}>{intelligenceLabel(txt(item.status))}</span>
            </div>
            <div className="manifestMeta"><span>{txt(item.purpose)}</span><span>{"resource "+txt(item.resource_id).slice(0,8)}</span><span>{"capability "+txt(item.capability_id).slice(0,8)}</span></div>
          </article>)}
          {!workspace.capability_evidence.length&&<p className="muted">No capability-fit evidence has been recorded yet.</p>}
        </div>
      </div>
    </section>

    {canManage&&<details className="panel quietDisclosure">
      <summary>Version ILM-1 profile · Owner / admin</summary>
      <form className="settingsGrid" onSubmit={saveProfile}>
        <label>Profile key<input value={profileKey} onChange={event=>setProfileKey(event.target.value)} required/></label>
        <label>Display name<input value={displayName} onChange={event=>setDisplayName(event.target.value)} required/></label>
        <label>Status<select value={status} onChange={event=>setStatus(event.target.value as IlmProfileStatus)}>{ilmProfileStatuses.map(value=><option key={value} value={value}>{intelligenceLabel(value)}</option>)}</select></label>
        <label>Allowed purposes<input value={purposes} onChange={event=>setPurposes(event.target.value)} required/></label>
        <label>Default capability<input value={defaultCapability} onChange={event=>setDefaultCapability(event.target.value)} required/></label>
        <label>Allowed Resource kinds<input value={resourceKinds} onChange={event=>setResourceKinds(event.target.value)} placeholder={intelligenceResourceKinds.join(", ")}/></label>
        <label>Memory policy JSON<textarea rows={3} value={memoryPolicy} onChange={event=>setMemoryPolicy(event.target.value)}/></label>
        <label>Routing policy JSON<textarea rows={3} value={routingPolicy} onChange={event=>setRoutingPolicy(event.target.value)}/></label>
        <label>Evaluation policy JSON<textarea rows={3} value={evaluationPolicy} onChange={event=>setEvaluationPolicy(event.target.value)}/></label>
        <label>Metadata JSON<textarea rows={3} value={metadata} onChange={event=>setMetadata(event.target.value)}/></label>
        <button className="primaryButton" disabled={busy||!profileKey.trim()||!displayName.trim()||!defaultCapability.trim()}>Record profile version</button>
      </form>
    </details>}
  </div>;
}
