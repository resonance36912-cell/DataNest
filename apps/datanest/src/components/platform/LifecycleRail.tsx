"use client";

import { workflowPhases, type WorkflowDestination, type WorkflowPhaseId } from "@/lib/workflowPhases";

export default function LifecycleRail({
  currentPhase,onNavigate,aiActive=false
}:{
  currentPhase:WorkflowPhaseId|null;
  onNavigate:(destination:WorkflowDestination)=>void;
  aiActive?:boolean;
}) {
  return <nav className={"workflowPhaseRail "+(aiActive?"aiViewPhaseRail":"")} aria-label="DataNest lifecycle phases">
    <div className="workflowPhaseSteps">
      {workflowPhases.map((phase,index)=>{
        const active=phase.id===currentPhase;
        return <button
          key={phase.id}
          type="button"
          className={active?"active":""}
          aria-current={active?"step":undefined}
          aria-label={active?phase.label+" phase · current":"Go to "+phase.label+" phase"}
          onClick={()=>{if(!active)onNavigate(phase.destination);}}
        ><span>{"0"+(index+1)}</span><b>{phase.label}</b></button>;
      })}
    </div>
    <button
      className={"workflowPhaseAi "+(aiActive?"active":"")}
      type="button"
      aria-current={aiActive?"page":undefined}
      onClick={()=>onNavigate("ai")}
    ><span aria-hidden="true">✦</span><b>AI CORE</b><small>cross-phase</small></button>
  </nav>;
}
