"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getSupabase } from "@/lib/supabase";
import styles from "./CollaborationVisual.module.css";

type GovernedProduct = {
  id:string;
  slug:string;
  name:string;
  full_name:string|null;
  lifecycle_status:string|null;
};

type ProductApplication = {
  id:string;
  product_id:string;
  name:string|null;
  status:string|null;
  sort_order:number;
  payload:Record<string,unknown>;
};

export type ProductHeroTarget = {
  product?:string;
  recordType?:"application";
  q?:string;
};

const MAX_ORBIT_PRODUCTS=9;

function orbitPosition(index:number,total:number){
  const angle=((Math.PI*2*index)/Math.max(1,total))-(Math.PI/2);
  return {
    left:50+(Math.cos(angle)*37),
    top:50+(Math.sin(angle)*39)
  };
}

function payloadText(payload:Record<string,unknown>|undefined,key:string){
  const value=payload?.[key];
  return typeof value==="string"&&value.trim()?value.trim():"";
}

export default function CollaborationVisual({
  projectId,
  onOpenProducts
}:{
  projectId?:string;
  onOpenProducts?:(target?:ProductHeroTarget)=>void;
}) {
  const [products,setProducts]=useState<GovernedProduct[]>([]);
  const [applications,setApplications]=useState<ProductApplication[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  useEffect(()=>{
    let active=true;
    if(!projectId){
      setLoading(false);
      setError("");
      setProducts([]);
      setApplications([]);
      return()=>{active=false;};
    }
    const supabase=getSupabase();
    if(!supabase){
      setError("Product catalog connection is unavailable.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    void Promise.all([
      supabase
        .from("products")
        .select("id,slug,name,full_name,lifecycle_status")
        .eq("project_id",projectId)
        .order("name"),
      supabase
        .from("product_records")
        .select("id,product_id,name,status,sort_order,payload")
        .eq("project_id",projectId)
        .eq("record_type","application")
        .order("sort_order",{ascending:true})
    ]).then(([productResult,applicationResult])=>{
      if(!active)return;
      const nextError=productResult.error||applicationResult.error;
      if(nextError){
        setError(nextError.message);
        setProducts([]);
        setApplications([]);
        return;
      }
      setProducts((productResult.data||[]) as GovernedProduct[]);
      setApplications((applicationResult.data||[]) as ProductApplication[]);
    }).catch(reason=>{
      if(!active)return;
      setError(reason instanceof Error?reason.message:"Product catalog sync failed.");
      setProducts([]);
      setApplications([]);
    }).finally(()=>{
      if(active)setLoading(false);
    });

    return()=>{active=false;};
  },[projectId]);

  const applicationCounts=useMemo(()=>{
    const counts=new Map<string,number>();
    for(const application of applications){
      counts.set(application.product_id,(counts.get(application.product_id)||0)+1);
    }
    return counts;
  },[applications]);

  const primaryApplications=useMemo(()=>{
    const primary=new Map<string,ProductApplication>();
    for(const application of applications){
      if(!primary.has(application.product_id))primary.set(application.product_id,application);
    }
    return primary;
  },[applications]);

  const orbitProducts=useMemo(
    ()=>products.slice(0,MAX_ORBIT_PRODUCTS),
    [products]
  );

  const ariaLabel=loading
    ?"DataNest AI core synchronizing the governed Resonance product catalog."
    :error
      ?"DataNest AI core. Governed product catalog is temporarily unavailable."
      :orbitProducts.length
        ?"DataNest AI core with governed products: "+orbitProducts.map(product=>{
          const count=applicationCounts.get(product.id)||0;
          return product.name+", "+count+" application"+(count===1?"":"s");
        }).join("; ")
        :"DataNest AI core. No governed Resonance products are currently loaded.";

  if(!projectId){
    return <div className="aiICoreStage" aria-label="AI and human collaboration visualization">
      <div className="coreOrbit orbitOuter" aria-hidden="true"/>
      <div className="coreOrbit orbitMiddle" aria-hidden="true"/>
      <div className="signalArc arcOne" aria-hidden="true"/>
      <div className="signalArc arcTwo" aria-hidden="true"/>
      <div className="coreNode humanCore">
        <small>I</small>
        <strong>Intent</strong>
        <span>Human direction</span>
      </div>
      <div className="coreBridge" aria-hidden="true"><i/><i/><i/><i/></div>
      <div className="coreNode aiCore">
        <small>AI</small>
        <strong>Amplify</strong>
        <span>Governed intelligence</span>
      </div>
      <div className="coreCenter" aria-hidden="true"><span>R</span></div>
      <span className="coreCaption">Traceable collaboration loop</span>
    </div>;
  }

  return <div className={"aiICoreStage "+styles.productsHeroVisual} aria-label={ariaLabel} data-hero-ecosystem="ronsas">
    <div className={styles.valueNetwork} aria-label="Resonance DataNest value network">
      <span className={styles.aiCorePulse} data-hero-signal="ai-core" aria-hidden="true"/>
      <span className={styles.valueSignal+" "+styles.aiSignal} data-signal="ai" aria-hidden="true"/>
      <span className={styles.valueSignal+" "+styles.memorySignal} data-signal="memory" aria-hidden="true"/>
      <span className={styles.valueSignal+" "+styles.collaborationSignal} data-signal="collaboration" aria-hidden="true"/>
      <span className={styles.valueSignal+" "+styles.ronsasSignal} data-signal="ronsas" aria-hidden="true"/>

      <div className={styles.valueNode+" "+styles.aiValueNode} data-value="governed-ai">
        <small>AI</small><b>Governed AI</b><span>Intent → intelligence</span>
      </div>
      <div className={styles.valueNode+" "+styles.memoryValueNode} data-value="certified-memory">
        <small>MEMORY</small><b>Certified Memory</b><span>Validated learning</span>
      </div>
      <div className={styles.valueNode+" "+styles.collaborationValueNode} data-value="traceable-collaboration">
        <small>TRACE</small><b>Traceable Collaboration</b><span>Human + AI provenance</span>
      </div>
      <div className={styles.valueNode+" "+styles.ronsasValueNode} data-value="sovereign-app-suite">
        <small>RONSAS</small><b>Sovereign App Suite</b><span>Resonance Open Nova Sovereign Application Suite</span>
      </div>

      <span className={styles.intelligenceHalo} aria-hidden="true"/>
    </div>

    <div className={styles.portfolioOrbitShell} aria-hidden="true">
      <span className={styles.portfolioOrbitRing+" "+styles.portfolioRingOuter}/>
      <span className={styles.portfolioOrbitRing+" "+styles.portfolioRingInner}/>
      <span className={styles.portfolioSignalSweep}/>
      <span className={styles.ecosystemPulse} data-hero-signal="ecosystem-sweep"/>
      <span className={styles.portfolioSignalDot+" "+styles.dotOne}/>
      <span className={styles.portfolioSignalDot+" "+styles.dotTwo}/>
      <span className={styles.portfolioSignalDot+" "+styles.dotThree}/>
    </div>

    {orbitProducts.map((product,index)=>{
      const position=orbitPosition(index,orbitProducts.length);
      const slotStyle={left:position.left+"%",top:position.top+"%"} as CSSProperties;
      const applicationCount=applicationCounts.get(product.id)||0;
      const primaryApplication=primaryApplications.get(product.id);
      const domain=payloadText(primaryApplication?.payload,"domain")||"application";
      const description=payloadText(primaryApplication?.payload,"description");
      return <div className={styles.portfolioProductSlot} style={slotStyle} key={product.id}>
        <button
          type="button"
          className={styles.portfolioProductCard}
          style={{animationDelay:(index*-0.42)+"s"}}
          onClick={()=>onOpenProducts?.({
            product:product.slug,
            recordType:"application",
            q:primaryApplication?.name||undefined
          })}
          aria-label={"Open "+product.name+" applications in Products"}
          title={description||undefined}
        >
          <span className={styles.portfolioProductTopline}>
            <i className={styles.portfolioProductIndex}>{String(index+1).padStart(2,"0")}</i>
            <em className={styles.portfolioProductDomain}>{domain}</em>
          </span>
          <b>{product.name}</b>
          <small>{applicationCount} application{applicationCount===1?"":"s"}</small>
          {primaryApplication&&<span className={styles.portfolioProductApplication}>
            <span>{primaryApplication.name||"Governed application"}</span>
            <em>{primaryApplication.status||"governed"}</em>
          </span>}
        </button>
      </div>;
    })}

    <div className={styles.portfolioCore+" "+(loading?styles.loading:"")}>
      <small>DATANEST CORE</small>
      <strong>DataNest AI</strong>
      <span>Shared intelligence</span>
      <button type="button" onClick={()=>onOpenProducts?.()}>
        <span>Open Products</span><b aria-hidden="true">↗</b>
      </button>
    </div>

    <span className={styles.portfolioCaption}>
      {loading
        ?"Live catalog sync"
        :error
          ?"Catalog sync unavailable"
          :orbitProducts.length
            ?orbitProducts.length+" governed product"+(orbitProducts.length===1?"":"s")+" · "+applications.length+" linked applications"
            :"No governed products imported yet"}
    </span>
  </div>;
}
