"use client";

import {deriveDataSovereigntyModel} from "@/lib/dataSovereignty";
import {trustPolicyLabel} from "@/lib/trustPolicy";

type Row=Record<string,unknown>;

function human(value:string){
  return trustPolicyLabel(value);
}

export default function DataSovereigntyCard({
  activeManifest,
  providerProfiles,
  retentionPolicies,
  retentionHolds
}:{
  activeManifest:Row|null;
  providerProfiles:Row[];
  retentionPolicies:Row[];
  retentionHolds:Row[];
}){
  const model=deriveDataSovereigntyModel({
    manifest:activeManifest,
    providerProfiles,
    retentionPolicies,
    retentionHolds
  });

  const regions=model.allowedRegions.length?model.allowedRegions.join(", "):"No verified/declared regional allowlist";
  const providers=model.activeApprovedProviderKeys.length?model.activeApprovedProviderKeys.join(", "):"No active approved external routes";
  const unresolved=model.unresolvedProviderKeys.length?model.unresolvedProviderKeys.join(", "):"None";

  return <section className="panel" aria-label="Data sovereignty model">
    <div className="panelHead">
      <div>
        <p className="eyebrow">DATA SOVEREIGNTY MODEL</p>
        <h3>Authority, locality, portability and reuse</h3>
      </div>
      <span className={"badge "+(model.rollout==="enforced"?"good":"neutral")}>{human(model.rollout)}</span>
    </div>

    <p className="muted">
      Sovereignty is derived from the active Trust Manifest and governed provider, retention and classification evidence.
      DataNest does not infer physical residency, customer-managed key custody, or ownership transfer from a provider name or deployment location. Runtime provider routes must explicitly declare a processing region before a regional allowlist can be enforced.
    </p>

    <section className="metricGrid">
      <article className="metricCard">
        <span>Authority</span>
        <strong>Project governed</strong>
        <small>Policy does not create a DataNest ownership claim</small>
      </article>
      <article className="metricCard">
        <span>Processing boundary</span>
        <strong>{human(model.boundary)}</strong>
        <small>{human(model.visibilityClass)}</small>
      </article>
      <article className="metricCard">
        <span>External processing</span>
        <strong>{human(model.externalProcessing)}</strong>
        <small>{model.approvedProviderKeys.length} approved route key{model.approvedProviderKeys.length===1?"":"s"}</small>
      </article>
      <article className="metricCard">
        <span>Reuse posture</span>
        <strong>{human(model.reusePosture)}</strong>
        <small>{human(model.reuseState)}</small>
      </article>
    </section>

    <dl className="settingsList">
      <div><dt>Cross-border posture</dt><dd>{human(model.crossBorder)}</dd></div>
      <div><dt>Allowed processing regions</dt><dd>{regions}</dd></div>
      <div><dt>Active approved providers</dt><dd>{providers}</dd></div>
      <div><dt>Unresolved provider routes</dt><dd>{unresolved}</dd></div>
      <div><dt>Export / portability</dt><dd>{human(model.exportPolicy)}</dd></div>
      <div><dt>Retention policy</dt><dd>{model.retentionPolicyKey?model.retentionPolicyKey+" · "+human(model.retentionDisposition||"retain"):"No active referenced retention policy"}</dd></div>
      <div><dt>Active holds</dt><dd>{model.activeHoldCount}</dd></div>
      <div><dt>Evidence state</dt><dd>{human(model.evidenceState)}</dd></div>
      <div><dt>Known limitations</dt><dd>{model.knownLimitations||"None recorded"}</dd></div>
    </dl>

    {model.rollout==="report_only"&&<p className="muted"><b>Report-only:</b> this model explains the governed target/effective policy posture but must not be represented as runtime enforcement until the active manifest is approved in enforced mode.</p>}
    {model.boundary==="local_only"&&<p className="muted"><b>Local-only:</b> external provider routing is denied by the existing Phase C policy model regardless of provider capability.</p>}
  </section>;
}
