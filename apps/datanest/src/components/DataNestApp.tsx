"use client";

import dynamic from "next/dynamic";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { DATANEST_LOGO_SRC } from "@/lib/brand";
import { getRonsasStatus } from "@/lib/ronsas";
import { DATANEST_CANONICAL_NAME, RESON8_HUB_URL } from "@/lib/reson8";
import { SPARKS_TASK_COMPLETE, SPARKS_TASK_EVIDENCE, SPARKS_TASK_START, SPARKS_WORKSPACE_DESCRIPTION } from "@/lib/ecosystemAuthority";
import { workflowPhaseForView } from "@/lib/workflowPhases";
import JobInviteForm from "@/components/JobInviteForm";
import ResonanceHome from "@/components/ResonanceHome";
import WorkspaceGlyph from "@/components/platform/WorkspaceGlyph";
import MotionControl from "@/components/MotionControl";
import ThemeControl from "@/components/platform/ThemeControl";
import ExecutionAuthorityPanel from "@/components/ExecutionAuthorityPanel";
import ResourceFabricPanel from "@/components/ResourceFabricPanel";
import RecoveryDiagnosticsPanel from "@/components/RecoveryDiagnosticsPanel";
import AccountPasswordPanel from "@/components/AccountPasswordPanel";
import OwnerDevelopmentAnalytics from "@/components/OwnerDevelopmentAnalytics";
import RndDeviceAdministration from "@/components/RndDeviceAdministration";
import AdminRndModeToggle from "@/components/AdminRndModeToggle";
import GlobalNavigation from "@/components/platform/GlobalNavigation";
import LifecycleRail from "@/components/platform/LifecycleRail";
import PlatformShell from "@/components/platform/PlatformShell";
import PlatformFooter from "@/components/platform/PlatformFooter";
import type { NavigationItem } from "@/components/platform/navigationTypes";
import ImpactScoringWorkspace from "@/components/ImpactScoringWorkspace";
import type { ExecutionAuthorityRole } from "@/lib/executionAuthority";
import { useSessionDraftState } from "@/lib/sessionDraft";
import { useSingleFlight } from "@/lib/singleFlight";
import { PENDING_MUTATION_EVENT, classifyPendingMutationAge, clearPendingMutation, getOrCreatePendingMutation, loadPendingMutation, markPendingMutationDurable, markPendingMutationVerification, restorePendingMutation, type PendingMutationAge, type PendingMutationIntent, type PendingMutationVerification } from "@/lib/pendingMutation";
import { durableRecoveryToPendingIntent, listDurableRecoveries, markDurableRecoveryVerification, registerDurableRecovery, resolveDurableRecovery } from "@/lib/durableRecovery";
import { reconcileServerMutation, type MutationReconciliationState } from "@/lib/mutationReconciliation";
import { WORK_FOCUS_AREAS, normalizeWorkFocusKeys, workFocusKeysFromRequirements, workFocusLabel, workInterestCoverage, workInterestGapKeys, workInterestOverlapCount, workInterestOverlapKeys, workMatchesInterests, type WorkFocusKey } from "@/lib/workFocus";

type Project = { id:string; slug:string; name:string; description:string|null; status:string; created_at:string };
type Tool = { id:string; tool_key:string; name:string; role:string; enabled:boolean; config:Record<string,unknown> };
type Job = { id:string; job_number:number; title:string; description:string|null; priority:number; status:string; required_capabilities:string[]; requirements:Record<string,unknown>; acceptance:Record<string,unknown>; created_at:string; updated_at:string; deadline:string|null };
type Capability = { id:string; account_key:string; connector_kind:string; capability:string; state:string; observed_at:string|null; next_check_at:string|null; confidence:number|null; concurrency_limit:number; running:number; metadata:Record<string,unknown> };
type Run = { id:string; job_id:string; run_number:number; connector_kind:string; status:string; started_at:string; completed_at:string|null; error_category:string|null };
type Checkpoint = { id:string; job_id:string; completed:string[]; remaining:string[]; resume_instruction:string|null; created_at:string };
type AuditEvent = { id:number; job_id:string|null; event_type:string; actor:string; payload:Record<string,unknown>; created_at:string };
type Policy = { id:string; policy_key:string; value:Record<string,unknown> };
type ProjectMember = { project_id:string; user_id:string; role:"owner"|"admin"|"operator"|"viewer"; status:string };
type ViewKey = "dashboard"|"overview"|"stakeholder"|"sparks"|"impact"|"governance"|"products"|"external_auditor"|"thinktank"|"ai"|"productlab"|"unifi"|"scheduler"|"runs"|"checkpoints"|"audit"|"transparency"|"settings";
type SchedulerViewMode = "queue"|"gantt"|"authority"|"resources";
type SchedulerSortMode = "priority"|"deadline"|"recent"|"interest";
const schedulerFilterOptions=["ALL","PLANNED","READY","QUEUED","RUNNING","MANUAL_ACTION","BLOCKED","COMPLETED"] as const;
type SchedulerFilter = typeof schedulerFilterOptions[number];
const operationalUrlStateKeys=["page","mode","filter","sort","interests","focus"] as const;
const workspaceScopedUrlStateKeys=[...operationalUrlStateKeys,"section"] as const;
const paginatedWorkspaceViews=new Set<ViewKey>(["unifi","scheduler","runs","checkpoints","audit"]);
function scopeUrlToWorkspace(url:URL,view:ViewKey){
  if(!paginatedWorkspaceViews.has(view))url.searchParams.delete("page");
  if(view!=="scheduler"){
    url.searchParams.delete("mode");
    url.searchParams.delete("filter");
    url.searchParams.delete("sort");
    url.searchParams.delete("interests");
    url.searchParams.delete("focus");
  }
  if(view!=="governance"&&view!=="products")url.searchParams.delete("section");
  return url;
}
function urlPageIndex(url:URL){
  const raw=Number(url.searchParams.get("page")||"1");
  return Number.isInteger(raw)&&raw>0?raw-1:0;
}
function schedulerViewModeFromUrl(url:URL):SchedulerViewMode{
  const raw=url.searchParams.get("mode");
  return raw==="queue"||raw==="authority"||raw==="resources"||raw==="gantt"?raw:"gantt";
}
function schedulerSortModeFromUrl(url:URL):SchedulerSortMode{
  const raw=url.searchParams.get("sort");
  return raw==="deadline"||raw==="recent"||raw==="interest"||raw==="priority"?raw:"priority";
}
function schedulerFilterFromUrl(url:URL):SchedulerFilter{
  const raw=url.searchParams.get("filter");
  return schedulerFilterOptions.includes(raw as SchedulerFilter)?raw as SchedulerFilter:"ALL";
}
function schedulerInterestOnlyFromUrl(url:URL){
  return url.searchParams.get("interests")==="1";
}
function schedulerRequirementFocusFromUrl(url:URL):WorkFocusKey|null{
  const raw=url.searchParams.get("focus");
  return raw?normalizeWorkFocusKeys([raw])[0]||null:null;
}
type HealthState = { state:"checking"|"online"|"degraded"|"offline"; checkedAt:string|null; message:string };
type Summary = { total:number; active:number; running:number; blocked:number; available:number; registered:number };
type ActiveDataNestAiSession = { jobId:string; sessionId:string|null; jobNumber:number; title:string; status:string };
type JobExecutionAuthorityState = {
  route_mode?:string;
  envelope_id?:string|null;
  envelope_status?:string|null;
  lease_states?:Record<string,string>;
  breaker_state?:string|null;
  decision_outcome?:string|null;
  decision_reason_code?:string|null;
  readiness?:string|null;
};
type MutationRecoveryDescriptor = {
  scope:string;
  kind:string;
  view:ViewKey;
  label:string;
  detail:string;
};
type MutationRecoveryItem = MutationRecoveryDescriptor & {
  startedAt:string;
  age:PendingMutationAge;
  verificationState:PendingMutationVerification;
  lastCheckedAt:string|null;
  durable:boolean;
  attemptCount:number;
  lastAttemptAt:string|null;
};

const PAGE_SIZE = 20;
const preparedJobStates = new Set(["PLANNED","READY","QUEUED"]);
const finalStates = new Set(["COMPLETED","FAILED","CANCELLED"]);
const jobColumns = "id,job_number,title,description,priority,status,required_capabilities,requirements,acceptance,created_at,updated_at,deadline";

const nav:Array<NavigationItem & {key:ViewKey;glyph:string}> = [
  {key:"dashboard",label:"Control Center",group:"HOME",glyph:"▦",id:"dashboard",phase:null,keywords:["dashboard","control","operations","governance"]},
  {key:"overview",label:"AI & I",group:"HOME",glyph:"◎",id:"overview",phase:null,keywords:["home","intent","overview"]},
  {key:"ai",label:"DataNest AI",group:"HOME",glyph:"✦",id:"ai",phase:null,keywords:["ai","assistant","core"]},
  {key:"stakeholder",label:"Stakeholder",group:"THINK",glyph:"◌",id:"stakeholder",phase:"discover",keywords:["stakeholder","contribution"]},
  {key:"sparks",label:"Sparks",group:"THINK",glyph:"✧",id:"sparks",phase:"discover",keywords:["sparks","ideas"]},
  {key:"impact",label:"Impact",group:"PROVE",glyph:"◉",id:"impact",phase:null,keywords:["impact","verification","scoring"]},
  {key:"thinktank",label:"Think Tanks",group:"THINK",glyph:"◈",id:"thinktank",phase:"discover",keywords:["think","research","collaboration"]},
  {key:"governance",label:"Governance",group:"GOVERN",glyph:"◆",id:"governance",phase:"govern",keywords:["governance","policy","decisions"]},
  {key:"products",label:"Products",group:"BUILD",glyph:"◉",id:"products",phase:"build",keywords:["products","portfolio"]},
  {key:"external_auditor",label:"External Auditor",group:"GOVERN",glyph:"◫",id:"external_auditor",phase:null,keywords:["audit","external","review"]},
  {key:"productlab",label:"Product Lab",group:"BUILD",glyph:"▣",id:"productlab",phase:"build",keywords:["product","lab","test"]},
  {key:"unifi",label:"UNIFI Planner",group:"EXECUTE",glyph:"◇",id:"unifi",phase:"execute",keywords:["unifi","plan","manifest"]},
  {key:"scheduler",label:"TranScheduler",group:"EXECUTE",glyph:"⌁",id:"scheduler",phase:"execute",keywords:["schedule","gantt","queue"]},
  {key:"runs",label:"Runs",group:"EXECUTE",glyph:"▶",id:"runs",phase:"execute",keywords:["runs","execution"]},
  {key:"checkpoints",label:"Checkpoints",group:"PROVE",glyph:"↺",id:"checkpoints",phase:"verify",keywords:["checkpoint","resume"]},
  {key:"audit",label:"Audit",group:"PROVE",glyph:"≡",id:"audit",phase:"verify",keywords:["audit","events"]},
  {key:"transparency",label:"Transparency",group:"PROVE",glyph:"◎",id:"transparency",phase:"verify",keywords:["transparency","evidence"]},
  {key:"settings",label:"Settings",group:"ADMIN",glyph:"⚙",id:"settings",phase:null,keywords:["settings","administration"]}
]

type CommandItem =
  | {kind:"view";id:ViewKey;key:ViewKey;label:string;group:string;glyph:string;description:string}
  | {kind:"external";id:"ronsas";href:string;label:string;group:string;glyph:string;description:string};

const viewKeys = new Set<ViewKey>(nav.map(item=>item.key));

const viewDescriptions:Record<ViewKey,string> = {
  dashboard:"Live operational dashboard across work, execution, governance, AI optimization, controls and evidence.",
  overview:"Human intent and governed AI collaboration at a glance.",
  stakeholder:"Capture stakeholder input and review contribution context.",
  sparks:SPARKS_WORKSPACE_DESCRIPTION,
  impact:"Live input quality, verification acceptance, impact points, and the project areas your work affects.",
  governance:"Review sovereign governance controls and decisions.",
  products:"Inspect governed Resonance products, their architecture, controls, evidence, risks and promotion branches.",
  external_auditor:"Assess external projects and products with evidence-linked findings, ISO-aware traceability, governed AI analysis, and reviewed optimization handoff.",
  thinktank:"Coordinate structured research and collaborative thinking.",
  ai:"Work with governed DataNest AI memory and project context.",
  productlab:"Test and review product surfaces before release.",
  unifi:"Plan complete, traceable Job Manifests before execution.",
  scheduler:"Manage project work in queue or Gantt chart context with live capability-aware scheduling.",
  runs:"Review execution history and connector outcomes.",
  checkpoints:"Resume project work from durable continuation points.",
  audit:"Inspect immutable operational events and traceability.",
  transparency:"Review published audit methodology, evidence, and findings.",
  settings:"Manage project, tool, AI administration, and scheduler policy."
};

type WorkspaceTaskGuide = { start:string; complete:string; evidence:string };

const workspaceTaskGuides:Partial<Record<ViewKey,WorkspaceTaskGuide>> = {
  ai:{start:"Select the Job Manifest that owns the work, then continue in the development chat.",complete:"The Job has an actionable AI output or durable memory worth certifying.",evidence:"Job-scoped session, event trail and certified memory."},
  impact:{start:"Inspect each input, its quality score, verification stage, and project area.",complete:"The live impact record shows how inputs progressed through verification and where they landed.",evidence:"Input trace, scoring version, verification stage, impact area and points."},
  stakeholder:{start:"Review stakeholder state and recent contribution events before changing preferences or review decisions.",complete:"Contribution context and participation preferences reflect the stakeholder's current intent.",evidence:"Profile state, contribution events and review signals."},
  sparks:{start:SPARKS_TASK_START,complete:SPARKS_TASK_COMPLETE,evidence:SPARKS_TASK_EVIDENCE},
  thinktank:{start:"Choose a Think Tank, open a thread, then discuss, ask or propose a governed decision.",complete:"The discussion has produced a decision, action item or reviewed learning candidate.",evidence:"Messages, decisions, actions and institutional-memory candidates."},
  governance:{start:"Begin with a protocol draft or formal proposal; ratify only after the required support and vote.",complete:"The decision is recorded, ratified where applicable, or moved into a visible dispute path.",evidence:"Proposal, votes, decision register, protocol version and dispute history."},
  products:{start:"Choose the governed product and inspect its architecture, controls, evidence and risks before promotion.",complete:"The product state or promotion branch is supported by current evidence.",evidence:"Product architecture, linked controls, evidence and promotion history."},
  external_auditor:{start:"Create an assessment, capture immutable evidence, and approve the applicable standards profile before analysis.",complete:"Reviewed findings and optimization actions are traceable to evidence and approved actions have governed UNIFI handoff.",evidence:"Assessment revision, standards profile, source hashes, findings, review events, Job linkage and verification evidence."},
  productlab:{start:"Select or register an immutable product surface before creating and running test cases.",complete:"Validation results are tied to the exact test-case version and product build.",evidence:"Versioned test runs, build identity and optional evidence links."},
  unifi:{start:"Describe the outcome, acceptance conditions and required capabilities in one complete Job Manifest.",complete:"The Job is ready for governed scheduling without hidden execution assumptions.",evidence:"Job Manifest, acceptance criteria, capabilities, priority and deadline."},
  scheduler:{start:"Review queue state and capability constraints, then move the right Job into execution.",complete:"The Job is running, intentionally queued, or visibly blocked with a reason.",evidence:"Job status, capability match and scheduling state."},
  runs:{start:"Open the run that belongs to the Job you are investigating and read its outcome before retrying work.",complete:"The connector outcome, timing and failure category are understood.",evidence:"Run number, connector, timestamps, status and error category."},
  checkpoints:{start:"Locate the most recent durable checkpoint for the Job before resuming work.",complete:"Completed work, remaining work and the resume instruction are unambiguous.",evidence:"Checkpoint snapshot with completed, remaining and resume fields."},
  audit:{start:"Read the event trail around the Job, decision or operation you need to explain.",complete:"You can reconstruct who did what, when, and with which payload.",evidence:"Immutable event type, actor, payload and timestamp."},
  transparency:{start:"Review the published audit library and findings before drawing conclusions about system state.",complete:"The finding, supporting evidence and reported backlog are traceable to published artifacts.",evidence:"Commit-pinned audit documents, findings and backlog records."},
  settings:{start:"Change only the policy, tool or administrative control required for the current operating need.",complete:"Configuration matches the intended governance and access model.",evidence:"Persisted policies, tool state and administrative configuration."}
};

const workflowNext:Partial<Record<ViewKey,ViewKey>> = {
  overview:"ai",
  ai:"unifi",
  stakeholder:"sparks",
  sparks:"impact",
  impact:"thinktank",
  thinktank:"governance",
  governance:"products",
  products:"external_auditor",
  external_auditor:"productlab",
  productlab:"unifi",
  unifi:"scheduler",
  scheduler:"runs",
  runs:"checkpoints",
  checkpoints:"audit",
  audit:"transparency",
  transparency:"overview"
};

type WorkflowRecommendation = { key:ViewKey|null; reason:string; adaptive:boolean };

function resolveWorkflowRecommendation(
  view:ViewKey,
  summary:Summary,
  runCount:number,
  checkpointCount:number
):WorkflowRecommendation{
  const fallback=workflowNext[view]||null;
  const defaultReason=fallback ? viewDescriptions[fallback] : viewDescriptions[view];

  if(view==="overview"){
    if(summary.blocked>0)return {key:"scheduler",reason:`${summary.blocked} blocked ${summary.blocked===1?"Job needs":"Jobs need"} scheduling attention.`,adaptive:true};
    if(summary.running>0)return {key:"runs",reason:`${summary.running} running ${summary.running===1?"Job is":"Jobs are"} ready for execution monitoring.`,adaptive:true};
    if(summary.total===0)return {key:"ai",reason:"No Jobs exist yet; shape the next governed outcome with DataNest AI.",adaptive:true};
  }

  if(view==="ai"){
    if(summary.blocked>0)return {key:"scheduler",reason:"Blocked work is waiting for scheduling or capability attention.",adaptive:true};
    if(summary.running>0)return {key:"runs",reason:"Active execution is underway; inspect live and completed run outcomes.",adaptive:true};
    if(summary.total===0)return {key:"unifi",reason:"Turn the clarified intent into a complete Job Manifest.",adaptive:true};
  }

  if(view==="unifi"&&summary.blocked>0){
    return {key:"scheduler",reason:"Blocked Jobs need scheduling and capability review before execution can continue.",adaptive:true};
  }

  if(view==="scheduler"){
    if(summary.running>0)return {key:"runs",reason:"Execution is active; move forward to run-level outcomes and connector evidence.",adaptive:true};
    if(summary.blocked>0)return {key:"unifi",reason:"No Job is running and blocked work may need manifest or capability adjustments.",adaptive:true};
  }

  if(view==="runs"&&runCount===0&&summary.active>0){
    return {key:"scheduler",reason:"There is active work but no run history yet; confirm scheduling state first.",adaptive:true};
  }

  if(view==="checkpoints"&&checkpointCount===0&&summary.running>0){
    return {key:"runs",reason:"No durable checkpoint is available yet; monitor the active run before resuming from evidence.",adaptive:true};
  }

  return {key:fallback,reason:defaultReason,adaptive:false};
}

const workflowPrevious:Partial<Record<ViewKey,ViewKey>> = {
  ai:"overview",
  sparks:"stakeholder",
  impact:"sparks",
  thinktank:"impact",
  governance:"thinktank",
  products:"governance",
  external_auditor:"products",
  productlab:"external_auditor",
  unifi:"productlab",
  scheduler:"unifi",
  runs:"scheduler",
  checkpoints:"runs",
  audit:"checkpoints",
  transparency:"audit"
};

const StakeholderWorkspace = dynamic(() => import("@/components/StakeholderWorkspace"), {
  ssr: false,
  loading: () => <section className="panel"><p className="muted">Loading stakeholder workspace…</p></section>
});

const SparksWorkspace = dynamic(() => import("@/components/SparksWorkspace"), {
  ssr: false,
  loading: () => <section className="panel"><p className="muted">Loading Sparks…</p></section>
});

const GovernanceWorkspace = dynamic(() => import("@/components/GovernanceWorkspace"), {
  ssr: false,
  loading: () => <section className="panel"><p className="muted">Loading Sovereign Governance…</p></section>
});

const ThinkTankWorkspace = dynamic(() => import("@/components/ThinkTankWorkspace"), {
  ssr: false,
  loading: () => <section className="panel"><p className="muted">Loading Think Tanks…</p></section>
});

const DataNestAiWorkspace = dynamic(() => import("@/components/DataNestAiWorkspace"), {
  ssr: false,
  loading: () => <section className="panel"><p className="muted">Loading DataNest AI…</p></section>
});

const DataNestDashboard = dynamic(() => import("@/components/DataNestDashboard"), {
  ssr: false,
  loading: () => <section className="panel"><p className="muted">Loading DataNest Control Center…</p></section>
});

const AiOperationsDashboard = dynamic(() => import("@/components/AiOperationsDashboard"), {
  ssr: false,
  loading: () => <section className="panel"><p className="muted">Loading AI administration…</p></section>
});


const OwnerOptimizerDashboard = dynamic(() => import("@/components/OwnerOptimizerDashboard"), {
  ssr: false,
  loading: () => <section className="panel"><p className="muted">Loading Owner Optimizer Console…</p></section>
});


const ProductsWorkspace = dynamic(() => import("@/components/ProductsWorkspace"), {
  ssr: false,
  loading: () => <section className="panel"><p className="muted">Loading Resonance products…</p></section>
});

const ExternalAuditor = dynamic(() => import("@/components/ExternalAuditor"), {
  ssr: false,
  loading: () => <section className="panel"><p className="muted">Loading External Auditor…</p></section>
});

const ProductLab = dynamic(() => import("@/components/ProductLab"), {
  ssr: false,
  loading: () => <section className="panel"><p className="muted">Loading Product Lab…</p></section>
});

const TransparencyWorkspace = dynamic(() => import("@/components/TransparencyWorkspace"), {
  ssr: false,
  loading: () => <section className="panel"><p className="muted">Loading Transparency…</p></section>
});

const ExternalAiSidebar = dynamic(() => import("@/components/ExternalAiSidebar"), {
  ssr: false
});

const RonsasIntegrationPanel = dynamic(() => import("@/components/RonsasIntegrationPanel"), {
  ssr: false,
  loading: () => <section className="panel fullWidth"><p className="muted">Loading Resonance cloud integration…</p></section>
});

function formatDate(value:string|null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined,{month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:"UTC",timeZoneName:"short"}).format(new Date(value));
}
function jobCode(job:Job) { return "JOB-" + String(job.job_number).padStart(5,"0"); }
function activeWorkContextKey(projectId:string,userId:string){ return "datanest.activeWorkContext:"+projectId+":"+userId; }
function isActiveWorkContext(value:unknown):value is ActiveDataNestAiSession {
  if(!value||typeof value!=="object")return false;
  const item=value as Record<string,unknown>;
  return typeof item.jobId==="string"&&typeof item.jobNumber==="number"&&typeof item.title==="string"&&typeof item.status==="string"&&(typeof item.sessionId==="string"||item.sessionId===null);
}
type ActiveContextAction = { key:ViewKey; label:string; detail:string };
type ActiveContextEvidence = { state:"visible"|"not-visible"|"context"; label:string; detail:string };
const ACTIVE_CONTEXT_REVEAL_EVENT="datanest:reveal-active-context";
const activeJobJourneySteps:Array<{key:ViewKey;label:string;detail:string}> = [
  {key:"unifi",label:"Plan",detail:"Open the active Job Manifest in UNIFI planning."},
  {key:"scheduler",label:"Schedule",detail:"Review capability-aware scheduling for the active Job."},
  {key:"runs",label:"Run",detail:"Inspect execution outcomes associated with the active Job."},
  {key:"checkpoints",label:"Checkpoint",detail:"Review durable continuation evidence for the active Job."},
  {key:"audit",label:"Audit",detail:"Trace immutable events associated with the active Job."}
];
function activeContextActionForView(view:ViewKey):ActiveContextAction {
  if(view==="productlab")return {key:"unifi",label:"Plan active Job in UNIFI",detail:"Turn validated product work into a complete Job Manifest."};
  if(view==="unifi")return {key:"scheduler",label:"Schedule active Job",detail:"Carry this Job into capability-aware execution planning."};
  if(view==="scheduler")return {key:"runs",label:"Review active Job runs",detail:"Inspect execution outcomes for the active Job."};
  if(view==="runs")return {key:"checkpoints",label:"Open active Job checkpoints",detail:"Continue from execution history into resumable evidence."};
  if(view==="checkpoints")return {key:"audit",label:"Trace active Job audit",detail:"Follow this Job into immutable operational history."};
  if(view==="audit")return {key:"transparency",label:"Review transparency evidence",detail:"Move from internal traceability to published evidence context."};
  return {key:"ai",label:"Return active Job to AI",detail:"Keep the active Job attached to its governed AI collaboration context."};
}
function activeContextEvidenceForView(
  view:ViewKey,
  activeJobId:string,
  jobs:Job[],
  runs:Run[],
  checkpoints:Checkpoint[],
  events:AuditEvent[]
):ActiveContextEvidence {
  if(view==="unifi"){
    const count=jobs.reduce((total,item)=>total+(item.id===activeJobId&&["PLANNED","READY","QUEUED"].includes(item.status)?1:0),0);
    return count>0
      ? {state:"visible",label:"Job evidence visible",detail:`On this page: ${count} matching prepared Job ${count===1?"record":"records"}.`}
      : {state:"not-visible",label:"Prepared Job evidence not visible",detail:"No matching prepared Job record is rendered on this page."};
  }
  if(view==="scheduler"){
    const count=jobs.reduce((total,item)=>total+(item.id===activeJobId?1:0),0);
    return count>0
      ? {state:"visible",label:"Job evidence visible",detail:`On this page: ${count} matching Job ${count===1?"record":"records"}.`}
      : {state:"not-visible",label:"Job evidence not visible",detail:"No matching Job record is loaded on this page."};
  }
  if(view==="runs"){
    const count=runs.reduce((total,item)=>total+(item.job_id===activeJobId?1:0),0);
    return count>0
      ? {state:"visible",label:"Run evidence visible",detail:`On this page: ${count} matching ${count===1?"run":"runs"}.`}
      : {state:"not-visible",label:"Run evidence not visible",detail:"No matching run is loaded on this page."};
  }
  if(view==="checkpoints"){
    const count=checkpoints.reduce((total,item)=>total+(item.job_id===activeJobId?1:0),0);
    return count>0
      ? {state:"visible",label:"Checkpoint evidence visible",detail:`On this page: ${count} matching ${count===1?"checkpoint":"checkpoints"}.`}
      : {state:"not-visible",label:"Checkpoint evidence not visible",detail:"No matching checkpoint is loaded on this page."};
  }
  if(view==="audit"){
    const count=events.reduce((total,item)=>total+(item.job_id===activeJobId?1:0),0);
    return count>0
      ? {state:"visible",label:"Audit evidence visible",detail:`On this page: ${count} matching audit ${count===1?"event":"events"}.`}
      : {state:"not-visible",label:"Audit evidence not visible",detail:"No matching audit event is loaded on this page."};
  }
  return {state:"context",label:"Context linked",detail:"This workspace does not expose active-Job evidence in the shell."};
}
function focusRenderedActiveContextRecord():boolean {
  const target=document.querySelector<HTMLElement>('[data-active-context="true"]');
  if(!target)return false;
  const reduceMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches||document.documentElement.dataset.motionPaused==="true";
  target.scrollIntoView({behavior:reduceMotion?"auto":"smooth",block:"center"});
  target.focus({preventScroll:true});
  return true;
}
function tone(value:string) {
  const v=value.toLowerCase();
  if (["available","completed","active","owner","admin","operator"].includes(v)) return "good";
  if (["failed","cancelled","exhausted","offline","disabled"].includes(v)) return "bad";
  if (["running","reserved","matching","queued","ready"].includes(v)) return "live";
  if (["manual_action","blocked","blocked_dependency","cooldown","retry_wait","viewer"].includes(v)) return "warn";
  return "neutral";
}
function pageRange(page:number) {
  const from = page * PAGE_SIZE;
  return { from, to: from + PAGE_SIZE - 1 };
}

export default function DataNestApp({session}:{session:Session}) {
  const [view,setView]=useState<ViewKey>("overview");
  const [viewReady,setViewReady]=useState(false);
  const workspaceTitleRef=useRef<HTMLHeadingElement|null>(null);
  const previousViewRef=useRef<ViewKey>("overview");
  const [mobileOpen,setMobileOpen]=useState(false);
  const [compactNavigation,setCompactNavigation]=useState(false);
  const navigationRef=useRef<HTMLElement|null>(null);
  const mobileMenuButtonRef=useRef<HTMLButtonElement|null>(null);
  const mobileCloseButtonRef=useRef<HTMLButtonElement|null>(null);
  const [commandOpen,setCommandOpen]=useState(false);
  const [commandQuery,setCommandQuery]=useState("");
  const [commandActiveIndex,setCommandActiveIndex]=useState(-1);
  const [ronsasHubUrl,setRonsasHubUrl]=useState(RESON8_HUB_URL);
  const commandInputRef=useRef<HTMLInputElement|null>(null);
  const quickSwitchButtonRef=useRef<HTMLButtonElement|null>(null);
  const commandReturnFocusRef=useRef<HTMLElement|null>(null);
  const commandOpenRef=useRef(false);
  const [aiSidebarOpen,setAiSidebarOpen]=useState(false);
  const [companionReserve,setCompanionReserve]=useState(0);
  const [activeDataNestAiSession,setActiveDataNestAiSession]=useState<ActiveDataNestAiSession|null>(null);
  const [project,setProject]=useState<Project|null>(null);
  const [membership,setMembership]=useState<ProjectMember|null>(null);
  const [tools,setTools]=useState<Tool[]>([]);
  const [capabilities,setCapabilities]=useState<Capability[]>([]);
  const [recentJobs,setRecentJobs]=useState<Job[]>([]);
  const [jobs,setJobs]=useState<Job[]>([]);
  const [runs,setRuns]=useState<Run[]>([]);
  const [checkpoints,setCheckpoints]=useState<Checkpoint[]>([]);
  const [events,setEvents]=useState<AuditEvent[]>([]);
  const [policies,setPolicies]=useState<Policy[]>([]);
  const [summary,setSummary]=useState<Summary>({total:0,active:0,running:0,blocked:0,available:0,registered:0});
  const [jobCount,setJobCount]=useState(0);
  const [runCount,setRunCount]=useState(0);
  const [checkpointCount,setCheckpointCount]=useState(0);
  const [eventCount,setEventCount]=useState(0);
  const [jobPage,setJobPage]=useState(0);
  const [runPage,setRunPage]=useState(0);
  const [checkpointPage,setCheckpointPage]=useState(0);
  const [eventPage,setEventPage]=useState(0);
  const [schedulerViewMode,setSchedulerViewMode]=useState<SchedulerViewMode>("gantt");
  const [schedulerFilter,setSchedulerFilter]=useState<SchedulerFilter>("ALL");
  const [schedulerSortMode,setSchedulerSortMode]=useState<SchedulerSortMode>("priority");
  const [schedulerInterestOnly,setSchedulerInterestOnly]=useState(false);
  const [schedulerRequirementFocus,setSchedulerRequirementFocus]=useState<WorkFocusKey|null>(null);
  const [loadingCore,setLoadingCore]=useState(true);
  const [loadingView,setLoadingView]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [pendingRecoveries,setPendingRecoveries]=useState<MutationRecoveryItem[]>([]);
  const [recoveryHydrated,setRecoveryHydrated]=useState(false);
  const [recoveryLedgerError,setRecoveryLedgerError]=useState("");
  const [recoveryLastSyncedAt,setRecoveryLastSyncedAt]=useState<string|null>(null);
  const [recoverySyncing,setRecoverySyncing]=useState(false);
  const recoverySyncingRef=useRef(false);
  const [health,setHealth]=useState<HealthState>({state:"checking",checkedAt:null,message:"Checking control plane…"});
  const pendingSettingsFocusRef=useRef<"account-security"|null>(null);
  const [reloadingLatest,setReloadingLatest]=useState(false);
  const [locatingActiveJob,setLocatingActiveJob]=useState(false);
  const [locatingActiveEvidence,setLocatingActiveEvidence]=useState(false);
  const pendingActiveJobPageFocusRef=useRef(false);
  const pendingActiveEvidenceFocusRef=useRef<"runs"|"checkpoints"|"audit"|null>(null);

  const canOperate=membership ? ["owner","admin","operator"].includes(membership.role) : false;
  const canManageAi=membership ? ["owner","admin"].includes(membership.role) : false;

  const pendingRecoveryDescriptors=useMemo(()=>{
    if(!project)return [] as MutationRecoveryDescriptor[];
    const suffix=project.id+":"+session.user.id;
    return [
      {
        scope:"unifi-job:"+suffix,
        kind:"unifi_job",
        view:"unifi" as ViewKey,
        label:"UNIFI Job Manifest",
        detail:"Execution-planning submission needs authoritative resolution."
      },
      {
        scope:"sparks-redemption:"+suffix,
        kind:"spark_redemption",
        view:"sparks" as ViewKey,
        label:"Spark reservation",
        detail:"Reservation outcome needs authoritative resolution."
      },
      {
        scope:"productlab-test-run:"+suffix,
        kind:"product_test_run",
        view:"productlab" as ViewKey,
        label:"Product Lab test evidence",
        detail:"Versioned test evidence needs authoritative resolution."
      }
    ];
  },[project?.id,session.user.id]);

  const syncPendingRecoveries=useCallback(()=>{
    if(!project){
      setPendingRecoveries([]);
      return;
    }
    const next:MutationRecoveryItem[]=[];
    for(const descriptor of pendingRecoveryDescriptors){
      const intent=loadPendingMutation(descriptor.scope);
      if(!intent||intent.kind!==descriptor.kind)continue;
      next.push({
        ...descriptor,
        startedAt:intent.startedAt,
        age:classifyPendingMutationAge(intent.startedAt),
        verificationState:intent.verificationState,
        lastCheckedAt:intent.lastCheckedAt,
        durable:intent.durable,
        attemptCount:intent.attemptCount,
        lastAttemptAt:intent.lastAttemptAt
      });
    }
    next.sort((a,b)=>a.startedAt.localeCompare(b.startedAt));
    setPendingRecoveries(next);
  },[project,pendingRecoveryDescriptors]);

  const synchronizeDurableRecoveries=useCallback(async()=>{
    if(!project)return;
    if(recoverySyncingRef.current)return;
    recoverySyncingRef.current=true;
    setRecoverySyncing(true);
    try{
      const serverRecoveries=await listDurableRecoveries(project.id);
      const serverByScope=new Map(serverRecoveries.map(item=>[item.scope,item]));
      for(const serverRecovery of serverRecoveries){
        const descriptor=pendingRecoveryDescriptors.find(item=>item.scope===serverRecovery.scope&&item.kind===serverRecovery.mutationKind);
        if(!descriptor)continue;
        const local=loadPendingMutation(descriptor.scope);
        if(local&&local.requestKey!==serverRecovery.requestKey){
          throw new Error("Durable recovery conflict detected for "+descriptor.label+". Review this account on the device that created the other unresolved identity.");
        }
        restorePendingMutation(descriptor.scope,durableRecoveryToPendingIntent(serverRecovery));
      }
      for(const descriptor of pendingRecoveryDescriptors){
        const local=loadPendingMutation(descriptor.scope);
        if(!local||local.kind!==descriptor.kind)continue;
        const serverRecovery=serverByScope.get(descriptor.scope);
        if(serverRecovery)continue;
        const registered=await registerDurableRecovery(project.id,descriptor.scope,local);
        if(!registered.active){
          clearPendingMutation(descriptor.scope,"durable_resolved");
          continue;
        }
        restorePendingMutation(descriptor.scope,durableRecoveryToPendingIntent(registered));
      }
      setRecoveryLedgerError("");
      setRecoveryHydrated(true);
      setRecoveryLastSyncedAt(new Date().toISOString());
      syncPendingRecoveries();
    }catch(syncError){
      setRecoveryLedgerError(syncError instanceof Error?syncError.message:"Unable to synchronize the durable recovery ledger.");
    }finally{
      recoverySyncingRef.current=false;
      setRecoverySyncing(false);
    }
  },[project,pendingRecoveryDescriptors,syncPendingRecoveries]);

  const openPendingRecovery=useCallback((item:MutationRecoveryItem)=>{
    setView(item.view);
    setMobileOpen(false);
    setNotice("Opening "+item.label+" for authoritative reconciliation.");
    window.requestAnimationFrame(()=>{
      document.getElementById("mutation-recovery-center")?.scrollIntoView({behavior:"auto",block:"start"});
    });
  },[]);

  const updateActiveWorkContext=useCallback((next:ActiveDataNestAiSession|null)=>{
    setActiveDataNestAiSession(next);
    if(!project)return;
    const key=activeWorkContextKey(project.id,session.user.id);
    try{
      if(next)window.sessionStorage.setItem(key,JSON.stringify(next));
      else window.sessionStorage.removeItem(key);
    }catch{}
  },[project?.id,session.user.id]);

  const clearActiveWorkContext=useCallback(()=>{
    updateActiveWorkContext(null);
  },[updateActiveWorkContext]);

  const focusActiveContextRecord=useCallback(()=>{
    if(focusRenderedActiveContextRecord())return;
    if(view==="scheduler"){
      setNotice("Revealing the active Job in TranScheduler…");
      window.dispatchEvent(new CustomEvent(ACTIVE_CONTEXT_REVEAL_EVENT));
      return;
    }
    setNotice("Active Job evidence is loaded, but its matching record is not rendered in this workspace view.");
  },[view]);

  const locateActiveJobPage=useCallback(async()=>{
    if(!project||!activeDataNestAiSession||!(view==="unifi"||view==="scheduler"))return;
    const supabase=getSupabase();
    if(!supabase)return;
    const reportedPages=jobCount>0?Math.max(1,Math.ceil(jobCount/PAGE_SIZE)):null;
    setLocatingActiveJob(true);
    setError("");
    setNotice(reportedPages
      ? "Locating the active Job across "+reportedPages+" project "+(reportedPages===1?"page":"pages")+"…"
      : "Locating the active Job across project pages…");
    try{
      const seenPageSignatures=new Set<string>();
      for(let page=0;;page+=1){
        const {from,to}=pageRange(page);
        const {data,error:queryError}=await supabase
          .from("jobs")
          .select("id,status")
          .eq("project_id",project.id)
          .order("priority",{ascending:false})
          .order("created_at",{ascending:false})
          .range(from,to);
        if(queryError){
          setError(queryError.message);
          return;
        }
        const rows=(data||[]) as Array<{id:string;status:string}>;
        const match=rows.find(item=>item.id===activeDataNestAiSession.jobId);
        if(match){
          if(view==="unifi"&&!preparedJobStates.has(match.status)){
            setNotice("Active Job exists in the project but is not a prepared UNIFI record at status "+match.status.replaceAll("_"," ")+".");
            return;
          }
          pendingActiveJobPageFocusRef.current=true;
          if(jobPage!==page){
            setJobPage(page);
          }else if(view==="scheduler"){
            window.dispatchEvent(new CustomEvent(ACTIVE_CONTEXT_REVEAL_EVENT));
            pendingActiveJobPageFocusRef.current=false;
          }else{
            window.requestAnimationFrame(()=>{
              if(focusRenderedActiveContextRecord())setNotice("Active Job located and focused on this UNIFI page.");
              else setNotice("Active Job is on this UNIFI page but its prepared record is not rendered.");
              pendingActiveJobPageFocusRef.current=false;
            });
          }
          setNotice("Active Job located on page "+(page+1)+(reportedPages?" of "+reportedPages:"")+".");
          return;
        }
        if(rows.length<PAGE_SIZE)break;
        if(reportedPages!==null&&page+1>=reportedPages)break;
        const signature=rows[0]?.id+":"+rows[rows.length-1]?.id;
        if(seenPageSignatures.has(signature)){
          setNotice("Active Job search stopped because Job pagination did not advance.");
          return;
        }
        seenPageSignatures.add(signature);
      }
      setNotice("Active Job was not found in the project Job pages checked.");
    }finally{
      setLocatingActiveJob(false);
    }
  },[project,activeDataNestAiSession,view,jobCount,jobPage]);

  const locateActiveEvidencePage=useCallback(async()=>{
    if(!activeDataNestAiSession||!(view==="runs"||view==="checkpoints"||view==="audit"))return;
    const supabase=getSupabase();
    if(!supabase)return;

    const evidenceView=view;
    const total=evidenceView==="runs"?runCount:evidenceView==="checkpoints"?checkpointCount:eventCount;
    const currentPage=evidenceView==="runs"?runPage:evidenceView==="checkpoints"?checkpointPage:eventPage;
    const reportedPages=total>0?Math.max(1,Math.ceil(total/PAGE_SIZE)):null;
    const evidenceLabel=evidenceView==="runs"?"run":evidenceView==="checkpoints"?"checkpoint":"audit event";

    setLocatingActiveEvidence(true);
    setError("");
    setNotice(reportedPages
      ? "Locating active Job "+evidenceLabel+" evidence across "+reportedPages+" "+(reportedPages===1?"page":"pages")+"…"
      : "Locating active Job "+evidenceLabel+" evidence across workspace pages…");

    try{
      const seenPageSignatures=new Set<string>();
      for(let page=0;;page+=1){
        const {from,to}=pageRange(page);
        const queryResult=evidenceView==="runs"
          ? await supabase.from("runs").select("id,job_id").order("started_at",{ascending:false}).range(from,to)
          : evidenceView==="checkpoints"
            ? await supabase.from("checkpoints").select("id,job_id").order("created_at",{ascending:false}).range(from,to)
            : project
              ? await supabase.from("events").select("id,job_id").eq("project_id",project.id).order("created_at",{ascending:false}).range(from,to)
              : {data:[],error:null};
        if(queryResult.error){
          setError(queryResult.error.message);
          return;
        }
        const rows=(queryResult.data||[]) as Array<{id:string|number;job_id:string|null}>;
        const match=rows.find(item=>item.job_id===activeDataNestAiSession.jobId);
        if(match){
          pendingActiveEvidenceFocusRef.current=evidenceView;
          if(currentPage!==page){
            if(evidenceView==="runs")setRunPage(page);
            else if(evidenceView==="checkpoints")setCheckpointPage(page);
            else setEventPage(page);
          }else{
            window.requestAnimationFrame(()=>{
              if(focusRenderedActiveContextRecord())setNotice("Active Job "+evidenceLabel+" evidence located and focused.");
              else setNotice("Active Job "+evidenceLabel+" evidence is on this page but is not rendered.");
              pendingActiveEvidenceFocusRef.current=null;
            });
          }
          setNotice("Active Job "+evidenceLabel+" evidence located on page "+(page+1)+(reportedPages?" of "+reportedPages:"")+".");
          return;
        }
        if(rows.length<PAGE_SIZE)break;
        if(reportedPages!==null&&page+1>=reportedPages)break;
        const signature=String(rows[0]?.id)+":"+String(rows[rows.length-1]?.id);
        if(seenPageSignatures.has(signature)){
          setNotice("Active Job evidence search stopped because "+evidenceView+" pagination did not advance.");
          return;
        }
        seenPageSignatures.add(signature);
      }
      setNotice("No matching active Job "+evidenceLabel+" evidence was found in the pages checked.");
    }finally{
      setLocatingActiveEvidence(false);
    }
  },[activeDataNestAiSession,view,project,runCount,checkpointCount,eventCount,runPage,checkpointPage,eventPage]);

  const commandItems=useMemo<CommandItem[]>(()=>{
    const items:CommandItem[]=nav.map(item=>({
      kind:"view",
      id:item.key,
      key:item.key,
      label:item.label,
      group:item.group,
      glyph:item.glyph,
      description:viewDescriptions[item.key]
    }));
    if(ronsasHubUrl){
      items.push({
        kind:"external",
        id:"ronsas",
        href:ronsasHubUrl,
        label:"Resonance",
        group:"Applications",
        glyph:"◉",
        description:"Open the governed Resonance application suite."
      });
    }
    const query=commandQuery.trim().toLowerCase();
    if(!query)return items;
    const score=(item:CommandItem)=>{
      const label=item.label.toLowerCase();
      if(label===query)return 0;
      if(label.startsWith(query))return 1;
      if(label.includes(query))return 2;
      if(item.group.toLowerCase().includes(query))return 3;
      return 4;
    };
    return items
      .filter(item=>{
        const haystack=[item.label,item.group,item.description].join(" ").toLowerCase();
        return haystack.includes(query);
      })
      .sort((a,b)=>score(a)-score(b));
  },[commandQuery,ronsasHubUrl]);

  const loadSummary=useCallback(async(projectId:string)=>{
    const supabase=getSupabase();
    if(!supabase) return;
    const {data,error:summaryError}=await supabase.rpc("get_project_dashboard_summary",{target_project:projectId});
    if(summaryError) return;
    const value=(data||{}) as Record<string,unknown>;
    setSummary({
      total:Number(value.total_jobs||0),
      active:Number(value.active_jobs||0),
      running:Number(value.running_jobs||0),
      blocked:Number(value.blocked_jobs||0),
      available:Number(value.available_capabilities||0),
      registered:Number(value.registered_capabilities||0)
    });
  },[]);

  const loadRecentJobs=useCallback(async(projectId:string)=>{
    const supabase=getSupabase();
    if(!supabase) return;
    const {data}=await supabase.from("jobs").select(jobColumns).eq("project_id",projectId).order("created_at",{ascending:false}).limit(5);
    setRecentJobs((data||[]) as Job[]);
  },[]);

  const checkControlPlane=useCallback(async(projectId:string)=>{
    const supabase=getSupabase();
    if(!supabase) return;
    setHealth(current=>({...current,state:"checking",message:"Checking control plane…"}));
    try {
      const query=supabase
        .from("projects")
        .select("id,status")
        .eq("id",projectId)
        .maybeSingle();

      const result=await Promise.race([
        query,
        new Promise<never>((_,reject)=>{
          window.setTimeout(()=>reject(new Error("Control plane check timed out.")),5000);
        })
      ]);

      if(result.error) throw result.error;
      const checkedAt=new Date().toISOString();
      if(!result.data) setHealth({state:"degraded",checkedAt,message:"Project data is not currently visible."});
      else setHealth({state:"online",checkedAt,message:"Supabase control plane responded."});
    } catch (healthError) {
      setHealth({
        state:"offline",
        checkedAt:new Date().toISOString(),
        message:healthError instanceof Error ? healthError.message : "Control plane check failed."
      });
    }
  },[]);

  const loadCore=useCallback(async()=>{
    const supabase=getSupabase();
    if(!supabase) return;
    setLoadingCore(true);
    setError("");

    await Promise.all([
      supabase.rpc("accept_pending_project_member_invites_v1"),
      supabase.rpc("accept_pending_job_invites")
    ]);

    const pResult=await supabase
      .from("projects")
      .select("id,slug,name,description,status,created_at")
      .eq("slug","resonance-datanest")
      .maybeSingle();

    if(pResult.error || !pResult.data) {
      setError(pResult.error?.message || "You do not have access to reson8.datanest.life.");
      setLoadingCore(false);
      return;
    }

    const p=pResult.data as Project;
    setProject(p);

    const [memberResult,toolResult,capabilityResult]=await Promise.all([
      supabase.from("project_members").select("project_id,user_id,role,status").eq("project_id",p.id).eq("user_id",session.user.id).maybeSingle(),
      supabase.from("tool_registry").select("id,tool_key,name,role,enabled,config").eq("project_id",p.id).order("name"),
      supabase.from("capabilities").select("id,account_key,connector_kind,capability,state,observed_at,next_check_at,confidence,concurrency_limit,running,metadata").eq("project_id",p.id).order("account_key")
    ]);

    const firstError=memberResult.error||toolResult.error||capabilityResult.error;
    if(firstError) setError(firstError.message);
    else {
      setMembership((memberResult.data||null) as ProjectMember|null);
      setTools((toolResult.data||[]) as Tool[]);
      setCapabilities((capabilityResult.data||[]) as Capability[]);
    }

    await Promise.all([loadSummary(p.id),loadRecentJobs(p.id),checkControlPlane(p.id)]);
    setLoadingCore(false);
  },[session.user.id,loadSummary,loadRecentJobs,checkControlPlane]);

  const loadJobsPage=useCallback(async(page:number)=>{
    if(!project) return;
    const supabase=getSupabase();
    if(!supabase) return;
    setLoadingView(true);
    const {from,to}=pageRange(page);
    const {data,count,error:queryError}=await supabase
      .from("jobs")
      .select(jobColumns,{count:"exact"})
      .eq("project_id",project.id)
      .order("priority",{ascending:false})
      .order("created_at",{ascending:false})
      .range(from,to);
    if(queryError) setError(queryError.message);
    else if(count===null){
      setJobs((data||[]) as Job[]);
    }else{
      const total=count;
      const lastPage=Math.max(0,Math.ceil(total/PAGE_SIZE)-1);
      setJobCount(total);
      if(page>lastPage){
        setJobPage(lastPage);
        if(total>0)setNotice("Shared Job view adjusted to the last available page.");
        else setJobs([]);
      }else setJobs((data||[]) as Job[]);
    }
    setLoadingView(false);
  },[project]);

  const loadRunsPage=useCallback(async(page:number)=>{
    const supabase=getSupabase();
    if(!supabase) return;
    setLoadingView(true);
    const {from,to}=pageRange(page);
    const {data,count,error:queryError}=await supabase
      .from("runs")
      .select("id,job_id,run_number,connector_kind,status,started_at,completed_at,error_category",{count:"exact"})
      .order("started_at",{ascending:false})
      .range(from,to);
    if(queryError) setError(queryError.message);
    else if(count===null){
      setRuns((data||[]) as Run[]);
    }else{
      const total=count;
      const lastPage=Math.max(0,Math.ceil(total/PAGE_SIZE)-1);
      setRunCount(total);
      if(page>lastPage){
        setRunPage(lastPage);
        if(total>0)setNotice("Shared Runs view adjusted to the last available page.");
        else setRuns([]);
      }else setRuns((data||[]) as Run[]);
    }
    setLoadingView(false);
  },[]);

  const loadCheckpointsPage=useCallback(async(page:number)=>{
    const supabase=getSupabase();
    if(!supabase) return;
    setLoadingView(true);
    const {from,to}=pageRange(page);
    const {data,count,error:queryError}=await supabase
      .from("checkpoints")
      .select("id,job_id,completed,remaining,resume_instruction,created_at",{count:"exact"})
      .order("created_at",{ascending:false})
      .range(from,to);
    if(queryError) setError(queryError.message);
    else if(count===null){
      setCheckpoints((data||[]) as Checkpoint[]);
    }else{
      const total=count;
      const lastPage=Math.max(0,Math.ceil(total/PAGE_SIZE)-1);
      setCheckpointCount(total);
      if(page>lastPage){
        setCheckpointPage(lastPage);
        if(total>0)setNotice("Shared Checkpoints view adjusted to the last available page.");
        else setCheckpoints([]);
      }else setCheckpoints((data||[]) as Checkpoint[]);
    }
    setLoadingView(false);
  },[]);

  const loadEventsPage=useCallback(async(page:number)=>{
    if(!project) return;
    const supabase=getSupabase();
    if(!supabase) return;
    setLoadingView(true);
    const {from,to}=pageRange(page);
    const {data,count,error:queryError}=await supabase
      .from("events")
      .select("id,job_id,event_type,actor,payload,created_at",{count:"exact"})
      .eq("project_id",project.id)
      .order("created_at",{ascending:false})
      .range(from,to);
    if(queryError) setError(queryError.message);
    else if(count===null){
      setEvents((data||[]) as AuditEvent[]);
    }else{
      const total=count;
      const lastPage=Math.max(0,Math.ceil(total/PAGE_SIZE)-1);
      setEventCount(total);
      if(page>lastPage){
        setEventPage(lastPage);
        if(total>0)setNotice("Shared Audit view adjusted to the last available page.");
        else setEvents([]);
      }else setEvents((data||[]) as AuditEvent[]);
    }
    setLoadingView(false);
  },[project]);

  const loadPolicies=useCallback(async()=>{
    if(!project) return;
    const supabase=getSupabase();
    if(!supabase) return;
    setLoadingView(true);
    const {data,error:queryError}=await supabase
      .from("scheduler_policies")
      .select("id,policy_key,value")
      .eq("project_id",project.id)
      .order("policy_key");
    if(queryError) setError(queryError.message);
    else setPolicies((data||[]) as Policy[]);
    setLoadingView(false);
  },[project]);

  useEffect(()=>{ void loadCore(); },[loadCore]);
  useEffect(()=>{
    setRecoveryHydrated(false);
    setRecoveryLedgerError("");
    setRecoveryLastSyncedAt(null);
  },[project?.id,session.user.id]);
  useEffect(()=>{
    syncPendingRecoveries();
    if(project)void synchronizeDurableRecoveries();
    const localSync=()=>syncPendingRecoveries();
    const durableSync=()=>{
      syncPendingRecoveries();
      if(project)void synchronizeDurableRecoveries();
    };
    const ageTimer=window.setInterval(durableSync,60000);
    window.addEventListener(PENDING_MUTATION_EVENT,localSync);
    window.addEventListener("pageshow",durableSync);
    window.addEventListener("focus",durableSync);
    return()=>{
      window.clearInterval(ageTimer);
      window.removeEventListener(PENDING_MUTATION_EVENT,localSync);
      window.removeEventListener("pageshow",durableSync);
      window.removeEventListener("focus",durableSync);
    };
  },[project,syncPendingRecoveries,synchronizeDurableRecoveries]);
  useEffect(()=>{
    if(!project){
      setActiveDataNestAiSession(null);
      return;
    }
    const key=activeWorkContextKey(project.id,session.user.id);
    try{
      const raw=window.sessionStorage.getItem(key);
      if(!raw){
        setActiveDataNestAiSession(null);
        return;
      }
      const parsed=JSON.parse(raw) as unknown;
      if(isActiveWorkContext(parsed))setActiveDataNestAiSession(parsed);
      else{
        window.sessionStorage.removeItem(key);
        setActiveDataNestAiSession(null);
      }
    }catch{
      setActiveDataNestAiSession(null);
    }
  },[project?.id,session.user.id]);
  useEffect(()=>{
    const syncViewFromUrl=()=>{
      const url=new URL(window.location.href);
      const requested=url.searchParams.get("view");
      const valid=requested&&viewKeys.has(requested as ViewKey);
      const next=valid ? requested as ViewKey : "overview";
      const originalUrl=url.toString();

      if(requested&&(!valid||requested==="overview"))url.searchParams.delete("view");
      scopeUrlToWorkspace(url,next);
      if(url.toString()!==originalUrl)window.history.replaceState(window.history.state,"",url.toString());

      const page=urlPageIndex(url);
      if(next==="unifi"||next==="scheduler")setJobPage(page);
      else if(next==="runs")setRunPage(page);
      else if(next==="checkpoints")setCheckpointPage(page);
      else if(next==="audit")setEventPage(page);
      if(next==="scheduler"){
        setSchedulerViewMode(schedulerViewModeFromUrl(url));
        setSchedulerFilter(schedulerFilterFromUrl(url));
        setSchedulerSortMode(schedulerSortModeFromUrl(url));
        setSchedulerInterestOnly(schedulerInterestOnlyFromUrl(url));
        setSchedulerRequirementFocus(schedulerRequirementFocusFromUrl(url));
      }
      setView(next);
      setViewReady(true);
    };

    syncViewFromUrl();
    window.addEventListener("popstate",syncViewFromUrl);
    return()=>window.removeEventListener("popstate",syncViewFromUrl);
  },[]);
  useEffect(()=>{
    if(!viewReady)return;
    const url=new URL(window.location.href);
    const current=url.searchParams.get("view");
    const next=view==="overview" ? null : view;
    if(current===next)return;

    if(next)url.searchParams.set("view",next);
    else url.searchParams.delete("view");
    workspaceScopedUrlStateKeys.forEach(key=>url.searchParams.delete(key));

    window.history.pushState(window.history.state,"",url.toString());
    window.scrollTo({top:0,left:0,behavior:"auto"});
  },[view,viewReady,commandOpen]);
  useEffect(()=>{
    if(!viewReady)return;
    const url=new URL(window.location.href);
    const expectedView=view==="overview"?null:view;
    if(url.searchParams.get("view")!==expectedView)return;

    operationalUrlStateKeys.forEach(key=>url.searchParams.delete(key));
    if(view!=="governance"&&view!=="products")url.searchParams.delete("section");
    const page=view==="unifi"||view==="scheduler"
      ? jobPage
      : view==="runs"
        ? runPage
        : view==="checkpoints"
          ? checkpointPage
          : view==="audit"
            ? eventPage
            : 0;
    if(page>0)url.searchParams.set("page",String(page+1));
    if(view==="scheduler"){
      if(schedulerViewMode!=="gantt")url.searchParams.set("mode",schedulerViewMode);
      if(schedulerFilter!=="ALL")url.searchParams.set("filter",schedulerFilter);
      if(schedulerSortMode!=="priority")url.searchParams.set("sort",schedulerSortMode);
      if(schedulerInterestOnly)url.searchParams.set("interests","1");
      if(schedulerRequirementFocus)url.searchParams.set("focus",schedulerRequirementFocus);
    }
    const nextUrl=url.toString();
    if(nextUrl!==window.location.href)window.history.replaceState(window.history.state,"",nextUrl);
  },[view,viewReady,jobPage,runPage,checkpointPage,eventPage,schedulerViewMode,schedulerFilter,schedulerSortMode,schedulerInterestOnly,schedulerRequirementFocus]);
  useEffect(()=>{
    if(!viewReady||commandOpen)return;
    if(previousViewRef.current===view)return;
    previousViewRef.current=view;
    const frame=window.requestAnimationFrame(()=>{
      if(commandOpenRef.current)return;
      workspaceTitleRef.current?.focus({preventScroll:true});
      window.scrollTo({top:0,left:0,behavior:"instant"});
    });
    return()=>window.cancelAnimationFrame(frame);
  },[view,viewReady,commandOpen]);
  useEffect(()=>{
    const media=window.matchMedia("(max-width: 900px)");
    const syncCompactNavigation=()=>{
      setCompactNavigation(media.matches);
      if(!media.matches)setMobileOpen(false);
    };
    syncCompactNavigation();
    media.addEventListener("change",syncCompactNavigation);
    return()=>media.removeEventListener("change",syncCompactNavigation);
  },[]);
  useEffect(()=>{
    if(!compactNavigation||!mobileOpen)return;
    const previousBodyOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const frame=window.requestAnimationFrame(()=>mobileCloseButtonRef.current?.focus({preventScroll:true}));
    return()=>{
      window.cancelAnimationFrame(frame);
      document.body.style.overflow=previousBodyOverflow;
    };
  },[compactNavigation,mobileOpen]);
  useEffect(()=>{
    const handleCommandShortcut=(event:KeyboardEvent)=>{
      const isQuickSwitch=(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k";
      if(isQuickSwitch){
        event.preventDefault();
        if(commandOpenRef.current)closeCommandPalette();
        else openCommandPalette();
        return;
      }
      if(event.key==="Escape"&&commandOpen)closeCommandPalette();
    };
    window.addEventListener("keydown",handleCommandShortcut);
    return()=>window.removeEventListener("keydown",handleCommandShortcut);
  },[commandOpen]);
  useEffect(()=>{
    if(!commandOpen)return;
    const focusInput=()=>{
      if(commandOpenRef.current)commandInputRef.current?.focus({preventScroll:true});
    };
    const frame=window.requestAnimationFrame(()=>{
      focusInput();
      window.setTimeout(focusInput,0);
    });
    return()=>window.cancelAnimationFrame(frame);
  },[commandOpen]);
  useEffect(()=>{
    let active=true;
    void getRonsasStatus().then(status=>{
      if(active)setRonsasHubUrl(status.authority.publicHub);
    }).catch(()=>{
      if(active)setRonsasHubUrl(RESON8_HUB_URL);
    });
    return()=>{active=false;};
  },[]);
  useEffect(()=>{
    const saved=window.localStorage.getItem("datanest.aiSidebar.open");
    if(saved==="true")setAiSidebarOpen(true);
    const open=()=>setAiSidebarOpen(true);
    window.addEventListener("datanest:open-ai-sidebar",open);
    return()=>window.removeEventListener("datanest:open-ai-sidebar",open);
  },[]);
  useEffect(()=>{
    window.localStorage.setItem("datanest.aiSidebar.open",String(aiSidebarOpen));
  },[aiSidebarOpen]);
  useEffect(()=>{
    if(!project) return;
    if(view==="unifi"||view==="scheduler") void loadJobsPage(jobPage);
  },[view,jobPage,project,loadJobsPage]);
  useEffect(()=>{
    if(!pendingActiveJobPageFocusRef.current||!activeDataNestAiSession)return;
    if(!(view==="unifi"||view==="scheduler"))return;
    if(!jobs.some(job=>job.id===activeDataNestAiSession.jobId))return;
    pendingActiveJobPageFocusRef.current=false;
    if(view==="scheduler"){
      window.dispatchEvent(new CustomEvent(ACTIVE_CONTEXT_REVEAL_EVENT));
      return;
    }
    window.requestAnimationFrame(()=>{
      if(focusRenderedActiveContextRecord())setNotice("Active Job located and focused in UNIFI.");
      else setNotice("Active Job is on this page but is not rendered in the prepared UNIFI list.");
    });
  },[jobs,view,activeDataNestAiSession]);
  useEffect(()=>{ if(view==="runs") void loadRunsPage(runPage); },[view,runPage,loadRunsPage]);
  useEffect(()=>{ if(view==="checkpoints") void loadCheckpointsPage(checkpointPage); },[view,checkpointPage,loadCheckpointsPage]);
  useEffect(()=>{ if(view==="audit") void loadEventsPage(eventPage); },[view,eventPage,loadEventsPage]);
  useEffect(()=>{
    const pendingView=pendingActiveEvidenceFocusRef.current;
    if(!pendingView||pendingView!==view||!activeDataNestAiSession)return;
    const visible=pendingView==="runs"
      ? runs.some(item=>item.job_id===activeDataNestAiSession.jobId)
      : pendingView==="checkpoints"
        ? checkpoints.some(item=>item.job_id===activeDataNestAiSession.jobId)
        : events.some(item=>item.job_id===activeDataNestAiSession.jobId);
    if(!visible)return;
    pendingActiveEvidenceFocusRef.current=null;
    const evidenceLabel=pendingView==="runs"?"run":pendingView==="checkpoints"?"checkpoint":"audit event";
    window.requestAnimationFrame(()=>{
      if(focusRenderedActiveContextRecord())setNotice("Active Job "+evidenceLabel+" evidence located and focused.");
      else setNotice("Active Job "+evidenceLabel+" evidence loaded but its matching record is not rendered.");
    });
  },[runs,checkpoints,events,view,activeDataNestAiSession]);
  useEffect(()=>{ if(view==="settings") void loadPolicies(); },[view,loadPolicies]);
  useEffect(()=>{
    if(view!=="settings"||!pendingSettingsFocusRef.current)return;
    const targetId=pendingSettingsFocusRef.current;
    const frame=window.requestAnimationFrame(()=>{
      const target=document.getElementById(targetId);
      if(!target)return;
      pendingSettingsFocusRef.current=null;
      target.scrollIntoView({behavior:"smooth",block:"start"});
      target.focus({preventScroll:true});
    });
    return()=>window.cancelAnimationFrame(frame);
  },[view]);
  useEffect(()=>{
    if(!project) return;
    const timer=window.setInterval(()=>void checkControlPlane(project.id),60000);
    return ()=>window.clearInterval(timer);
  },[project,checkControlPlane]);

  function closeMobileNavigation(restoreFocus=true){
    setMobileOpen(false);
    if(!restoreFocus||!compactNavigation)return;
    window.requestAnimationFrame(()=>mobileMenuButtonRef.current?.focus({preventScroll:true}));
  }

  function trapMobileNavigationFocus(event:import("react").KeyboardEvent<HTMLElement>){
    if(!compactNavigation||!mobileOpen)return;
    if(event.key==="Escape"){
      event.preventDefault();
      event.stopPropagation();
      closeMobileNavigation();
      return;
    }
    if(event.key!=="Tab")return;
    const focusable=Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])'
    )).filter(element=>element.getClientRects().length>0&&!element.hasAttribute("inert"));
    if(!focusable.length)return;
    const first=focusable[0];
    const last=focusable[focusable.length-1];
    const active=document.activeElement;
    if(event.shiftKey&&active===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&active===last){event.preventDefault();first.focus();}
  }

  function openCommandPalette(){
    commandReturnFocusRef.current=quickSwitchButtonRef.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    commandOpenRef.current=true;
    setCommandQuery("");
    setCommandActiveIndex(-1);
    setCommandOpen(true);
    setMobileOpen(false);
  }

  function closeCommandPalette(restoreFocus=true){
    commandOpenRef.current=false;
    setCommandOpen(false);
    setCommandQuery("");
    setCommandActiveIndex(-1);
    window.requestAnimationFrame(()=>{
      if(restoreFocus){
        const liveLauncher=quickSwitchButtonRef.current;
        const returnTarget=commandReturnFocusRef.current;
        if(liveLauncher?.isConnected)liveLauncher.focus({preventScroll:true});
        else if(returnTarget?.isConnected)returnTarget.focus({preventScroll:true});
      }
      commandReturnFocusRef.current=null;
    });
  }

  function trapCommandFocus(event:import("react").KeyboardEvent<HTMLElement>){
    if(event.key!=="Tab")return;
    const focusable=Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'
    )).filter(element=>!element.hasAttribute("hidden"));
    if(!focusable.length)return;
    const active=document.activeElement as HTMLElement|null;
    const activeIndex=active?focusable.indexOf(active):-1;
    if(activeIndex===-1)return;
    event.preventDefault();
    const nextIndex=event.shiftKey
      ? (activeIndex-1+focusable.length)%focusable.length
      : (activeIndex+1)%focusable.length;
    focusable[nextIndex].focus();
  }

  function handleCommandSearchKeyDown(event:import("react").KeyboardEvent<HTMLInputElement>){
    if(event.key==="ArrowDown"&&commandQuery.trim()&&commandItems.length){
      event.preventDefault();
      setCommandActiveIndex(index=>(index+1)%commandItems.length);
      return;
    }
    if(event.key==="ArrowUp"&&commandQuery.trim()&&commandItems.length){
      event.preventDefault();
      setCommandActiveIndex(index=>(index-1+commandItems.length)%commandItems.length);
      return;
    }
    if(event.key==="Enter"&&commandQuery.trim()&&commandItems[0]){
      event.preventDefault();
      const selected=commandActiveIndex>0&&commandItems[commandActiveIndex]
        ?commandItems[commandActiveIndex]
        :commandItems[0];
      chooseCommandItem(selected);
    }
  }

  function chooseCommandItem(item:CommandItem){
    if(item.kind==="external"){
      window.open(item.href,"_blank","noopener,noreferrer");
      closeCommandPalette();
      return;
    }
    chooseCommandView(item.key);
  }

  function chooseCommandView(nextView:ViewKey){
    setView(nextView);
    closeCommandPalette(nextView===view);
    setMobileOpen(false);
  }

  function openAccountSecurity(){
    pendingSettingsFocusRef.current="account-security";
    setView("settings");
    setMobileOpen(false);
  }

  async function signOut(){
    if(pendingRecoveries.length>0){
      const noun=pendingRecoveries.length===1?"operation":"operations";
      const confirmed=window.confirm(
        pendingRecoveries.length+" unresolved "+noun+" will remain preserved in this browser session and, when durably registered, in the recovery ledger. They remain scoped to this account and will reappear when it returns. Sign out without resolving "+(pendingRecoveries.length===1?"it":"them")+" now?"
      );
      if(!confirmed)return;
    }
    await getSupabase()?.auth.signOut();
  }

  async function copyWorkspaceLink(){
    const shareUrl=new URL(window.location.href);
    shareUrl.searchParams.delete("release");
    shareUrl.searchParams.delete("_reload");
    scopeUrlToWorkspace(shareUrl,view);
    shareUrl.hash="";
    try{
      await navigator.clipboard.writeText(shareUrl.toString());
      setNotice("Workspace view link copied.");
    }catch{
      const input=document.createElement("textarea");
      input.value=shareUrl.toString();
      input.setAttribute("readonly","");
      input.style.position="fixed";
      input.style.opacity="0";
      document.body.appendChild(input);
      input.select();
      const copied=document.execCommand("copy");
      input.remove();
      if(copied)setNotice("Workspace view link copied.");
      else setError("Could not copy the workspace link.");
    }
  }

  async function reloadLatestVersion(){
    if(reloadingLatest)return;
    setReloadingLatest(true);
    setError("");
    setNotice("Checking the latest deployed DataNest release…");

    const now=Date.now();
    let releaseKey=String(now);

    try{
      const manifestUrl=new URL("./release-manifest.json",window.location.href);
      manifestUrl.searchParams.set("_reload",String(now));
      const response=await fetch(manifestUrl.toString(),{
        cache:"no-store",
        headers:{"Cache-Control":"no-cache"}
      });

      if(response.ok){
        const manifest=(await response.json()) as {frontendCommit?:string;databaseRelease?:string};
        if(manifest.frontendCommit){
          releaseKey=manifest.frontendCommit.slice(0,16);
        }
      }
    }catch{
      // The timestamped navigation below still forces a fresh document request.
    }

    const nextUrl=new URL(window.location.href);
    nextUrl.searchParams.set("release",releaseKey);
    nextUrl.searchParams.set("_reload",String(now));
    nextUrl.hash="";
    window.location.replace(nextUrl.toString());
  }

  async function updateJobStatus(job:Job,status:string) {
    const supabase=getSupabase();
    if(!supabase||!project) return;
    if(!canOperate){setError("Your DataNest role is read-only.");return;}

    setNotice("");
    setError("");

    const {data,error:updateError}=await supabase.rpc("transition_job_status",{
      target_job:job.id,
      target_status:status
    });

    if(updateError){setError(updateError.message);return;}

    const row=Array.isArray(data)?data[0]:data;
    const nextStatus=String((row as Record<string,unknown>|null)?.status||status);
    setJobs(current=>current.map(item=>item.id===job.id?{...item,status:nextStatus,updated_at:new Date().toISOString()}:item));
    setRecentJobs(current=>current.map(item=>item.id===job.id?{...item,status:nextStatus,updated_at:new Date().toISOString()}:item));
    setNotice(jobCode(job)+" moved to "+nextStatus+".");
    await Promise.all([loadSummary(project.id),loadRecentJobs(project.id),checkControlPlane(project.id)]);
  }

  const jobLookup=useMemo(()=>new Map([...recentJobs,...jobs].map(job=>[job.id,job])),[recentJobs,jobs]);
  const currentNavItem=nav.find(item=>item.key===view);
  const currentLabel=currentNavItem?.label||"Overview";
  const currentDescription=viewDescriptions[view];
  const currentGroup=currentNavItem?.group||"HOME";
  const currentPhase=workflowPhaseForView(view);
  const activeContextAction=activeContextActionForView(view);
  const activeJobJourneyCurrent=activeJobJourneySteps.some(step=>step.key===view)?view:null;
  const activeContextEvidence=activeDataNestAiSession
    ? activeContextEvidenceForView(view,activeDataNestAiSession.jobId,jobs,runs,checkpoints,events)
    : null;
  const workflowRecommendation=resolveWorkflowRecommendation(view,summary,runCount,checkpointCount);
  const nextViewKey=workflowRecommendation.key;
  const previousViewKey=workflowPrevious[view]||null;
  const nextViewItem=nextViewKey ? nav.find(item=>item.key===nextViewKey)||null : null;
  const previousViewItem=previousViewKey ? nav.find(item=>item.key===previousViewKey)||null : null;
  const healthLabel=health.state==="checking"
    ? "Checking control plane"
    : health.state==="online"
      ? "Control plane online"
      : health.state==="degraded"
        ? "Control plane degraded"
        : "Control plane offline";

  return <div
    data-workspace={view}
    className={"appFrame datanextExperience "+(aiSidebarOpen?"aiDockOpen ":"")+(companionReserve>0?"companionRailReserved":"")}
    style={companionReserve>0?({"--companion-reserve":companionReserve+"px"} as CSSProperties):undefined}
  >
    <PlatformShell
      navigationOpen={compactNavigation&&mobileOpen}
      navigation={<>
    <a className="skipLink" href="#workspace-title" onClick={event=>{event.preventDefault();workspaceTitleRef.current?.focus();}}>Skip to workspace</a>
    <aside
      ref={navigationRef}
      id="datanest-navigation" aria-label="DataNest navigation"
      className={"sidebar "+(mobileOpen?"open":"")}
      role={compactNavigation&&mobileOpen?"dialog":undefined}
      aria-modal={compactNavigation&&mobileOpen?true:undefined}
      inert={compactNavigation&&!mobileOpen}
      onKeyDown={trapMobileNavigationFocus}
    >
      <div className="sidebarTop">
        <div className="logo" aria-label="Resonance AppDev"><img src={DATANEST_LOGO_SRC} alt="Resonance AppDev"/></div>
        <div><b>Resonance Data Nest</b></div>
        <button ref={mobileCloseButtonRef} className="closeMenu" type="button" onClick={()=>closeMobileNavigation()} aria-label="Close menu" aria-controls="datanest-navigation">×</button>
      </div>
      <div className="projectPill"><span className="liveDot"/><div><small>PROJECT</small><strong>{project?.name||DATANEST_CANONICAL_NAME}</strong></div></div>
      <GlobalNavigation
        items={nav}
        currentView={view}
        onNavigate={next=>{
          const nextView=next as ViewKey;
          const restoreLauncher=nextView===view;
          setView(nextView);
          closeMobileNavigation(restoreLauncher);
        }}
        onOpenQuickSwitch={openCommandPalette}
      />
      {ronsasHubUrl&&<a
        className="ronsasNavLaunch"
        href={ronsasHubUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="Open Resonance from DataNest navigation"
      ><span aria-hidden="true">◉</span><span><b>Resonance</b><small>Open governed application suite</small></span><strong aria-hidden="true">↗</strong></a>}
      <div className="sidebarFooter">
        <div className="userMini"><div className="avatar">{(session.user.email||"U").slice(0,1).toUpperCase()}</div><div><b>{session.user.email?.split("@")[0]||"Authorized user"}</b><small>{membership ? membership.role.toUpperCase()+" · Authenticated" : "Authenticated"}</small></div></div>
        {project&&membership&&(membership.role==="owner"||membership.role==="admin")&&<AdminRndModeToggle
          role={membership.role}
          projectId={project.id}
          currentUserId={session.user.id}
          onOpenProductLab={()=>{setView("productlab");setMobileOpen(false);}}
        />}
        <button className="accountSecurityShortcut" type="button" onClick={openAccountSecurity}><span aria-hidden="true">◈</span><span><b>Account security</b><small>Change password or email a reset link</small></span></button>
        <div className="mobileNavActions" aria-label="Mobile workspace actions">
          <div className={"mobileSystemStatus "+health.state} title={health.message}>
            <span className={"statusDot "+health.state}/>
            <span>{healthLabel}</span>
          </div>
          <button
            className="secondaryButton compact"
            type="button"
            disabled={!project}
            onClick={()=>project&&void Promise.all([loadSummary(project.id),loadRecentJobs(project.id),checkControlPlane(project.id)])}
          >Refresh workspace</button>
          <button
            className="secondaryButton compact"
            type="button"
            onClick={()=>void copyWorkspaceLink()}
          >Copy view link</button>
          <button
            className="secondaryButton compact"
            type="button"
            disabled={reloadingLatest}
            onClick={()=>void reloadLatestVersion()}
          >{reloadingLatest?"Reloading…":"Reload latest"}</button>
        </div>
        <button className="textButton" type="button" onClick={signOut}>Sign out</button>
      </div>
    </aside>
    {mobileOpen&&<button className="scrim" type="button" onClick={()=>closeMobileNavigation()} aria-label="Close navigation"/>}

    {commandOpen&&<div className="commandPaletteBackdrop" onMouseDown={()=>closeCommandPalette()}>
      <section
        className="commandPalette"
        role="dialog"
        aria-modal="true"
        aria-label="Quick switch DataNest workspace"
        onMouseDown={event=>event.stopPropagation()}
        onKeyDown={trapCommandFocus}
      >
        <div className="commandPaletteHeader">
          <div><p className="eyebrow">QUICK SWITCH</p><h2>Go to a DataNest workspace</h2></div>
          <button className="iconButton" type="button" onClick={()=>closeCommandPalette()} aria-label="Close quick switch">×</button>
        </div>
        <label className="commandSearch">
          <span className="srOnly">Search DataNest workspaces</span>
          <input
            ref={commandInputRef}
            type="search"
            value={commandQuery}
            onChange={event=>{
              const nextQuery=event.target.value;
              setCommandQuery(nextQuery);
              setCommandActiveIndex(nextQuery.trim()?0:-1);
            }}
            onKeyDown={handleCommandSearchKeyDown}
            placeholder="Search workspaces, tools, research…"
            aria-label="Search DataNest workspaces"
          />
          <kbd>Esc</kbd>
        </label>
        <div className="commandResults" role="listbox" aria-label="DataNest workspaces">
          {commandItems.map((item,index)=><button
            className={"commandResult "+((commandActiveIndex===index||(item.kind==="view"&&view===item.key))?"active":"")}
            type="button"
            role="option"
            aria-selected={commandActiveIndex===index}
            aria-label={item.kind==="external"?"Open Resonance application suite":undefined}
            key={item.id}
            onClick={()=>chooseCommandItem(item)}
          >
            <span className="commandGlyph" aria-hidden="true">{item.glyph}</span>
            <span className="commandResultCopy"><b>{item.label}</b><small>{item.group+" · "+item.description}</small></span>
            {item.kind==="view"&&view===item.key
              ?<span className="commandCurrent">Current</span>
              :<span className="workspaceArrow" aria-hidden="true">{item.kind==="external"?"↗":"→"}</span>}
          </button>)}
          {!commandItems.length&&<div className="commandEmpty">No DataNest workspace matches “{commandQuery}”.</div>}
        </div>
        <div className="commandPaletteFooter"><span>Ctrl/Cmd + K to toggle</span><span>Tab to move · Enter to open</span></div>
      </section>
    </div>}

      </>}
      topbar={
      <header className="topbar datanextShellTopbar">
        <button ref={mobileMenuButtonRef} className="menuButton" type="button" onClick={()=>setMobileOpen(true)} aria-label="Open menu" aria-controls="datanest-navigation" aria-expanded={mobileOpen}>☰</button>
        <div className="topbarTitle">
          <span className="workspaceEmblem"><WorkspaceGlyph view={view}/></span>
          <p className="eyebrow">{DATANEST_CANONICAL_NAME.toUpperCase()} · {currentGroup.toUpperCase()}</p>
          <h1 id="workspace-title" ref={workspaceTitleRef} tabIndex={-1}>{currentLabel}</h1>
          <p className="topbarContext">{currentDescription}</p>
          <div className="topbarMeta" aria-label="Current workspace status"><span>{project?.name || DATANEST_CANONICAL_NAME}</span>{currentPhase&&<><i aria-hidden="true">·</i><span>{currentPhase.toUpperCase()}</span></>}<i aria-hidden="true">·</i><span>{project?.status?.toUpperCase() || (loadingCore ? "CHECKING" : "UNAVAILABLE")}</span></div>
        </div>
        <div className="topActions">
          {pendingRecoveries.length>0&&<button
            className="secondaryButton compact mutationRecoveryTopButton"
            type="button"
            aria-label={pendingRecoveries.length+" unresolved operation"+(pendingRecoveries.length===1?"":"s")}
            onClick={()=>document.getElementById("mutation-recovery-center")?.scrollIntoView({behavior:"smooth",block:"start"})}
          >Recovery <span>{pendingRecoveries.length}</span></button>}
          <button
            ref={quickSwitchButtonRef}
            className="secondaryButton compact quickSwitchButton"
            type="button"
            onClick={openCommandPalette}
            aria-haspopup="dialog"
            aria-expanded={commandOpen}
            aria-keyshortcuts="Control+K Meta+K"
            title="Search and switch DataNest workspaces (Ctrl/Cmd + K)"
          >Quick switch <kbd className="shortcutHint">Ctrl K</kbd></button>
          <button
            className={"secondaryButton compact aiSidebarToggle "+(aiSidebarOpen?"active":"")}
            onClick={()=>setAiSidebarOpen(value=>{
              const next=!value;
              if(!next)setCompanionReserve(0);
              return next;
            })}
            aria-pressed={aiSidebarOpen}
          >{aiSidebarOpen?"Hide AI":"AI assistant"}</button>
          <details className="workspaceOptions" onKeyDown={event=>{
            if(event.key==="Escape"){
              event.currentTarget.open=false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}>
            <summary className="secondaryButton compact">Options</summary>
            <div className="workspaceOptionsMenu">
              <ThemeControl compact />
              <MotionControl/>
          <button
            className="secondaryButton compact"
            type="button"
            onClick={()=>void copyWorkspaceLink()}
            title="Copy a canonical deep link to this workspace presentation state."
          >Copy view link</button>
          <button
            className="secondaryButton compact releaseAction"
            type="button"
            disabled={reloadingLatest}
            onClick={()=>void reloadLatestVersion()}
            title="Fetch the latest release manifest and reopen DataNest with a cache-busting release URL."
          >{reloadingLatest?"Reloading…":"Reload latest"}</button>
          <button className="secondaryButton compact refreshAction" onClick={()=>project&&void Promise.all([loadSummary(project.id),loadRecentJobs(project.id),checkControlPlane(project.id)])}>Refresh</button>
          <div className={"systemStatus "+health.state} title={health.message}>
            <span className={"statusDot "+health.state}/>
            <span>{healthLabel}<small>{health.checkedAt ? " · "+formatDate(health.checkedAt) : ""}</small></span>
          </div>
            </div>
          </details>
        </div>
      </header>
      }
      footer={<PlatformFooter compact/>}
    >
        {view!=="overview"&&view!=="settings"&&<LifecycleRail
          currentPhase={currentPhase}
          aiActive={view==="ai"}
          onNavigate={destination=>setView(destination as ViewKey)}
        />}
        {pendingRecoveries.length>0&&<section id="mutation-recovery-center" className="mutationRecoveryCenter" aria-label="Unresolved operations" aria-live="polite">
          <div className="mutationRecoveryHead">
            <div>
              <p className="eyebrow">AUTHORITATIVE RECOVERY</p>
              <h2>{pendingRecoveries.length===1?"1 unresolved operation":pendingRecoveries.length+" unresolved operations"}</h2>
              <p>These requests have preserved identities and are not yet finalized. Durable entries can recover across tabs and devices; authoritative mutation state still decides the outcome.</p>
            </div>
            <span className="badge warn">{pendingRecoveries.length} OPEN</span>
          </div>
          <div className="mutationRecoveryList">
            {pendingRecoveries.map(item=><article className={"mutationRecoveryItem "+item.age} key={item.scope}>
              <div>
                <div className="mutationRecoveryIdentity">
                  <strong>{item.label}</strong>
                  <span className={"badge "+(item.verificationState==="confirmed_absent"?"good":item.age==="stale"?"bad":"warn")}>
                    {item.verificationState==="confirmed_absent"?"SAFE RETRY":item.age==="stale"?"STALE":item.age==="aging"?"AGING":"PENDING"}
                  </span>
                </div>
                <p>{item.verificationState==="confirmed_absent"?"Server state confirmed no record for the preserved request. Resume the original retry or edit it into new intent.":item.detail}</p>
                <small>Started {formatDate(item.startedAt)} · request identity preserved · {item.durable?"durable ledger":"session continuity"} · {item.attemptCount} attempt{item.attemptCount===1?"":"s"}{item.lastAttemptAt?" · last attempt "+formatDate(item.lastAttemptAt):""}{item.lastCheckedAt?" · checked "+formatDate(item.lastCheckedAt):""}</small>
              </div>
              <button className="secondaryButton compact" type="button" onClick={()=>openPendingRecovery(item)}>{item.verificationState==="confirmed_absent"?"Resume safe retry →":"Review &amp; reconcile →"}</button>
            </article>)}
          </div>
        </section>}
        {activeDataNestAiSession&&project&&view!=="overview"&&view!=="ai"&&view!=="settings"&&<section className="activeWorkContext" aria-label="Active work context">
          <div className="activeWorkContextIdentity">
            <p className="eyebrow">ACTIVE WORK CONTEXT</p>
            <div><strong>{"JOB-"+String(activeDataNestAiSession.jobNumber).padStart(5,"0")}</strong><span>{activeDataNestAiSession.title}</span></div>
            <small className="activeWorkContextHint">{activeContextAction.detail}</small>
          </div>
          <div className="activeWorkContextState">
            <div className="activeWorkContextStatusLine">
              <span className={"badge "+tone(activeDataNestAiSession.status)}>{activeDataNestAiSession.status.replaceAll("_"," ")}</span>
              <small>{activeDataNestAiSession.sessionId?"AI session linked":"Job context linked"}</small>
            </div>
            {activeContextEvidence&&<div className={"activeWorkContextEvidence "+activeContextEvidence.state} role="status" aria-label="Visible evidence signal">
              <span>{activeContextEvidence.label}</span>
              <small>{activeContextEvidence.detail}</small>
            </div>}
            {activeContextEvidence?.state==="visible"&&["unifi","scheduler","runs","checkpoints","audit"].includes(view)&&<button className="activeWorkContextEvidenceJump" type="button" onClick={focusActiveContextRecord}>Jump to visible evidence ↓</button>}
            {activeContextEvidence?.state==="not-visible"&&["unifi","scheduler"].includes(view)&&<button className="activeWorkContextEvidenceJump" type="button" disabled={locatingActiveJob} onClick={()=>void locateActiveJobPage()}>{locatingActiveJob?"Locating active Job…":"Locate active Job page →"}</button>}
            {activeContextEvidence?.state==="not-visible"&&["runs","checkpoints","audit"].includes(view)&&<button className="activeWorkContextEvidenceJump" type="button" disabled={locatingActiveEvidence} onClick={()=>void locateActiveEvidencePage()}>{locatingActiveEvidence?"Locating active evidence…":"Locate active evidence page →"}</button>}
          </div>
          <div className="activeWorkContextActions">
            <button className="primaryButton compact activeWorkContextPrimary" type="button" onClick={()=>setView(activeContextAction.key)}>{activeContextAction.label}</button>
            {activeContextAction.key!=="ai"&&<button className="secondaryButton compact" type="button" onClick={()=>setView("ai")}>Return to DataNest AI</button>}
            <button className="ghostButton compact activeWorkContextClear" type="button" onClick={clearActiveWorkContext}>Clear context</button>
          </div>
          <nav className="activeWorkContextJourney" aria-label="Active Job journey">
            <div className="activeWorkContextJourneyHeader"><span>JOB JOURNEY</span><small>Location only · not completion state</small></div>
            <div className="activeWorkContextJourneySteps">
              {activeJobJourneySteps.map((step,index)=>{
                const current=activeJobJourneyCurrent===step.key;
                return <button
                  key={step.key}
                  type="button"
                  className={current?"active":""}
                  aria-current={current?"step":undefined}
                  aria-label={current?step.label+" · current Job view":"Open "+step.label+" for active Job"}
                  title={step.detail}
                  onClick={()=>setView(step.key)}
                ><span>{"0"+(index+1)}</span><b>{step.label}</b></button>;
              })}
            </div>
          </nav>
        </section>}
        <div aria-live="polite">
          {notice&&<div className="notice goodNotice">{notice}</div>}
          {error&&<div className="notice errorNotice" role="alert">{error}</div>}
        </div>
        {(loadingCore||loadingView)&&<div className="loadingBar" role="progressbar" aria-label="Loading DataNest data"><span/></div>}

        {!loadingCore&&view!=="ai"&&workspaceTaskGuides[view]&&<section className="workspaceTaskGuide" aria-label={currentLabel+" task guide"}>
          <div>
            <span>START HERE</span>
            <p>{workspaceTaskGuides[view]?.start}</p>
          </div>
          <div><span>COMPLETE WHEN</span><p>{workspaceTaskGuides[view]?.complete}</p></div>
          <div><span>EVIDENCE</span><p>{workspaceTaskGuides[view]?.evidence}</p></div>
        </section>}

        <div key={view} className="viewStage workspaceArrival">
        {!loadingCore&&project&&view==="dashboard"&&<DataNestDashboard
          projectId={project.id}
          projectName={project.name}
          role={membership?.role||"viewer"}
          counts={summary}
          jobs={recentJobs}
          runCount={runCount}
          checkpointCount={checkpointCount}
          eventCount={eventCount}
          health={health}
          onNavigate={next=>setView(next)}
        />}
        {!loadingCore&&project&&view==="overview"&&<ResonanceHome project={project} jobs={recentJobs} counts={summary} canOperate={canOperate} onNavigate={setView}/>}
        {!loadingCore&&project&&view==="stakeholder"&&<StakeholderWorkspace projectId={project.id} currentUserId={session.user.id} canReview={canManageAi} onOpenMatchedJobs={()=>{setSchedulerRequirementFocus(null);setSchedulerInterestOnly(true);setSchedulerSortMode("interest");setSchedulerFilter("ALL");setSchedulerViewMode("gantt");setJobPage(0);setView("scheduler");}} onOpenRequirementJobs={key=>{setSchedulerRequirementFocus(key);setSchedulerInterestOnly(false);setSchedulerSortMode("priority");setSchedulerFilter("ALL");setSchedulerViewMode("gantt");setJobPage(0);setView("scheduler");}}/>}
        {!loadingCore&&project&&["sparks","productlab","unifi"].includes(view)&&!recoveryHydrated&&<section className="panel" role="status" aria-live="polite">
          <p className="eyebrow">DURABLE RECOVERY</p>
          <h2>Synchronizing mutation continuity</h2>
          <p className="muted">{recoveryLedgerError||"Checking this account for unresolved server-backed request identities before enabling mutation controls."}</p>
          {recoveryLedgerError&&<button className="secondaryButton compact" type="button" onClick={()=>void synchronizeDurableRecoveries()}>Retry recovery sync</button>}
        </section>}
        {!loadingCore&&project&&view==="sparks"&&recoveryHydrated&&<SparksWorkspace projectId={project.id} currentUserId={session.user.id} canOperate={canOperate} canManage={canManageAi} setNotice={setNotice} setError={setError}/>}
        {!loadingCore&&project&&view==="impact"&&<ImpactScoringWorkspace projectId={project.id} currentUserId={session.user.id}/>}
        {!loadingCore&&project&&view==="governance"&&<GovernanceWorkspace projectId={project.id} currentUserId={session.user.id} role={membership?.role||"viewer"} canManage={canManageAi} setNotice={setNotice} setError={setError}/>}
        {!loadingCore&&project&&view==="products"&&<ProductsWorkspace projectId={project.id} currentUserId={session.user.id} role={membership?.role||"viewer"}/>}
        {!loadingCore&&project&&view==="external_auditor"&&<ExternalAuditor projectId={project.id} currentUserId={session.user.id} role={membership?.role||"viewer"}/>}
        {!loadingCore&&project&&view==="thinktank"&&<ThinkTankWorkspace projectId={project.id} currentUserId={session.user.id} currentUserEmail={session.user.email||"Authenticated user"} role={membership?.role||"viewer"} canOperate={canOperate} canReview={canManageAi} setNotice={setNotice} setError={setError}/>}
        {!loadingCore&&project&&view==="ai"&&<DataNestAiWorkspace key={project.id+":"+session.user.id} projectId={project.id} currentUserId={session.user.id} currentUserEmail={session.user.email||"Authenticated user"} role={membership?.role||"viewer"} canOperate={canOperate} openScheduler={()=>setView("scheduler")} setNotice={setNotice} setError={setError} preferredJobId={activeDataNestAiSession?.jobId||null} onActiveSessionChange={updateActiveWorkContext}/>}
        {!loadingCore&&project&&view==="productlab"&&recoveryHydrated&&<ProductLab projectId={project.id} currentUserId={session.user.id} canOperate={canOperate} setNotice={setNotice} setError={setError}/>}
        {!loadingCore&&project&&view==="unifi"&&recoveryHydrated&&<UnifiPlanner project={project} currentUserId={session.user.id} jobs={jobs} capabilities={capabilities} reload={async()=>{await loadJobsPage(jobPage);await loadSummary(project.id);await loadRecentJobs(project.id);}} setNotice={setNotice} setError={setError} canOperate={canOperate} page={jobPage} total={jobCount} onPage={setJobPage} activeJobId={activeDataNestAiSession?.jobId||null}/>}
        {!loadingCore&&view==="scheduler"&&project&&<Scheduler projectId={project.id} projectName={project?.name||DATANEST_CANONICAL_NAME} projectSlug={project?.slug||"resonance-datanest"} currentUserId={session.user.id} role={membership?.role||"viewer"} jobs={jobs} capabilities={capabilities} onStatus={updateJobStatus} canOperate={canOperate} page={jobPage} total={jobCount} onPage={setJobPage} onNavigate={setView} activeJobId={activeDataNestAiSession?.jobId||null} setNotice={setNotice} setError={setError} filter={schedulerFilter} viewMode={schedulerViewMode} sortMode={schedulerSortMode} interestOnly={schedulerInterestOnly} requirementFocus={schedulerRequirementFocus} onFilter={setSchedulerFilter} onViewMode={setSchedulerViewMode} onSortMode={setSchedulerSortMode} onInterestOnly={setSchedulerInterestOnly} onRequirementFocus={setSchedulerRequirementFocus}/>}
        {!loadingCore&&view==="runs"&&<Runs runs={runs} jobLookup={jobLookup} page={runPage} total={runCount} onPage={setRunPage} onNavigate={setView} activeJobId={activeDataNestAiSession?.jobId||null}/>}
        {!loadingCore&&view==="checkpoints"&&<Checkpoints checkpoints={checkpoints} jobLookup={jobLookup} page={checkpointPage} total={checkpointCount} onPage={setCheckpointPage} onNavigate={setView} activeJobId={activeDataNestAiSession?.jobId||null}/>}
        {!loadingCore&&view==="audit"&&<Audit events={events} jobLookup={jobLookup} page={eventPage} total={eventCount} onPage={setEventPage} onNavigate={setView} activeJobId={activeDataNestAiSession?.jobId||null}/>}
        {!loadingCore&&view==="transparency"&&<TransparencyWorkspace/>}
        {!loadingCore&&view==="settings"&&<Settings project={project} tools={tools} policies={policies} membership={membership} currentUserId={session.user.id} canManageAi={canManageAi} recoveryHydrated={recoveryHydrated} recoveryLedgerError={recoveryLedgerError} recoveryLastSyncedAt={recoveryLastSyncedAt} recoverySyncing={recoverySyncing} synchronizeDurableRecoveries={synchronizeDurableRecoveries}/>}
        </div>
        {!loadingCore&&project&&(previousViewItem||nextViewItem)&&<nav className="workflowContinuation" aria-label="Workspace progression">
          <div className="workflowContinuationCopy">
            <div className="workflowContinuationMeta"><p className="eyebrow">WORKFLOW CONTINUITY</p><span className={"workflowMode "+(workflowRecommendation.adaptive?"adaptive":"lifecycle")}>{workflowRecommendation.adaptive?"STATE-AWARE":"LIFECYCLE"}</span></div>
            <strong>{currentGroup} · {currentLabel}</strong>
            <small>{nextViewItem ? "Suggested next: "+nextViewItem.label+" · "+workflowRecommendation.reason : currentDescription}</small>
          </div>
          <div className="workflowContinuationActions">
            {previousViewItem&&<button className="secondaryButton compact" type="button" onClick={()=>setView(previousViewItem.key)}>← {previousViewItem.label}</button>}
            {nextViewItem&&<button className="primaryButton compact" type="button" onClick={()=>setView(nextViewItem.key)}>Continue · {nextViewItem.label} →</button>}
          </div>
        </nav>}
    </PlatformShell>

    {!loadingCore&&project&&aiSidebarOpen&&<ExternalAiSidebar
      projectId={project.id}
      currentUserEmail={session.user.email||"Authenticated user"}
      activeDataNestAiSession={activeDataNestAiSession}
      onClose={()=>{setAiSidebarOpen(false);setCompanionReserve(0);}}
      onNotice={setNotice}
      onError={setError}
      onCompanionReserve={setCompanionReserve}
    />}
  </div>;
}

function Overview({project,tools,jobs,counts,setView,canOperate}:{project:Project;tools:Tool[];jobs:Job[];counts:Summary;setView:(v:ViewKey)=>void;canOperate:boolean}) {
  const workspaces:Array<{key:ViewKey;label:string;description:string;glyph:string}> = [
    {key:"products",label:"Products",description:"Inspect governed products, linked architecture, controls, evidence and specialist experiences.",glyph:"◉"},
    {key:"ai",label:"DataNest AI",description:"Governed project memory and AI collaboration.",glyph:"⌬"},
    {key:"unifi",label:"UNIFI Planner",description:"Prepare complete, traceable Job Manifests.",glyph:"◇"},
    {key:"scheduler",label:"TranScheduler",description:"Route work through capability-aware scheduling.",glyph:"⌁"},
    {key:"stakeholder",label:"Stakeholder",description:"Capture and review stakeholder contributions.",glyph:"✦"},
    {key:"sparks",label:"Sparks",description:"Develop early ideas into project inputs.",glyph:"✧"},
    {key:"governance",label:"Governance",description:"Review controls, decisions, and accountability.",glyph:"◆"},
    {key:"thinktank",label:"Think Tanks",description:"Coordinate structured collaborative research.",glyph:"◈"},
    {key:"productlab",label:"Product Lab",description:"Review and test product surfaces before release.",glyph:"▣"},
    {key:"transparency",label:"Transparency",description:"Inspect audit evidence, methodology, and findings.",glyph:"◎"}
  ];

  return <>
    <section className="heroPanel">
      <div className="heroCopy">
        <p className="eyebrow">PROJECT COMMAND CENTER</p>
        <h2>{project.name}</h2>
        <p>{project.description}</p>
        <div className="heroActions">
          <button className="primaryButton compact" disabled={!canOperate} onClick={()=>setView("unifi")}>{canOperate ? "Create UNIFI job" : "Viewer mode"}</button>
          <button className="secondaryButton compact" onClick={()=>setView("ai")}>Open DataNest AI</button>
          <button className="secondaryButton compact" onClick={()=>setView("scheduler")}>Open TranScheduler</button>
        </div>
      </div>

    </section>

    <section className="metricGrid" aria-label="Project work summary">
      <Metric label="Total jobs" value={counts.total} note="Project work units"/>
      <Metric label="Active work" value={counts.active} note="Not in a final state"/>
      <Metric label="Running" value={counts.running} note="Executing now"/>
      <Metric label="Blocked" value={counts.blocked} note="Needs dependency or action"/>
    </section>

    <details className="workspaceSection quietDisclosure" aria-labelledby="workspace-heading">
      <summary id="workspace-heading">Browse all workspaces</summary>
      <div className="workspaceGrid">
        {workspaces.map(item=><button className="workspaceCard" type="button" key={item.key} onClick={()=>setView(item.key)}>
          <span className="workspaceGlyph" aria-hidden="true">{item.glyph}</span>
          <span><b>{item.label}</b><small>{item.description}</small></span>
          <span className="workspaceArrow" aria-hidden="true">→</span>
        </button>)}
      </div>
    </details>

    <details className="panel quietDisclosure">
      <summary>Operating tools</summary>
      <div className="toolGrid">
        {tools.map(tool=><article className="toolCard" key={tool.id}><div className="toolIcon">{tool.tool_key==="unifi"?"◇":"⌁"}</div><div><div className="rowBetween"><h4>{tool.name}</h4><Badge value={tool.enabled?"ACTIVE":"DISABLED"}/></div><p>{tool.role}</p></div></article>)}
      </div>
    </details>

    <section className="panel">
      <div className="panelHead"><div><p className="eyebrow">RECENT WORK</p><h3>Latest jobs</h3></div><button className="textButton" onClick={()=>setView("scheduler")}>Open queue</button></div>
      <JobTable jobs={jobs}/>
    </section>
  </>;
}

function Metric({label,value,note}:{label:string;value:number;note:string}) {
  return <article className="metricCard"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

type UnifiPendingPayload={
  title:string;
  description:string|null;
  priority:number;
  capability:string;
  tests:boolean;
  artifact:boolean;
  focusAreas:WorkFocusKey[];
};

function UnifiPlanner({project,currentUserId,jobs,capabilities,reload,setNotice,setError,canOperate,page,total,onPage,activeJobId}:{project:Project;currentUserId:string;jobs:Job[];capabilities:Capability[];reload:()=>Promise<void>;setNotice:(v:string)=>void;setError:(v:string)=>void;canOperate:boolean;page:number;total:number;onPage:(p:number)=>void;activeJobId:string|null}) {
  const draftPrefix="unifi:"+project.id+":"+currentUserId+":";
  const requestScope="unifi-job:"+project.id+":"+currentUserId;
  const [title,setTitle,titleDraft]=useSessionDraftState(draftPrefix+"title","");
  const [description,setDescription,descriptionDraft]=useSessionDraftState(draftPrefix+"description","");
  const [priority,setPriority,priorityDraft]=useSessionDraftState(draftPrefix+"priority",50);
  const [capability,setCapability,capabilityDraft]=useSessionDraftState(draftPrefix+"capability","chat");
  const [tests,setTests,testsDraft]=useSessionDraftState(draftPrefix+"tests",true);
  const [artifact,setArtifact,artifactDraft]=useSessionDraftState(draftPrefix+"artifact",true);
  const [focusAreas,setFocusAreas,focusAreasDraft]=useSessionDraftState<WorkFocusKey[]>(draftPrefix+"focus-areas",[]);
  const {activeAction,busy:saving,run:runSingleFlight}=useSingleFlight();
  const [reconciliationState,setReconciliationState]=useState<MutationReconciliationState|"idle"|"checking">("idle");
  const hasSessionDraft=[titleDraft,descriptionDraft,priorityDraft,capabilityDraft,testsDraft,artifactDraft,focusAreasDraft].some(item=>item.hasStoredDraft);
  const known=Array.from(new Set(["chat",...capabilities.map(item=>item.capability)]));
  const reconciliationLocked=reconciliationState==="pending"||reconciliationState==="checking";
  const intentEditLocked=reconciliationLocked||reconciliationState==="not_recorded";

  function restoreIntentPayload(intent:PendingMutationIntent<UnifiPendingPayload>){
    setTitle(intent.payload.title);
    setDescription(intent.payload.description||"");
    setPriority(intent.payload.priority);
    setCapability(intent.payload.capability);
    setTests(intent.payload.tests);
    setArtifact(intent.payload.artifact);
    setFocusAreas(normalizeWorkFocusKeys(intent.payload.focusAreas));
  }

  async function startNewUnifiIntent(){
    const pending=loadPendingMutation<UnifiPendingPayload>(requestScope);
    if(!pending||pending.verificationState!=="confirmed_absent")return;
    setError("");
    try{
      await resolveDurableRecovery(project.id,requestScope,pending.requestKey,"superseded_after_absence");
      clearPendingMutation(requestScope,"confirmed_absent_new_intent");
      setReconciliationState("idle");
      setNotice("The previous request was closed after authoritative absence. You can edit this manifest as new intent.");
    }catch(intentError){
      setError(intentError instanceof Error?intentError.message:"Unable to close the previous durable recovery identity.");
    }
  }

  async function reconcileUnifiIntent(intent:PendingMutationIntent<UnifiPendingPayload>,announce:boolean){
    const supabase=getSupabase();
    if(!supabase){
      markPendingMutationVerification(requestScope,"unconfirmed");
      setReconciliationState("pending");
      if(announce)setError("UNIFI submission is awaiting authoritative confirmation. Connectivity is unavailable, so do not create a second request yet.");
      return {state:"pending" as const,value:null,error:new Error("Supabase unavailable")};
    }

    setReconciliationState("checking");
    const result=await reconcileServerMutation(async()=>{
      const {data,error}=await supabase.from("jobs")
        .select("id,job_number,status")
        .eq("project_id",project.id)
        .eq("client_request_id",intent.requestKey)
        .limit(1);
      if(error)throw error;
      const row=Array.isArray(data)?data[0]:null;
      return row ? row as {id:string;job_number:number;status:string} : null;
    });

    if(result.state==="confirmed"&&result.value){
      try{
        await resolveDurableRecovery(project.id,requestScope,intent.requestKey,"confirmed");
      }catch(ledgerError){
        markPendingMutationVerification(requestScope,"unconfirmed");
        setReconciliationState("pending");
        restoreIntentPayload(intent);
        if(announce)setError("JOB-"+String(result.value.job_number).padStart(5,"0")+" is confirmed, but durable recovery finalization failed. Recheck to finish continuity cleanup.");
        return {state:"pending" as const,value:null,error:ledgerError instanceof Error?ledgerError:new Error("Durable recovery finalization failed.")};
      }
      clearPendingMutation(requestScope,"confirmed");
      setTitle("");setDescription("");setPriority(50);setCapability("chat");setTests(true);setArtifact(true);setFocusAreas([]);
      setReconciliationState("confirmed");
      setError("");
      setNotice("Recovered confirmed JOB-"+String(result.value.job_number).padStart(5,"0")+" from authoritative server state.");
      await reload();
    }else if(result.state==="not_recorded"){
      try{
        await markDurableRecoveryVerification(project.id,requestScope,intent.requestKey,"confirmed_absent");
      }catch(ledgerError){
        markPendingMutationVerification(requestScope,"unconfirmed");
        setReconciliationState("pending");
        restoreIntentPayload(intent);
        setError("Server state confirms no UNIFI manifest was recorded, but the durable recovery ledger could not record that verification. Recheck before retrying.");
        return {state:"pending" as const,value:null,error:ledgerError instanceof Error?ledgerError:new Error("Durable recovery verification failed.")};
      }
      markPendingMutationVerification(requestScope,"confirmed_absent");
      setReconciliationState("not_recorded");
      restoreIntentPayload(intent);
      if(announce)setNotice("Previous UNIFI submission was not recorded. The original manifest is restored and can be retried safely.");
    }else{
      try{await markDurableRecoveryVerification(project.id,requestScope,intent.requestKey,"unconfirmed");}catch{}
      markPendingMutationVerification(requestScope,"unconfirmed");
      setReconciliationState("pending");
      restoreIntentPayload(intent);
      if(announce)setError("UNIFI submission outcome is still unconfirmed. Its request identity is preserved; recheck server state before retrying.");
    }
    return result;
  }

  useEffect(()=>{
    const reconcilePending=()=>{
      const pending=loadPendingMutation<UnifiPendingPayload>(requestScope);
      if(!pending||pending.kind!=="unifi_job")return;
      restoreIntentPayload(pending);
      void reconcileUnifiIntent(pending,true);
    };
    reconcilePending();
    window.addEventListener("online",reconcilePending);
    return()=>window.removeEventListener("online",reconcilePending);
  },[requestScope]);

  async function createJob(event:FormEvent) {
    event.preventDefault();
    const supabase=getSupabase();
    if(!supabase||!title.trim()||reconciliationLocked) return;
    if(!canOperate){setError("Your DataNest role is read-only.");return;}

    const payload:UnifiPendingPayload={
      title:title.trim(),
      description:description.trim()||null,
      priority,
      capability,
      tests,
      artifact,
      focusAreas:normalizeWorkFocusKeys(focusAreas)
    };
    const intent=getOrCreatePendingMutation(requestScope,"unifi_job",payload);

    await runSingleFlight("create-job",async()=>{
      setNotice("Creating Job Manifest…");
      setError("");
      try {
        const durable=await registerDurableRecovery(project.id,requestScope,intent);
        if(!durable.active){
          clearPendingMutation(requestScope,"durable_resolved");
          setReconciliationState(durable.resolution==="confirmed"?"confirmed":"idle");
          if(durable.resolution==="confirmed"){
            setNotice("This UNIFI request identity was already finalized on another session. Reloading authoritative Job state.");
            await reload();
          }else{
            setNotice("This recovery identity was already superseded after confirmed absence. Submit the edited manifest as new intent.");
          }
          return;
        }
        markPendingMutationDurable(requestScope,{attemptCount:durable.attemptCount,lastAttemptAt:durable.lastAttemptAt});
        const {data,error}=await supabase.rpc("create_job_manifest_v3",{
          target_project:project.id,
          target_request_key:intent.requestKey,
          job_title:payload.title,
          job_description:payload.description,
          job_priority:payload.priority,
          required_capability:payload.capability,
          job_focus_areas:payload.focusAreas,
          tests_required:payload.tests,
          artifact_required:payload.artifact
        });
        if(error) throw error;
        const row=Array.isArray(data)?data[0]:data;
        const number=Number((row as Record<string,unknown>|null)?.job_number||0);
        await resolveDurableRecovery(project.id,requestScope,intent.requestKey,"confirmed");
        clearPendingMutation(requestScope,"confirmed");
        setReconciliationState("confirmed");
        setTitle("");setDescription("");setPriority(50);setCapability("chat");setTests(true);setArtifact(true);setFocusAreas([]);
        setNotice("JOB-"+String(number||"?").padStart(5,"0")+" created transactionally by UNIFI.");
        await reload();
      } catch(createError) {
        const reconciled=await reconcileUnifiIntent(intent,false);
        if(reconciled.state==="confirmed")return;
        if(reconciled.state==="not_recorded"){
          setError((createError instanceof Error ? createError.message : "Unable to create the UNIFI job.")+" Server state confirms the manifest was not recorded; retry is safe.");
          return;
        }
        setError("UNIFI submission outcome is ambiguous. The manifest is locked to its original request identity until authoritative reconciliation succeeds.");
      }
    });
  }

  const prepared=jobs.filter(item=>["PLANNED","READY","QUEUED"].includes(item.status));
  return <section className="splitView">
    <div className="panel stickyPanel"><p className="eyebrow">UNIFI</p><h2>Job Manifest Planner</h2><p className="muted">Prepare work completely before consuming scarce execution capacity.</p>
      {hasSessionDraft&&<p className="muted" role="status">Browser-session draft active · unfinished inputs are restored after workspace navigation or reload.</p>}
      {reconciliationState==="pending"&&<div className="notice errorNotice" role="status"><b>Submission awaiting confirmation.</b> Do not create a second manifest. Recheck authoritative server state first. <button type="button" className="textButton" onClick={()=>{const pending=loadPendingMutation<UnifiPendingPayload>(requestScope);if(pending)void reconcileUnifiIntent(pending,true);}}>Recheck server state</button></div>}
      {reconciliationState==="not_recorded"&&<div className="notice goodNotice" role="status">Server state confirms the previous request was not recorded. Retrying this restored manifest reuses the same request identity. <button type="button" className="textButton" onClick={()=>void startNewUnifiIntent()}>Change manifest</button></div>}
      {!canOperate&&<div className="notice errorNotice">Viewer access is read-only. Ask a DataNest owner or admin for operator access to create jobs.</div>}
      <form className="plannerForm" onSubmit={createJob} aria-busy={saving||reconciliationState==="checking"} data-active-action={activeAction||undefined}>
        <label>Job title<input disabled={intentEditLocked} value={title} onChange={event=>setTitle(event.target.value)} required placeholder="e.g. Validate production deployment"/></label>
        <label>Objective / context<textarea disabled={intentEditLocked} value={description} onChange={event=>setDescription(event.target.value)} rows={6} placeholder="What must be done, constraints, expected output…"/></label>
        <div className="fieldRow">
          <label>Priority<select disabled={intentEditLocked} value={priority} onChange={event=>setPriority(Number(event.target.value))}><option value={100}>100 · Critical</option><option value={80}>80 · High</option><option value={50}>50 · Normal</option><option value={20}>20 · Background</option><option value={5}>5 · Maintenance</option></select></label>
          <label>Required capability<select disabled={intentEditLocked} value={capability} onChange={event=>setCapability(event.target.value)}>{known.map(item=><option key={item}>{item}</option>)}</select></label>
        </div>
        <fieldset className="workFocusFieldset" disabled={intentEditLocked}>
          <legend>Job requirement sections</legend>
          <p className="muted">Tag the work areas this Job needs. TranScheduler uses the same categories as user interests for optional relevance matching.</p>
          <div className="workFocusGrid">
            {WORK_FOCUS_AREAS.map(item=><label key={item.key} title={item.description}><input type="checkbox" checked={focusAreas.includes(item.key)} onChange={event=>setFocusAreas(current=>event.target.checked?[...current,item.key]:current.filter(key=>key!==item.key))}/><span><b>{item.label}</b><small>{item.description}</small></span></label>)}
          </div>
        </fieldset>
        <div className="checkRow"><label><input disabled={intentEditLocked} type="checkbox" checked={tests} onChange={event=>setTests(event.target.checked)}/> Tests required</label><label><input disabled={intentEditLocked} type="checkbox" checked={artifact} onChange={event=>setArtifact(event.target.checked)}/> Artifact required</label></div>
        <button className="primaryButton" disabled={saving||reconciliationLocked||!canOperate}>{saving?"Creating…":reconciliationState==="checking"?"Checking server state…":"Create Job Manifest"}</button>
      </form>
    </div>
    <div className="panel"><div className="panelHead"><div><p className="eyebrow">PLANNING</p><h3>Prepared jobs</h3></div><span className="countPill">{total+" total"}</span></div><div className="manifestList">
      {prepared.map(job=>{const active=job.id===activeJobId;return <article className={"manifestCard "+(active?"contextMatch":"")} data-active-context={active?"true":undefined} tabIndex={active?-1:undefined} aria-label={active?"Active work context · "+jobCode(job)+" · "+job.title:undefined} key={job.id}>{active&&<span className="contextMatchTag contextMatchCardTag">ACTIVE CONTEXT</span>}<div className="rowBetween"><b>{jobCode(job)}</b><Badge value={job.status}/></div><h4>{job.title}</h4><p>{job.description||"No description supplied."}</p><div className="manifestMeta"><span>{"Priority "+job.priority}</span><span>{job.required_capabilities?.join(", ")||"chat"}</span>{workFocusKeysFromRequirements(job.requirements).map(key=><span key={key}>{workFocusLabel(key)}</span>)}<span>{formatDate(job.created_at)}</span></div><JobInviteForm jobId={job.id} canInvite={canOperate} compact onSent={setNotice}/></article>;})}
      {!prepared.length&&<EmptyState title="No prepared jobs on this page" text="Create a job or navigate to another queue page."/>}
    </div><Pagination page={page} total={total} onPage={onPage}/></div>
  </section>;
}

function ganttTime(value:string|null|undefined) {
  if(!value)return null;
  const parsed=Date.parse(value);
  return Number.isFinite(parsed)?parsed:null;
}

function jobAuthorityReadinessLabel(value:JobExecutionAuthorityState|undefined){
  const readiness=String(value?.readiness||"not_evaluated");
  if(readiness==="report_only")return "Report only";
  if(readiness==="ready_for_check")return "Ready for authority check";
  if(readiness==="authorized"&&String(value?.decision_outcome||"")==="allow")return "Authorized";
  if(readiness==="approval_required")return "Approval required";
  if(readiness==="lease_missing")return "Lease missing";
  if(readiness==="lease_expired")return "Lease expired";
  if(readiness==="paused")return "Paused by policy";
  if(readiness==="blocked")return "Blocked by policy";
  return "Authority not evaluated";
}

function formatGanttTick(value:number,span:number) {
  const day=24*60*60*1000;
  const options:Intl.DateTimeFormatOptions=span<=3*day
    ? {month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"UTC"}
    : span<=120*day
      ? {month:"short",day:"2-digit",timeZone:"UTC"}
      : {month:"short",year:"numeric",timeZone:"UTC"};
  return new Intl.DateTimeFormat(undefined,options).format(new Date(value));
}

function Scheduler({projectId,projectName,projectSlug,currentUserId,role,jobs,capabilities,onStatus,canOperate,page,total,onPage,onNavigate,activeJobId,setNotice,setError,filter,viewMode,sortMode,interestOnly,requirementFocus,onFilter,onViewMode,onSortMode,onInterestOnly,onRequirementFocus}:{projectId:string;projectName:string;projectSlug:string;currentUserId:string;role:ExecutionAuthorityRole;jobs:Job[];capabilities:Capability[];onStatus:(j:Job,s:string)=>Promise<void>;canOperate:boolean;page:number;total:number;onPage:(p:number)=>void;onNavigate:(v:ViewKey)=>void;activeJobId:string|null;setNotice:(value:string)=>void;setError:(value:string)=>void;filter:SchedulerFilter;viewMode:SchedulerViewMode;sortMode:SchedulerSortMode;interestOnly:boolean;requirementFocus:WorkFocusKey|null;onFilter:(value:SchedulerFilter)=>void;onViewMode:(value:SchedulerViewMode)=>void;onSortMode:(value:SchedulerSortMode)=>void;onInterestOnly:(value:boolean)=>void;onRequirementFocus:(value:WorkFocusKey|null)=>void}) {
  const setFilter=onFilter;
  const setViewMode=onViewMode;
  const setSortMode=onSortMode;
  const setInterestOnly=onInterestOnly;
  const setRequirementFocus=onRequirementFocus;
  const [authoritySummary,setAuthoritySummary]=useState<Record<string,JobExecutionAuthorityState>>({});
  const [userInterests,setUserInterests]=useState<WorkFocusKey[]>([]);
  const [requirementJobs,setRequirementJobs]=useState<Job[]|null>(null);
  const [requirementJobsLoading,setRequirementJobsLoading]=useState(false);
  const filterOptions=schedulerFilterOptions;

  useEffect(()=>{
    let cancelled=false;
    const supabase=getSupabase();
    if(!supabase){setUserInterests([]);return ()=>{cancelled=true;};}
    void supabase.from("datanest_user_preferences")
      .select("interest_keys")
      .eq("user_id",currentUserId)
      .maybeSingle()
      .then(({data,error})=>{
        if(cancelled)return;
        if(error||!data){setUserInterests([]);return;}
        setUserInterests(normalizeWorkFocusKeys((data as {interest_keys?:unknown}).interest_keys));
      });
    return ()=>{cancelled=true;};
  },[currentUserId]);

  useEffect(()=>{
    let cancelled=false;
    if(!requirementFocus){
      setRequirementJobs(null);
      setRequirementJobsLoading(false);
      return ()=>{cancelled=true;};
    }
    const supabase=getSupabase();
    if(!supabase){
      setRequirementJobs([]);
      setRequirementJobsLoading(false);
      return ()=>{cancelled=true;};
    }
    setRequirementJobs(null);
    setRequirementJobsLoading(true);
    void (async()=>{
      const requirementFocusBatchSize=200;
      const allJobs:Job[]=[];
      for(let offset=0;;offset+=requirementFocusBatchSize){
        const {data,error}=await supabase
          .from("jobs")
          .select(jobColumns)
          .eq("project_id",projectId)
          .order("priority",{ascending:false})
          .order("created_at",{ascending:false})
          .range(offset,offset+requirementFocusBatchSize-1);
        if(cancelled)return;
        if(error){
          setRequirementJobs([]);
          setRequirementJobsLoading(false);
          setError("Requirement focus could not load all project Jobs: "+error.message);
          return;
        }
        const batch=(data||[]) as Job[];
        allJobs.push(...batch);
        if(batch.length<requirementFocusBatchSize)break;
      }
      if(cancelled)return;
      setRequirementJobs(allJobs.filter(item=>!finalStates.has(item.status)&&workFocusKeysFromRequirements(item.requirements).includes(requirementFocus)));
      setRequirementJobsLoading(false);
    })();
    return ()=>{cancelled=true;};
  },[projectId,requirementFocus,setError]);

  const schedulerJobs=useMemo(()=>requirementFocus?(requirementJobs??[]):jobs,[jobs,requirementFocus,requirementJobs]);

  useEffect(()=>{
    let cancelled=false;
    const supabase=getSupabase();
    if(!supabase||schedulerJobs.length===0){setAuthoritySummary({});return ()=>{cancelled=true;};}
    void supabase.rpc("get_job_execution_authority_summary_v1",{
      target_project:projectId,
      target_jobs:schedulerJobs.map(job=>job.id)
    }).then(({data,error})=>{
      if(cancelled)return;
      if(error||!data){setAuthoritySummary({});return;}
      setAuthoritySummary(data as Record<string,JobExecutionAuthorityState>);
    });
    return ()=>{cancelled=true;};
  },[projectId,schedulerJobs]);
  const statusVisible=filter==="ALL"?schedulerJobs:schedulerJobs.filter(item=>item.status===filter);
  const requirementVisible=requirementFocus
    ? statusVisible.filter(item=>!finalStates.has(item.status)&&workFocusKeysFromRequirements(item.requirements).includes(requirementFocus))
    : statusVisible;
  const interestMatchCount=requirementVisible.filter(item=>workMatchesInterests(item.requirements,userInterests)).length;
  const interestCoverage=workInterestCoverage(jobs.map(item=>item.requirements),userInterests);
  const visible=interestOnly&&userInterests.length>0
    ? requirementVisible.filter(item=>workMatchesInterests(item.requirements,userInterests))
    : requirementVisible;
  const orderedVisible=[...visible].sort((left,right)=>{
    if(sortMode==="interest"){
      const overlapDifference=workInterestOverlapCount(right.requirements,userInterests)-workInterestOverlapCount(left.requirements,userInterests);
      if(overlapDifference!==0)return overlapDifference;
      return right.priority-left.priority||left.job_number-right.job_number;
    }
    if(sortMode==="deadline"){
      const leftDeadline=ganttTime(left.deadline);
      const rightDeadline=ganttTime(right.deadline);
      if(leftDeadline!==null||rightDeadline!==null){
        if(leftDeadline===null)return 1;
        if(rightDeadline===null)return -1;
        if(leftDeadline!==rightDeadline)return leftDeadline-rightDeadline;
      }
      return right.priority-left.priority||left.job_number-right.job_number;
    }
    if(sortMode==="recent"){
      return (ganttTime(right.updated_at)??0)-(ganttTime(left.updated_at)??0)||right.priority-left.priority;
    }
    return right.priority-left.priority||left.job_number-right.job_number;
  });
  const activeCount=visible.filter(item=>!finalStates.has(item.status)).length;
  const deadlineCount=visible.filter(item=>Boolean(item.deadline)).length;

  useEffect(()=>{
    function revealActiveContext(){
      setFilter("ALL");
      setInterestOnly(false);
      setRequirementFocus(null);
      setViewMode("gantt");
      window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>{
        if(focusRenderedActiveContextRecord()){
          setNotice("Active Job revealed in TranScheduler.");
        }else{
          setNotice("The active Job is loaded, but no rendered scheduler record is available.");
        }
      }));
    }
    window.addEventListener(ACTIVE_CONTEXT_REVEAL_EVENT,revealActiveContext);
    return ()=>window.removeEventListener(ACTIVE_CONTEXT_REVEAL_EVENT,revealActiveContext);
  },[setNotice]);

  return <>
    <section className="schedulerHero">
      <div>
        <p className="eyebrow">TRANSCHEDULER · GANTT CHART VIEWER</p>
        <div className="schedulerProjectIdentity"><span>PROJECT</span><b>{projectName}</b><small>{projectSlug}</small></div>
        <h2>Capability-aware project scheduler</h2>
        <p>Switch between the operational queue and a Universal Time Gantt timeline. Jobs stay grouped under their project identity, with a priority-scale gradient from maintenance to critical for faster visual planning.</p>
      </div>
      <div className="schedulerPulse"><span>{capabilities.filter(item=>item.state==="AVAILABLE").length}</span><small>available resources</small></div>
    </section>
    <section className="panel">
      <div className="schedulerContextBar">
        <div className="schedulerContextControls">
          <div className="schedulerViewSwitch" role="group" aria-label="TranScheduler view">
            <button type="button" className={viewMode==="queue"?"active":""} aria-pressed={viewMode==="queue"} onClick={()=>setViewMode("queue")}>Queue</button>
            <button type="button" className={viewMode==="gantt"?"active":""} aria-pressed={viewMode==="gantt"} onClick={()=>setViewMode("gantt")}>Gantt chart</button>
            <button type="button" className={viewMode==="authority"?"active":""} aria-pressed={viewMode==="authority"} onClick={()=>setViewMode("authority")}>Authority & Execution</button>
            <button type="button" className={viewMode==="resources"?"active":""} aria-pressed={viewMode==="resources"} onClick={()=>setViewMode("resources")}>Resource Fabric</button>
          </div>
          <label className="schedulerSortControl">Sort
            <select aria-label="Sort project jobs" value={sortMode} onChange={event=>setSortMode(event.target.value as SchedulerSortMode)}>
              <option value="priority">Priority scale</option>
              <option value="deadline">Nearest deadline</option>
              <option value="recent">Recently updated</option>
              <option value="interest">Interest relevance</option>
            </select>
          </label>
          <label className="schedulerInterestToggle">
            <input type="checkbox" checked={interestOnly} disabled={userInterests.length===0} onChange={event=>setInterestOnly(event.target.checked)}/>
            My interests
          </label>
        </div>
        <div className="schedulerContextStats" aria-label="Current scheduler context">
          <span>{projectName}</span>
          <span>{total+" project jobs"}</span>
          <span>{visible.length+" shown"}</span>
          <span>{activeCount+" active"}</span>
          <span>{deadlineCount+" deadlines"}</span>
          <span>{userInterests.length?interestMatchCount+" interest matches":"No interests saved"}</span>
          {requirementFocus&&<span>{"Requirement · "+workFocusLabel(requirementFocus)}</span>}
        </div>
      </div>
      {viewMode==="authority"
        ? <ExecutionAuthorityPanel projectId={projectId} currentUserId={currentUserId} role={role} jobs={jobs} setNotice={setNotice} setError={setError}/>
        : viewMode==="resources"
          ? <ResourceFabricPanel projectId={projectId} role={role} setNotice={setNotice} setError={setError}/>
          : <>
          <label className="schedulerFilterMobile">Status filter
            <select aria-label="Status filter" value={filter} onChange={event=>setFilter(event.target.value as SchedulerFilter)}>
              {filterOptions.map(item=><option key={item} value={item}>{item.replace("_"," ")}</option>)}
            </select>
          </label>
          <div className="filterBar schedulerFilterDesktop">{filterOptions.map(item=><button key={item} className={filter===item?"active":""} onClick={()=>setFilter(item)}>{item.replace("_"," ")}</button>)}</div>
          <div className="schedulerInterestSummary" aria-label="User interests">
            <b>Interest matching</b>
            <span>{userInterests.length?userInterests.map(workFocusLabel).join(" · "):"Save interests in Stakeholder to enable relevance matching."}</span>
          </div>
          {userInterests.length>0&&<div className="schedulerInterestCoverage" aria-label="Interest coverage on current queue page">
            <div className="schedulerInterestCoverageHead"><b>Interest coverage · current queue page</b><span>{interestCoverage.covered.length+" covered · "+interestCoverage.gaps.length+" gap"+(interestCoverage.gaps.length===1?"":"s")}</span></div>
            <div className="schedulerInterestCoverageItems">
              {interestCoverage.covered.map(key=><span className="covered" aria-label={"Covered interest: "+workFocusLabel(key)} key={"covered-"+key}><b>Covered</b>{workFocusLabel(key)}</span>)}
              {interestCoverage.gaps.map(key=><span className="gap" aria-label={"No current Job interest: "+workFocusLabel(key)} key={"gap-"+key}><b>No current Job</b>{workFocusLabel(key)}</span>)}
            </div>
          </div>}
          {requirementFocus&&<div className="schedulerInterestSummary" aria-label={"Requirement focus: "+workFocusLabel(requirementFocus)}>
            <b>Requirement focus</b>
            <span>{workFocusLabel(requirementFocus)+" · open Jobs only"}</span>
            <button className="ghostButton compact" type="button" onClick={()=>setRequirementFocus(null)}>Clear focus</button>
          </div>}

          {!orderedVisible.length?<div className="schedulerEmptyState"><EmptyState
            title={total===0?"No project jobs yet":"No jobs match this filter"}
            text={total===0?"Create a complete Job Manifest in UNIFI before scheduling execution.":requirementFocus?requirementJobsLoading?"Loading all open Jobs for "+workFocusLabel(requirementFocus)+"…":"No open Jobs match "+workFocusLabel(requirementFocus)+". Clear the requirement focus to return to the project queue.":interestOnly?"No Jobs on this page match your saved interests. Turn off the interest filter or update your interests in Stakeholder.":"Clear the current status filter to return to the project queue."}
            actionLabel={total===0?"Open UNIFI Planner":requirementFocus?"Clear requirement focus":interestOnly?"Show all interests":"Show all jobs"}
            onAction={()=>{if(total===0)onNavigate("unifi");else if(requirementFocus)setRequirementFocus(null);else if(interestOnly)setInterestOnly(false);else setFilter("ALL");}}
          /></div>:viewMode==="queue"?<div className="schedulerProjectGroup">
            <ProjectGroupHeader projectName={projectName} projectSlug={projectSlug} jobs={orderedVisible}/>
            <div className="schedulerTable"><div className="schedulerRow headerRow"><span>Job</span><span>Priority</span><span>Capability</span><span>Status</span><span>Controls</span></div>
            {orderedVisible.map(job=><div className={"schedulerRow "+(job.id===activeJobId?"contextMatch ":"")+(workMatchesInterests(job.requirements,userInterests)?"interestMatch":"")} data-active-context={job.id===activeJobId?"true":undefined} tabIndex={job.id===activeJobId?-1:undefined} aria-label={job.id===activeJobId?"Active work context · "+jobCode(job)+" · "+job.title:undefined} key={job.id}>
              <div data-label="Job"><b>{jobCode(job)}</b><small>{job.title}</small>{job.id===activeJobId&&<span className="contextMatchTag">ACTIVE CONTEXT</span>}<JobInterestEvidence job={job} userInterests={userInterests}/>{workFocusKeysFromRequirements(job.requirements).length>0&&<span className="jobFocusTags">{workFocusKeysFromRequirements(job.requirements).map(key=><small key={key}>{workFocusLabel(key)}</small>)}</span>}</div>
              <span data-label="Priority" className="schedulerPriorityCell"><b>{"P"+job.priority}</b><PriorityScale value={job.priority}/></span>
              <span data-label="Capability">{job.required_capabilities?.join(", ")||"chat"}</span>
              <span data-label="Status"><Badge value={job.status}/><small className="schedulerAuthorityState">{jobAuthorityReadinessLabel(authoritySummary[job.id])}</small></span>
              <div className="rowActions" data-label="Controls">
                {canOperate ? <>
                  {!finalStates.has(job.status)&&job.status!=="PAUSED"&&<button onClick={()=>void onStatus(job,"PAUSED")}>Pause</button>}
                  {job.status==="PAUSED"&&<button onClick={()=>void onStatus(job,"READY")}>Resume</button>}
                  {!finalStates.has(job.status)&&<button onClick={()=>void onStatus(job,"CANCELLED")}>Cancel</button>}
                </> : <span className="muted">Read only</span>}
              </div>
            </div>)}
          </div></div>:<SchedulerGantt projectName={projectName} projectSlug={projectSlug} jobs={orderedVisible} onStatus={onStatus} canOperate={canOperate} activeJobId={activeJobId} userInterests={userInterests}/>}
          {!requirementFocus&&<Pagination page={page} total={total} onPage={onPage}/>}
        </>}
    </section>
  </>;
}


function JobInterestEvidence({job,userInterests}:{job:Job;userInterests:WorkFocusKey[]}) {
  if(userInterests.length===0)return null;
  const matched=workInterestOverlapKeys(job.requirements,userInterests);
  const gaps=workInterestGapKeys(job.requirements,userInterests);
  const requirementCount=workFocusKeysFromRequirements(job.requirements).length;
  return <>
    {requirementCount>0&&<span className="interestCoverageDetail" aria-label={"Interest coverage "+matched.length+" of "+requirementCount+" Job requirement sections"}>{"Coverage "+matched.length+" of "+requirementCount}</span>}
    {matched.length>0&&<>
      <span className="interestMatchTag">INTEREST MATCH</span>
      <span className="interestMatchDetail" aria-label={"Matched interests: "+matched.map(workFocusLabel).join(", ")}>{"Matched "+matched.length+" · "+matched.map(workFocusLabel).join(" · ")}</span>
    </>}
    {gaps.length>0&&<span className="interestGapDetail" aria-label={"Requirement sections outside your interests: "+gaps.map(workFocusLabel).join(", ")}>{"Outside your interests · "+gaps.map(workFocusLabel).join(" · ")}</span>}
  </>;
}

function priorityBand(value:number) {
  if(value>=80)return "Critical";
  if(value>=60)return "High";
  if(value>=30)return "Standard";
  return "Maintenance";
}

function PriorityScale({value}:{value:number}) {
  const safe=Math.max(0,Math.min(100,value));
  const band=priorityBand(safe);
  return <span className="priorityScaleMeter" aria-label={"Priority "+safe+" of 100 · "+band} title={"Priority P"+safe+" · "+band}>
    <span className="priorityScaleGradient" aria-hidden="true"/>
    <i className="priorityScaleMarker" style={{left:String(safe)+"%"}} aria-hidden="true"/>
  </span>;
}

function ProjectGroupHeader({projectName,projectSlug,jobs}:{projectName:string;projectSlug:string;jobs:Job[]}) {
  const active=jobs.filter(job=>!finalStates.has(job.status)).length;
  const completed=jobs.filter(job=>job.status==="COMPLETED").length;
  const highest=jobs.length?Math.max(...jobs.map(job=>job.priority)):0;
  const bands=[
    {label:"Maintenance",count:jobs.filter(job=>job.priority<30).length},
    {label:"Standard",count:jobs.filter(job=>job.priority>=30&&job.priority<60).length},
    {label:"High",count:jobs.filter(job=>job.priority>=60&&job.priority<80).length},
    {label:"Critical",count:jobs.filter(job=>job.priority>=80).length}
  ];
  return <div className="schedulerProjectGroupHead">
    <div className="schedulerProjectGroupTitle">
      <span className="schedulerProjectGroupGlyph" aria-hidden="true">◆</span>
      <div><small>PROJECT</small><b>{projectName}</b><span>{projectSlug}</span></div>
    </div>
    <div className="schedulerProjectGroupSummary">
      <span>{jobs.length+" jobs"}</span><span>{active+" active"}</span><span>{completed+" complete"}</span><span>{"Peak P"+highest}</span>
    </div>
    <div className="schedulerPriorityStack">
      <div className="schedulerPriorityLegend" aria-label="Job priority scale">
        <span>Maintenance</span><i aria-hidden="true"/><span>Critical</span>
      </div>
      <div className="schedulerPriorityBands" aria-label="Priority distribution">
        {bands.map(item=><span key={item.label}><b>{item.count}</b>{item.label}</span>)}
      </div>
    </div>
  </div>;
}

function SchedulerGantt({projectName,projectSlug,jobs,onStatus,canOperate,activeJobId,userInterests}:{projectName:string;projectSlug:string;jobs:Job[];onStatus:(j:Job,s:string)=>Promise<void>;canOperate:boolean;activeJobId:string|null;userInterests:WorkFocusKey[]}) {
  if(!jobs.length)return <div className="ganttEmpty"><EmptyState title="No jobs in this Gantt view" text="Change the status filter or add work in UNIFI."/></div>;

  const now=Date.now();
  const minute=60*1000;
  const starts=jobs.map(job=>ganttTime(job.created_at)??now);
  const ends=jobs.map((job,index)=>{
    const deadline=ganttTime(job.deadline);
    const updated=ganttTime(job.updated_at)??starts[index];
    const lifecycleEnd=finalStates.has(job.status)?updated:Math.max(updated,now);
    return Math.max(starts[index]+minute,deadline??lifecycleEnd);
  });
  const rawStart=Math.min(...starts);
  const rawEnd=Math.max(now,...ends);
  const rawSpan=Math.max(rawEnd-rawStart,6*60*minute);
  const padding=Math.max(rawSpan*.055,30*minute);
  const rangeStart=rawStart-padding;
  const rangeEnd=rawEnd+padding;
  const span=rangeEnd-rangeStart;
  const tickCount=6;
  const ticks=Array.from({length:tickCount},(_,index)=>rangeStart+(span*index)/(tickCount-1));
  const nowPosition=Math.max(0,Math.min(100,((now-rangeStart)/span)*100));

  return <div className="ganttViewer">
    <div className="ganttViewerHead">
      <div><p className="eyebrow">PROJECT TIMELINE</p><h3>{projectName}</h3><p>Lifecycle and deadline context for this project. The priority gradient runs from maintenance to critical, while timeline bars continue to use recorded job timestamps only.</p></div>
      <div className="ganttLegend" aria-label="Gantt chart legend">
        <span><i className="deadline"/>Deadline target</span>
        <span><i className="lifecycle"/>Lifecycle window</span>
        <span><i className="now"/>Now</span>
      </div>
    </div>
    <div className="ganttViewport">
      <div className="ganttCanvas">
        <ProjectGroupHeader projectName={projectName} projectSlug={projectSlug} jobs={jobs}/>
        <div className="ganttAxisRow">
          <div className="ganttAxisLabel"><b>{projectName}</b><small>Universal Time · current queue page</small></div>
          <div className="ganttTimeline ganttTimelineAxis">
            {ticks.map((tick,index)=>{
              const position=(index/(tickCount-1))*100;
              const transform=index===0?"none":index===tickCount-1?"translateX(-100%)":"translateX(-50%)";
              return <span className="ganttTickLabel" key={tick} style={{left:String(position)+"%",transform}}>{formatGanttTick(tick,span)}</span>;
            })}
          </div>
        </div>
        {jobs.map((job,index)=>{
          const start=starts[index];
          const end=ends[index];
          const left=Math.max(0,Math.min(100,((start-rangeStart)/span)*100));
          const right=Math.max(left,Math.min(100,((end-rangeStart)/span)*100));
          const width=Math.max(1.4,right-left);
          const deadline=ganttTime(job.deadline);
          const deadlinePosition=deadline===null?null:Math.max(0,Math.min(100,((deadline-rangeStart)/span)*100));
          const endText=job.deadline
            ? "Target "+formatDate(job.deadline)
            : finalStates.has(job.status)
              ? "Closed "+formatDate(job.updated_at)
              : "Active through now · no deadline";

          return <article className={"ganttRow "+(job.id===activeJobId?"contextMatch ":"")+(workMatchesInterests(job.requirements,userInterests)?"interestMatch":"")} data-active-context={job.id===activeJobId?"true":undefined} tabIndex={job.id===activeJobId?-1:undefined} aria-label={job.id===activeJobId?"Active work context · "+jobCode(job)+" · "+job.title:undefined} key={job.id}>
            <div className="ganttJobLabel">
              <div className="ganttJobTitle">
                <div><b>{jobCode(job)}</b><small title={job.title}>{job.title}</small>{job.id===activeJobId&&<span className="contextMatchTag">ACTIVE CONTEXT</span>}<JobInterestEvidence job={job} userInterests={userInterests}/></div>
                <Badge value={job.status}/>
              </div>
              <div className="ganttMeta">
                <span className="ganttPriorityMeta"><b>{"P"+job.priority}</b><PriorityScale value={job.priority}/></span>
                <span>{job.required_capabilities?.join(", ")||"chat"}</span>
                {workFocusKeysFromRequirements(job.requirements).map(key=><span className="jobFocusChip" key={key}>{workFocusLabel(key)}</span>)}
                <span>{endText}</span>
              </div>
              <div className="rowActions ganttRowActions">
                {canOperate ? <>
                  {!finalStates.has(job.status)&&job.status!=="PAUSED"&&<button onClick={()=>void onStatus(job,"PAUSED")}>Pause</button>}
                  {job.status==="PAUSED"&&<button onClick={()=>void onStatus(job,"READY")}>Resume</button>}
                  {!finalStates.has(job.status)&&<button onClick={()=>void onStatus(job,"CANCELLED")}>Cancel</button>}
                </> : <span className="muted">Read only</span>}
              </div>
            </div>
            <div className="ganttTimeline ganttTrack">
              {ticks.map((tick,tickIndex)=><span className="ganttGridLine" key={tick} style={{left:String((tickIndex/(tickCount-1))*100)+"%"}} aria-hidden="true"/>)}
              <span className="ganttNowLine" style={{left:String(nowPosition)+"%"}} aria-hidden="true"/>
              <div
                className={"ganttBar "+tone(job.status)+(job.deadline?" deadlineBound":" lifecycleBound")}
                style={{left:String(left)+"%",width:String(width)+"%"}}
                title={jobCode(job)+" · "+job.title+" · "+endText}
              ><span>{jobCode(job)}</span></div>
              {deadlinePosition!==null&&<span className="ganttDeadlineMarker" style={{left:String(deadlinePosition)+"%"}} aria-hidden="true"/>}
            </div>
          </article>;
        })}
      </div>
    </div>
  </div>;
}

function Runs({runs,jobLookup,page,total,onPage,onNavigate,activeJobId}:{runs:Run[];jobLookup:Map<string,Job>;page:number;total:number;onPage:(p:number)=>void;onNavigate:(v:ViewKey)=>void;activeJobId:string|null}) {
  return <section className="panel"><div className="panelHead"><div><p className="eyebrow">EXECUTION HISTORY</p><h2>Runs</h2></div><span className="countPill">{total}</span></div>
    {runs.length?<div className="dataTable"><div className="dataRow headerRow"><span>Run</span><span>Job</span><span>Connector</span><span>Status</span><span>Started</span></div>
      {runs.map(run=>{const job=jobLookup.get(run.job_id);const active=run.job_id===activeJobId;return <div className={"dataRow "+(active?"contextMatch":"")} data-active-context={active?"true":undefined} tabIndex={active?-1:undefined} aria-label={active?"Active work context · RUN-"+run.run_number:undefined} key={run.id}>
        <b data-label="Run">{"RUN-"+run.run_number}</b>
        <span data-label="Job" className="contextJobCell">{job?jobCode(job):run.job_id.slice(0,8)}{active&&<small className="contextMatchTag">ACTIVE CONTEXT</small>}</span>
        <span data-label="Connector">{run.connector_kind}</span>
        <span data-label="Status"><Badge value={run.status}/></span>
        <span data-label="Started">{formatDate(run.started_at)}</span>
      </div>;})}
    </div>:<EmptyState title="No execution runs yet" text="Runs appear after TranScheduler dispatches governed Jobs." actionLabel="Open TranScheduler" onAction={()=>onNavigate("scheduler")}/>}
    <Pagination page={page} total={total} onPage={onPage}/>
  </section>;
}

function Checkpoints({checkpoints,jobLookup,page,total,onPage,onNavigate,activeJobId}:{checkpoints:Checkpoint[];jobLookup:Map<string,Job>;page:number;total:number;onPage:(p:number)=>void;onNavigate:(v:ViewKey)=>void;activeJobId:string|null}) {
  return <>{checkpoints.length?<section className="checkpointGrid">{checkpoints.map(checkpoint=>{const job=jobLookup.get(checkpoint.job_id);const active=checkpoint.job_id===activeJobId;return <article className={"checkpointCard "+(active?"contextMatch":"")} data-active-context={active?"true":undefined} tabIndex={active?-1:undefined} aria-label={active?"Active work context · "+(job?jobCode(job):checkpoint.job_id.slice(0,8)):undefined} key={checkpoint.id}>{active&&<span className="contextMatchTag contextMatchCardTag">ACTIVE CONTEXT</span>}<div className="rowBetween"><div><p className="eyebrow">CHECKPOINT</p><h3>{job?jobCode(job):checkpoint.job_id.slice(0,8)}</h3></div><small>{formatDate(checkpoint.created_at)}</small></div><h4>{job?.title||"Project continuation"}</h4><div className="checkpointColumns"><div><b>Completed</b>{checkpoint.completed?.map(item=><span key={item}>{"✓ "+item}</span>)}</div><div><b>Remaining</b>{checkpoint.remaining?.map(item=><span key={item}>{"→ "+item}</span>)}</div></div>{checkpoint.resume_instruction&&<div className="resumeBox"><b>Resume</b>{checkpoint.resume_instruction}</div>}</article>;})}</section>:<EmptyState title="No checkpoints yet" text="Durable continuation points appear after executable work records resumable state." actionLabel="Open Runs" onAction={()=>onNavigate("runs")}/>}<Pagination page={page} total={total} onPage={onPage}/></>;
}

function Audit({events,jobLookup,page,total,onPage,onNavigate,activeJobId}:{events:AuditEvent[];jobLookup:Map<string,Job>;page:number;total:number;onPage:(p:number)=>void;onNavigate:(v:ViewKey)=>void;activeJobId:string|null}) {
  return <section className="panel"><div className="panelHead"><div><p className="eyebrow">IMMUTABLE HISTORY</p><h2>Audit trail</h2></div><span className="countPill">{total}</span></div>{events.length?<div className="timeline">
    {events.map(event=>{const active=event.job_id===activeJobId;return <div className={"timelineItem "+(active?"contextMatch":"")} data-active-context={active?"true":undefined} tabIndex={active?-1:undefined} aria-label={active?"Active work context · "+event.event_type.replaceAll("_"," "):undefined} key={event.id}><div className="timelineDot"/><div>{active&&<span className="contextMatchTag">ACTIVE CONTEXT</span>}<div className="rowBetween"><b>{event.event_type.replaceAll("_"," ")}</b><small>{formatDate(event.created_at)}</small></div><p>{(event.job_id&&jobLookup.get(event.job_id)?jobCode(jobLookup.get(event.job_id)!)+" · ":"")+event.actor}</p><code>{JSON.stringify(event.payload)}</code></div></div>;})}
  </div>:<EmptyState title="No audit events yet" text="Governed project actions will appear here as immutable operational evidence." actionLabel="Open Checkpoints" onAction={()=>onNavigate("checkpoints")}/>}<Pagination page={page} total={total} onPage={onPage}/></section>;
}

function Settings({
  project,tools,policies,membership,currentUserId,canManageAi,
  recoveryHydrated,recoveryLedgerError,recoveryLastSyncedAt,recoverySyncing,synchronizeDurableRecoveries
}:{
  project:Project|null;
  tools:Tool[];
  policies:Policy[];
  membership:ProjectMember|null;
  currentUserId:string;
  canManageAi:boolean;
  recoveryHydrated:boolean;
  recoveryLedgerError:string;
  recoveryLastSyncedAt:string|null;
  recoverySyncing:boolean;
  synchronizeDurableRecoveries:()=>Promise<void>;
}) {
  return <section className="settingsGrid">
    <div className="panel"><p className="eyebrow">PROJECT</p><h3>{project?.name||DATANEST_CANONICAL_NAME}</h3><dl className="settingsList"><div><dt>Slug</dt><dd>{project?.slug||"resonance-datanest"}</dd></div><div><dt>Status</dt><dd><Badge value={project?.status||"ACTIVE"}/></dd></div><div><dt>Access role</dt><dd><Badge value={(membership?.role||"viewer").toUpperCase()}/></dd></div><div><dt>GitHub</dt><dd>DataNest-Supository/DataNest</dd></div><div><dt>Supabase</dt><dd>sgqdmfgjbprsoqsmgigi</dd></div><div><dt>Hosting</dt><dd>Provider-agnostic</dd></div><div><dt>Production host</dt><dd>GitHub Pages</dd></div></dl></div>
    <div className="panel"><p className="eyebrow">TOOLS</p><h3>Tool registry</h3>{tools.map(tool=><div className="settingRow" key={tool.id}><div><b>{tool.name}</b><small>{tool.role}</small></div><Badge value={tool.enabled?"ACTIVE":"DISABLED"}/></div>)}</div>
    <RonsasIntegrationPanel/>
    {project&&(membership?.role==="owner"||membership?.role==="admin")&&<div className="fullWidth" aria-label="R&D Device Administration"><RndDeviceAdministration projectId={project.id} role={membership.role}/></div>}
    <div className="fullWidth accountSecurityAnchor" id="account-security" tabIndex={-1}>{project&&<AccountPasswordPanel projectId={project.id}/>}</div>
    {project&&<RecoveryDiagnosticsPanel projectId={project.id} hydrated={recoveryHydrated} ledgerError={recoveryLedgerError} lastSyncedAt={recoveryLastSyncedAt} syncing={recoverySyncing} onSync={synchronizeDurableRecoveries}/>}
    {project&&<div className="fullWidth" aria-label="AI Administration">
      <AiOperationsDashboard projectId={project.id} currentUserId={currentUserId} canManageAi={canManageAi}/>
    </div>}

    {project&&membership?.role==="owner"&&<div className="fullWidth" aria-label="Owner Development Analytics Administration"><OwnerDevelopmentAnalytics projectId={project.id} compact /></div>}

    {project&&membership&&["owner","admin"].includes(membership.role)&&<div className="fullWidth" aria-label="DataNest AI System Optimizer Administration">
      <OwnerOptimizerDashboard projectId={project.id}/>
    </div>}

    <div className="panel fullWidth"><p className="eyebrow">SCHEDULER</p><h3>Policies</h3><div className="policyGrid">{policies.map(policy=><article key={policy.id}><b>{policy.policy_key}</b><pre>{JSON.stringify(policy.value,null,2)}</pre></article>)}</div></div>
  </section>;
}

function JobTable({jobs}:{jobs:Job[]}) {
  return <div className="jobTable">{jobs.map(job=><div className="jobTableRow" key={job.id}>
    <b data-label="Job">{jobCode(job)}</b>
    <div data-label="Title"><strong>{job.title}</strong><small>{formatDate(job.created_at)}</small></div>
    <span data-label="Priority">{"P"+job.priority}</span>
    <span data-label="Capability">{job.required_capabilities?.join(", ")||"chat"}</span>
    <span data-label="Status"><Badge value={job.status}/></span>
  </div>)}{!jobs.length&&<EmptyState title="No jobs yet" text="Use UNIFI to create the first Job Manifest."/>}</div>;
}

function Pagination({page,total,onPage}:{page:number;total:number;onPage:(p:number)=>void}) {
  const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  if(total<=PAGE_SIZE) return null;
  return <div className="pageControls" aria-label="Pagination"><button disabled={page===0} onClick={()=>onPage(Math.max(0,page-1))}>Previous</button><span>{"Page "+(page+1)+" of "+pages}</span><button disabled={page+1>=pages} onClick={()=>onPage(page+1)}>Next</button></div>;
}

function Badge({value}:{value:string}) { return <span className={"badge "+tone(value)}>{value.replaceAll("_"," ")}</span>; }
function EmptyState({title,text,actionLabel,onAction}:{title:string;text:string;actionLabel?:string;onAction?:()=>void}) { return <div className="emptyState"><div>◇</div><h3>{title}</h3><p>{text}</p>{actionLabel&&onAction&&<button className="secondaryButton compact emptyStateAction" type="button" onClick={onAction}>{actionLabel}</button>}</div>; }
