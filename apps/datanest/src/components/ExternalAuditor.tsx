"use client";
import { useEffect,useMemo,useState } from "react";
import type { ExternalAuditorProps,AssessmentBundle } from "@/lib/externalAuditTypes";
import { STANDARDS_REGISTER,selectSuggestedStandards } from "@/lib/externalAuditStandards";
import { analyzeAssessment,approveAction,createAssessment,loadAssessment,publishAuditDocument,saveStandardsProfile,snapshotSource } from "@/lib/externalAuditClient";
import ExternalAuditDocuments from "@/components/ExternalAuditDocuments";
import GovernedAction from "@/components/platform/GovernedAction";

const DEFAULT_DOMAINS=["audit","software","ux","security"];

export default function ExternalAuditor({projectId,role}:ExternalAuditorProps){
  const [name,setName]=useState("");
  const [reference,setReference]=useState("");
  const [goal,setGoal]=useState("");
  const [assessmentId,setAssessmentId]=useState<string|null>(null);
  const [bundle,setBundle]=useState<AssessmentBundle|null>(null);
  const [domains,setDomains]=useState<string[]>(DEFAULT_DOMAINS);
  const [selected,setSelected]=useState<string[]>(()=>selectSuggestedStandards(DEFAULT_DOMAINS).map(item=>item.id));
  const [busy,setBusy]=useState("");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const canOperate=role==="owner"||role==="admin"||role==="operator";
  const canApprove=role==="owner"||role==="admin";

  const selectedRefs=useMemo(()=>STANDARDS_REGISTER.filter(item=>selected.includes(item.id)),[selected]);
  const refresh=async(id=assessmentId)=>{if(!id)return;setBundle(await loadAssessment(id));};

  useEffect(()=>{if(assessmentId)void refresh(assessmentId).catch(err=>setError(String(err?.message||err)));},[assessmentId]);

  const run=async(label:string,task:()=>Promise<void>)=>{
    setBusy(label);setError("");setNotice("");
    try{await task();}catch(err){setError(err instanceof Error?err.message:"External audit operation failed.");}
    finally{setBusy("");}
  };

  const create=()=>run("create",async()=>{
    const requestKey=crypto.randomUUID();
    const result=await createAssessment({projectId,requestKey,name,kind:"website",goal,reference});
    setAssessmentId(result.assessmentId);setNotice("Assessment created. Capture evidence, approve the standards profile, then analyze.");
  });

  const capture=()=>run("snapshot",async()=>{
    if(!assessmentId)throw new Error("Create an assessment first.");
    await snapshotSource(assessmentId,reference);await refresh(assessmentId);setNotice("Immutable source snapshot captured.");
  });

  const saveProfile=()=>run("profile",async()=>{
    if(!bundle)throw new Error("Load an assessment first.");
    const excluded=STANDARDS_REGISTER.filter(item=>!selected.includes(item.id)).map(item=>({standardId:item.id,reason:"Outside the selected first-release assessment scope."}));
    await saveStandardsProfile({
      assessmentId:bundle.assessment.id,revision:bundle.assessment.revision,domains,jurisdiction:"",
      selected:selectedRefs.map(item=>({standardId:item.id,edition:item.edition,applicability:"Selected for the assessed scope; clause-level assertions require authorized references and competent review."})),
      excluded,approve:canApprove
    });
    await refresh(bundle.assessment.id);setNotice(canApprove?"Standards profile approved.":"Standards profile saved for owner/admin approval.");
  });

  const analyze=()=>run("analyze",async()=>{
    if(!bundle)throw new Error("Load an assessment first.");
    await analyzeAssessment(bundle.assessment.id,crypto.randomUUID());await refresh(bundle.assessment.id);setNotice("Evidence-linked draft analysis created for human review.");
  });

  const publishReport=()=>run("publish",async()=>{
    if(!bundle)throw new Error("Load an assessment first.");
    await publishAuditDocument({assessmentId:bundle.assessment.id,revision:bundle.assessment.revision,kind:"assessment_report",format:"json",content:JSON.stringify(bundle,null,2)});
    await refresh(bundle.assessment.id);setNotice("Versioned assessment report published with a server-calculated SHA-256 hash.");
  });

  const handoff=(actionId:string)=>run("handoff",async()=>{
    await approveAction(actionId,crypto.randomUUID());await refresh();setNotice("Approved action handed to UNIFI as one idempotent Job Manifest.");
  });

  return <section className="externalAuditorWorkspace">
    <header className="externalAuditHero">
      <div><p className="eyebrow">DATANEST GOVERNED PRODUCT</p><h2>DataNest External Audit &amp; Optimizer</h2><p>Evidence-linked external assessment, ISO-aware traceability, governed DataNest AI analysis, human review, and approved optimization handoff to UNIFI and TranScheduler.</p></div>
      <span className="externalAuditBadge">ASSISTED ASSESSMENT</span>
    </header>

    {error&&<div className="errorBanner">{error}</div>}{notice&&<div className="noticeBanner">{notice}</div>}

    <section className="externalAuditSection">
      <p className="eyebrow">INTAKE</p><h3>External target</h3>
      <div className="externalAuditForm">
        <label>Target name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Project or product name"/></label>
        <label>Public HTTPS URL<input value={reference} onChange={e=>setReference(e.target.value)} placeholder="https://example.com"/></label>
        <label className="wide">Assessment goal<textarea value={goal} onChange={e=>setGoal(e.target.value)} placeholder="What should this assessment determine or optimize?"/></label>
      </div>
      <div className="externalAuditActions">
        <button disabled={!canOperate||!name||!reference||Boolean(busy)} onClick={create}>{busy==="create"?"Creating…":"Create assessment"}</button>
        <button className="secondaryButton" disabled={!canOperate||!assessmentId||Boolean(busy)} onClick={capture}>{busy==="snapshot"?"Capturing…":"Capture source snapshot"}</button>
      </div>
    </section>

    <section className="externalAuditSection">
      <div className="externalAuditSectionHeader"><div><p className="eyebrow">ISO PROFILE</p><h3>Standards applicability</h3></div>{bundle&&<span>Revision {bundle.assessment.revision}</span>}</div>
      <p className="muted">Metadata and original scope summaries only. DataNest does not reproduce proprietary ISO text and automated analysis does not establish certification.</p>
      <div className="standardsGrid">{STANDARDS_REGISTER.map(item=><label className="standardCard" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={e=>setSelected(current=>e.target.checked?[...current,item.id]:current.filter(id=>id!==item.id))}/><span><b>{item.id}:{item.edition}</b><small>{item.title}</small><a href={item.url} target="_blank" rel="noreferrer">Official ISO reference</a></span></label>)}</div>
      <div className="externalAuditActions"><button disabled={!canOperate||!bundle||Boolean(busy)} onClick={saveProfile}>{busy==="profile"?"Saving…":canApprove?"Save & approve profile":"Save profile"}</button><button className="secondaryButton" disabled={!canOperate||!bundle||Boolean(busy)} onClick={analyze}>{busy==="analyze"?"Analyzing…":"Run governed analysis"}</button></div>
    </section>

    {bundle&&<>
      <section className="externalAuditSection">
        <p className="eyebrow">FINDINGS & OPTIMIZATION</p><h3>Evidence-linked draft</h3>
        {bundle.findings.length===0?<p className="muted">No findings yet. Capture evidence, approve a standards profile, and run governed analysis.</p>:<div className="externalAuditList">{bundle.findings.map(finding=><article key={finding.id}><div><b>{finding.criterion_id}</b><span className="externalAuditState">{finding.state}</span></div><p>{finding.observation}</p><small>{finding.claim_kind.toUpperCase()} · confidence {Math.round(finding.confidence*100)}% · evidence {finding.evidence_ids.length}</small></article>)}</div>}
        {bundle.actions.length>0&&<div className="externalAuditList">{bundle.actions.map(action=>{
          const approvalEvent=bundle.events.find(event=>event.event_type==="ACTION_APPROVED_TO_UNIFI"&&String(event.payload?.action_id||"")===action.id);
          const authorized=action.status==="planned"&&Boolean(action.job_id)&&Boolean(approvalEvent);
          const reviewer=authorized?(approvalEvent?.actor_user_id||undefined):undefined;
          const evidence=approvalEvent?<span>{"Approval event · "+approvalEvent.id}</span>:<span>{"Finding "+action.finding_id+" · reviewer approval evidence pending"}</span>;
          return <article key={action.id}>
            <div><b>{action.outcome}</b><span className="externalAuditState">{action.status}</span></div>
            <GovernedAction
              stage={authorized?"authorized":"review-required"}
              summary={authorized?"This optimization handoff has recorded human approval evidence.":"This optimization remains review-required before UNIFI handoff."}
              reviewer={reviewer}
              evidence={evidence}
            />
            <small>{action.job_id?"UNIFI Job "+action.job_id:"Awaiting reviewer approval"}</small>
            {!action.job_id&&<button className="secondaryButton compact" disabled={!canApprove||Boolean(busy)} onClick={()=>handoff(action.id)}>Approve → UNIFI</button>}
          </article>;
        })}</div>}
      </section>
      <ExternalAuditDocuments bundle={bundle} onPublish={publishReport}/>
    </>}
  </section>;
}
