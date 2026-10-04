"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { FREE_PROMOTION_LABEL } from "@/lib/ecosystemAuthority";
import { getSupabase } from "@/lib/supabase";
import {
  canApprovePortfolio,
  canProposePortfolio,
  portfolioClassificationLabel,
  portfolioKindLabel,
  portfolioLifecycleLabel,
  type PortfolioClassification,
  type PortfolioItemKind,
  type PortfolioLifecycle,
  type PortfolioRegistryRow,
  type PortfolioRelationshipType,
  type PortfolioRole
} from "@/lib/portfolioRegistry";

type ClassificationRow={
  id:string;portfolio_item_id:string;classification:PortfolioClassification;target_product_id:string|null;
  status:string;rationale:string|null;evidence_reference:string|null;created_at:string;
};
type RelationshipRow={
  id:string;source_item_id:string;target_item_id:string;relationship_type:PortfolioRelationshipType;criticality:string;
  status:string;rationale:string|null;evidence_reference:string|null;created_at:string;
};
type LifecycleRow={
  id:string;portfolio_item_id:string;from_state:PortfolioLifecycle|null;to_state:PortfolioLifecycle;
  status:string;reason:string;evidence_reference:string|null;created_at:string;
};
type SurfaceRow={
  id:string;portfolio_item_id:string|null;name:string;environment:string;status:string;
  build_commit:string|null;release_id:string|null;
};
type ProductOption={id:string;slug:string;name:string};

const itemKinds:PortfolioItemKind[]=[
  "product_candidate","application","module","capability","external_capability"
];
const classificationOptions:PortfolioClassification[]=[
  "product_owned","shared_datanest_capability","independent_datanest_product","registered_external_capability"
];
const relationshipOptions:PortfolioRelationshipType[]=[
  "contains","uses","provides","depends_on","replaces","supersedes","integrates_with","derived_from"
];
const lifecycleOptions:PortfolioLifecycle[]=[
  "concept","experiment","validating","candidate","active","maintained","deprecated","retired"
];

function slugify(value:string){
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,160);
}

export default function PortfolioRegistryPanel({
  projectId,currentUserId,role,historicalRonsasProductId,onGovernedProductsChanged
}:{
  projectId:string;
  currentUserId:string;
  role:PortfolioRole;
  historicalRonsasProductId:string|null;
  onGovernedProductsChanged?:()=>void;
}){
  const [items,setItems]=useState<PortfolioRegistryRow[]>([]);
  const [classifications,setClassifications]=useState<ClassificationRow[]>([]);
  const [relationships,setRelationships]=useState<RelationshipRow[]>([]);
  const [lifecycleEvents,setLifecycleEvents]=useState<LifecycleRow[]>([]);
  const [surfaces,setSurfaces]=useState<SurfaceRow[]>([]);
  const [products,setProducts]=useState<ProductOption[]>([]);
  const [query,setQuery]=useState("");
  const [selectedSlug,setSelectedSlug]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [actionError,setActionError]=useState("");
  const [actionNotice,setActionNotice]=useState("");
  const [busy,setBusy]=useState(false);

  const [createOpen,setCreateOpen]=useState(false);
  const [createName,setCreateName]=useState("");
  const [createSlug,setCreateSlug]=useState("");
  const [createKind,setCreateKind]=useState<PortfolioItemKind>("application");

  const [classification,setClassification]=useState<PortfolioClassification>("product_owned");
  const [classificationProduct,setClassificationProduct]=useState(historicalRonsasProductId||"");
  const [classificationRationale,setClassificationRationale]=useState("");
  const [classificationEvidence,setClassificationEvidence]=useState("");

  const [relationshipTarget,setRelationshipTarget]=useState("");
  const [relationshipType,setRelationshipType]=useState<PortfolioRelationshipType>("uses");
  const [relationshipCriticality,setRelationshipCriticality]=useState("normal");
  const [relationshipRationale,setRelationshipRationale]=useState("");

  const [lifecycleTarget,setLifecycleTarget]=useState<PortfolioLifecycle>("active");
  const [lifecycleReason,setLifecycleReason]=useState("");
  const [lifecycleEvidence,setLifecycleEvidence]=useState("");
  const [reviewReason,setReviewReason]=useState("");

  const [promotionOpen,setPromotionOpen]=useState(false);
  const [promotionCategory,setPromotionCategory]=useState("");
  const [promotionMission,setPromotionMission]=useState("");
  const [promotionOperatingModel,setPromotionOperatingModel]=useState("");
  const [promotionRuntime,setPromotionRuntime]=useState("");
  const [promotionEvidence,setPromotionEvidence]=useState("");
  const [promotionProblem,setPromotionProblem]=useState("");
  const [promotionUsers,setPromotionUsers]=useState("");
  const [promotionValue,setPromotionValue]=useState("");
  const [promotionDemand,setPromotionDemand]=useState("");
  const [promotionOwner,setPromotionOwner]=useState("");
  const [promotionLifecycle,setPromotionLifecycle]=useState("");
  const [promotionLabEvidence,setPromotionLabEvidence]=useState("");
  const [promotionRisks,setPromotionRisks]=useState("");
  const [promotionDependencies,setPromotionDependencies]=useState("");

  const load=useCallback(async()=>{
    const supabase=getSupabase();
    if(!supabase){setLoading(false);setError("Portfolio Registry unavailable.");return;}
    setLoading(true);
    setError("");
    const [itemResult,classificationResult,relationshipResult,lifecycleResult,surfaceResult,productResult]=await Promise.all([
      supabase.from("portfolio_registry_view").select("*").eq("project_id",projectId).order("name"),
      supabase.from("portfolio_classifications").select("id,portfolio_item_id,classification,target_product_id,status,rationale,evidence_reference,created_at").eq("project_id",projectId).order("created_at",{ascending:false}),
      supabase.from("portfolio_relationships").select("id,source_item_id,target_item_id,relationship_type,criticality,status,rationale,evidence_reference,created_at").eq("project_id",projectId).order("created_at",{ascending:false}),
      supabase.from("portfolio_lifecycle_events").select("id,portfolio_item_id,from_state,to_state,status,reason,evidence_reference,created_at").eq("project_id",projectId).order("created_at",{ascending:false}),
      supabase.from("product_surfaces").select("id,portfolio_item_id,name,environment,status,build_commit,release_id").eq("project_id",projectId).neq("status","archived"),
      supabase.from("products").select("id,slug,name").eq("project_id",projectId).order("name")
    ]);
    const nextError=itemResult.error||classificationResult.error||relationshipResult.error||lifecycleResult.error||surfaceResult.error||productResult.error;
    if(nextError){
      setError("Portfolio Registry unavailable. "+nextError.message);
      setItems([]);setClassifications([]);setRelationships([]);setLifecycleEvents([]);setSurfaces([]);setProducts([]);
    }else{
      const nextItems=(itemResult.data||[]) as PortfolioRegistryRow[];
      setItems(nextItems);
      setClassifications((classificationResult.data||[]) as ClassificationRow[]);
      setRelationships((relationshipResult.data||[]) as RelationshipRow[]);
      setLifecycleEvents((lifecycleResult.data||[]) as LifecycleRow[]);
      setSurfaces((surfaceResult.data||[]) as SurfaceRow[]);
      setProducts((productResult.data||[]) as ProductOption[]);
      const requested=new URL(window.location.href).searchParams.get("item")||"";
      setSelectedSlug(current=>{
        if(requested&&nextItems.some(item=>item.slug===requested))return requested;
        if(current&&nextItems.some(item=>item.slug===current))return current;
        return nextItems[0]?.slug||"";
      });
    }
    setLoading(false);
  },[projectId]);

  useEffect(()=>{void load();},[load]);

  useEffect(()=>{
    if(!selectedSlug)return;
    const url=new URL(window.location.href);
    if(url.searchParams.get("item")===selectedSlug)return;
    url.searchParams.set("section","portfolio");
    url.searchParams.set("item",selectedSlug);
    window.history.replaceState(window.history.state,"",url.toString());
  },[selectedSlug]);

  const visible=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    if(!needle)return items;
    return items.filter(item=>[
      item.name,item.slug,item.item_kind,item.review_state,item.active_classification||"",item.current_lifecycle||""
    ].join(" ").toLowerCase().includes(needle));
  },[items,query]);

  const selected=items.find(item=>item.slug===selectedSlug)||visible[0]||null;
  const selectedClassifications=selected?classifications.filter(row=>row.portfolio_item_id===selected.id):[];
  const selectedRelationships=selected?relationships.filter(row=>row.source_item_id===selected.id||row.target_item_id===selected.id):[];
  const selectedLifecycle=selected?lifecycleEvents.filter(row=>row.portfolio_item_id===selected.id):[];
  const selectedSurfaces=selected?surfaces.filter(row=>row.portfolio_item_id===selected.id):[];
  const pendingClassifications=selectedClassifications.filter(row=>row.status==="proposed");
  const pendingRelationships=selectedRelationships.filter(row=>row.status==="proposed");
  const pendingLifecycle=selectedLifecycle.filter(row=>row.status==="proposed");
  const historicalParent=selected?.metadata?.historical_catalog;
  const aiSuggestion=selected?.metadata?.ai_suggestion;
  const permissionSummary=canApprovePortfolio(role)
    ?"May propose and approve governed portfolio changes."
    :canProposePortfolio(role)
      ?"May propose changes; owner/admin approval remains required."
      :"Read-only portfolio access.";

  useEffect(()=>{
    if(!selected)return;
    setRelationshipTarget(items.find(item=>item.id!==selected.id)?.id||"");
    setClassificationProduct(
      selected.target_product_id
      ||historicalRonsasProductId
      ||products[0]?.id
      ||""
    );
    setActionError("");
    setActionNotice("");
    setPromotionOpen(false);
  },[selected?.id,historicalRonsasProductId,items,products]);

  async function rpc(name:string,args:Record<string,unknown>,success:string,after?:()=>void){
    const supabase=getSupabase();
    if(!supabase||busy)return false;
    setBusy(true);setActionError("");setActionNotice("");
    try{
      const {error:rpcError}=await supabase.rpc(name,args);
      if(rpcError){setActionError(rpcError.message);return false;}
      setActionNotice(success);
      await load();
      after?.();
      return true;
    }catch(actionFailure){
      setActionError(actionFailure instanceof Error?actionFailure.message:"Portfolio operation failed.");
      return false;
    }finally{
      setBusy(false);
    }
  }

  async function createItem(event:FormEvent){
    event.preventDefault();
    const name=createName.trim();
    const slug=(createSlug.trim()||slugify(name));
    if(!name||!slug){setActionError("Name and slug are required.");return;}
    const ok=await rpc("create_portfolio_item_v1",{
      target_project:projectId,target_slug:slug,target_name:name,target_kind:createKind,
      target_lifecycle:null,target_source_authority:"portfolio_registry_ui",target_source_reference:null,
      target_metadata:{created_from:"portfolio_registry_ui",created_by:currentUserId}
    },"Portfolio Item created for governed review.");
    if(ok){setCreateName("");setCreateSlug("");setCreateOpen(false);setSelectedSlug(slug);}
  }

  async function proposeClassification(event:FormEvent){
    event.preventDefault();
    if(!selected)return;
    if(!classificationRationale.trim()){setActionError("Classification rationale is required.");return;}
    await rpc("propose_portfolio_classification_v1",{
      target_item:selected.id,
      target_classification:classification,
      target_product:classification==="product_owned"?(classificationProduct||null):null,
      target_rationale:classificationRationale.trim(),
      target_evidence_reference:classificationEvidence.trim()||null
    },"Classification proposal recorded.");
  }

  async function proposeRelationship(event:FormEvent){
    event.preventDefault();
    if(!selected||!relationshipTarget)return;
    if(!relationshipRationale.trim()){setActionError("Relationship rationale is required.");return;}
    await rpc("propose_portfolio_relationship_v1",{
      target_source_item:selected.id,target_target_item:relationshipTarget,
      target_relationship_type:relationshipType,target_criticality:relationshipCriticality,
      target_rationale:relationshipRationale.trim(),target_evidence_reference:null
    },"Relationship proposal recorded.");
  }

  async function proposeLifecycle(event:FormEvent){
    event.preventDefault();
    if(!selected)return;
    if(!lifecycleReason.trim()){setActionError("Lifecycle reason is required.");return;}
    await rpc("propose_portfolio_lifecycle_transition_v1",{
      target_item:selected.id,target_to_state:lifecycleTarget,target_reason:lifecycleReason.trim(),
      target_evidence_reference:lifecycleEvidence.trim()||null
    },"Lifecycle proposal recorded.");
  }

  async function reject(name:string,id:string,label:string){
    if(!reviewReason.trim()){setActionError("Review reason is required to reject a proposal.");return;}
    const argument=name.includes("classification")?{target_classification_id:id,target_reason:reviewReason.trim()}
      :name.includes("relationship")?{target_relationship_id:id,target_reason:reviewReason.trim()}
      :{target_event_id:id,target_reason:reviewReason.trim()};
    await rpc(name,argument,label+" rejected.");
  }

  async function promote(event:FormEvent){
    event.preventDefault();
    if(!selected)return;
    const packet={
      problem_statement:promotionProblem.trim(),
      intended_users:promotionUsers.trim(),
      value_proposition:promotionValue.trim(),
      repeat_demand_evidence:promotionDemand.trim(),
      operational_owner:promotionOwner.trim(),
      independent_lifecycle_justification:promotionLifecycle.trim(),
      product_lab_evidence:promotionLabEvidence.trim(),
      known_risks:promotionRisks.trim(),
      dependencies:promotionDependencies.trim()
    };
    if(Object.values(packet).some(value=>!value)
      ||![promotionCategory,promotionMission,promotionOperatingModel,promotionRuntime,promotionEvidence].every(value=>value.trim())){
      setActionError("Complete the Promotion Packet and governed product fields before promotion.");
      return;
    }
    const ok=await rpc("promote_product_candidate_v1",{
      target_item:selected.id,
      target_category:promotionCategory.trim(),
      target_mission:promotionMission.trim(),
      target_operating_model:promotionOperatingModel.trim(),
      target_primary_runtime:promotionRuntime.trim(),
      target_promotion_packet:packet,
      target_evidence_reference:promotionEvidence.trim()
    },"Product Candidate promoted under billing-off policy.",onGovernedProductsChanged);
    if(ok)setPromotionOpen(false);
  }

  return <section className="portfolioRegistry" aria-labelledby="portfolio-registry-title" data-current-user={currentUserId}>
    <div className="portfolioRegistryHead">
      <div>
        <p className="eyebrow">PORTFOLIO REGISTRY</p>
        <h2 id="portfolio-registry-title">Classify what exists without inventing ownership.</h2>
        <p>Products, candidates, applications, modules and capabilities retain separate identity, classification and lifecycle state.</p>
      </div>
      <span className="catalogLiveBadge">{loading?"SYNCING":items.length+" ITEMS"}</span>
    </div>
    <div className="portfolioPermissionNote">{permissionSummary}</div>
    {error&&<div className="catalogError" role="alert">{error}</div>}
    {actionError&&<div className="catalogError" role="alert">{actionError}</div>}
    {actionNotice&&<div className="notice goodNotice" role="status">{actionNotice}</div>}

    {canProposePortfolio(role)&&<section className="portfolioActionPanel">
      <button type="button" className="secondaryButton compact" onClick={()=>setCreateOpen(value=>!value)}>Create Portfolio Item</button>
      {createOpen&&<form onSubmit={createItem} className="portfolioActionForm">
        <label>Name<input value={createName} onChange={event=>{setCreateName(event.target.value);if(!createSlug)setCreateSlug(slugify(event.target.value));}}/></label>
        <label>Slug<input value={createSlug} onChange={event=>setCreateSlug(slugify(event.target.value))}/></label>
        <label>Kind<select value={createKind} onChange={event=>setCreateKind(event.target.value as PortfolioItemKind)}>{itemKinds.map(kind=><option key={kind} value={kind}>{portfolioKindLabel(kind)}</option>)}</select></label>
        <button type="submit" className="primaryButton compact" disabled={busy}>Save Portfolio Item</button>
      </form>}
    </section>}

    <label className="portfolioSearch">Search registry<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search items, kinds, lifecycle…"/></label>
    <div className="portfolioRegistryGrid">
      <nav className="portfolioRegistryList" aria-label="Portfolio items">
        {visible.map(item=><button type="button" key={item.id} className={item.slug===selected?.slug?"active":""} onClick={()=>setSelectedSlug(item.slug)}>
          <b>{item.name}</b>
          <span>{portfolioKindLabel(item.item_kind)}</span>
          <small>{portfolioClassificationLabel(item.active_classification)} · {portfolioLifecycleLabel(item.current_lifecycle)}</small>
        </button>)}
        {!loading&&!visible.length&&<div className="catalogEmpty">No Portfolio Items match this view.</div>}
      </nav>

      <div className="portfolioRegistryDetail">
        {selected?<>
          <div className="portfolioRegistryTitle">
            <div><p className="eyebrow">{portfolioKindLabel(selected.item_kind)}</p><h3>{selected.name}</h3><small>{selected.slug}</small></div>
            <div className="portfolioBadgeStack">
              <span>{portfolioClassificationLabel(selected.active_classification)}</span>
              <span>{portfolioLifecycleLabel(selected.current_lifecycle)}</span>
            </div>
          </div>

          {selected.review_state==="pending_review"&&<div className="portfolioPendingReview"><b>PENDING REVIEW</b><span>Architectural ownership has not yet been approved.</span></div>}

          <section><h4>Provenance</h4>
            <dl className="portfolioFacts">
              <div><dt>Source authority</dt><dd>{selected.source_authority||"Registry"}</dd></div>
              <div><dt>Source reference</dt><dd>{selected.source_reference||"—"}</dd></div>
              <div><dt>Historical technical RONSAS link</dt><dd>{historicalRonsasProductId&&historicalParent?"Recorded historically":"Not asserted"}</dd></div>
            </dl>
          </section>

          <section><h4>Product Lab evidence</h4>
            <p>{selected.product_lab_surface_count} surfaces · {selected.product_lab_test_run_count} test runs</p>
            {selectedSurfaces.length>0?<ul>{selectedSurfaces.map(surface=><li key={surface.id}><b>{surface.environment.toUpperCase()}</b> · {surface.name} · build {surface.build_commit||"unversioned"}</li>)}</ul>:<p>No linked Product Lab surfaces.</p>}
            <small>Production environment is runtime evidence, not product-promotion authority.</small>
          </section>

          <section><h4>Relationships</h4>
            {selectedRelationships.length?<ul>{selectedRelationships.map(row=><li key={row.id}><b>{row.relationship_type.replaceAll("_"," ")}</b> · {row.criticality} · {row.status}</li>)}</ul>:<p>No governed relationships recorded.</p>}
          </section>

          <section><h4>Classification history</h4>
            {selectedClassifications.length?<ul>{selectedClassifications.map(row=><li key={row.id}>{portfolioClassificationLabel(row.classification)} · {row.status}</li>)}</ul>:<p>No approved or proposed classification recorded.</p>}
          </section>

          {aiSuggestion!=null&&<section className="portfolioAiSuggestion"><h4>AI suggestion · non-authoritative</h4><p>{String(aiSuggestion)}</p></section>}

          {canProposePortfolio(role)&&<section className="portfolioGovernedActions" aria-label="Portfolio proposals">
            <h4>Governed proposals</h4>
            <form className="portfolioActionForm" onSubmit={proposeClassification}>
              <label>Classification<select value={classification} onChange={event=>setClassification(event.target.value as PortfolioClassification)}>{classificationOptions.map(value=><option key={value} value={value}>{portfolioClassificationLabel(value)}</option>)}</select></label>
              {classification==="product_owned"&&<label>Target product<select value={classificationProduct} onChange={event=>setClassificationProduct(event.target.value)}>{products.map(product=><option key={product.id} value={product.id}>{product.name}</option>)}</select></label>}
              <label>Classification rationale<input value={classificationRationale} onChange={event=>setClassificationRationale(event.target.value)}/></label>
              <label>Evidence reference<input value={classificationEvidence} onChange={event=>setClassificationEvidence(event.target.value)}/></label>
              <button type="submit" className="secondaryButton compact" disabled={busy}>Propose classification</button>
            </form>

            <form className="portfolioActionForm" onSubmit={proposeRelationship}>
              <label>Relationship target<select value={relationshipTarget} onChange={event=>setRelationshipTarget(event.target.value)}>{items.filter(item=>item.id!==selected.id).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Relationship type<select value={relationshipType} onChange={event=>setRelationshipType(event.target.value as PortfolioRelationshipType)}>{relationshipOptions.map(value=><option key={value} value={value}>{value.replaceAll("_"," ")}</option>)}</select></label>
              <label>Criticality<select value={relationshipCriticality} onChange={event=>setRelationshipCriticality(event.target.value)}><option value="optional">optional</option><option value="normal">normal</option><option value="critical">critical</option></select></label>
              <label>Relationship rationale<input value={relationshipRationale} onChange={event=>setRelationshipRationale(event.target.value)}/></label>
              <button type="submit" className="secondaryButton compact" disabled={busy||!relationshipTarget}>Propose relationship</button>
            </form>

            <form className="portfolioActionForm" onSubmit={proposeLifecycle}>
              <label>Lifecycle state<select value={lifecycleTarget} onChange={event=>setLifecycleTarget(event.target.value as PortfolioLifecycle)}>{lifecycleOptions.map(value=><option key={value} value={value}>{portfolioLifecycleLabel(value)}</option>)}</select></label>
              <label>Lifecycle reason<input value={lifecycleReason} onChange={event=>setLifecycleReason(event.target.value)}/></label>
              <label>Lifecycle evidence<input value={lifecycleEvidence} onChange={event=>setLifecycleEvidence(event.target.value)}/></label>
              <button type="submit" className="secondaryButton compact" disabled={busy}>Propose lifecycle</button>
            </form>
          </section>}

          {canApprovePortfolio(role)&&<section className="portfolioGovernedActions" aria-label="Portfolio approvals">
            <h4>Owner / admin review</h4>
            {(pendingClassifications.length||pendingRelationships.length||pendingLifecycle.length)>0&&<label>Review reason<input value={reviewReason} onChange={event=>setReviewReason(event.target.value)} placeholder="Required only when rejecting"/></label>}

            {pendingClassifications.map(row=><div key={row.id} className="portfolioReviewCard">
              <span>{portfolioClassificationLabel(row.classification)} · {row.rationale||"No rationale supplied"}</span>
              <div className="rowActions">
                <button type="button" className="primaryButton compact" disabled={busy} onClick={()=>void rpc("approve_portfolio_classification_v1",{target_classification_id:row.id},"Classification approved.")}>Approve classification</button>
                <button type="button" className="secondaryButton compact" disabled={busy} onClick={()=>void reject("reject_portfolio_classification_v1",row.id,"Classification")}>Reject classification</button>
              </div>
            </div>)}

            {pendingRelationships.map(row=><div key={row.id} className="portfolioReviewCard">
              <span>{row.relationship_type.replaceAll("_"," ")} · {row.rationale||"No rationale supplied"}</span>
              <div className="rowActions">
                <button type="button" className="primaryButton compact" disabled={busy} onClick={()=>void rpc("approve_portfolio_relationship_v1",{target_relationship_id:row.id},"Relationship approved.")}>Approve relationship</button>
                <button type="button" className="secondaryButton compact" disabled={busy} onClick={()=>void reject("reject_portfolio_relationship_v1",row.id,"Relationship")}>Reject relationship</button>
              </div>
            </div>)}

            {pendingLifecycle.map(row=><div key={row.id} className="portfolioReviewCard">
              <span>{portfolioLifecycleLabel(row.to_state)} · {row.reason}</span>
              <div className="rowActions">
                <button type="button" className="primaryButton compact" disabled={busy} onClick={()=>void rpc("approve_portfolio_lifecycle_transition_v1",{target_event_id:row.id},"Lifecycle approved.")}>Approve lifecycle</button>
                <button type="button" className="secondaryButton compact" disabled={busy} onClick={()=>void reject("reject_portfolio_lifecycle_transition_v1",row.id,"Lifecycle")}>Reject lifecycle</button>
              </div>
            </div>)}

            <div className="portfolioLifecycleControls">
              <p>Enter a Lifecycle reason to confirm a direct deprecation or retirement. Retirement preserves history; database dependency and production-surface guards remain authoritative.</p>
              <div className="rowActions">
                <button type="button" className="secondaryButton compact" disabled={busy||!lifecycleReason.trim()} onClick={()=>selected&&void rpc("deprecate_portfolio_item_v1",{target_item:selected.id,target_reason:lifecycleReason.trim(),target_evidence_reference:lifecycleEvidence.trim()||null},"Portfolio Item deprecated.")}>Deprecate</button>
                <button type="button" className="secondaryButton compact" disabled={busy||!lifecycleReason.trim()} onClick={()=>selected&&void rpc("retire_portfolio_item_v1",{target_item:selected.id,target_reason:lifecycleReason.trim(),target_evidence_reference:lifecycleEvidence.trim()||null},"Portfolio Item retired.")}>Retire</button>
              </div>
            </div>

            {selected.item_kind==="product_candidate"&&<>
              <button type="button" className="primaryButton compact" onClick={()=>setPromotionOpen(value=>!value)}>Promote candidate</button>
              {promotionOpen&&<form className="portfolioActionForm portfolioPromotionForm" onSubmit={promote}>
                <div className="portfolioPromotionPolicy">{FREE_PROMOTION_LABEL}</div>
                <label>Category<input value={promotionCategory} onChange={event=>setPromotionCategory(event.target.value)}/></label>
                <label>Mission<textarea value={promotionMission} onChange={event=>setPromotionMission(event.target.value)}/></label>
                <label>Operating model<input value={promotionOperatingModel} onChange={event=>setPromotionOperatingModel(event.target.value)}/></label>
                <label>Primary runtime<input value={promotionRuntime} onChange={event=>setPromotionRuntime(event.target.value)}/></label>
                <label>Promotion evidence reference<input value={promotionEvidence} onChange={event=>setPromotionEvidence(event.target.value)}/></label>
                <label>Problem statement<textarea value={promotionProblem} onChange={event=>setPromotionProblem(event.target.value)}/></label>
                <label>Intended users<textarea value={promotionUsers} onChange={event=>setPromotionUsers(event.target.value)}/></label>
                <label>Value proposition<textarea value={promotionValue} onChange={event=>setPromotionValue(event.target.value)}/></label>
                <label>Repeat demand evidence<textarea value={promotionDemand} onChange={event=>setPromotionDemand(event.target.value)}/></label>
                <label>Operational owner<input value={promotionOwner} onChange={event=>setPromotionOwner(event.target.value)}/></label>
                <label>Independent lifecycle justification<textarea value={promotionLifecycle} onChange={event=>setPromotionLifecycle(event.target.value)}/></label>
                <label>Product Lab evidence<textarea value={promotionLabEvidence} onChange={event=>setPromotionLabEvidence(event.target.value)}/></label>
                <label>Known risks<textarea value={promotionRisks} onChange={event=>setPromotionRisks(event.target.value)}/></label>
                <label>Dependencies<textarea value={promotionDependencies} onChange={event=>setPromotionDependencies(event.target.value)}/></label>
                <button type="submit" className="primaryButton compact" disabled={busy}>Confirm governed promotion</button>
              </form>}
            </>}
          </section>}
        </>:<div className="catalogEmpty">Select a Portfolio Item.</div>}
      </div>
    </div>
  </section>;
}
