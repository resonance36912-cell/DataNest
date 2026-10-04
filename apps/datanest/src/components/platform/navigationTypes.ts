import type { WorkflowPhaseId } from "@/lib/workflowPhases";

export type NavigationItem = {
  id:string;
  label:string;
  group:string;
  phase:WorkflowPhaseId|null;
  keywords:readonly string[];
};
