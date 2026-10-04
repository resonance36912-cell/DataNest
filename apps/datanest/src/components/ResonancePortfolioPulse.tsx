"use client";

import { useMemo, useState } from "react";

type Product = {
  id:string;
  slug:string;
  name:string;
  full_name:string|null;
  category:string|null;
  lifecycle_status:string|null;
  mission:string|null;
  primary_runtime:string|null;
  as_of_date:string|null;
};

type RecordItem = {
  id:string;
  product_id:string;
  record_type:string;
  code:string|null;
  name:string|null;
  status:string|null;
  sort_order:number;
  payload:Record<string,unknown>;
};

type Props = {
  products:Product[];
  records:RecordItem[];
  loading:boolean;
};

type PulseTone = "live"|"attention"|"evidence"|"governance"|"neutral";

function textValue(payload:Record<string,unknown>,...keys:string[]){
  for(const key of keys){
    const value=payload[key];
    if(typeof value==="string"&&value.trim())return value.trim();
  }
  return "";
}

function productTone(product:Product,records:RecordItem[]):PulseTone{
  const status=(product.lifecycle_status||"").toLowerCase();
  const hasRisk=records.some(record=>record.record_type==="risk"&&!("closed resolved accepted".includes((record.status||"").toLowerCase())));
  if(hasRisk)return "attention";
  if(status.includes("live")||status.includes("active")||status.includes("production"))return "live";
  if(records.some(record=>record.record_type==="evidence"))return "evidence";
  if(records.some(record=>record.record_type==="governance_control"))return "governance";
  return "neutral";
}

function toneLabel(tone:PulseTone){
  if(tone==="live")return "Live";
  if(tone==="attention")return "Attention";
  if(tone==="evidence")return "Evidence";
  if(tone==="governance")return "Governed";
  return "Tracked";
}

export default function ResonancePortfolioPulse({products,records,loading}:Props){
  const [filter,setFilter]=useState<"all"|PulseTone>("all");
  const [expanded,setExpanded]=useState<string|null>(null);

  const grouped=useMemo(()=>{
    const byProduct=new Map<string,RecordItem[]>();
    for(const record of records){
      const current=byProduct.get(record.product_id)||[];
      current.push(record);
      byProduct.set(record.product_id,current);
    }
    return byProduct;
  },[records]);

  const rows=useMemo(()=>products.map(product=>{
    const linked=(grouped.get(product.id)||[]).slice().sort((a,b)=>a.sort_order-b.sort_order);
    const tone=productTone(product,linked);
    const evidence=linked.filter(item=>item.record_type==="evidence");
    const risks=linked.filter(item=>item.record_type==="risk");
    const branches=linked.filter(item=>item.record_type==="source_branch"||item.record_type==="datanest_branch");
    const latest=evidence.at(-1)||linked.find(item=>item.record_type==="decision")||linked[0]||null;
    const latestText=latest
      ?textValue(latest.payload,"summary","description","change","purpose","finding")||latest.name||latest.code||"Governed record available."
      :product.mission||"Governed product record available.";
    return {product,linked,tone,evidence,risks,branches,latestText};
  }).filter(row=>filter==="all"||row.tone===filter),[products,grouped,filter]);

  const counts=useMemo(()=>{
    const result:Record<PulseTone,number>={live:0,attention:0,evidence:0,governance:0,neutral:0};
    for(const product of products){
      result[productTone(product,grouped.get(product.id)||[])]++;
    }
    return result;
  },[products,grouped]);

  return <section className="resonancePortfolioPulse" aria-labelledby="resonance-portfolio-pulse-title">
    <div className="resonancePortfolioPulseHead">
      <div>
        <p className="eyebrow">RESONANCE PORTFOLIO PULSE</p>
        <h2 id="resonance-portfolio-pulse-title">Live ecosystem state, derived from governed DataNest records.</h2>
        <p>This adapts the strongest status-and-update pattern from Reson8 Hub without copying its hard-coded feed: every card is generated from DataNest product evidence, risks, governance records and source lineage.</p>
      </div>
      <span className="resonancePortfolioPulseCount">{loading?"SYNCING":products.length+" TRACKED"}</span>
    </div>

    <div className="resonancePortfolioFilters" role="tablist" aria-label="Filter Resonance portfolio status">
      {([
        ["all","All",products.length],
        ["live","Live",counts.live],
        ["attention","Attention",counts.attention],
        ["evidence","Evidence",counts.evidence],
        ["governance","Governed",counts.governance]
      ] as const).map(([key,label,count])=><button
        key={key}
        type="button"
        role="tab"
        aria-selected={filter===key}
        className={filter===key?"active":""}
        onClick={()=>{setFilter(key);setExpanded(null);}}
      >{label}<span>{count}</span></button>)}
    </div>

    {!loading&&rows.length===0&&<div className="resonancePortfolioEmpty">No products match this pulse filter.</div>}

    <div className="resonancePortfolioGrid">
      {rows.map(({product,linked,tone,evidence,risks,branches,latestText})=>{
        const open=expanded===product.id;
        const activeRisks=risks.filter(item=>!("closed resolved accepted".includes((item.status||"").toLowerCase())));
        return <article className={"resonancePortfolioCard "+tone} key={product.id}>
          <div className="resonancePortfolioCardHead">
            <div>
              <p>{product.category||"RESONANCE PRODUCT"}</p>
              <h3>{product.name}</h3>
              {product.full_name&&<small>{product.full_name}</small>}
            </div>
            <span className="resonancePortfolioTone">{toneLabel(tone)}</span>
          </div>

          <p className="resonancePortfolioLatest">{latestText}</p>

          <div className="resonancePortfolioStats" aria-label={product.name+" governed record summary"}>
            <span><b>{linked.length}</b> records</span>
            <span><b>{evidence.length}</b> evidence</span>
            <span><b>{branches.length}</b> branches</span>
            <span><b>{activeRisks.length}</b> active risks</span>
          </div>

          <button
            type="button"
            className="resonancePortfolioDetailsButton"
            aria-expanded={open}
            onClick={()=>setExpanded(open?null:product.id)}
          >{open?"Hide governed detail":"Review governed detail"}</button>

          {open&&<div className="resonancePortfolioDetails">
            <dl>
              <div><dt>Lifecycle</dt><dd>{product.lifecycle_status||"Tracked"}</dd></div>
              <div><dt>Runtime</dt><dd>{product.primary_runtime||"Governed runtime"}</dd></div>
              <div><dt>As of</dt><dd>{product.as_of_date||"Current catalog"}</dd></div>
            </dl>
            <div className="resonancePortfolioEvidenceList">
              {linked.slice(0,8).map(record=><div key={record.id}>
                <span>{record.record_type.replaceAll("_"," ")}</span>
                <b>{record.name||record.code||record.status||"Governed record"}</b>
                {record.status&&<small>{record.status}</small>}
              </div>)}
            </div>
          </div>}
        </article>;
      })}
    </div>
  </section>;
}
