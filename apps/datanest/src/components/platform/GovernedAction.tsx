import type { ReactNode } from "react";
import StatusIndicator from "@/components/platform/StatusIndicator";

export type GovernedActionStage = "proposed"|"checked"|"review-required"|"authorized"|"scheduled"|"executed"|"verified";

const stageCopy:Record<GovernedActionStage,{label:string;tone:"neutral"|"info"|"success"|"warning"|"danger"}> = {
  proposed:{label:"AI proposed",tone:"neutral"},
  checked:{label:"System checked",tone:"info"},
  "review-required":{label:"Human / external review required",tone:"warning"},
  authorized:{label:"Authorized",tone:"success"},
  scheduled:{label:"Scheduled",tone:"info"},
  executed:{label:"Executed",tone:"info"},
  verified:{label:"Verified",tone:"success"}
};

export function guardGovernedActionStage(
  requestedStage:GovernedActionStage,
  {reviewer,evidence}:{reviewer?:string|null;evidence:boolean}
):GovernedActionStage {
  if(["authorized","scheduled","executed","verified"].includes(requestedStage)&&(!reviewer||!evidence)) {
    return "review-required";
  }
  return requestedStage;
}

export default function GovernedAction({
  stage:requestedStage,summary,evidence,reviewer,onAction
}:{
  stage:GovernedActionStage;
  summary:string;
  evidence?:ReactNode;
  reviewer?:string;
  onAction?:()=>void;
}) {
  const stage=guardGovernedActionStage(requestedStage,{reviewer,evidence:Boolean(evidence)});
  const state=stageCopy[stage];
  return <section className="platformGovernedAction" aria-label="Governed action" data-governed-stage={stage}>
    <div className="platformGovernedActionHead">
      <StatusIndicator label={state.label} tone={state.tone}/>
      {reviewer&&<span className="platformGovernedReviewer"><small>REVIEWER</small><strong>{reviewer}</strong></span>}
    </div>
    <p>{summary}</p>
    {evidence&&<div className="platformGovernedEvidence">{evidence}</div>}
    {onAction&&<button className="primaryButton compact" type="button" onClick={onAction}>Continue governed action</button>}
  </section>;
}
