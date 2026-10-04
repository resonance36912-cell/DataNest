"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useSingleFlight } from "@/lib/singleFlight";
import {
  canManageResourceFabric,
  resourceFabricLabel,
  resourceHealthTone,
  resourceKinds,
  resourceLocationClasses,
  resourceTrustLevels,
  resourceTrustTone,
  resourceVisibilityClasses,
  type ResourceFabricRole,
  type ResourceKind,
  type ResourceTrustLevel
} from "@/lib/resourceFabric";

type Row=Record<string,unknown>;
type ResourceWorkspace={
  resources:Row[];
  unbound_capabilities:Row[];
  caller_role:string|null;
  can_manage:boolean;
  boundaries:Record<string,unknown>;
};

function txt(value:unknown){return value==null?"":String(value);}
function arr(value:unknown){return Array.isArray(value)?value.map(item=>String(item)):[];}
function obj(value:unknown){return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function rows(value:unknown){return Array.isArray(value)?value as Row[]:[];}
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
  return new Intl.DateTimeFormat(undefined,{year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(date);
}
function prettyObject(value:unknown){
  const valueObj=obj(value);
  const keys=Object.keys(valueObj);
  if(!keys.length)return "None recorded";
  return keys.slice(0,4).map(key=>key.replaceAll("_"," ")+": "+String(valueObj[key])).join(" · ");
}

export default function ResourceFabricPanel({
  projectId,role,setNotice,setError
}:{
  projectId:string;
  role:ResourceFabricRole;
  setNotice:(value:string)=>void;
  setError:(value:string)=>void;
}){
  const [workspace,setWorkspace]=useState<ResourceWorkspace|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const {activeAction,run:runSingleFlight}=useSingleFlight();

  const [resourceKey,setResourceKey]=useState("");
  const [displayName,setDisplayName]=useState("");
  const [resourceKind,setResourceKind]=useState<ResourceKind>("external_service");
  const [ownerKind,setOwnerKind]=useState("project");
  const [ownerLabel,setOwnerLabel]=useState("");
  const [trustLevel,setTrustLevel]=useState<ResourceTrustLevel>("unknown");
  const [locationClass,setLocationClass]=useState<(typeof resourceLocationClasses)[number]>("unknown");
  const [regionHint,setRegionHint]=useState("");
  const [visibility,setVisibility]=useState("public");
  const [allowedCapabilities,setAllowedCapabilities]=useState("");
  const [costProfile,setCostProfile]=useState("{}");
  const [limits,setLimits]=useState("{}");
  const [metadata,setMetadata]=useState("{}");

  const [nodeResource,setNodeResource]=useState("");
  const [nodeStatus,setNodeStatus]=useState("active");
  const [nodeCapabilities,setNodeCapabilities]=useState("");
  const [nodeVisibility,setNodeVisibility]=useState("local_only");
  const [nodeCeiling,setNodeCeiling]=useState('{"max_concurrency":1}');
  const [nodeScheduleMode,setNodeScheduleMode]=useState("always");
  const [nodeDataScope,setNodeDataScope]=useState("{}");
  const [nodeProhibitedOperations,setNodeProhibitedOperations]=useState("destruct");
  const [nodeNetworkPolicy,setNodeNetworkPolicy]=useState("{}");

  const canManage=canManageResourceFabric(role);

  const load=useCallback(async()=>{
    const supabase=getSupabase();
    if(!supabase){setError("Resource Fabric is unavailable.");setLoading(false);return;}
    setLoading(true);
    const {data,error}=await supabase.rpc("get_resource_fabric_workspace_v1",{target_project:projectId});
    if(error){
      setError(error.message);
      setWorkspace(null);
    }else{
      const raw=obj(data);
      const next:ResourceWorkspace={
        resources:rows(raw.resources),
        unbound_capabilities:rows(raw.unbound_capabilities),
        caller_role:raw.caller_role?String(raw.caller_role):null,
        can_manage:Boolean(raw.can_manage),
        boundaries:obj(raw.boundaries)
      };
      setWorkspace(next);
      const firstLocal=next.resources.find(item=>txt(obj(item.resource).resource_kind)==="local_node");
      setNodeResource(current=>current||txt(obj(firstLocal?.resource).id));
    }
    setLoading(false);
  },[projectId,setError]);

  useEffect(()=>{void load();},[load]);

  async function rpc(name:string,args:Record<string,unknown>,notice:string){
    const supabase=getSupabase();
    if(!supabase)return false;
    const result=await runSingleFlight(name,async()=>{
      setBusy(true);setError("");setNotice("Resource Fabric action in progress…");
      try{
        const {error}=await supabase.rpc(name,args);
        if(error)throw error;
        setNotice(notice);
        await load();
        return true;
      }catch(actionError){
        setError(actionError instanceof Error?actionError.message:"Resource Fabric action failed. You can retry safely.");
        return false;
      }finally{
        setBusy(false);
      }
    });
    return Boolean(result.started&&result.value);
  }

  async function registerResource(event:FormEvent){
    event.preventDefault();
    try{
      const ok=await rpc("register_project_resource_v1",{
        target_project:projectId,
        target_resource_key:resourceKey.trim(),
        target_resource_kind:resourceKind,
        target_display_name:displayName.trim(),
        target_owner_kind:ownerKind,
        target_trust_level:trustLevel,
        target_location_class:locationClass,
        target_supported_visibility_classes:splitList(visibility),
        target_allowed_capabilities:splitList(allowedCapabilities),
        target_owner_user:null,
        target_owner_label:ownerLabel.trim()||null,
        target_region_hint:regionHint.trim()||null,
        target_cost_profile:parseObject(costProfile),
        target_limits:parseObject(limits),
        target_metadata:parseObject(metadata)
      },"Resource registered and bound to this project.");
      if(ok){
        setResourceKey("");setDisplayName("");setOwnerLabel("");setRegionHint("");
        setAllowedCapabilities("");setCostProfile("{}");setLimits("{}");setMetadata("{}");
      }
    }catch(error){
      setError(error instanceof Error?error.message:"Unable to register Resource.");
    }
  }

  async function saveNodePolicy(event:FormEvent){
    event.preventDefault();
    try{
      const schedule=nodeScheduleMode==="utc_window"
        ? {mode:"utc_window",start_hour_utc:8,end_hour_utc:18}
        : {mode:nodeScheduleMode};
      await rpc("upsert_sovereign_node_policy_v1",{
        target_project:projectId,
        target_resource:nodeResource,
        target_status:nodeStatus,
        target_allowed_capabilities:splitList(nodeCapabilities),
        target_resource_ceiling:parseObject(nodeCeiling),
        target_schedule_policy:schedule,
        target_allowed_visibility_classes:splitList(nodeVisibility),
        target_data_scope:parseObject(nodeDataScope),
        target_prohibited_operations:splitList(nodeProhibitedOperations),
        target_network_policy:parseObject(nodeNetworkPolicy),
        target_interactive_remote_control:false
      },"New sovereign node policy version recorded.");
    }catch(error){
      setError(error instanceof Error?error.message:"Unable to save sovereign node policy.");
    }
  }

  const localNodes=useMemo(
    ()=>workspace?.resources.filter(item=>txt(obj(item.resource).resource_kind)==="local_node")||[],
    [workspace]
  );

  if(loading)return <section className="panel"><p className="muted">Loading Resource Fabric…</p></section>;
  if(!workspace)return <section className="panel"><p className="muted">Resource Fabric workspace is unavailable.</p></section>;

  return <div className="resourceFabricWorkspace">
    {activeAction&&<p className="muted" role="status">Resource Fabric action in progress · duplicate submissions are blocked until the request finishes.</p>}
    <section className="resourceFabricBoundary" aria-label="Resource Fabric boundaries">
      <p><b>Registration ≠ remote control.</b> A local node record describes bounded participation; it does not open an interactive control channel.</p>
      <p><b>Resource match ≠ reservation ≠ Capability Lease.</b> Matching identifies an eligible supply-side candidate only.</p>
      <p><b>Health evidence is service-recorded and read-only.</b> The browser cannot mark a Resource healthy or fabricate availability.</p>
    </section>

    <section className="panel">
      <div className="panelHead">
        <div><p className="eyebrow">RESOURCE FABRIC</p><h3>Project-bound execution supply</h3></div>
        <span className="countPill">{workspace.resources.length+" resources"}</span>
      </div>
      {workspace.resources.length?<div className="resourceFabricCards">{workspace.resources.map(item=>{
        const binding=obj(item.binding);
        const resource=obj(item.resource);
        const capabilities=rows(item.capabilities);
        const recentHealth=rows(item.recent_health);
        const nodePolicy=obj(item.sovereign_node_policy);
        const bindingState=txt(binding.status);
        const health=txt(resource.health_status);
        return <article className="manifestCard resourceFabricCard" key={txt(resource.id)}>
          <div className="rowBetween">
            <div><b>{txt(binding.resource_alias)||txt(resource.display_name)}</b><small>{resourceFabricLabel(txt(resource.resource_kind))}</small></div>
            <span className={"badge "+resourceHealthTone(health)}>{resourceFabricLabel(health)}</span>
          </div>
          <div className="resourceFabricMeta">
            <span className={"badge "+resourceTrustTone(txt(resource.trust_level))}>{resourceFabricLabel(txt(resource.trust_level))+" trust"}</span>
            <span className="badge neutral">{resourceFabricLabel(bindingState)}</span>
            <span>{resourceFabricLabel(txt(resource.location_class))}{resource.region_hint?" · "+txt(resource.region_hint):""}</span>
          </div>
          <p className="muted">Visibility: {arr(resource.supported_visibility_classes).map(resourceFabricLabel).join(", ")||"none declared"}</p>
          <p className="muted">Limits: {prettyObject(resource.limits)}</p>
          <p className="muted">Cost metadata: {prettyObject(resource.cost_profile)}</p>

          <div className="resourceCapabilityList">
            <b>Capabilities</b>
            {capabilities.length?capabilities.map(capability=><div className="resourceCapabilityRow" key={txt(capability.id)}>
              <span>{txt(capability.capability)}</span>
              <span className="badge neutral">{resourceFabricLabel(txt(capability.state))}</span>
              <span>{txt(capability.running)+"/"+txt(capability.concurrency_limit)+" running"}</span>
            </div>):<span className="muted">No linked capability rows.</span>}
          </div>

          <div className="resourceHealthEvidence">
            <b>Recent health evidence</b>
            {recentHealth.length?recentHealth.map(observation=><div className="resourceHealthRow" key={txt(observation.id)}>
              <span>{prettyDate(observation.observed_at)}</span>
              <span className={"badge "+resourceHealthTone(txt(observation.health_status))}>{resourceFabricLabel(txt(observation.health_status))}</span>
              <span>{resourceFabricLabel(txt(observation.source_kind))}</span>
            </div>):<span className="muted">No service-recorded health observations.</span>}
          </div>

          {txt(resource.resource_kind)==="local_node"&&<div className="authorityHighImpactNotice">
            <b>Sovereign node policy:</b> {nodePolicy.id?"v"+txt(nodePolicy.version)+" · "+resourceFabricLabel(txt(nodePolicy.status)):"No policy yet — automated matching fails closed."}
            <br/><span>Interactive remote control: disabled.</span>
          </div>}

          {canManage&&<div className="rowActions">
            {bindingState!=="active"&&bindingState!=="retired"&&<button className="secondaryButton compact" disabled={busy} onClick={()=>void rpc("set_resource_project_binding_state_v1",{target_binding:binding.id,target_state:"active",target_reason:"Reactivated from Resource Fabric workspace."},"Resource binding activated.")}>Activate</button>}
            {bindingState==="active"&&<button className="textButton" disabled={busy} onClick={()=>void rpc("set_resource_project_binding_state_v1",{target_binding:binding.id,target_state:"suspended",target_reason:"Suspended from Resource Fabric workspace."},"Resource binding suspended.")}>Suspend</button>}
            {bindingState!=="retired"&&<button className="textButton" disabled={busy} onClick={()=>void rpc("set_resource_project_binding_state_v1",{target_binding:binding.id,target_state:"retired",target_reason:"Retired from Resource Fabric workspace."},"Resource binding retired.")}>Retire</button>}
          </div>}
        </article>;
      })}</div>:<p className="muted">No Resources are bound to this project.</p>}
    </section>

    {workspace.unbound_capabilities.length>0&&<section className="panel">
      <div className="panelHead"><div><p className="eyebrow">COMPATIBILITY</p><h3>Unbound legacy capabilities</h3></div><span className="countPill">{workspace.unbound_capabilities.length}</span></div>
      <p className="muted">These capability rows remain valid for compatibility but are not eligible for Phase E Resource resolution until bound.</p>
    </section>}

    {canManage&&<section className="resourceFabricActionGrid">
      <details className="panel quietDisclosure">
        <summary>Register Resource · Owner / admin</summary>
        <form className="settingsGrid" onSubmit={registerResource}>
          <label>Resource key<input value={resourceKey} onChange={event=>setResourceKey(event.target.value)} placeholder="stable-resource-key" required/></label>
          <label>Display name<input value={displayName} onChange={event=>setDisplayName(event.target.value)} required/></label>
          <label>Resource kind<select value={resourceKind} onChange={event=>setResourceKind(event.target.value as ResourceKind)}>{resourceKinds.map(kind=><option value={kind} key={kind}>{resourceFabricLabel(kind)}</option>)}</select></label>
          <label>Owner kind<select value={ownerKind} onChange={event=>setOwnerKind(event.target.value)}>{["project","organization","external","system"].map(value=><option key={value} value={value}>{resourceFabricLabel(value)}</option>)}</select></label>
          <label>Owner label<input value={ownerLabel} onChange={event=>setOwnerLabel(event.target.value)} placeholder="Optional descriptive owner"/></label>
          <label>Trust level<select value={trustLevel} onChange={event=>setTrustLevel(event.target.value as ResourceTrustLevel)}>{resourceTrustLevels.map(value=><option key={value} value={value}>{resourceFabricLabel(value)}</option>)}</select></label>
          <label>Location class<select value={locationClass} onChange={event=>setLocationClass(event.target.value as (typeof resourceLocationClasses)[number])}>{resourceLocationClasses.map(value=><option key={value} value={value}>{resourceFabricLabel(value)}</option>)}</select></label>
          <label>Region hint<input value={regionHint} onChange={event=>setRegionHint(event.target.value)} placeholder="Coarse region only"/></label>
          <label>Supported visibility classes<input value={visibility} onChange={event=>setVisibility(event.target.value)} placeholder={resourceVisibilityClasses.join(", ")}/></label>
          <label>Allowed capabilities<input value={allowedCapabilities} onChange={event=>setAllowedCapabilities(event.target.value)} placeholder="chat, deployment"/></label>
          <label>Cost metadata JSON<textarea rows={3} value={costProfile} onChange={event=>setCostProfile(event.target.value)}/></label>
          <label>Limits JSON<textarea rows={3} value={limits} onChange={event=>setLimits(event.target.value)}/></label>
          <label>Metadata JSON<textarea rows={3} value={metadata} onChange={event=>setMetadata(event.target.value)}/></label>
          <button className="primaryButton" disabled={busy||!resourceKey.trim()||!displayName.trim()}>Register Resource</button>
        </form>
      </details>

      <details className="panel quietDisclosure">
        <summary>Sovereign node policy · Owner / admin</summary>
        <form className="settingsGrid" onSubmit={saveNodePolicy}>
          <label>Local node<select value={nodeResource} onChange={event=>{
            const value=event.target.value;setNodeResource(value);
            const selected=localNodes.find(item=>txt(obj(item.resource).id)===value);
            if(selected)setNodeCapabilities(arr(obj(selected.binding).allowed_capabilities).join(", "));
          }} required>
            <option value="">Select local node</option>
            {localNodes.map(item=><option key={txt(obj(item.resource).id)} value={txt(obj(item.resource).id)}>{txt(obj(item.resource).display_name)}</option>)}
          </select></label>
          <label>Policy status<select value={nodeStatus} onChange={event=>setNodeStatus(event.target.value)}><option value="active">Active</option><option value="draft">Draft</option><option value="suspended">Suspended</option><option value="retired">Retired</option></select></label>
          <label>Allowed capabilities<input value={nodeCapabilities} onChange={event=>setNodeCapabilities(event.target.value)} required/></label>
          <label>Allowed visibility classes<input value={nodeVisibility} onChange={event=>setNodeVisibility(event.target.value)} required/></label>
          <label>Schedule mode<select value={nodeScheduleMode} onChange={event=>setNodeScheduleMode(event.target.value)}><option value="always">Always</option><option value="disabled">Disabled</option><option value="utc_window">08:00–18:00 UTC window</option></select></label>
          <label>Prohibited operations<input value={nodeProhibitedOperations} onChange={event=>setNodeProhibitedOperations(event.target.value)} placeholder="destruct, promote"/></label>
          <label>Resource ceiling JSON<textarea rows={3} value={nodeCeiling} onChange={event=>setNodeCeiling(event.target.value)}/></label>
          <label>Data scope JSON<textarea rows={3} value={nodeDataScope} onChange={event=>setNodeDataScope(event.target.value)}/></label>
          <label>Network policy JSON<textarea rows={3} value={nodeNetworkPolicy} onChange={event=>setNodeNetworkPolicy(event.target.value)}/></label>
          <p className="authorityHighImpactNotice">Registration ≠ remote control. Interactive remote control is fixed off in Phase E v1.</p>
          <button className="primaryButton" disabled={busy||!nodeResource||!nodeCapabilities.trim()}>Record new policy version</button>
        </form>
      </details>
    </section>}
  </div>;
}
