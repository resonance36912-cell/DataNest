"use client";

export type CertifiedMemoryItem = {
  id:string;
  normalized_knowledge:string;
  category:string;
  effective_version:number;
  certification_id:string;
  source_job_ids:string[];
  source_trace_ids:string[];
  certification_class:string;
  confidence:number|null;
  policy_version:string;
  content_hash:string;
  supersedes_memory_id:string|null;
  promoted_at:string;
  applicability?:Record<string,unknown>;
  valid_from?:string|null;
  valid_until?:string|null;
  review_after?:string|null;
  last_verified_at?:string|null;
  review_due?:boolean;
  memory_score?:number;
  relevance_score?:number;
  trust_score?:number;
  freshness_score?:number;
  review_factor?:number;
};

function formatDate(value:string){
  return new Intl.DateTimeFormat(undefined,{
    month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"
  }).format(new Date(value));
}

export default function DataNestAiMemoryPanel({items}:{items:CertifiedMemoryItem[]}){
  const reviewDue=items.filter(item=>item.review_due).length;

  return <section className="panel datanestAiMemoryPanel">
    <div className="panelHead">
      <div>
        <p className="eyebrow">CERTIFIED MEMORY</p>
        <h3>Project-wide reusable knowledge</h3>
      </div>
      <span className="countPill">{items.length}</span>
    </div>
    <p className="muted">
      This is the governed, context-ranked subset of project memory selected for the active Job. Raw collective evidence remains outside operational memory until certification.
    </p>
    {reviewDue>0&&<p className="muted" role="status">
      {reviewDue+" selected memor"+(reviewDue===1?"y is":"ies are")+" due for review and therefore receive a lower retrieval weight until reaffirmed."}
    </p>}
    <div className="manifestList">
      {items.map(item=><article className="manifestCard" key={item.id}>
        <div className="rowBetween">
          <div>
            <b>{item.category.replaceAll("_"," ")}</b>
            <small>
              {"Memory v"+item.effective_version+" · promoted "+formatDate(item.promoted_at)}
              {item.last_verified_at?" · reviewed "+formatDate(item.last_verified_at):""}
            </small>
          </div>
          <span className={"badge "+(item.review_due?"warn":"good")}>
            {item.review_due?"CERTIFIED · REVIEW DUE":"CERTIFIED"}
          </span>
        </div>
        <p>{item.normalized_knowledge}</p>
        <div className="manifestMeta">
          <span>{item.certification_class}</span>
          <span>{item.source_job_ids.length+" source Job"+(item.source_job_ids.length===1?"":"s")}</span>
          <span>{item.confidence==null?"confidence —":"confidence "+Math.round(item.confidence*100)+"%"}</span>
          {typeof item.memory_score==="number"&&<span>{"selection "+Math.round(item.memory_score*100)+"%"}</span>}
          {item.review_after&&<span>{"review "+(item.review_due?"due ":"by ")+formatDate(item.review_after)}</span>}
        </div>
        <details>
          <summary>Provenance &amp; selection</summary>
          <code>{JSON.stringify({
            certificationId:item.certification_id,
            sourceJobIds:item.source_job_ids,
            sourceTraceIds:item.source_trace_ids,
            policyVersion:item.policy_version,
            contentHash:item.content_hash,
            supersedes:item.supersedes_memory_id,
            applicability:item.applicability||{},
            validFrom:item.valid_from||null,
            validUntil:item.valid_until||null,
            lastVerifiedAt:item.last_verified_at||null,
            reviewAfter:item.review_after||null,
            reviewDue:Boolean(item.review_due),
            selectionScore:item.memory_score??null,
            relevanceScore:item.relevance_score??null,
            trustScore:item.trust_score??null,
            freshnessScore:item.freshness_score??null,
            reviewFactor:item.review_factor??null
          },null,2)}</code>
        </details>
      </article>)}
      {!items.length&&<div className="emptyState">
        <div>✓</div>
        <h3>No Verified Memory selected</h3>
        <p>No active certified memory matched this Job context and its governed applicability scope.</p>
      </div>}
    </div>
  </section>;
}
