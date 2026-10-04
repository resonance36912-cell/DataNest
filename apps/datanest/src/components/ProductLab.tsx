"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useSessionDraftState } from "@/lib/sessionDraft";
import { useSingleFlight } from "@/lib/singleFlight";
import { clearPendingMutation, getOrCreatePendingMutation, loadPendingMutation, markPendingMutationDurable, markPendingMutationVerification, type PendingMutationIntent } from "@/lib/pendingMutation";
import { markDurableRecoveryVerification, registerDurableRecovery, resolveDurableRecovery } from "@/lib/durableRecovery";
import { reconcileServerMutation, type MutationReconciliationState } from "@/lib/mutationReconciliation";
import PageHeader from "@/components/platform/PageHeader";
import StatusIndicator from "@/components/platform/StatusIndicator";
import EvidencePanel from "@/components/platform/EvidencePanel";

type Surface={
  id:string;project_id:string;name:string;url:string;environment:string;status:string;
  description:string|null;build_commit:string|null;release_id:string|null;build_label:string|null;
  portfolio_item_id:string|null;updated_at:string
};
type PortfolioItemOption={id:string;slug:string;name:string;item_kind:string;review_state:string;current_lifecycle:string|null};
type TestCase={
  id:string;project_id:string;surface_id:string|null;title:string;description:string|null;
  expected_result:string;status:string;version:number;created_by:string;created_at:string
};
type TestRun={
  id:string;project_id:string;job_id:string|null;surface_id:string|null;test_case_id:string;
  tester_user_id:string;result:"pass"|"fail"|"blocked";notes:string|null;evidence_url:string|null;
  request_id:string|null;test_case_version:number|null;surface_url_snapshot:string|null;
  environment_snapshot:string|null;build_commit:string|null;release_id:string|null;
  browser_user_agent:string|null;viewport:Record<string,unknown>;created_at:string
};
type ProductTestRunPendingPayload={
  testCaseId:string;
  surfaceId:string;
  result:"pass"|"fail"|"blocked";
  notes:string|null;
  evidenceUrl:string|null;
};

function formatDate(value:string|null){
  if(!value)return "—";
  return new Intl.DateTimeFormat(undefined,{month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(value));
}
function shortCommit(value:string|null){
  if(!value)return "unversioned";
  return value.length>12?value.slice(0,12):value;
}

export default function ProductLab({
  projectId,currentUserId,canOperate,setNotice,setError
}:{
  projectId:string;
  currentUserId:string;
  canOperate:boolean;
  setNotice:(value:string)=>void;
  setError:(value:string)=>void;
}){
  const [surfaces,setSurfaces]=useState<Surface[]>([]);
  const [portfolioItems,setPortfolioItems]=useState<PortfolioItemOption[]>([]);
  const [cases,setCases]=useState<TestCase[]>([]);
  const [runs,setRuns]=useState<TestRun[]>([]);
  const [selectedSurfaceId,setSelectedSurfaceId]=useState("");
  const [previewKey,setPreviewKey]=useState(0);

  const draftPrefix="productlab:"+projectId+":"+currentUserId+":";
  const [surfaceName,setSurfaceName,surfaceNameDraft]=useSessionDraftState(draftPrefix+"surface-name","Product Preview");
  const [surfaceUrl,setSurfaceUrl,surfaceUrlDraft]=useSessionDraftState(draftPrefix+"surface-url","");
  const [surfaceEnv,setSurfaceEnv]=useState("preview");
  const [surfaceBuild,setSurfaceBuild,surfaceBuildDraft]=useSessionDraftState(draftPrefix+"surface-build","");
  const [surfaceRelease,setSurfaceRelease,surfaceReleaseDraft]=useSessionDraftState(draftPrefix+"surface-release","");
  const [selectedPortfolioItemId,setSelectedPortfolioItemId]=useState("");

  const [caseTitle,setCaseTitle,caseTitleDraft]=useSessionDraftState(draftPrefix+"case-title","");
  const [caseExpected,setCaseExpected,caseExpectedDraft]=useSessionDraftState(draftPrefix+"case-expected","");
  const [caseDescription,setCaseDescription,caseDescriptionDraft]=useSessionDraftState(draftPrefix+"case-description","");
  const [runNotes,setRunNotes,runNotesDraft]=useSessionDraftState<Record<string,string>>(draftPrefix+"run-notes",{});
  const [evidenceUrls,setEvidenceUrls,evidenceUrlsDraft]=useSessionDraftState<Record<string,string>>(draftPrefix+"evidence-urls",{});
  const hasSessionDraft=[
    surfaceNameDraft,surfaceUrlDraft,surfaceBuildDraft,surfaceReleaseDraft,
    caseTitleDraft,caseExpectedDraft,caseDescriptionDraft,runNotesDraft,evidenceUrlsDraft
  ].some(item=>item.hasStoredDraft);

  const {activeAction,busy,run:runSingleFlight}=useSingleFlight();
  const [testRunReconciliation,setTestRunReconciliation]=useState<MutationReconciliationState|"idle"|"checking">("idle");
  const testRunRequestScope="productlab-test-run:"+projectId+":"+currentUserId;
  const testRunLocked=testRunReconciliation==="pending"||testRunReconciliation==="checking";
  const testRunEditLocked=testRunLocked||testRunReconciliation==="not_recorded";
  const [realtime,setRealtime]=useState("connecting");

  const load=useCallback(async()=>{
    const supabase=getSupabase();
    if(!supabase)return;

    const [s,c,r,p]=await Promise.all([
      supabase.from("product_surfaces")
        .select("id,project_id,name,url,environment,status,description,build_commit,release_id,build_label,portfolio_item_id,updated_at")
        .eq("project_id",projectId).neq("status","archived").order("updated_at",{ascending:false}),
      supabase.from("product_test_cases")
        .select("id,project_id,surface_id,title,description,expected_result,status,version,created_by,created_at")
        .eq("project_id",projectId).eq("status","active").order("created_at",{ascending:false}),
      supabase.from("product_test_runs")
        .select("id,project_id,job_id,surface_id,test_case_id,tester_user_id,result,notes,evidence_url,request_id,test_case_version,surface_url_snapshot,environment_snapshot,build_commit,release_id,browser_user_agent,viewport,created_at")
        .eq("project_id",projectId).order("created_at",{ascending:false}).limit(150),
      supabase.from("portfolio_registry_view")
        .select("id,slug,name,item_kind,review_state,current_lifecycle")
        .eq("project_id",projectId).order("name",{ascending:true})
    ]);

    const first=s.error||c.error||r.error||p.error;
    if(first){setError(first.message);return;}

    setSurfaces((s.data||[]) as Surface[]);
    setPortfolioItems((p.data||[]) as PortfolioItemOption[]);
    setCases((c.data||[]) as TestCase[]);
    setRuns((r.data||[]) as TestRun[]);
    const next=(s.data||[]) as Surface[];
    setSelectedSurfaceId(current=>current||next[0]?.id||"");
  },[projectId,setError]);

  useEffect(()=>{void load()},[load]);

  useEffect(()=>{
    const supabase=getSupabase();
    if(!supabase)return;
    const refresh=()=>void load();
    const channel=supabase.channel("product-lab-"+projectId)
      .on("postgres_changes",{event:"*",schema:"public",table:"product_surfaces",filter:"project_id=eq."+projectId},refresh)
      .on("postgres_changes",{event:"*",schema:"public",table:"product_test_cases",filter:"project_id=eq."+projectId},refresh)
      .on("postgres_changes",{event:"*",schema:"public",table:"product_test_runs",filter:"project_id=eq."+projectId},refresh)
      .subscribe(status=>setRealtime(status==="SUBSCRIBED"?"live":status.toLowerCase()));
    return()=>{void supabase.removeChannel(channel)};
  },[projectId,load]);

  const selected=surfaces.find(s=>s.id===selectedSurfaceId)||null;
  const linkedPortfolioItem=selected?.portfolio_item_id
    ? portfolioItems.find(item=>item.id===selected.portfolio_item_id)||null
    : null;
  const visibleCases=cases.filter(c=>c.surface_id===selectedSurfaceId);
  const metrics=useMemo(()=>{
    const relevant=runs.filter(r=>!selectedSurfaceId||r.surface_id===selectedSurfaceId);
    return {
      total:relevant.length,
      pass:relevant.filter(r=>r.result==="pass").length,
      fail:relevant.filter(r=>r.result==="fail").length,
      blocked:relevant.filter(r=>r.result==="blocked").length
    };
  },[runs,selectedSurfaceId]);

  async function addSurface(event:FormEvent){
    event.preventDefault();
    const supabase=getSupabase();
    if(!supabase||!canOperate)return;
    if(!surfaceBuild.trim()){setError("A build commit or immutable build identifier is required.");return;}

    await runSingleFlight("add-surface",async()=>{
      setNotice("Registering versioned Product Lab surface…");
      setError("");
      const {data,error:insertError}=await supabase.from("product_surfaces").insert({
        project_id:projectId,name:surfaceName.trim(),url:surfaceUrl.trim(),environment:surfaceEnv,
        status:"active",build_commit:surfaceBuild.trim(),release_id:surfaceRelease.trim()||null,
        build_label:surfaceRelease.trim()||shortCommit(surfaceBuild.trim()),
        portfolio_item_id:selectedPortfolioItemId||null,
        created_by:currentUserId,updated_by:currentUserId
      }).select("id").single();

      if(insertError){setError(insertError.message);throw insertError;}
      setSurfaceName("Product Preview");setSurfaceUrl("");setSurfaceEnv("preview");setSurfaceBuild("");setSurfaceRelease("");setSelectedPortfolioItemId("");
      setNotice("Product surface added with immutable build identity.");
      await load();
      if(data?.id)setSelectedSurfaceId(data.id);
    }).catch(()=>{});
  }

  async function addTestCase(event:FormEvent){
    event.preventDefault();
    const supabase=getSupabase();
    if(!supabase||!caseTitle.trim()||!caseExpected.trim())return;
    if(!selectedSurfaceId){setError("Select a versioned product surface before adding a test case.");return;}

    await runSingleFlight("add-test-case",async()=>{
      setNotice("Adding versioned Product Lab test case…");
      setError("");
      const {error:insertError}=await supabase.from("product_test_cases").insert({
        project_id:projectId,surface_id:selectedSurfaceId,title:caseTitle.trim(),
        description:caseDescription.trim()||null,expected_result:caseExpected.trim(),
        status:"active",created_by:currentUserId
      });

      if(insertError){setError(insertError.message);throw insertError;}
      setCaseTitle("");setCaseExpected("");setCaseDescription("");
      setNotice("Version 1 of the test case was added.");
      await load();
    }).catch(()=>{});
  }

  function restoreTestRunIntent(intent:PendingMutationIntent<ProductTestRunPendingPayload>){
    setSelectedSurfaceId(intent.payload.surfaceId);
    setRunNotes(current=>({...current,[intent.payload.testCaseId]:intent.payload.notes||""}));
    setEvidenceUrls(current=>({...current,[intent.payload.testCaseId]:intent.payload.evidenceUrl||""}));
  }

  async function startNewTestRunIntent(){
    const pending=loadPendingMutation<ProductTestRunPendingPayload>(testRunRequestScope);
    if(!pending||pending.verificationState!=="confirmed_absent")return;
    setError("");
    try{
      await resolveDurableRecovery(projectId,testRunRequestScope,pending.requestKey,"superseded_after_absence");
      clearPendingMutation(testRunRequestScope,"confirmed_absent_new_intent");
      setTestRunReconciliation("idle");
      setNotice("The previous test result was closed after authoritative absence. You can edit evidence or choose a different result as new intent.");
    }catch(intentError){
      setError(intentError instanceof Error?intentError.message:"Unable to close the previous durable Product Lab recovery identity.");
    }
  }

  async function reconcileTestRunIntent(intent:PendingMutationIntent<ProductTestRunPendingPayload>,announce:boolean){
    const supabase=getSupabase();
    if(!supabase){
      markPendingMutationVerification(testRunRequestScope,"unconfirmed");
      setTestRunReconciliation("pending");
      if(announce)setError("Product Lab test evidence is awaiting authoritative confirmation. Connectivity is unavailable, so do not record a second result yet.");
      return {state:"pending" as const,value:null,error:new Error("Supabase unavailable")};
    }

    setTestRunReconciliation("checking");
    const result=await reconcileServerMutation(async()=>{
      const {data,error}=await supabase.from("product_test_runs")
        .select("id,request_id,test_case_id,result,created_at")
        .eq("tester_user_id",currentUserId)
        .eq("request_id",intent.requestKey)
        .limit(1);
      if(error)throw error;
      const row=Array.isArray(data)?data[0]:null;
      return row ? row as {id:string;request_id:string;test_case_id:string;result:string;created_at:string} : null;
    });

    if(result.state==="confirmed"&&result.value){
      try{
        await resolveDurableRecovery(projectId,testRunRequestScope,intent.requestKey,"confirmed");
      }catch(ledgerError){
        markPendingMutationVerification(testRunRequestScope,"unconfirmed");
        setTestRunReconciliation("pending");
        restoreTestRunIntent(intent);
        setError("Product Lab test evidence is confirmed, but durable recovery finalization failed. Recheck to finish continuity cleanup.");
        return {state:"pending" as const,value:null,error:ledgerError instanceof Error?ledgerError:new Error("Durable recovery finalization failed.")};
      }
      clearPendingMutation(testRunRequestScope,"confirmed");
      setTestRunReconciliation("confirmed");
      setRunNotes(current=>{const next={...current};delete next[intent.payload.testCaseId];return next;});
      setEvidenceUrls(current=>{const next={...current};delete next[intent.payload.testCaseId];return next;});
      setError("");
      setNotice("Recovered confirmed Product Lab test evidence from authoritative server state.");
      await load();
    }else if(result.state==="not_recorded"){
      try{
        await markDurableRecoveryVerification(projectId,testRunRequestScope,intent.requestKey,"confirmed_absent");
      }catch(ledgerError){
        markPendingMutationVerification(testRunRequestScope,"unconfirmed");
        setTestRunReconciliation("pending");
        restoreTestRunIntent(intent);
        setError("Server state confirms the Product Lab result was not recorded, but the durable recovery ledger could not record that verification. Recheck before retrying.");
        return {state:"pending" as const,value:null,error:ledgerError instanceof Error?ledgerError:new Error("Durable recovery verification failed.")};
      }
      markPendingMutationVerification(testRunRequestScope,"confirmed_absent");
      setTestRunReconciliation("not_recorded");
      restoreTestRunIntent(intent);
      if(announce)setNotice("Previous Product Lab test result was not recorded. The original evidence is restored and can be retried safely.");
    }else{
      try{await markDurableRecoveryVerification(projectId,testRunRequestScope,intent.requestKey,"unconfirmed");}catch{}
      markPendingMutationVerification(testRunRequestScope,"unconfirmed");
      setTestRunReconciliation("pending");
      restoreTestRunIntent(intent);
      if(announce)setError("Product Lab test result is still unconfirmed. Its request identity is preserved; recheck server state before retrying.");
    }
    return result;
  }

  useEffect(()=>{
    const reconcilePending=()=>{
      const pending=loadPendingMutation<ProductTestRunPendingPayload>(testRunRequestScope);
      if(!pending||pending.kind!=="product_test_run")return;
      restoreTestRunIntent(pending);
      void reconcileTestRunIntent(pending,true);
    };
    reconcilePending();
    window.addEventListener("online",reconcilePending);
    return()=>window.removeEventListener("online",reconcilePending);
  },[testRunRequestScope]);

  async function recordRun(testCase:TestCase,result:"pass"|"fail"|"blocked"){
    const supabase=getSupabase();
    if(!supabase||testRunLocked)return;

    const surface=surfaces.find(s=>s.id===(testCase.surface_id||selectedSurfaceId));
    if(!surface){setError("A versioned product surface is required for this test.");return;}

    const existingIntent=loadPendingMutation<ProductTestRunPendingPayload>(testRunRequestScope);
    if(testRunReconciliation==="not_recorded"&&existingIntent&&(
      existingIntent.payload.testCaseId!==testCase.id
      ||existingIntent.payload.surfaceId!==surface.id
      ||existingIntent.payload.result!==result
    )){
      setError("The restored Product Lab result is locked to its original test case, surface and result. Use Change evidence before creating different intent.");
      return;
    }

    if(surface.environment==="production"){
      const confirmed=window.confirm(
        "PRODUCTION TEST\n\nYou are about to record a test against the production surface at build "+shortCommit(surface.build_commit)+". Confirm only if this test is safe and non-destructive."
      );
      if(!confirmed)return;
    }

    const payload:ProductTestRunPendingPayload={
      testCaseId:testCase.id,
      surfaceId:surface.id,
      result,
      notes:runNotes[testCase.id]?.trim()||null,
      evidenceUrl:evidenceUrls[testCase.id]?.trim()||null
    };
    const intent=getOrCreatePendingMutation(testRunRequestScope,"product_test_run",payload);

    await runSingleFlight("record-test:"+testCase.id,async()=>{
      setNotice("Recording Product Lab test evidence…");
      setError("");
      const viewport={
        width:window.innerWidth,
        height:window.innerHeight,
        devicePixelRatio:window.devicePixelRatio
      };

      try{
        const durable=await registerDurableRecovery(projectId,testRunRequestScope,intent);
        if(!durable.active){
          clearPendingMutation(testRunRequestScope,"durable_resolved");
          setTestRunReconciliation(durable.resolution==="confirmed"?"confirmed":"idle");
          if(durable.resolution==="confirmed"){
            setNotice("This Product Lab request identity was already finalized on another session. Reloading authoritative test evidence.");
            await load();
          }else{
            setNotice("This recovery identity was already superseded after confirmed absence. Submit edited evidence as new intent.");
          }
          return;
        }
        markPendingMutationDurable(testRunRequestScope,{attemptCount:durable.attemptCount,lastAttemptAt:durable.lastAttemptAt});
        const {error:insertError}=await supabase.from("product_test_runs").insert({
          project_id:projectId,
          surface_id:payload.surfaceId,
          test_case_id:payload.testCaseId,
          tester_user_id:currentUserId,
          result:payload.result,
          notes:payload.notes,
          evidence_url:payload.evidenceUrl,
          request_id:intent.requestKey,
          browser_user_agent:navigator.userAgent,
          viewport
        });
        if(insertError)throw insertError;

        await resolveDurableRecovery(projectId,testRunRequestScope,intent.requestKey,"confirmed");
        clearPendingMutation(testRunRequestScope,"confirmed");
        setTestRunReconciliation("confirmed");
        setRunNotes(current=>{const next={...current};delete next[testCase.id];return next;});
        setEvidenceUrls(current=>{const next={...current};delete next[testCase.id];return next;});
        setNotice("Test evidence recorded for "+shortCommit(surface.build_commit)+". Test evidence is recorded once per tester/test-version/build.");
        await load();
      }catch(actionError){
        const reconciled=await reconcileTestRunIntent(intent,false);
        if(reconciled.state==="confirmed")return;
        if(reconciled.state==="not_recorded"){
          setError((actionError instanceof Error?actionError.message:"Unable to record Product Lab test evidence.")+" Server state confirms the result was not recorded; retry is safe.");
          return;
        }
        setError("Product Lab test result is ambiguous. Evidence is locked to its original request identity until authoritative reconciliation succeeds.");
      }
    });
  }

  function latestRun(caseId:string){
    return runs.find(r=>r.test_case_id===caseId)||null;
  }

  return <div className="productLab">
    <section className="panel" aria-label="Product Lab workspace overview">
      <PageHeader
        eyebrow="BUILD · PRODUCT LAB"
        title="Build verification workspace"
        description="Validate immutable product surfaces and versioned test evidence before release decisions."
        meta={<StatusIndicator label={realtime==="connected"?"Live evidence connected":"Evidence feed "+realtime} tone={realtime==="connected"?"success":"info"} detail={canOperate?"Operator validation controls available":"Read-only validation evidence"}/>}
      />
    </section>
    <EvidencePanel
      title="Product Lab evidence"
      items={surfaces.length||metrics.total?[
        {label:"Versioned surfaces",value:String(surfaces.length)},
        {label:"Active test cases",value:String(visibleCases.length)},
        {label:"Passing results",value:String(metrics.pass)},
        {label:"Fail / blocked",value:String(metrics.fail+metrics.blocked)}
      ]:[]}
      emptyState={<span>No versioned Product Lab evidence exists yet. Register an immutable product surface, then add the first validation case before release review.</span>}
    />
    {hasSessionDraft&&<p className="muted" role="status">Browser-session draft active · unfinished Product Lab inputs are restored after workspace navigation or reload.</p>}
    <section className="sectionIntro">
      <p className="eyebrow">PRODUCT LAB</p>
      <h2>Versioned Live Product Display & Testing</h2>
      <p>Every result is tied to a test-case version and product build. Repeated runs remain visible as versioned validation evidence.</p>
    </section>

    {activeAction&&<p className="muted" role="status">Product Lab action in progress · duplicate submissions are blocked until this request finishes.</p>}
    {testRunReconciliation==="pending"&&<div className="notice errorNotice" role="status"><b>Test result awaiting confirmation.</b> Do not record another result. <button type="button" className="textButton" onClick={()=>{const pending=loadPendingMutation<ProductTestRunPendingPayload>(testRunRequestScope);if(pending)void reconcileTestRunIntent(pending,true);}}>Recheck server state</button></div>}
    {testRunReconciliation==="not_recorded"&&<div className="notice goodNotice" role="status">Server state confirms the previous test result was not recorded. Retrying reuses the same request identity. <button type="button" className="textButton" onClick={()=>void startNewTestRunIntent()}>Change evidence</button></div>}

    <section className="metricGrid">
      <article className="metricCard"><span>Surfaces</span><strong>{surfaces.length}</strong><small>Versioned preview/staging/production</small></article>
      <article className="metricCard"><span>Tests</span><strong>{metrics.total}</strong><small>{visibleCases.length} active cases</small></article>
      <article className="metricCard"><span>Pass</span><strong>{metrics.pass}</strong><small>Recorded results</small></article>
      <article className="metricCard"><span>Fail / blocked</span><strong>{metrics.fail+metrics.blocked}</strong><small>Needs development attention</small></article>
      <article className="metricCard"><span>Realtime</span><strong className="realtimeWord">{realtime}</strong><small>Scoped project change feed</small></article>
    </section>

    <section className="productLabGrid">
      <div className="panel productPreviewPanel">
        <div className="panelHead">
          <div>
            <p className="eyebrow">LIVE SURFACE</p>
            <h3>{selected?.name||"No product surface"}</h3>
            {selected&&<div className="manifestMeta">
              <span className={selected.environment==="production"?"productionTag":""}>{selected.environment.toUpperCase()}</span>
              <span>Build {shortCommit(selected.build_commit)}</span>
              <span>Release {selected.release_id||"—"}</span>
              {linkedPortfolioItem&&<span>{linkedPortfolioItem.name} · {linkedPortfolioItem.item_kind} · {linkedPortfolioItem.review_state}</span>}
            </div>}
          </div>
          <div className="rowActions">
            {selected&&<button className="secondaryButton compact" type="button" onClick={()=>setPreviewKey(v=>v+1)}>Reload</button>}
            {selected&&<a className="secondaryButton compact linkButton" href={selected.url} target="_blank" rel="noreferrer">Open</a>}
          </div>
        </div>
        {selected?.environment==="production"&&<div className="productionBanner">PRODUCTION SURFACE · confirm before running any potentially destructive test. Production environment is runtime evidence, not product-promotion authority.</div>}
        {surfaces.length>0&&<label>Surface<select value={selectedSurfaceId} onChange={e=>setSelectedSurfaceId(e.target.value)}>{surfaces.map(s=><option key={s.id} value={s.id}>{s.name} · {s.environment} · {shortCommit(s.build_commit)}</option>)}</select></label>}
        {selected?<div className="productFrameShell">
          <iframe key={previewKey} className="productFrame" src={selected.url} title={selected.name} sandbox="allow-scripts allow-forms allow-popups allow-same-origin" referrerPolicy="no-referrer"/>
        </div>:<div className="emptyState"><div>▣</div><h3>No preview configured</h3><p>{canOperate?"Register an immutable preview, staging, or production surface to begin versioned validation.":"An operator can register a versioned preview, staging, or production URL."}</p>{canOperate&&<button className="primaryButton compact" type="button" onClick={()=>document.getElementById("product-surface-admin")?.scrollIntoView({behavior:"smooth",block:"start"})}>Register product surface</button>}</div>}
      </div>

      <div className="panel">
        <div className="panelHead"><div><p className="eyebrow">TEST CASES</p><h3>Collaborative validation</h3></div><span className="countPill">{visibleCases.length}</span></div>
        <form className="plannerForm" onSubmit={addTestCase}>
          <label>Test title<input value={caseTitle} onChange={e=>setCaseTitle(e.target.value)} placeholder="e.g. Job invite appears in DataNest workspace" required/></label>
          <label>Expected result<textarea rows={3} value={caseExpected} onChange={e=>setCaseExpected(e.target.value)} required/></label>
          <label>Notes<textarea rows={2} value={caseDescription} onChange={e=>setCaseDescription(e.target.value)}/></label>
          <button className="secondaryButton" disabled={busy||!selectedSurfaceId}>{activeAction==="add-test-case"?"Adding test case…":"Add versioned test case"}</button>
        </form>
      </div>
    </section>

    {canOperate&&<section className="panel" id="product-surface-admin">
      <div className="panelHead"><div><p className="eyebrow">SURFACE ADMIN</p><h3>Add versioned product display</h3></div></div>
      <form className="surfaceForm productSurfaceForm" onSubmit={addSurface}>
        <label>Name<input value={surfaceName} onChange={e=>setSurfaceName(e.target.value)} required/></label>
        <label>URL<input type="url" value={surfaceUrl} onChange={e=>setSurfaceUrl(e.target.value)} placeholder="https://…" required/></label>
        <label>Environment<select value={surfaceEnv} onChange={e=>setSurfaceEnv(e.target.value)}><option value="preview">Preview</option><option value="staging">Staging</option><option value="production">Production</option><option value="local">Local</option></select></label>
        <label>Build commit / immutable ID<input value={surfaceBuild} onChange={e=>setSurfaceBuild(e.target.value)} placeholder="Git commit SHA" required/></label>
        <label>Release ID<input value={surfaceRelease} onChange={e=>setSurfaceRelease(e.target.value)} placeholder="Optional release/tag"/></label>
        <label>Portfolio item<select value={selectedPortfolioItemId} onChange={e=>setSelectedPortfolioItemId(e.target.value)}><option value="">Unlinked / project-only surface</option>{portfolioItems.map(item=><option key={item.id} value={item.id}>{item.name} · {item.item_kind} · {item.review_state}</option>)}</select></label>
        <button className="primaryButton" disabled={busy}>{activeAction==="add-surface"?"Adding surface…":"Add surface"}</button>
      </form>
    </section>}

    <section className="testCaseGrid">
      {visibleCases.map(tc=>{
        const latest=latestRun(tc.id);
        return <article className="checkpointCard testCaseCard" key={tc.id}>
          <div className="rowBetween"><div><p className="eyebrow">TEST CASE v{tc.version}</p><h3>{tc.title}</h3></div>{latest&&<span className={"badge "+(latest.result==="pass"?"good":latest.result==="fail"?"bad":"warn")}>{latest.result.toUpperCase()}</span>}</div>
          {tc.description&&<p className="muted">{tc.description}</p>}
          <div className="resumeBox"><b>Expected</b>{tc.expected_result}</div>
          <label>Test notes<textarea disabled={testRunEditLocked} rows={3} value={runNotes[tc.id]||""} onChange={e=>setRunNotes(current=>({...current,[tc.id]:e.target.value}))}/></label>
          <label>Evidence URL<input disabled={testRunEditLocked} type="url" value={evidenceUrls[tc.id]||""} onChange={e=>setEvidenceUrls(current=>({...current,[tc.id]:e.target.value}))} placeholder="Optional screenshot, artifact, issue or recording"/></label>
          <div className="testActions">
            <button className="primaryButton compact" type="button" disabled={busy||testRunLocked} onClick={()=>void recordRun(tc,"pass")}>Pass</button>
            <button className="secondaryButton compact" type="button" disabled={busy||testRunLocked} onClick={()=>void recordRun(tc,"fail")}>Fail</button>
            <button className="secondaryButton compact" type="button" disabled={busy||testRunLocked} onClick={()=>void recordRun(tc,"blocked")}>Blocked</button>
          </div>
          {latest&&<div className="testEvidence">
            <small>Latest: {formatDate(latest.created_at)} · test v{latest.test_case_version||tc.version} · build {shortCommit(latest.build_commit)}</small>
            <small>{latest.environment_snapshot||"—"} · {latest.notes||"No notes"}</small>
            {latest.evidence_url&&<a href={latest.evidence_url} target="_blank" rel="noreferrer">Open evidence</a>}
          </div>}
        </article>;
      })}
      {!visibleCases.length&&<div className="panel emptyState"><div>✓</div><h3>No test cases yet</h3><p>Add the first validation case for the selected versioned product surface.</p></div>}
    </section>
  </div>;
}
