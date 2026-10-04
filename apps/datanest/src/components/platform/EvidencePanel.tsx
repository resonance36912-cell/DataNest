import type { ReactNode } from "react";

type EvidenceItem = {
  label:string;
  value:string;
  href?:string;
};

export default function EvidencePanel({
  title,items,emptyState
}:{
  title:string;
  items:readonly EvidenceItem[];
  emptyState?:ReactNode;
}) {
  return <section className="platformEvidencePanel" aria-label={title}>
    <div className="platformEvidenceHeader"><p className="eyebrow">EVIDENCE</p><h3>{title}</h3></div>
    {items.length>0?<dl className="platformEvidenceList">
      {items.map((item,index)=><div className="platformEvidenceItem" key={item.label+"-"+index}>
        <dt>{item.label}</dt>
        <dd>{item.href?<a href={item.href}>{item.value}</a>:item.value}</dd>
      </div>)}
    </dl>:<div className="platformEvidenceEmpty">{emptyState||"No evidence is attached to this view yet."}</div>}
  </section>;
}
