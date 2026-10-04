import type { StandardRef,StandardsProfile,StandardsProfileInput } from "@/lib/externalAuditTypes";

export const STANDARDS_REGISTER:readonly StandardRef[]=[
  {id:"ISO 19011",edition:"2026",title:"Guidelines for auditing management systems",issuer:"ISO",url:"https://www.iso.org/standard/19011",domains:["audit","management"],kind:"guidance",statusCheckedAt:"2026-09-29"},
  {id:"ISO 9001",edition:"2026",title:"Quality management systems — Requirements",issuer:"ISO",url:"https://www.iso.org/standard/9001",domains:["quality","management","qms"],kind:"requirements",statusCheckedAt:"2026-09-29"},
  {id:"ISO 31000",edition:"2018",title:"Risk management — Guidelines",issuer:"ISO",url:"https://www.iso.org/standard/65694.html",domains:["risk","management"],kind:"guidance",statusCheckedAt:"2026-09-29"},
  {id:"ISO/IEC 25010",edition:"2023",title:"SQuaRE — Product quality model",issuer:"ISO",url:"https://www.iso.org/standard/78176.html",domains:["software","ict","product"],kind:"quality_model",statusCheckedAt:"2026-09-29"},
  {id:"ISO/IEC 25019",edition:"2023",title:"SQuaRE — Quality-in-use model",issuer:"ISO",url:"https://www.iso.org/standard/78177.html",domains:["software","ict","ux"],kind:"quality_model",statusCheckedAt:"2026-09-29"},
  {id:"ISO 9241-210",edition:"2019",title:"Human-centred design for interactive systems",issuer:"ISO",url:"https://www.iso.org/standard/77520.html",domains:["ux","ui","design"],kind:"guidance",statusCheckedAt:"2026-09-29"},
  {id:"ISO/IEC 27001",edition:"2022",title:"Information security management systems — Requirements",issuer:"ISO",url:"https://www.iso.org/standard/27001",domains:["security","isms"],kind:"requirements",statusCheckedAt:"2026-09-29"},
  {id:"ISO/IEC 27701",edition:"2025",title:"Privacy information management systems",issuer:"ISO",url:"https://www.iso.org/standard/27701",domains:["privacy","pii"],kind:"requirements",statusCheckedAt:"2026-09-29"},
  {id:"ISO/IEC 42001",edition:"2023",title:"Artificial intelligence — Management system",issuer:"ISO",url:"https://www.iso.org/standard/42001",domains:["ai","management"],kind:"requirements",statusCheckedAt:"2026-09-29"},
  {id:"ISO/IEC 25059",edition:"2023",title:"SQuaRE — Quality model for AI systems",issuer:"ISO",url:"https://www.iso.org/standard/80655.html",domains:["ai","software","quality"],kind:"quality_model",statusCheckedAt:"2026-09-29"},
  {id:"ISO/IEC 42005",edition:"2025",title:"Artificial intelligence — AI system impact assessment",issuer:"ISO",url:"https://www.iso.org/standard/42005",domains:["ai","risk","impact"],kind:"guidance",statusCheckedAt:"2026-09-29"},
  {id:"ISO 13485",edition:"2016",title:"Medical devices — Quality management systems",issuer:"ISO",url:"https://www.iso.org/standard/59752.html",domains:["medical_device","qms"],kind:"requirements",statusCheckedAt:"2026-09-29"},
  {id:"ISO 14971",edition:"2019",title:"Medical devices — Application of risk management",issuer:"ISO",url:"https://www.iso.org/standard/72704.html",domains:["medical_device","risk"],kind:"requirements",statusCheckedAt:"2026-09-29"}
] as const;

export function selectSuggestedStandards(domains:string[]):StandardRef[]{
  const normalized=new Set(domains.map(value=>value.trim().toLowerCase()).filter(Boolean));
  const suggested=STANDARDS_REGISTER.filter(standard=>standard.domains.some(domain=>normalized.has(domain)));
  const baseline=STANDARDS_REGISTER.filter(standard=>standard.id==="ISO 19011");
  return [...new Map([...baseline,...suggested].map(item=>[item.id,item])).values()];
}

export function validateStandardsProfile(input:StandardsProfileInput):StandardsProfile{
  const selected=input.selected.map(item=>{
    const registered=STANDARDS_REGISTER.find(ref=>ref.id===item.standardId);
    if(!registered)throw new Error("unknown_standard:"+item.standardId);
    if(registered.edition!==item.edition)throw new Error("unknown_standard_edition:"+item.standardId+":"+item.edition);
    if(!item.applicability?.trim())throw new Error("applicability_required:"+item.standardId);
    return {...item,applicability:item.applicability.trim()};
  });
  const excluded=input.excluded.map(item=>{
    if(!STANDARDS_REGISTER.some(ref=>ref.id===item.standardId))throw new Error("unknown_standard:"+item.standardId);
    if(!item.reason?.trim())throw new Error("exclusion_reason_required:"+item.standardId);
    return {...item,reason:item.reason.trim()};
  });
  const decided=new Set<string>();
  for(const item of [...selected.map(x=>x.standardId),...excluded.map(x=>x.standardId)]){
    if(decided.has(item))throw new Error("duplicate_standard_decision:"+item);
    decided.add(item);
  }
  if(selected.length===0)throw new Error("at_least_one_standard_required");
  return {selected,excluded,reviewerId:input.reviewerId??null,approvedAt:input.approvedAt??null,version:Math.max(1,input.version??1)};
}
