"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";

type AdminRole="owner"|"admin";
type Device={
  id:string;
  device_key:string;
  display_name:string;
  device_class:string;
  environment:string;
  status:string;
  enrolled_at:string;
  last_seen_at:string|null;
  revoked_at:string|null;
  revocation_reason:string|null;
  updated_at:string;
};
type Report={
  id:string;
  device_id:string;
  report_type:string;
  severity:string;
  title:string;
  summary:string;
  evidence_reference:string|null;
  observed_at:string;
};
type Grant={
  id:string;
  device_id:string;
  capabilities:string[];
  reason:string;
  status:string;
  expires_at:string;
  issued_at:string;
  revoked_at:string|null;
  revocation_reason:string|null;
};
type AuditEvent={
  id:number;
  device_id:string|null;
  grant_id:string|null;
  event_type:string;
  detail:string;
  created_at:string;
};
type Workspace={
  role:string;
  can_manage:boolean;
  mutation_policy:{
    direct_remote_execution:boolean;
    named_task_approval_required:boolean;
    isolated_workspace_required:boolean;
    allowed_grant_capabilities:string[];
  };
  devices:Device[];
  reports:Report[];
  grants:Grant[];
  audit:AuditEvent[];
};

const defaultCapabilities=["inventory.read","report.read"] as const;

function localDateTimeFromNow(hours:number){
  const value=new Date(Date.now()+hours*60*60*1000);
  const offset=value.getTimezoneOffset()*60000;
  return new Date(value.getTime()-offset).toISOString().slice(0,16);
}

function fmt(value:string|null|undefined){
  if(!value)return "—";
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return value;
  return new Intl.DateTimeFormat(undefined,{year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(date);
}

function rows<T>(value:unknown):T[]{
  return Array.isArray(value)?value as T[]:[];
}

export default function RndDeviceAdministration({projectId,role}:{projectId:string;role:AdminRole}){
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState("");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");

  const [deviceKey,setDeviceKey]=useState("");
  const [displayName,setDisplayName]=useState("");
  const [deviceClass,setDeviceClass]=useState("workstation");
  const [environment,setEnvironment]=useState("lab");

  const [grantDevice,setGrantDevice]=useState("");
  const [grantCapabilities,setGrantCapabilities]=useState<string[]>([...defaultCapabilities]);
  const [grantReason,setGrantReason]=useState("");
  const [grantExpiry,setGrantExpiry]=useState(()=>localDateTimeFromNow(24));

  const load=useCallback(async()=>{
    const supabase=getSupabase();
    if(!supabase){setError("R&D device administration is unavailable.");setLoading(false);return;}
    setLoading(true);
    setError("");
    const {data,error:loadError}=await supabase.rpc("get_rnd_device_admin_workspace_v1",{target_project:projectId});
    if(loadError){
      setWorkspace(null);
      setError(loadError.message);
      setLoading(false);
      return;
    }
    const raw=(data||{}) as Record<string,unknown>;
    const next:Workspace={
      role:String(raw.role||role),
      can_manage:Boolean(raw.can_manage),
      mutation_policy:(raw.mutation_policy&&typeof raw.mutation_policy==="object"?raw.mutation_policy:{}) as Workspace["mutation_policy"],
      devices:rows<Device>(raw.devices),
      reports:rows<Report>(raw.reports),
      grants:rows<Grant>(raw.grants),
      audit:rows<AuditEvent>(raw.audit)
    };
    setWorkspace(next);
    const firstActive=next.devices.find(item=>item.status==="active");
    setGrantDevice(current=>current&&next.devices.some(item=>item.id===current&&item.status==="active")?current:firstActive?.id||"");
    setLoading(false);
  },[projectId,role]);

  useEffect(()=>{void load();},[load]);

  const deviceById=useMemo(()=>new Map((workspace?.devices||[]).map(item=>[item.id,item])),[workspace]);

  async function run(action:string,fn:()=>Promise<{error:{message:string}|null}|{error:null}>){
    if(busy)return;
    setBusy(action);
    setError("");
    setNotice("");
    try{
      const result=await fn();
      if(result.error)throw new Error(result.error.message);
      setNotice("R&D device administration updated.");
      await load();
    }catch(actionError){
      setError(actionError instanceof Error?actionError.message:"R&D device administration action failed.");
    }finally{
      setBusy("");
    }
  }

  async function enroll(event:FormEvent){
    event.preventDefault();
    const supabase=getSupabase(); if(!supabase)return;
    await run("enroll",async()=>{
      const result=await supabase.rpc("enroll_rnd_device_v1",{
        target_project:projectId,
        target_device_key:deviceKey.trim(),
        target_display_name:displayName.trim(),
        target_device_class:deviceClass,
        target_environment:environment
      });
      if(!result.error){
        setDeviceKey("");
        setDisplayName("");
      }
      return {error:result.error};
    });
  }

  function toggleCapability(capability:string){
    setGrantCapabilities(current=>current.includes(capability)
      ?current.filter(item=>item!==capability)
      :[...current,capability]);
  }

  async function issueGrant(event:FormEvent){
    event.preventDefault();
    const supabase=getSupabase(); if(!supabase||!grantDevice)return;
    await run("grant",async()=>{
      const result=await supabase.rpc("grant_rnd_device_capabilities_v1",{
        target_project:projectId,
        target_device:grantDevice,
        target_capabilities:grantCapabilities,
        target_reason:grantReason.trim(),
        target_expires_at:new Date(grantExpiry).toISOString()
      });
      if(!result.error)setGrantReason("");
      return {error:result.error};
    });
  }

  async function revokeGrant(grant:Grant){
    const reason=window.prompt("Reason for revoking this device grant:");
    if(!reason?.trim())return;
    const supabase=getSupabase(); if(!supabase)return;
    await run("revoke-grant:"+grant.id,async()=>{
      const result=await supabase.rpc("revoke_rnd_device_grant_v1",{
        target_project:projectId,
        target_grant:grant.id,
        target_reason:reason.trim()
      });
      return {error:result.error};
    });
  }

  async function revokeDevice(device:Device){
    const reason=window.prompt("Reason for revoking this device and all active grants:");
    if(!reason?.trim())return;
    const confirmed=window.confirm("Revoke "+device.display_name+" and close all active grants?");
    if(!confirmed)return;
    const supabase=getSupabase(); if(!supabase)return;
    await run("revoke-device:"+device.id,async()=>{
      const result=await supabase.rpc("revoke_rnd_device_v1",{
        target_project:projectId,
        target_device:device.id,
        target_reason:reason.trim()
      });
      return {error:result.error};
    });
  }

  const allowedCapabilities=workspace?.mutation_policy?.allowed_grant_capabilities?.length
    ?workspace.mutation_policy.allowed_grant_capabilities
    :["inventory.read","report.read","report.submit","named_task.request"];

  return <section className="panel" aria-labelledby="rnd-device-admin-heading">
    <div className="panelHead">
      <div>
        <p className="eyebrow">R&D DEVICE ADMINISTRATION</p>
        <h3 id="rnd-device-admin-heading">Server-enforced device inventory</h3>
        <p>Owner/admin controls for enrollment, bounded grants, report inspection, revocation and audit evidence.</p>
      </div>
      <button className="secondaryButton compact" type="button" onClick={()=>void load()} disabled={loading||Boolean(busy)}>
        {loading?"Loading…":"Refresh"}
      </button>
    </div>

    <div className="authMessageSlot" aria-live="polite">
      {error&&<div className="authMessage" role="alert">{error}</div>}
      {notice&&<div className="authMessage">{notice}</div>}
    </div>

    <dl className="settingsList">
      <div><dt>Role</dt><dd>{workspace?.role||role}</dd></div>
      <div><dt>Direct remote execution</dt><dd>{workspace?.mutation_policy?.direct_remote_execution?"Enabled":"Disabled"}</dd></div>
      <div><dt>Named-task approval</dt><dd>{workspace?.mutation_policy?.named_task_approval_required===false?"Optional":"Required"}</dd></div>
      <div><dt>Isolated workspace</dt><dd>{workspace?.mutation_policy?.isolated_workspace_required===false?"Optional":"Required"}</dd></div>
    </dl>

    <details open>
      <summary>Device inventory</summary>
      <div className="settingsList">
        {(workspace?.devices||[]).map(device=><div key={device.id}>
          <dt>{device.display_name}</dt>
          <dd>
            <div><b>{device.device_key}</b> · {device.device_class} · {device.environment} · {device.status}</div>
            <small>Enrolled {fmt(device.enrolled_at)} · Last seen {fmt(device.last_seen_at)}</small>
            {device.revocation_reason&&<small>Revocation: {device.revocation_reason}</small>}
            {device.status!=="revoked"&&<button className="textButton" type="button" onClick={()=>void revokeDevice(device)} disabled={Boolean(busy)}>Revoke device</button>}
          </dd>
        </div>)}
        {!workspace?.devices?.length&&<div><dt>Inventory</dt><dd>No R&D devices enrolled.</dd></div>}
      </div>
    </details>

    <details>
      <summary>Enroll device</summary>
      <form className="authForm" onSubmit={enroll} aria-busy={busy==="enroll"}>
        <label>Device key<input required minLength={3} maxLength={160} value={deviceKey} onChange={event=>setDeviceKey(event.target.value)} placeholder="lab-workstation-01"/></label>
        <label>Display name<input required maxLength={160} value={displayName} onChange={event=>setDisplayName(event.target.value)} placeholder="R&D Workstation 01"/></label>
        <label>Device class<select value={deviceClass} onChange={event=>setDeviceClass(event.target.value)}><option value="workstation">Workstation</option><option value="server">Server</option><option value="lab_node">Lab node</option><option value="mobile">Mobile</option><option value="other">Other</option></select></label>
        <label>Environment<select value={environment} onChange={event=>setEnvironment(event.target.value)}><option value="lab">Lab</option><option value="staging">Staging</option><option value="production">Production</option></select></label>
        <button className="primaryButton compact" type="submit" disabled={Boolean(busy)}>{busy==="enroll"?"Enrolling…":"Enroll device"}</button>
      </form>
    </details>

    <details>
      <summary>Bounded capability grants</summary>
      <form className="authForm" onSubmit={issueGrant} aria-busy={busy==="grant"}>
        <label>Active device<select required value={grantDevice} onChange={event=>setGrantDevice(event.target.value)}><option value="">Select device</option>{(workspace?.devices||[]).filter(item=>item.status==="active").map(device=><option key={device.id} value={device.id}>{device.display_name}</option>)}</select></label>
        <fieldset>
          <legend>Capabilities</legend>
          {allowedCapabilities.map(capability=><label key={capability}><input type="checkbox" checked={grantCapabilities.includes(capability)} onChange={()=>toggleCapability(capability)}/>{capability}</label>)}
        </fieldset>
        <label>Reason<textarea required maxLength={1000} value={grantReason} onChange={event=>setGrantReason(event.target.value)} placeholder="Why this bounded grant is required"/></label>
        <label>Expiry<input required type="datetime-local" value={grantExpiry} onChange={event=>setGrantExpiry(event.target.value)}/></label>
        <button className="primaryButton compact" type="submit" disabled={Boolean(busy)||!grantDevice||grantCapabilities.length===0}>{busy==="grant"?"Issuing…":"Issue bounded grant"}</button>
      </form>
      <div className="settingsList">
        {(workspace?.grants||[]).map(grant=><div key={grant.id}>
          <dt>{deviceById.get(grant.device_id)?.display_name||"Device"}</dt>
          <dd>
            <div>{grant.capabilities.join(", ")} · {grant.status}</div>
            <small>Expires {fmt(grant.expires_at)} · {grant.reason}</small>
            {grant.status==="active"&&<button className="textButton" type="button" onClick={()=>void revokeGrant(grant)} disabled={Boolean(busy)}>Revoke grant</button>}
          </dd>
        </div>)}
        {!workspace?.grants?.length&&<div><dt>Grants</dt><dd>No device grants recorded.</dd></div>}
      </div>
    </details>

    <details>
      <summary>Device reports</summary>
      <div className="settingsList">
        {(workspace?.reports||[]).map(report=><div key={report.id}>
          <dt>{report.title}</dt>
          <dd>
            <div>{deviceById.get(report.device_id)?.display_name||"Device"} · {report.report_type} · {report.severity}</div>
            <small>{report.summary}</small>
            <small>Observed {fmt(report.observed_at)}{report.evidence_reference?" · Evidence "+report.evidence_reference:""}</small>
          </dd>
        </div>)}
        {!workspace?.reports?.length&&<div><dt>Reports</dt><dd>No sanitized device reports recorded.</dd></div>}
      </div>
    </details>

    <details>
      <summary>Administration audit</summary>
      <div className="settingsList">
        {(workspace?.audit||[]).map(event=><div key={event.id}>
          <dt>{event.event_type.replaceAll("_"," ")}</dt>
          <dd><div>{event.detail}</div><small>{fmt(event.created_at)}</small></dd>
        </div>)}
        {!workspace?.audit?.length&&<div><dt>Audit</dt><dd>No R&D device administration events recorded.</dd></div>}
      </div>
    </details>
  </section>;
}
