import { workflowPhases, type WorkflowPhaseId } from "@/lib/workflowPhases";

export default function ContextStrip({
  projectName,applicationName,phase,status,nextAction
}:{
  projectName?:string;
  applicationName?:string;
  phase:WorkflowPhaseId|null;
  status?:string;
  nextAction?:string;
}) {
  const phaseLabel=phase?workflowPhases.find(item=>item.id===phase)?.label||"Cross-phase":"Cross-phase";
  const itemStyle={display:"grid",gap:"2px",minWidth:0,maxWidth:"100%"} as const;
  const valueStyle={minWidth:0,maxWidth:"100%",overflowWrap:"anywhere"} as const;
  return <section className="workspaceWayfinding" role="region" aria-label="Workspace context">
    {projectName&&<span style={itemStyle}><small>PROJECT</small><strong style={valueStyle}>{projectName}</strong></span>}
    {applicationName&&<><span aria-hidden="true">/</span><span style={itemStyle}><small>WORKSPACE</small><strong style={valueStyle}>{applicationName}</strong></span></>}
    <span aria-hidden="true">/</span><span style={itemStyle}><small>PHASE</small><strong>{phaseLabel}</strong></span>
    {status&&<><span aria-hidden="true">/</span><span style={itemStyle}><small>STATUS</small><strong>{status}</strong></span></>}
    {nextAction&&<><span aria-hidden="true">/</span><span style={itemStyle}><small>NEXT GOVERNED ACTION</small><strong>{"Next · "+nextAction}</strong></span></>}
  </section>;
}
