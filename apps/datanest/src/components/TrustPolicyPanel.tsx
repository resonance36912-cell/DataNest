"use client";

import DataSovereigntyCard from "@/components/DataSovereigntyCard";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import {
  canApproveTrustPolicy,
  canProposeTrustPolicy,
  evidenceStates,
  retentionDispositionIntents,
  reuseStates,
  trustPolicyLabel,
  visibilityClasses,
  type ReuseState,
  type RetentionDispositionIntent,
  type TrustEvidenceState,
  type TrustPolicyRole,
  type VisibilityClass
} from "@/lib/trustPolicy";

type Row=Record<string,unknown>;
type Workspace={
  active_manifest:Row|null;
  manifests:Row[];
  provider_profiles:Row[];
  bindings:Row[];
  retention_policies:Row[];
  retention_holds:Row[];
  retention_reviews:Row[];
  can_propose:boolean;
  can_approve:boolean;
};

function rows(value:unknown){return Array.isArray(value)?value as Row[]:[];}
function text(value:unknown){return value==null?"":String(value);}
function list(value:unknown){return Array.isArray(value)?value.map(item=>String(item)):[];}
function date(value:unknown){
  const raw=text(value);
  if(!raw)return "—";
  return new Intl.DateTimeFormat(undefined,{year:"numeric",month:"short",day:"2-digit"}).format(new Date(raw));
}
function splitList(value:string){
  return value.split(/[\n,]/).map(item=>item.trim()).filter(Boolean);
}

export default function TrustPolicyPanel({
  projectId,currentUserId,role,setNotice,setError
}:{
  projectId:string;
  currentUserId:string;
  role:TrustPolicyRole;
  setNotice:(value:string)=>void;
  setError:(value:string)=>void;
}){
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);

  const [bindingSubjectType,setBindingSubjectType]=useState("project");
  const [bindingSubjectId,setBindingSubjectId]=useState(projectId);
  const [bindingReference,setBindingReference]=useState("");
  const [bindingVisibility,setBindingVisibility]=useState<VisibilityClass>("project_restricted");
  const [bindingReuse,setBindingReuse]=useState<ReuseState>("runtime_only");
  const [bindingPublication,setBindingPublication]=useState(false);
  const [bindingRationale,setBindingRationale]=useState("");
  const [bindingEvidence,setBindingEvidence]=useState("");

  const [manifestVisibility,setManifestVisibility]=useState<VisibilityClass>("project_restricted");
  const [manifestReuse,setManifestReuse]=useState<ReuseState>("runtime_only");
  const [manifestEvidenceState,setManifestEvidenceState]=useState<TrustEvidenceState>("unknown");
  const [manifestEvidence,setManifestEvidence]=useState("");
  const [manifestLimitations,setManifestLimitations]=useState("");
  const [manifestPolicyVersion,setManifestPolicyVersion]=useState("phase-c-trust-v1");
  const [manifestRetentionPolicy,setManifestRetentionPolicy]=useState("");
  const [manifestEnforcementMode,setManifestEnforcementMode]=useState("report_only");
  const [manifestApprovedProviderKeys,setManifestApprovedProviderKeys]=useState("");

  const [providerConnection,setProviderConnection]=useState("");
  const [providerKey,setProviderKey]=useState("");
  const [providerCategory,setProviderCategory]=useState("ai_model");
  const [providerVisibility,setProviderVisibility]=useState("project_restricted");
  const [providerPurposes,setProviderPurposes]=useState("external_provider_processing");
  const [providerProhibitedPurposes,setProviderProhibitedPurposes]=useState("");
  const [providerRegions,setProviderRegions]=useState("");
  const [providerRetentionPosture,setProviderRetentionPosture]=useState("");
  const [providerTrainingPosture,setProviderTrainingPosture]=useState("");
  const [providerEvidenceState,setProviderEvidenceState]=useState<TrustEvidenceState>("unknown");
  const [providerSecurityEvidence,setProviderSecurityEvidence]=useState("");
  const [providerContractEvidence,setProviderContractEvidence]=useState("");
  const [providerLocality,setProviderLocality]=useState("");
  const [providerCredentialBoundary,setProviderCredentialBoundary]=useState("Credentials remain in the existing server-side provider connection.");
  const [providerPolicyVersion,setProviderPolicyVersion]=useState("phase-c-provider-trust-v1");
  const [providerReviewDue,setProviderReviewDue]=useState("");
  const [providerLimitations,setProviderLimitations]=useState("");

  const [retentionKey,setRetentionKey]=useState("project-default");
  const [retentionVisibility,setRetentionVisibility]=useState("project_restricted");
  const [retentionReuse,setRetentionReuse]=useState("runtime_only,session_context,project_learning_eligible");
  const [retentionSubjects,setRetentionSubjects]=useState("project,job,ai_event,file");
  const [retentionDays,setRetentionDays]=useState("");
  const [retentionReviewDays,setRetentionReviewDays]=useState("90");
  const [retentionDisposition,setRetentionDisposition]=useState<RetentionDispositionIntent>("retain");
  const [retentionReason,setRetentionReason]=useState("");
  const [retentionAuthorityBasis,setRetentionAuthorityBasis]=useState("");
  const [retentionEvidenceReference,setRetentionEvidenceReference]=useState("");
  const [retentionReviewDue,setRetentionReviewDue]=useState("");

  const [reviewSubjectType,setReviewSubjectType]=useState("project");
  const [reviewSubjectId,setReviewSubjectId]=useState(projectId);
  const [reviewSubjectReference,setReviewSubjectReference]=useState("");
  const [reviewPolicyId,setReviewPolicyId]=useState("");
  const [reviewDisposition,setReviewDisposition]=useState<RetentionDispositionIntent>("review_due");
  const [reviewRationale,setReviewRationale]=useState("");

  const [holdSubjectType,setHoldSubjectType]=useState("project");
  const [holdSubjectId,setHoldSubjectId]=useState(projectId);
  const [holdSubjectReference,setHoldSubjectReference]=useState("");
  const [holdType,setHoldType]=useState("governance");
  const [holdReason,setHoldReason]=useState("");

  const canPropose=canProposeTrustPolicy(role);
  const canApprove=canApproveTrustPolicy(role);

  const load=useCallback(async()=>{
    const supabase=getSupabase();
    if(!supabase){setLoading(false);setError("Trust & Data Policy is unavailable.");return;}
    setLoading(true);
    const {data,error}=await supabase.rpc("get_trust_policy_workspace_v1",{target_project:projectId});
    if(error){setError(error.message);setWorkspace(null);}
    else{
      const raw=(data||{}) as Record<string,unknown>;
      const next:Workspace={
        active_manifest:(raw.active_manifest||null) as Row|null,
        manifests:rows(raw.manifests),
        provider_profiles:rows(raw.provider_profiles),
        bindings:rows(raw.bindings),
        retention_policies:rows(raw.retention_policies),
        retention_holds:rows(raw.retention_holds),
        retention_reviews:rows(raw.retention_reviews),
        can_propose:Boolean(raw.can_propose),
        can_approve:Boolean(raw.can_approve)
      };
      setWorkspace(next);
      const activePolicy=next.retention_policies.find(item=>text(item.status)==="active");
      setReviewPolicyId(current=>current||text(activePolicy?.id));
    }
    setLoading(false);
  },[projectId,setError]);

  useEffect(()=>{void load();},[load]);

  async function rpc(name:string,args:Record<string,unknown>,notice:string){
    const supabase=getSupabase(); if(!supabase)return;
    setBusy(true);setError("");
    const {error}=await supabase.rpc(name,args);
    if(error)setError(error.message);
    else{setNotice(notice);await load();}
    setBusy(false);
  }

  function subjectId(type:string,value:string){
    return ["project","product","job","certified_memory","portfolio_item"].includes(type)?(value||null):null;
  }
  function subjectReference(type:string,value:string){
    return ["project","product","job","certified_memory","portfolio_item"].includes(type)?null:(value.trim()||null);
  }

  async function proposeBinding(event:FormEvent){
    event.preventDefault();
    await rpc("propose_data_policy_binding_v1",{
      target_project:projectId,
      target_subject_type:bindingSubjectType,
      target_subject_id:subjectId(bindingSubjectType,bindingSubjectId),
      target_subject_reference:subjectReference(bindingSubjectType,bindingReference),
      target_visibility_class:bindingVisibility,
      target_reuse_state:bindingReuse,
      target_publication_authorized:bindingPublication,
      target_rationale:bindingRationale.trim(),
      target_evidence_reference:bindingEvidence.trim()||null
    },"Trust policy proposal recorded for governed review.");
    setBindingRationale("");setBindingEvidence("");
  }

  async function createManifest(event:FormEvent){
    event.preventDefault();
    await rpc("create_trust_manifest_draft_v1",{
      target_project:projectId,
      target_scope_type:"project",
      target_product:null,
      target_default_visibility_class:manifestVisibility,
      target_default_reuse_state:manifestReuse,
      target_publication_policy:"governed_only",
      target_export_policy:"governed_only",
      target_evidence_state:manifestEvidenceState,
      target_evidence_reference:manifestEvidence.trim()||null,
      target_known_limitations:manifestLimitations.trim()||null,
      target_policy_version:manifestPolicyVersion.trim(),
      target_retention_policy:manifestRetentionPolicy||null,
      target_enforcement_mode:manifestEnforcementMode,
      target_approved_provider_keys:splitList(manifestApprovedProviderKeys)
    },"Trust Manifest draft created. It is not active until independent owner/admin review.");
  }

  async function createProviderProfile(event:FormEvent){
    event.preventDefault();
    await rpc("create_provider_trust_profile_v1",{
      target_project:projectId,
      target_provider_connection:providerConnection.trim()||null,
      target_provider_key:providerKey.trim(),
      target_provider_category:providerCategory,
      target_allowed_visibility_classes:splitList(providerVisibility),
      target_allowed_purposes:splitList(providerPurposes),
      target_prohibited_purposes:splitList(providerProhibitedPurposes),
      target_allowed_regions:splitList(providerRegions),
      target_retention_posture:providerRetentionPosture.trim()||null,
      target_training_reuse_posture:providerTrainingPosture.trim()||null,
      target_security_evidence_reference:providerSecurityEvidence.trim()||null,
      target_contractual_evidence_reference:providerContractEvidence.trim()||null,
      target_data_locality_guarantees:providerLocality.trim()||null,
      target_credential_boundary_description:providerCredentialBoundary.trim()||null,
      target_evidence_state:providerEvidenceState,
      target_policy_version:providerPolicyVersion.trim(),
      target_review_due_at:providerReviewDue?new Date(providerReviewDue).toISOString():null,
      target_known_limitations:providerLimitations.trim()||null
    },"Provider Trust Profile draft created without storing provider credentials.");
  }

  async function proposeRetentionPolicy(event:FormEvent){
    event.preventDefault();
    await rpc("propose_retention_policy_v1",{
      target_project:projectId,
      target_policy_key:retentionKey.trim(),
      target_applicable_visibility_classes:splitList(retentionVisibility),
      target_applicable_reuse_states:splitList(retentionReuse),
      target_applicable_subject_types:splitList(retentionSubjects),
      target_default_retention_days:retentionDays?Number(retentionDays):null,
      target_review_interval_days:retentionReviewDays?Number(retentionReviewDays):null,
      target_default_disposition_intent:retentionDisposition,
      target_rules:{phase_c_v1:"non_destructive",proposal_reason:retentionReason.trim()||null},
      target_minimum_evidence:{review_required:true},
      target_requires_lineage_review:true,
      target_authority_basis:retentionAuthorityBasis.trim()||null,
      target_evidence_reference:retentionEvidenceReference.trim()||null,
      target_review_due_at:retentionReviewDue?new Date(retentionReviewDue).toISOString():null
    },"Retention policy proposal recorded. No data was deleted or anonymized.");
  }

  async function requestReview(event:FormEvent){
    event.preventDefault();
    await rpc("request_retention_review_v1",{
      target_project:projectId,
      target_subject_type:reviewSubjectType,
      target_subject_id:subjectId(reviewSubjectType,reviewSubjectId),
      target_subject_reference:subjectReference(reviewSubjectType,reviewSubjectReference),
      target_retention_policy:reviewPolicyId||null,
      target_proposed_disposition:reviewDisposition,
      target_rationale:reviewRationale.trim(),
      target_evidence_reference:null
    },"Retention review requested. This is review evidence only, not a destructive action.");
    setReviewRationale("");
  }

  async function placeHold(event:FormEvent){
    event.preventDefault();
    await rpc("place_retention_hold_v1",{
      target_project:projectId,
      target_subject_type:holdSubjectType,
      target_subject_id:subjectId(holdSubjectType,holdSubjectId),
      target_subject_reference:subjectReference(holdSubjectType,holdSubjectReference),
      target_hold_type:holdType,
      target_reason:holdReason.trim(),
      target_evidence_reference:null
    },"Retention hold placed.");
    setHoldReason("");
  }

  const activeManifest=workspace?.active_manifest||null;
  const pendingBindings=useMemo(()=>workspace?.bindings.filter(item=>text(item.status)==="proposed")||[],[workspace]);
  const draftManifests=useMemo(()=>workspace?.manifests.filter(item=>text(item.status)==="draft")||[],[workspace]);
  const activePolicies=useMemo(()=>workspace?.retention_policies.filter(item=>text(item.status)==="active")||[],[workspace]);
  const draftPolicies=useMemo(()=>workspace?.retention_policies.filter(item=>text(item.status)==="draft")||[],[workspace]);
  const pendingReviews=useMemo(()=>workspace?.retention_reviews.filter(item=>text(item.status)==="pending")||[],[workspace]);

  if(loading)return <section className="panel"><p className="muted">Loading Trust & Data Policy…</p></section>;
  if(!workspace)return <section className="panel"><p className="muted">Trust & Data Policy workspace is unavailable.</p></section>;

  return <div className="trustPolicyWorkspace">
    <section className="heroPanel">
      <div>
        <p className="eyebrow">PHASE C · TRUST & DATA POLICY</p>
        <h2>Processing, reuse, provider trust and retention</h2>
        <p>Processing permission does not grant learning or publication permission. DataNest evaluates these authorities independently and preserves existing project, Job, file-access and certified-memory controls. High-impact widening requires independent review.</p>
        <div className="heroActions"><button className="secondaryButton compact" onClick={()=>void load()}>Refresh</button></div>
      </div>
    </section>

    <section className="trustPolicyWarnings" aria-label="Trust policy boundaries">
      <p><b>Processing permission does not grant learning or publication permission.</b></p>
      <p><b>No destructive retention action is enabled in Phase C v1.</b></p>
      <p><b>Provider credentials are managed outside Trust Profiles.</b></p>
      <p><b>Planned/unknown controls are not verified trust guarantees.</b></p>\n      <p><b>High-impact widening requires independent review; authors cannot approve their own high-impact proposal.</b></p>
    </section>

    <section className="metricGrid">
      <article className="metricCard"><span>Visibility / processing</span><strong>{trustPolicyLabel(text(activeManifest?.default_visibility_class)||"unknown")}</strong><small>Independent of reuse</small></article>
      <article className="metricCard"><span>Reuse / learning</span><strong>{trustPolicyLabel(text(activeManifest?.default_reuse_state)||"runtime_only")}</strong><small>Certification remains separate</small></article>
      <article className="metricCard"><span>Provider profiles</span><strong>{workspace.provider_profiles.length}</strong><small>Policy metadata only</small></article>
      <article className="metricCard"><span>Active holds</span><strong>{workspace.retention_holds.length}</strong><small>Block future disposition</small></article>
    </section>

    <DataSovereigntyCard activeManifest={activeManifest} providerProfiles={workspace.provider_profiles} retentionPolicies={workspace.retention_policies} retentionHolds={workspace.retention_holds}/>

    <section className="panel">
      <div className="panelHead"><div><p className="eyebrow">ACTIVE TRUST MANIFEST</p><h3>{activeManifest?"Version "+text(activeManifest.version):"No active manifest"}</h3></div>{activeManifest&&<span className={"badge "+(text(activeManifest.evidence_state)==="verified"?"good":"neutral")}>{trustPolicyLabel(text(activeManifest.evidence_state))}</span>}</div>
      {activeManifest?<dl className="settingsList">
        <div><dt>Visibility / processing</dt><dd>{trustPolicyLabel(text(activeManifest.default_visibility_class))}</dd></div>
        <div><dt>Reuse / learning</dt><dd>{trustPolicyLabel(text(activeManifest.default_reuse_state))}</dd></div>
        <div><dt>Policy version</dt><dd>{text(activeManifest.policy_version)}</dd></div>
        <div><dt>Enforcement</dt><dd>{trustPolicyLabel(text(activeManifest.enforcement_mode)||"report_only")}</dd></div>
        <div><dt>Evidence</dt><dd>{text(activeManifest.evidence_reference)||"—"}</dd></div>
        <div><dt>Known limitations</dt><dd>{text(activeManifest.known_limitations)||"None recorded"}</dd></div>
      </dl>:<p className="muted">No active project Trust Manifest exists. External provider routing, publication and learning decisions therefore remain fail-closed where Phase C policy is required.</p>}
    </section>

    <section className="panel">
      <div className="panelHead"><div><p className="eyebrow">PROVIDER TRUST PROFILES</p><h3>External processing boundaries</h3></div><span className="countPill">{workspace.provider_profiles.length}</span></div>
      {workspace.provider_profiles.length?<div className="trustPolicyCards">{workspace.provider_profiles.map(item=><article className="manifestCard" key={text(item.id)}>
        <div className="rowBetween"><b>{text(item.provider_key)}</b><span className="badge neutral">{trustPolicyLabel(text(item.status))}</span></div>
        <p>{text(item.provider_category)} · evidence {trustPolicyLabel(text(item.evidence_state))}</p>
        <div className="manifestMeta">
          <span>visibility: {list(item.allowed_visibility_classes).map(trustPolicyLabel).join(", ")||"none"}</span>
          <span>purposes: {list(item.allowed_purposes).join(", ")||"none"}</span>
          <span>review: {date(item.review_due_at)}</span>
        </div>
        <p className="muted">{text(item.training_reuse_posture)||"Training/reuse posture not recorded."}</p>
        {canApprove&&<div className="rowActions">
          {text(item.status)==="draft"&&<><button className="primaryButton compact" disabled={busy||text(item.created_by)===currentUserId} onClick={()=>void rpc("activate_provider_trust_profile_v1",{target_profile:item.id},"Provider Trust Profile activated.")}>Activate</button>{text(item.created_by)===currentUserId&&<small>Independent review is required for a self-authored Provider Trust Profile.</small>}</>}
          {text(item.status)==="active"&&<button className="secondaryButton compact" disabled={busy} onClick={()=>void rpc("suspend_provider_trust_profile_v1",{target_profile:item.id,target_reason:"Suspended from Trust & Data Policy workspace."},"Provider Trust Profile suspended.")}>Suspend</button>}
          {text(item.status)!=="retired"&&<button className="textButton" disabled={busy} onClick={()=>void rpc("retire_provider_trust_profile_v1",{target_profile:item.id,target_reason:"Retired from Trust & Data Policy workspace."},"Provider Trust Profile retired.")}>Retire</button>}
        </div>}
      </article>)}</div>:<p className="muted">No Provider Trust Profiles have been recorded. External routing remains fail-closed under Phase C policy.</p>}
    </section>

    <section className="panel">
      <div className="panelHead"><div><p className="eyebrow">POLICY PROPOSALS</p><h3>Governed visibility and reuse changes</h3></div><span className="countPill">{pendingBindings.length}</span></div>
      {pendingBindings.length?<div className="trustPolicyCards">{pendingBindings.map(item=><article className="manifestCard" key={text(item.id)}>
        <b>{text(item.subject_type)} · {text(item.subject_id)||text(item.subject_reference)}</b>
        <p>Visibility / processing: {trustPolicyLabel(text(item.visibility_class))}</p>
        <p>Reuse / learning: {trustPolicyLabel(text(item.reuse_state))}</p>
        <small>{text(item.rationale)}</small>
        {canApprove&&<div className="rowActions">
          <button className="primaryButton compact" disabled={busy||(text(item.proposed_by)===currentUserId&&(text(item.visibility_class)==="public"||["platform_learning_eligible","datanest_certified_knowledge","publicly_reusable"].includes(text(item.reuse_state))||Boolean(item.publication_authorized)))} onClick={()=>void rpc("approve_data_policy_binding_v1",{target_binding:item.id},"Data policy proposal approved.")}>Approve</button>
          <button className="textButton" disabled={busy} onClick={()=>void rpc("reject_data_policy_binding_v1",{target_binding:item.id,target_reason:"Rejected from Trust & Data Policy workspace."},"Data policy proposal rejected.")}>Reject</button>
        </div>}
      </article>)}</div>:<p className="muted">No policy proposals are awaiting review.</p>}
    </section>

    <section className="panel">
      <div className="panelHead"><div><p className="eyebrow">RETENTION REVIEW</p><h3>Review-only lifecycle evidence</h3></div><span className="countPill">{pendingReviews.length}</span></div>
      {workspace.retention_holds.length>0&&<div className="trustPolicyCards">{workspace.retention_holds.map(item=><article className="manifestCard" key={text(item.id)}>
        <b>{trustPolicyLabel(text(item.hold_type))} hold</b><p>{text(item.reason)}</p><small>{text(item.subject_type)} · {text(item.subject_id)||text(item.subject_reference)}</small>
        {canApprove&&<button className="textButton" disabled={busy} onClick={()=>void rpc("release_retention_hold_v1",{target_hold:item.id,target_reason:"Released after governed review."},"Retention hold released.")}>Release hold</button>}
      </article>)}</div>}
      {pendingReviews.length?<div className="trustPolicyCards">{pendingReviews.map(item=><article className="manifestCard" key={text(item.id)}>
        <div className="rowBetween"><b>{text(item.subject_type)}</b><span className="badge neutral">{trustPolicyLabel(text(item.proposed_disposition))}</span></div>
        <p>{text(item.rationale)}</p>
        <div className="manifestMeta"><span>holds {text(item.active_hold_count)||"0"}</span><span>lineage {text(item.active_lineage_count)||"0"}</span><span>blocked {String(Boolean(item.future_disposition_blocked))}</span></div>
        {canApprove&&<div className="rowActions">
          <button className="secondaryButton compact" disabled={busy} onClick={()=>void rpc("resolve_retention_review_v1",{target_review:item.id,target_status:"keep",target_reason:"Keep after governed review.",target_evidence_reference:null},"Retention review resolved: keep.")}>Keep</button>
          <button className="secondaryButton compact" disabled={busy} onClick={()=>void rpc("resolve_retention_review_v1",{target_review:item.id,target_status:"blocked",target_reason:"Blocked pending further evidence.",target_evidence_reference:null},"Retention review blocked.")}>Block</button>
          <button className="primaryButton compact" disabled={busy||Boolean(item.future_disposition_blocked)} onClick={()=>void rpc("resolve_retention_review_v1",{target_review:item.id,target_status:"approved_for_future_disposition",target_reason:"Future disposition approved after server-derived lineage review. No destructive action executed.",target_evidence_reference:null},"Future disposition review approved; no data was deleted.")}>Approve future disposition</button>
        </div>}
      </article>)}</div>:<p className="muted">No retention reviews are pending.</p>}
    </section>

    {canPropose&&<section className="trustPolicyActionGrid">
      <details className="panel quietDisclosure">
        <summary>Propose data policy</summary>
        <form className="settingsGrid" onSubmit={proposeBinding}>
          <label>Subject type<select value={bindingSubjectType} onChange={e=>{const value=e.target.value;setBindingSubjectType(value);if(value==="project")setBindingSubjectId(projectId);}}>
            {["project","product","job","ai_event","certified_memory","portfolio_item","file","transparency_artifact","other"].map(value=><option key={value} value={value}>{trustPolicyLabel(value)}</option>)}
          </select></label>
          {["project","product","job","certified_memory","portfolio_item"].includes(bindingSubjectType)
            ?<label>Subject ID<input value={bindingSubjectId} onChange={e=>setBindingSubjectId(e.target.value)} required/></label>
            :<label>Subject reference<input value={bindingReference} onChange={e=>setBindingReference(e.target.value)} required placeholder="Stable trace or governed reference"/></label>}
          <label>Visibility / processing<select value={bindingVisibility} onChange={e=>setBindingVisibility(e.target.value as VisibilityClass)}>{visibilityClasses.map(value=><option key={value} value={value}>{trustPolicyLabel(value)}</option>)}</select></label>
          <label>Reuse / learning<select value={bindingReuse} onChange={e=>setBindingReuse(e.target.value as ReuseState)}>{reuseStates.map(value=><option key={value} value={value}>{trustPolicyLabel(value)}</option>)}</select></label>
          <label className="checkboxLine"><input type="checkbox" checked={bindingPublication} onChange={e=>setBindingPublication(e.target.checked)}/> Publication authorized</label>
          <label>Rationale<textarea rows={3} value={bindingRationale} onChange={e=>setBindingRationale(e.target.value)} required/></label>
          <label>Evidence reference<input value={bindingEvidence} onChange={e=>setBindingEvidence(e.target.value)}/></label>
          <button className="primaryButton" disabled={busy||!bindingRationale.trim()}>Propose policy</button>
        </form>
      </details>

      <details className="panel quietDisclosure">
        <summary>Create Trust Manifest draft</summary>
        <form className="settingsGrid" onSubmit={createManifest}>
          <label>Default visibility / processing<select value={manifestVisibility} onChange={e=>setManifestVisibility(e.target.value as VisibilityClass)}>{visibilityClasses.map(value=><option key={value} value={value}>{trustPolicyLabel(value)}</option>)}</select></label>
          <label>Default reuse / learning<select value={manifestReuse} onChange={e=>setManifestReuse(e.target.value as ReuseState)}>{reuseStates.map(value=><option key={value} value={value}>{trustPolicyLabel(value)}</option>)}</select></label>
          <label>Evidence state<select value={manifestEvidenceState} onChange={e=>setManifestEvidenceState(e.target.value as TrustEvidenceState)}>{evidenceStates.map(value=><option key={value} value={value}>{trustPolicyLabel(value)}</option>)}</select></label>
          <label>Evidence reference<input value={manifestEvidence} onChange={e=>setManifestEvidence(e.target.value)}/></label>
          <label>Known limitations<textarea rows={3} value={manifestLimitations} onChange={e=>setManifestLimitations(e.target.value)}/></label>
          <label>Policy version<input value={manifestPolicyVersion} onChange={e=>setManifestPolicyVersion(e.target.value)} required/></label>
          <label>Retention policy<select value={manifestRetentionPolicy} onChange={e=>setManifestRetentionPolicy(e.target.value)}><option value="">None</option>{activePolicies.map(item=><option key={text(item.id)} value={text(item.id)}>{text(item.policy_key)} v{text(item.version)}</option>)}</select></label>
          <label>Rollout mode<select value={manifestEnforcementMode} onChange={e=>setManifestEnforcementMode(e.target.value)}><option value="report_only">Report only</option><option value="enforced">Enforced</option></select></label>
          <label>Approved provider route keys<input value={manifestApprovedProviderKeys} onChange={e=>setManifestApprovedProviderKeys(e.target.value)} placeholder="provider:endpoint-host, one per line or comma separated"/></label>
          <small className="muted">Start with report-only. Enforced activation requires an active project policy binding, an active retention policy, and reviewed coverage for every active AI provider route.</small>
          <button className="primaryButton" disabled={busy||!manifestPolicyVersion.trim()}>Create manifest draft</button>
        </form>
      </details>

      <details className="panel quietDisclosure">
        <summary>Create Provider Trust Profile draft</summary>
        <form className="settingsGrid" onSubmit={createProviderProfile}>
          <label>Provider connection ID<input value={providerConnection} onChange={e=>setProviderConnection(e.target.value)} placeholder="Optional existing connection UUID"/></label>
          <label>Provider key<input value={providerKey} onChange={e=>setProviderKey(e.target.value)} required={!providerConnection.trim()} placeholder={providerConnection.trim()?"Derived server-side as provider:endpoint-host":"Stable provider key"}/></label>
          <label>Category<select value={providerCategory} onChange={e=>setProviderCategory(e.target.value)}>{["ai_model","storage","execution","search","communications","other"].map(value=><option key={value} value={value}>{trustPolicyLabel(value)}</option>)}</select></label>
          <label>Allowed visibility classes<input value={providerVisibility} onChange={e=>setProviderVisibility(e.target.value)}/></label>
          <label>Allowed purposes<input value={providerPurposes} onChange={e=>setProviderPurposes(e.target.value)}/></label>
          <label>Prohibited purposes<input value={providerProhibitedPurposes} onChange={e=>setProviderProhibitedPurposes(e.target.value)}/></label>
          <label>Allowed regions<input value={providerRegions} onChange={e=>setProviderRegions(e.target.value)}/></label>
          <label>Retention posture<textarea rows={2} value={providerRetentionPosture} onChange={e=>setProviderRetentionPosture(e.target.value)} required/></label>
          <label>Training/reuse posture<textarea rows={2} value={providerTrainingPosture} onChange={e=>setProviderTrainingPosture(e.target.value)} required/></label>
          <label>Evidence state<select value={providerEvidenceState} onChange={e=>setProviderEvidenceState(e.target.value as TrustEvidenceState)}>{evidenceStates.map(value=><option key={value} value={value}>{trustPolicyLabel(value)}</option>)}</select></label>
          <label>Security evidence reference<input value={providerSecurityEvidence} onChange={e=>setProviderSecurityEvidence(e.target.value)}/></label>
          <label>Contract evidence reference<input value={providerContractEvidence} onChange={e=>setProviderContractEvidence(e.target.value)}/></label>
          <label>Data-locality guarantees<input value={providerLocality} onChange={e=>setProviderLocality(e.target.value)}/></label>
          <label>Credential boundary description<textarea rows={2} value={providerCredentialBoundary} onChange={e=>setProviderCredentialBoundary(e.target.value)}/></label>
          <label>Policy version<input value={providerPolicyVersion} onChange={e=>setProviderPolicyVersion(e.target.value)} required/></label>
          <label>Review due<input type="date" value={providerReviewDue} onChange={e=>setProviderReviewDue(e.target.value)}/></label>
          <label>Known limitations<textarea rows={2} value={providerLimitations} onChange={e=>setProviderLimitations(e.target.value)}/></label>
          <button className="primaryButton" disabled={busy||(!providerConnection.trim()&&!providerKey.trim())||!providerRetentionPosture.trim()||!providerTrainingPosture.trim()}>Create provider profile draft</button>
        </form>
      </details>

      <details className="panel quietDisclosure">
        <summary>Propose retention policy</summary>
        <form className="settingsGrid" onSubmit={proposeRetentionPolicy}>
          <label>Policy key<input value={retentionKey} onChange={e=>setRetentionKey(e.target.value)} required/></label>
          <label>Visibility classes<input value={retentionVisibility} onChange={e=>setRetentionVisibility(e.target.value)}/></label>
          <label>Reuse states<input value={retentionReuse} onChange={e=>setRetentionReuse(e.target.value)}/></label>
          <label>Subject types<input value={retentionSubjects} onChange={e=>setRetentionSubjects(e.target.value)}/></label>
          <label>Retention days<input type="number" min="0" value={retentionDays} onChange={e=>setRetentionDays(e.target.value)}/></label>
          <label>Review interval days<input type="number" min="1" value={retentionReviewDays} onChange={e=>setRetentionReviewDays(e.target.value)}/></label>
          <label>Disposition intent<select value={retentionDisposition} onChange={e=>setRetentionDisposition(e.target.value as RetentionDispositionIntent)}>{retentionDispositionIntents.map(value=><option key={value} value={value}>{trustPolicyLabel(value)}</option>)}</select></label>
          <label>Status reason<textarea rows={2} value={retentionReason} onChange={e=>setRetentionReason(e.target.value)}/></label>
          <label>Authority basis<input value={retentionAuthorityBasis} onChange={e=>setRetentionAuthorityBasis(e.target.value)} placeholder="Required for fixed duration or delete-when-authorized intent"/></label>
          <label>Evidence reference<input value={retentionEvidenceReference} onChange={e=>setRetentionEvidenceReference(e.target.value)} placeholder="Policy, contract, regulation, decision, or reviewed evidence"/></label>
          <label>Review due<input type="date" value={retentionReviewDue} onChange={e=>setRetentionReviewDue(e.target.value)}/></label>
          <button className="primaryButton" disabled={busy||!retentionKey.trim()}>Propose retention policy</button>
        </form>
      </details>

      <details className="panel quietDisclosure">
        <summary>Request retention review</summary>
        <form className="settingsGrid" onSubmit={requestReview}>
          <label>Subject type<select value={reviewSubjectType} onChange={e=>{const value=e.target.value;setReviewSubjectType(value);if(value==="project")setReviewSubjectId(projectId);}}>{["project","product","job","ai_event","certified_memory","portfolio_item","file","transparency_artifact","other"].map(value=><option key={value} value={value}>{trustPolicyLabel(value)}</option>)}</select></label>
          {["project","product","job","certified_memory","portfolio_item"].includes(reviewSubjectType)
            ?<label>Subject ID<input value={reviewSubjectId} onChange={e=>setReviewSubjectId(e.target.value)} required/></label>
            :<label>Subject reference<input value={reviewSubjectReference} onChange={e=>setReviewSubjectReference(e.target.value)} required/></label>}
          <label>Retention policy<select value={reviewPolicyId} onChange={e=>setReviewPolicyId(e.target.value)} required><option value="">Select active policy</option>{activePolicies.map(item=><option key={text(item.id)} value={text(item.id)}>{text(item.policy_key)} v{text(item.version)}</option>)}</select></label>
          <label>Proposed disposition<select value={reviewDisposition} onChange={e=>setReviewDisposition(e.target.value as RetentionDispositionIntent)}>{retentionDispositionIntents.map(value=><option key={value} value={value}>{trustPolicyLabel(value)}</option>)}</select></label>
          <label>Rationale<textarea rows={3} value={reviewRationale} onChange={e=>setReviewRationale(e.target.value)} required/></label>
          <button className="primaryButton" disabled={busy||!reviewPolicyId||!reviewRationale.trim()}>Request review</button>
        </form>
      </details>

      {canApprove&&<details className="panel quietDisclosure">
        <summary>Place retention hold · Owner / admin</summary>
        <form className="settingsGrid" onSubmit={placeHold}>
          <label>Subject type<select value={holdSubjectType} onChange={e=>{const value=e.target.value;setHoldSubjectType(value);if(value==="project")setHoldSubjectId(projectId);}}>{["project","product","job","ai_event","certified_memory","portfolio_item","file","transparency_artifact","other"].map(value=><option key={value} value={value}>{trustPolicyLabel(value)}</option>)}</select></label>
          {["project","product","job","certified_memory","portfolio_item"].includes(holdSubjectType)
            ?<label>Subject ID<input value={holdSubjectId} onChange={e=>setHoldSubjectId(e.target.value)} required/></label>
            :<label>Subject reference<input value={holdSubjectReference} onChange={e=>setHoldSubjectReference(e.target.value)} required/></label>}
          <label>Hold type<select value={holdType} onChange={e=>setHoldType(e.target.value)}>{["legal","contractual","audit","security","governance","other"].map(value=><option key={value} value={value}>{trustPolicyLabel(value)}</option>)}</select></label>
          <label>Reason<textarea rows={3} value={holdReason} onChange={e=>setHoldReason(e.target.value)} required/></label>
          <button className="primaryButton" disabled={busy||!holdReason.trim()}>Place hold</button>
        </form>
      </details>}
    </section>}

    {canApprove&&<section className="panel">
      <div className="panelHead"><div><p className="eyebrow">OWNER / ADMIN REVIEW</p><h3>Activate governed trust state</h3></div><span className="countPill">Owner / admin</span></div>
      <div className="trustPolicyCards">
        {draftManifests.map(item=><article className="manifestCard" key={text(item.id)}>
          <b>Trust Manifest v{text(item.version)}</b><p>{trustPolicyLabel(text(item.evidence_state))} · {text(item.evidence_reference)||"no evidence reference"}</p>
          <div className="rowActions"><button className="primaryButton compact" disabled={busy||text(item.created_by)===currentUserId} onClick={()=>void rpc("activate_trust_manifest_v1",{target_manifest:item.id},"Trust Manifest activated.")}>Activate</button><button className="textButton" disabled={busy} onClick={()=>void rpc("reject_trust_manifest_v1",{target_manifest:item.id,target_reason:"Rejected from Trust & Data Policy workspace."},"Trust Manifest rejected.")}>Reject</button></div>{text(item.created_by)===currentUserId&&<small>Independent review is required for a self-authored Trust Manifest.</small>}
        </article>)}
        {draftPolicies.map(item=><article className="manifestCard" key={text(item.id)}>
          <b>Retention policy · {text(item.policy_key)} v{text(item.version)}</b><p>{trustPolicyLabel(text(item.default_disposition_intent))}</p>
          <div className="rowActions"><button className="primaryButton compact" disabled={busy} onClick={()=>void rpc("approve_retention_policy_v1",{target_policy:item.id},"Retention policy activated.")}>Approve</button><button className="textButton" disabled={busy} onClick={()=>void rpc("reject_retention_policy_v1",{target_policy:item.id,target_reason:"Rejected from Trust & Data Policy workspace."},"Retention policy rejected.")}>Reject</button></div>
        </article>)}
      </div>
    </section>}
  </div>;
}
