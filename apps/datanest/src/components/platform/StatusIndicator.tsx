import type { ReactNode } from "react";

export default function StatusIndicator({
  label,tone,detail,icon
}:{
  label:string;
  tone:"neutral"|"info"|"success"|"warning"|"danger";
  detail?:string;
  icon?:ReactNode;
}) {
  return <span
    className={"platformStatusIndicator "+tone}
    role="status"
    aria-label={detail?label+" · "+detail:label}
  >
    {icon&&<span className="platformStatusIcon" aria-hidden="true">{icon}</span>}
    <span className="platformStatusCopy"><strong>{label}</strong>{detail&&<small>{detail}</small>}</span>
  </span>;
}
