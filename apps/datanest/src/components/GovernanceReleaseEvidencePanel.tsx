"use client";

import { useCallback, useEffect, useState } from "react";

type ReleaseEvidence={
  releaseSha:string;
  releaseState:string;
  authorized:boolean;
  ownerTestMode:null|{
    active:boolean;
    expiresAt:string;
    reason:string;
    authorizationReference:string;
    timeframeProposal?:{recommendedHours:number;strategy:string};
    evidenceDeadlines?:Record<string,string|null>;
  };
  evidence:Record<string,{status:string;reference:string|null}>;
};

const items=[
  ["visualReview","Human visual / UX review"],
  ["governanceReview","Governance-impact review"],
  ["legalReview","Legal review"],
  ["externalReview","External / independent review"],
  ["productionAuthorization","Final production authorization"]
] as const;

function formatDate(value:string|null|undefined){
  return value?new Date(value).toLocaleString():"—";
}

export default function GovernanceReleaseEvidencePanel(){
  const [release,setRelease]=useState<ReleaseEvidence|null>(null);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    setError("");
    try{
      const url=new URL("ui-governance-release.json",window.location.href);
      url.search="";
      url.hash="";
      const response=await fetch(url.toString(),{cache:"no-store"});
      if(!response.ok)throw new Error("Release evidence is not published yet.");
      setRelease(await response.json() as ReleaseEvidence);
    }catch(value){
      setRelease(null);
      setError(value instanceof Error?value.message:"Unable to load release evidence.");
    }
  },[]);

  useEffect(()=>{void load();},[load]);

  const mode=release?.ownerTestMode;
  const due=mode?.evidenceDeadlines||{};
  const open=items.filter(([key])=>release?.evidence?.[key]?.status!=="supplied").length;

  return <section className="panel" aria-label="Production evidence window">
    <div className="panelHead">
      <div>
        <p className="eyebrow">PRODUCTION EVIDENCE</p>
        <h2>Release evidence and due dates</h2>
        <p>Live production testing gathers evidence first; outstanding human reviews close against that evidence within the bounded window.</p>
      </div>
      <button className="secondaryButton compact" type="button" onClick={()=>void load()}>Refresh</button>
    </div>
    {error&&<p className="muted" role="alert">{error}</p>}
    {release&&<>
      <div className="metricGrid">
        <article className="metricCard"><span>Release state</span><strong>{release.releaseState.replaceAll("_"," ").toUpperCase()}</strong><small>{release.authorized?"Authorized":"Closure pending"}</small></article>
        <article className="metricCard"><span>Open human items</span><strong>{open}</strong><small>Outstanding evidence records</small></article>
        <article className="metricCard"><span>Live Test Mode</span><strong>{mode?.active?"ACTIVE":"—"}</strong><small>{mode?.expiresAt?"Ends "+formatDate(mode.expiresAt):"No active window"}</small></article>
        <article className="metricCard"><span>Closure phase</span><strong>{mode?.active?"POST-TEST":"STANDARD"}</strong><small>{mode?.active?"Human evidence closes after live observation":"Normal governed release flow"}</small></article>
        <article className="metricCard"><span>Candidate</span><strong>{release.releaseSha.slice(0,8)}</strong><small title={release.releaseSha}>{release.releaseSha}</small></article>
      </div>
      {mode&&<dl className="settingsList">
        <div><dt>Owner reference</dt><dd>{mode.authorizationReference}</dd></div>
        <div><dt>Evidence purpose</dt><dd>{mode.reason}</dd></div>
        <div><dt>Proposed window</dt><dd>{mode.timeframeProposal?.recommendedHours?mode.timeframeProposal.recommendedHours+" hours":"—"}</dd></div>
        <div><dt>Window ends</dt><dd>{formatDate(mode.expiresAt)}</dd></div>
      </dl>}
      <div className="settingsList">
        {items.map(([key,label])=>{
          const item=release.evidence?.[key]||{status:"pending",reference:null};
          return <div key={key}><dt>{label}</dt><dd><b>{item.status==="supplied"?"SUPPLIED":"OPEN"}</b>{item.reference&&<small>{item.reference}</small>}{due[key]&&<small>{"Due "+formatDate(due[key])}</small>}</dd></div>;
        })}
      </div>
    </>}
  </section>;
}
