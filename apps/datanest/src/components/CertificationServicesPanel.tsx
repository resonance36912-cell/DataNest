"use client";

import { FormEvent,useMemo,useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { RESONANCE_CERTIFICATION_PRICING,RESONANCE_CERTIFICATION_STANDARD } from "@/lib/resonanceCertification";
import PageHeader from "@/components/platform/PageHeader";
import StatusIndicator from "@/components/platform/StatusIndicator";

type Props={projectId:string};


export default function CertificationServicesPanel({projectId}:Props){
  const [serviceCode,setServiceCode]=useState("RCS-SVC-01");
  const [certificationCode,setCertificationCode]=useState("RCS-GOV-01");
  const [targetName,setTargetName]=useState("");
  const [targetKind,setTargetKind]=useState("product");
  const [reference,setReference]=useState("");
  const [scope,setScope]=useState("");
  const [jurisdiction,setJurisdiction]=useState("");
  const [requestedCurrency,setRequestedCurrency]=useState("ZAR");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");

  const selectedService=useMemo(
    ()=>RESONANCE_CERTIFICATION_STANDARD.services.find(item=>item.code===serviceCode)||RESONANCE_CERTIFICATION_STANDARD.services[0],
    [serviceCode]
  );

  async function submit(event:FormEvent){
    event.preventDefault();
    if(busy)return;
    setBusy(true);setNotice("");setError("");
    try{
      const supabase=getSupabase();
      if(!supabase)throw new Error("DataNest backend is not configured.");
      const {data,error:rpcError}=await supabase.rpc("create_certification_service_request_v2",{
        target_project:projectId,
        target_request_key:crypto.randomUUID(),
        target_service_code:serviceCode,
        target_certification_code:serviceCode==="RCS-SVC-05"?null:certificationCode,
        target_target_name:targetName,
        target_target_kind:targetKind,
        target_target_reference:reference||null,
        target_scope_summary:scope,
        target_jurisdiction:jurisdiction||null,
        target_requested_currency:requestedCurrency
      });
      if(rpcError)throw rpcError;
      const row=Array.isArray(data)?data[0]:data;
      setNotice("Service request submitted. Request "+String(row?.request_id||"")+" is now in intake.");
      setTargetName("");setReference("");setScope("");setJurisdiction("");
    }catch(err){
      setError(err instanceof Error?err.message:"Certification service request could not be submitted.");
    }finally{setBusy(false);}
  }

  return <section className="panel" aria-labelledby="certification-services-title">
    <PageHeader
      eyebrow="BUSINESS · CERTIFICATION & ASSURANCE"
      title="Resonance Certification & Assurance"
      description="Evidence-led certification, readiness, standards alignment, surveillance and governed evidence services delivered through DataNest."
      meta={<StatusIndicator label="Bank transfer / EFT" tone="success" detail="ZAR settlement · automated card checkout disabled"/>}
    />

    <div className="certificationServiceGrid">
      {RESONANCE_CERTIFICATION_STANDARD.services.map(service=>{
        const price=RESONANCE_CERTIFICATION_PRICING.find(item=>item.serviceCode===service.code);
        return <article className="certificationServiceCard" key={service.code}>
          <p className="eyebrow">{service.code}</p>
          <h3>{service.name}</h3>
          <p>{service.description}</p>
          <strong>{price?.displayPrice||"Quote required"}</strong>
          <small>{price?.scopeNote}</small>
          <span>{service.output}</span>
          <button type="button" onClick={()=>{setServiceCode(service.code);window.requestAnimationFrame(()=>document.getElementById("certification-service-request")?.scrollIntoView({behavior:"smooth",block:"start"}));}}>
            Request this service
          </button>
        </article>;
      })}
    </div>

    <div className="certificationClassStrip" aria-label="Certification classes">
      {RESONANCE_CERTIFICATION_STANDARD.certificationClasses.map(item=><span key={item.code}><b>{item.code}</b>{item.name}</span>)}
    </div>

    <div className="certificationBoundaryNote">
      <b>Certification boundary</b>
      <span>RCS is Resonance's internal certification standard. It is not ISO certification, external accreditation, regulatory approval, legal advice, or third-party conformity certification.</span>
    </div>

    <form id="certification-service-request" className="certificationServiceRequest" onSubmit={submit}>
      <div>
        <p className="eyebrow">REQUEST INTAKE</p>
        <h3>Start a certification engagement</h3>
        <p>Submit the scope and target. DataNest records the request before assessment work begins.</p>
        <div className="certificationPaymentNotice"><b>Payment method: Bank transfer / EFT</b><span>Issued invoices are settled in ZAR. Foreign-currency preferences are used for quotation only; bank settlement follows the issued ZAR invoice and your bank's applicable conversion process.</span></div>
      </div>
      <label>Service
        <select value={serviceCode} onChange={e=>setServiceCode(e.target.value)}>
          {RESONANCE_CERTIFICATION_STANDARD.services.map(item=><option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}
        </select>
      </label>
      {serviceCode!=="RCS-SVC-05"&&<label>Certification class
        <select value={certificationCode} onChange={e=>setCertificationCode(e.target.value)}>
          {RESONANCE_CERTIFICATION_STANDARD.certificationClasses.map(item=><option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}
        </select>
      </label>}
      <label>Target name<input required value={targetName} onChange={e=>setTargetName(e.target.value)} placeholder="Product, service, project or organization"/></label>
      <label>Target type
        <select value={targetKind} onChange={e=>setTargetKind(e.target.value)}>
          {["website","application","repository","product","project","document","organization","service","other"].map(item=><option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label>Reference<input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Public URL or governed reference"/></label>
      <label>Quote currency preference
        <select value={requestedCurrency} onChange={e=>setRequestedCurrency(e.target.value)}>
          {["ZAR","USD","EUR","GBP"].map(item=><option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label>Jurisdiction<input value={jurisdiction} onChange={e=>setJurisdiction(e.target.value)} placeholder="Optional"/></label>
      <label className="wide">Scope summary<textarea required value={scope} onChange={e=>setScope(e.target.value)} placeholder="What is being assessed, and what should the engagement determine?"/></label>
      {error&&<div className="errorBanner">{error}</div>}
      {notice&&<div className="noticeBanner">{notice}</div>}
      <div className="externalAuditActions"><button disabled={busy||!targetName.trim()||!scope.trim()} type="submit">{busy?"Submitting…":"Submit service request"}</button><span className="muted">{selectedService.name} · ZAR settlement · {RESONANCE_CERTIFICATION_PRICING.find(item=>item.serviceCode===serviceCode)?.displayPrice||"Quote required"}</span></div>
    </form>
  </section>;
}
