"use client";

import { useEffect, useState } from "react";

type Finding = {
  id:string;
  title:string;
  domain:string;
  severity:string;
  confidence:string;
  reported_status:string;
  priority:string;
  validation_state:string;
};

type FindingsDocument = {
  audit_id:string;
  audit_date:string;
  audit_type:string;
  source_baseline:string;
  certification_status:string;
  validation_state:string;
  findings:Finding[];
};

type LibertyIndexDocument = {
  generatedAt:string;
  status:string;
  headSha:string;
  coverage:{
    indexedRecords:number;
    publicRecords:number;
    controlledRecords:number;
    restrictedRecords:number;
    missingEvidenceSources:number;
  };
  missingEvidenceSources:string[];
  disclosure:{
    recordContentsPublished:boolean;
    secretsPublished:boolean;
    privateAuthenticationMaterialPublished:boolean;
    protectedPersonalDataPublished:boolean;
  };
};

const auditDomains = [
  "UI / UX / information architecture",
  "Accessibility and interaction quality",
  "Architecture and system boundaries",
  "Authentication / authorization / security",
  "UNIFI planning and Job Manifests",
  "TranScheduler and execution controls",
  "DataNest AI and external AI handoff",
  "Think Tanks and reviewed institutional learning",
  "Contribution Intelligence and stakeholder progression",
  "Sparks internal-utility economy",
  "Sovereign Governance and formal membership",
  "Product Lab and output quality",
  "Auditability, traceability and observability",
  "Deployment, CI/CD and release integrity",
  "Reliability, recovery and failure handling",
  "Cost, maintainability and operational efficiency",
  "End-to-end user journeys",
  "Prioritized optimization backlog"
];

const invariantHighlights = [
  "GitHub remains source authority and Supabase remains the application/control-plane authority.",
  "UNKNOWN capability state is never treated as execution permission.",
  "Independent review, audit history, authorization checks and certification gates cannot be optimized away.",
  "Sparks remain internal utility only and do not create ownership, royalties or voting weight.",
  "Governance remains one active project member, one vote and does not amend contracts or financial rights.",
  "Project invitations do not create access or voting eligibility until the matching authenticated account becomes active.",
  "Normal user UI must not silently reintroduce Capacity or Operations Capabilities."
];

const publicBasePath=process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const briefPartUrls = Array.from({length:8},(_,index)=>`${publicBasePath}/transparency/audits/external-full-system-audit-brief/part-${String(index+1).padStart(2,"0")}.txt`);
const auditReturnBase=`${publicBasePath}/transparency/audits/external-full-system-audit-return-2026-09-25`;
const auditReturnUrl=auditReturnBase+"/report.md";
const findingsUrl=auditReturnBase+"/findings.json";
const backlogUrl=auditReturnBase+"/remediation-backlog.json";
const systemCharterUrl=`${publicBasePath}/system-charter/`;
const visibilityUtilityIndexUrl=`${publicBasePath}/transparency/visibility-utility/index.json`;
const libertyIndexUrl=`${publicBasePath}/transparency/liberty-in-all/index.json`;
const libertyLiveUrl="https://raw.githubusercontent.com/DataNest-Supository/DataNest/automation/liberty-in-all/public/transparency/liberty-in-all/latest.json";

function downloadText(filename:string,text:string){
  const blob=new Blob([text],{type:"text/plain;charset=utf-8"});
  const href=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=href;
  anchor.download=filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

export default function TransparencyWorkspace(){
  const [fullBrief,setFullBrief]=useState("");
  const [briefLoading,setBriefLoading]=useState(false);
  const [briefError,setBriefError]=useState("");
  const [auditReturn,setAuditReturn]=useState("");
  const [auditReturnLoading,setAuditReturnLoading]=useState(false);
  const [auditReturnError,setAuditReturnError]=useState("");
  const [findings,setFindings]=useState<FindingsDocument|null>(null);
  const [findingsError,setFindingsError]=useState("");
  const [libertyIndex,setLibertyIndex]=useState<LibertyIndexDocument|null>(null);
  const [libertyIndexError,setLibertyIndexError]=useState("");

  useEffect(()=>{
    let cancelled=false;
    void fetch(findingsUrl,{cache:"no-store"})
      .then(response=>{
        if(!response.ok)throw new Error(`Unable to load findings (${response.status}).`);
        return response.json() as Promise<FindingsDocument>;
      })
      .then(data=>{if(!cancelled)setFindings(data);})
      .catch(error=>{if(!cancelled)setFindingsError(error instanceof Error?error.message:"Unable to load audit findings.");});
    return()=>{cancelled=true;};
  },[]);

  useEffect(()=>{
    let cancelled=false;
    void fetch(libertyLiveUrl,{cache:"no-store"})
      .then(response=>{
        if(!response.ok)throw new Error(`Live traceability snapshot is not initialized (${response.status}).`);
        return response.json() as Promise<LibertyIndexDocument>;
      })
      .then(data=>{if(!cancelled)setLibertyIndex(data);})
      .catch(error=>{if(!cancelled)setLibertyIndexError(error instanceof Error?error.message:"Live traceability snapshot is unavailable.");});
    return()=>{cancelled=true;};
  },[]);

  async function loadFullBrief(){
    if(fullBrief||briefLoading)return;
    setBriefLoading(true);
    setBriefError("");
    try{
      const responses=await Promise.all(briefPartUrls.map(url=>fetch(url,{cache:"no-store"})));
      const failed=responses.find(response=>!response.ok);
      if(failed)throw new Error(`Unable to load audit brief transcript (${failed.status}).`);
      const parts=await Promise.all(responses.map(response=>response.text()));
      setFullBrief(parts.join(""));
    }catch(error){
      setBriefError(error instanceof Error?error.message:"Unable to load the accessible audit brief.");
    }finally{
      setBriefLoading(false);
    }
  }

  async function loadAuditReturn(){
    if(auditReturn||auditReturnLoading)return;
    setAuditReturnLoading(true);
    setAuditReturnError("");
    try{
      const response=await fetch(auditReturnUrl,{cache:"no-store"});
      if(!response.ok)throw new Error(`Unable to load audit return (${response.status}).`);
      setAuditReturn(await response.text());
    }catch(error){
      setAuditReturnError(error instanceof Error?error.message:"Unable to load the external audit return.");
    }finally{
      setAuditReturnLoading(false);
    }
  }

  const highCount=findings?.findings.filter(item=>item.severity.startsWith("HIGH")).length||9;
  const mediumCount=findings?.findings.filter(item=>item.severity.startsWith("MEDIUM")).length||5;

  return <div className="transparencyWorkspace">
    <section className="heroPanel transparencyHero" aria-labelledby="transparency-title">
      <div>
        <p className="eyebrow">TRANSPARENCY</p>
        <h2 id="transparency-title">Audit library + public accountability record</h2>
        <p>
          DataNest publishes audit methodology, external audit returns, finding status and remediation evidence so stakeholders can inspect how the system is reviewed.
          Audit documents are informational evidence: they do not grant project roles, financial authority, ownership or governance power.
        </p>
        <div className="heroActions">
          <button className="primaryButton compact" type="button" onClick={()=>void loadAuditReturn()} disabled={auditReturnLoading}>
            {auditReturnLoading?"Loading audit return…":"Read external audit return"}
          </button>
          <a className="secondaryButton compact linkButton" href="#published-findings">View 14 findings</a>
        </div>
      </div>
      <div className="stackDiagram" aria-label="Transparency lifecycle">
        <div>Audit brief <b>Published</b></div><span aria-hidden="true">↓</span>
        <div>External return <b>Published</b></div><span aria-hidden="true">↓</span>
        <div>DataNest validation <b>Pending</b></div><span aria-hidden="true">↓</span>
        <div>Remediation <b>Not yet validated</b></div>
      </div>
    </section>

    <section className="metricGrid" aria-label="Transparency status">
      <article className="metricCard"><span>Published audit documents</span><strong>2</strong><small>Methodology + external return</small></article>
      <article className="metricCard"><span>External audit returns</span><strong>1</strong><small>Read-only / source-review scope</small></article>
      <article className="metricCard"><span>Published findings</span><strong>14</strong><small>{highCount+" high/verification · "+mediumCount+" medium"}</small></article>
      <article className="metricCard"><span>Validated / closed</span><strong>0</strong><small>DataNest validation pending</small></article>
    </section>

    <section className="notice errorNotice" role="note" aria-label="Audit coverage limitation">
      <b>Coverage boundary:</b> this external return is a substantive read-only public/source audit, not a full production certification.
      Authenticated UI behavior, deployed database controls, production mutations and output quality were not verified by the external auditor.
    </section>

    <section className="panel" aria-labelledby="audit-library-heading">
      <div className="panelHead">
        <div><p className="eyebrow">AUDIT LIBRARY</p><h3 id="audit-library-heading">Published audit documents</h3></div>
        <span className="countPill">READ ONLY</span>
      </div>

      <div className="transparencyDocumentGrid">
        <article className="transparencyDocCard">
          <div className="transparencyDocHeader">
            <div><p className="eyebrow">SYSTEM CHARTER · 1 OCT 2026</p><h3>Scope, Mission, Governance, Architecture &amp; Assurance</h3></div>
            <span className="badge good">PUBLISHED</span>
          </div>
          <p>Public charter covering mission, vision, value proposition, governance, specialized-tree architecture, infrastructure, products/services, market-growth controls, projections and standards alignment.</p>
          <dl className="transparencyMeta">
            <div><dt>Standards posture</dt><dd>ISO/NIST/WCAG aligned mapping; no certification claim</dd></div>
            <div><dt>Visibility</dt><dd>Public source-controlled platform document</dd></div>
          </dl>
          <div className="heroActions">
            <a className="primaryButton compact linkButton" href={systemCharterUrl}>Open System Charter</a>
            <a className="secondaryButton compact linkButton" href="https://github.com/DataNest-Supository/DataNest/blob/main/docs/DATANEST_SYSTEM_CHARTER.md">Source on GitHub</a>
            <a className="textButton linkButton" href={visibilityUtilityIndexUrl}>Visibility intelligence index</a>
          </div>
        </article>
        <article className="transparencyDocCard">
          <div className="transparencyDocHeader">
            <div><p className="eyebrow">LIBERTY-IN-ALL · CONTINUOUS TRACEABILITY</p><h3>On-demand provenance, indexing &amp; evidence visibility</h3></div>
            <span className="badge good">PUBLISHED</span>
          </div>
          <p>Continuously refreshed, source-attributable traceability metadata for interested individuals, stakeholders, auditors and regulators. Public output contains digests and lineage, not protected record contents.</p>
          <dl className="transparencyMeta">
            <div><dt>Operating rule</dt><dd>Maximum legitimate visibility · minimum necessary restriction</dd></div>
            <div><dt>Authority</dt><dd>Evidence/indexing only · no production authorization</dd></div>
            <div><dt>Live status</dt><dd>{libertyIndex?libertyIndex.status.toUpperCase():libertyIndexError?"NOT INITIALIZED":"LOADING"}</dd></div>
            <div><dt>Indexed evidence</dt><dd>{libertyIndex?`${libertyIndex.coverage.indexedRecords} records · ${libertyIndex.coverage.publicRecords} public metadata records`:"Awaiting current sanitized snapshot"}</dd></div>
            <div><dt>Source lineage</dt><dd>{libertyIndex?.headSha?<code>{libertyIndex.headSha.slice(0,12)}</code>:"Automation branch initializes after canonical activation"}</dd></div>
            <div><dt>Generated</dt><dd>{libertyIndex?.generatedAt?new Date(libertyIndex.generatedAt).toLocaleString():"Not yet available"}</dd></div>
          </dl>
          {libertyIndexError&&<p className="muted">Live index status: {libertyIndexError} The source-controlled descriptor and standard remain available.</p>}
          <div className="heroActions">
            <a className="primaryButton compact linkButton" href={libertyLiveUrl}>Open live traceability snapshot</a>
            <a className="secondaryButton compact linkButton" href={libertyIndexUrl}>Open index descriptor</a>
            <a className="secondaryButton compact linkButton" href="https://github.com/DataNest-Supository/DataNest/blob/main/docs/LIBERTY_IN_ALL_STANDARD.md">Read standard</a>
          </div>
        </article>
        <article className="transparencyDocCard"><div className="transparencyDocHeader"><div><p className="eyebrow">DATA NEST ARCHITECTURE · 28 SEP 2026</p><h3>Architecture &amp; Infrastructure Audit / Stakeholder Document</h3></div><span className="badge good">PUBLISHED</span></div><p>Current architecture authority, infrastructure boundaries, governed AI lifecycle, execution controls, security model, CI/CD evidence and clearly separated target-state capabilities.</p><dl className="transparencyMeta"><div><dt>Audience</dt><dd>Audit + stakeholder presentation</dd></div><div><dt>Status</dt><dd>Published reference; claims remain evidence-bound</dd></div></dl><div className="heroActions"><a className="primaryButton compact linkButton" href="./architecture">Open architecture document</a><a className="secondaryButton compact linkButton" href="https://github.com/DataNest-Supository/DataNest/blob/main/docs/ARCHITECTURE.md">Source on GitHub</a></div></article>
        <article className="transparencyDocCard"><div className="transparencyDocHeader"><div><p className="eyebrow">ADVERSARIAL VALIDATION · 28 SEP 2026</p><h3>DataNest AI Adversarial Stress-Test Evidence</h3></div><span className="badge good">PUBLISHED</span></div><p>Database-level validation of authentication boundaries, authority escalation, contribution certification, request idempotency, payload-tamper protection, row isolation and certified-memory exposure.</p><dl className="transparencyMeta"><div><dt>Scope</dt><dd>Staging runtime tests + production schema/function inspection</dd></div><div><dt>Result</dt><dd>Verified controls recorded; not a full penetration test</dd></div></dl><div className="heroActions"><a className="primaryButton compact linkButton" href="./stress-test">Open stress-test report</a><a className="secondaryButton compact linkButton" href="https://github.com/DataNest-Supository/DataNest/blob/main/docs/ADVERSARIAL_STRESS_TEST_2026-09-28.md">Source on GitHub</a></div></article>
        <article className="transparencyDocCard">
          <div className="transparencyDocHeader">
            <div>
              <p className="eyebrow">AUDIT METHODOLOGY · VERSION 1.0</p>
              <h3>External Full-System Audit Brief</h3>
            </div>
            <span className="badge good">PUBLISHED</span>
          </div>
          <p>
            The governing audit specification covering UI, architecture, workflows, AI, governance, output quality,
            reliability, security, deployment and optimization.
          </p>
          <dl className="transparencyMeta">
            <div><dt>Published</dt><dd>25 Sep 2026</dd></div>
            <div><dt>Baseline source</dt><dd><code>ac93d51828707d398dfa9c5a471d8a6ed4c9059f</code></dd></div>
            <div><dt>Baseline DB release</dt><dd><code>datanest-project-member-invitations-v1</code></dd></div>
            <div><dt>Audit result</dt><dd>External return received 25 Sep 2026</dd></div>
          </dl>
          <div className="heroActions">
            <button className="secondaryButton compact" type="button" onClick={()=>void loadFullBrief()} disabled={briefLoading}>
              {fullBrief?"Brief loaded":briefLoading?"Loading…":"Open full brief"}
            </button>
            <a className="textButton linkButton" href={`${publicBasePath}/transparency/audits/index.json`}>Document registry</a>
          </div>
        </article>

        <article className="transparencyDocCard">
          <div className="transparencyDocHeader">
            <div>
              <p className="eyebrow">EXTERNAL AUDIT RETURN · 25 SEP 2026</p>
              <h3>Read-only public + commit-pinned source review</h3>
            </div>
            <span className="badge warn">VALIDATION PENDING</span>
          </div>
          <p>
            The external auditor reported 14 actionable findings and explicitly declined to certify production readiness without authenticated, database, deployment and runtime-output evidence.
          </p>
          <dl className="transparencyMeta">
            <div><dt>Source baseline</dt><dd><code>ac93d51828707d398dfa9c5a471d8a6ed4c9059f</code></dd></div>
            <div><dt>Findings</dt><dd>14 reported · 0 DataNest-validated/closed</dd></div>
            <div><dt>Scope</dt><dd>Public artifacts + commit-pinned static source review</dd></div>
            <div><dt>Certification effect</dt><dd>None · not a full production certification</dd></div>
          </dl>
          <div className="heroActions">
            <button className="primaryButton compact" type="button" onClick={()=>void loadAuditReturn()} disabled={auditReturnLoading}>
              {auditReturn?"Audit return loaded":auditReturnLoading?"Loading…":"Open full audit return"}
            </button>
            <a className="secondaryButton compact linkButton" href={findingsUrl}>Findings JSON</a>
            <a className="secondaryButton compact linkButton" href={backlogUrl}>Reported backlog JSON</a>
          </div>
        </article>
      </div>
    </section>

    <section className="panel" id="published-findings" aria-labelledby="published-findings-heading">
      <div className="panelHead">
        <div><p className="eyebrow">EXTERNAL FINDINGS</p><h3 id="published-findings-heading">AUD-001 → AUD-014</h3></div>
        <span className="countPill">{findings?findings.findings.length:"14"} REPORTED</span>
      </div>
      <p className="muted">
        Severity, title, domain and reported status are preserved from the external return. The separate DataNest validation state starts as PENDING and must be changed only by reproducible validation/remediation evidence.
      </p>
      {findingsError&&<div className="notice errorNotice" role="alert">{findingsError}</div>}
      {!findings&&!findingsError&&<p className="muted">Loading structured findings…</p>}
      {findings&&<div className="transparencyFindingsWrap">
        <table className="transparencyFindingsTable">
          <thead><tr><th>ID</th><th>Finding</th><th>Domain</th><th>Severity</th><th>Reported status</th><th>DataNest validation</th></tr></thead>
          <tbody>
            {findings.findings.map(item=><tr key={item.id}>
              <td><b>{item.id}</b><small>{item.priority}</small></td>
              <td>{item.title}</td>
              <td>{item.domain}</td>
              <td><span className={"badge "+(item.severity.startsWith("HIGH")?"bad":"warn")}>{item.severity}</span></td>
              <td>{item.reported_status}</td>
              <td><span className="badge neutral">PENDING</span></td>
            </tr>)}
          </tbody>
        </table>
      </div>}
      <div className="heroActions">
        <a className="secondaryButton compact linkButton" href={findingsUrl}>Download structured findings</a>
        <a className="secondaryButton compact linkButton" href={backlogUrl}>Download reported remediation backlog</a>
      </div>
    </section>

    <section className="panel" id="full-audit-return" aria-labelledby="full-audit-return-heading">
      <div className="panelHead">
        <div><p className="eyebrow">IMMUTABLE SOURCE ARTIFACT</p><h3 id="full-audit-return-heading">External audit return · exact uploaded Markdown</h3></div>
        <span className="countPill">SOURCE PRESERVED</span>
      </div>
      <p className="muted">
        DataNest preserves the uploaded Markdown unchanged. Structured findings and backlog files are derived indexes for accessibility and workflow and do not replace the source artifact.
        The structured index interprets only the formal audit-return sections; any trailing non-report scratchpad text remains preserved in the raw artifact but is not treated as a finding.
      </p>
      {!auditReturn&&<div className="transparencyLoadBox">
        <button className="primaryButton compact" type="button" onClick={()=>void loadAuditReturn()} disabled={auditReturnLoading}>
          {auditReturnLoading?"Loading complete audit return…":"Load complete audit return"}
        </button>
        <a className="secondaryButton compact linkButton" href={auditReturnUrl}>Open raw Markdown</a>
      </div>}
      {auditReturnError&&<div className="notice errorNotice" role="alert">{auditReturnError}</div>}
      {auditReturn&&<>
        <div className="transparencyTranscriptActions">
          <button className="secondaryButton compact" type="button" onClick={()=>downloadText("Resonance_DataNest_External_Audit_Return_2026-09-25.md",auditReturn)}>Download exact Markdown</button>
          <span>{auditReturn.length.toLocaleString()+" characters"}</span>
        </div>
        <pre className="transparencyTranscript" tabIndex={0} aria-label="Complete external audit return source artifact">{auditReturn}</pre>
      </>}
    </section>

    <section className="panel" id="full-audit-brief" aria-labelledby="full-audit-brief-heading">
      <div className="panelHead">
        <div><p className="eyebrow">AUDIT METHODOLOGY</p><h3 id="full-audit-brief-heading">External Full-System Audit Brief · complete transcription</h3></div>
        <span className="countPill">VERSION 1.0</span>
      </div>
      {!fullBrief&&<div className="transparencyLoadBox">
        <button className="secondaryButton compact" type="button" onClick={()=>void loadFullBrief()} disabled={briefLoading}>
          {briefLoading?"Loading complete brief…":"Load complete audit brief"}
        </button>
        <span>The methodology remains independently readable alongside the audit return.</span>
      </div>}
      {briefError&&<div className="notice errorNotice" role="alert">{briefError}</div>}
      {fullBrief&&<>
        <div className="transparencyTranscriptActions">
          <button className="secondaryButton compact" type="button" onClick={()=>downloadText("Resonance_DataNest_External_Full_System_Audit_Brief_Accessible.txt",fullBrief)}>Download accessible brief</button>
          <span>{fullBrief.length.toLocaleString()+" characters"}</span>
        </div>
        <pre className="transparencyTranscript" tabIndex={0} aria-label="Complete accessible transcription of the External Full-System Audit Brief">{fullBrief}</pre>
      </>}
    </section>

    <section className="panel" id="audit-accessible-summary" aria-labelledby="accessible-summary-heading">
      <div className="panelHead">
        <div><p className="eyebrow">AUDIT SCOPE</p><h3 id="accessible-summary-heading">Original audit domains</h3></div>
        <span className="countPill">{auditDomains.length+" DOMAINS"}</span>
      </div>
      <ol className="transparencyDomainList">
        {auditDomains.map((domain,index)=><li key={domain}><span>{String(index+1).padStart(2,"0")}</span><b>{domain}</b></li>)}
      </ol>
    </section>

    <section className="panel" aria-labelledby="invariants-heading">
      <div className="panelHead">
        <div><p className="eyebrow">AUDIT GUARDRAILS</p><h3 id="invariants-heading">Non-negotiable system invariants</h3></div>
        <span className="countPill">PRESERVE</span>
      </div>
      <ul className="transparencyChecklist">
        {invariantHighlights.map(item=><li key={item}>{item}</li>)}
      </ul>
    </section>

    <section className="panel" aria-labelledby="publication-model-heading">
      <div className="panelHead">
        <div><p className="eyebrow">REMEDIATION GOVERNANCE</p><h3 id="publication-model-heading">Finding → validation → governed fix → closure</h3></div>
      </div>
      <div className="transparencyLifecycle">
        <article><b>1 · Reported finding</b><p>External source wording and evidence remain attributable and unchanged.</p></article>
        <article><b>2 · DataNest validation</b><p>Reproduce against the current release or mark not reproduced / evidence required.</p></article>
        <article><b>3 · Governed work</b><p>Accepted remediation links to a Job Manifest, branch/PR and exact acceptance test.</p></article>
        <article><b>4 · Release evidence</b><p>Certification, migration/function evidence where relevant, deployment and live verification.</p></article>
        <article><b>5 · Closure</b><p>Finding closes only with reproducible evidence or explicit governed risk acceptance.</p></article>
      </div>
    </section>
  </div>;
}
