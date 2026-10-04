import type { ReactNode } from "react";

export default function PageHeader({
  eyebrow,title,description,primaryAction,meta
}:{
  eyebrow:string;
  title:string;
  description?:string;
  primaryAction?:ReactNode;
  meta?:ReactNode;
}) {
  return <header className="platformPageHeader">
    <div className="platformPageHeaderCopy">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {description&&<p>{description}</p>}
      {meta&&<div className="platformPageHeaderMeta">{meta}</div>}
    </div>
    {primaryAction&&<div className="platformPageHeaderAction">{primaryAction}</div>}
  </header>;
}
