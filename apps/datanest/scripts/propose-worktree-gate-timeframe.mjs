import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const configPath=fileURLToPath(new URL("../config/worktree-gate-timeframes.json",import.meta.url));
const calmerPath=fileURLToPath(new URL("../config/calmer.tree.json",import.meta.url));
const CONFIG=JSON.parse(readFileSync(configPath,"utf8"));
const CALMER=JSON.parse(readFileSync(calmerPath,"utf8"));

function clean(value){ return typeof value==="string" ? value.trim() : ""; }
function parseArgs(argv){
  const out={};
  for(let i=0;i<argv.length;i++){
    const value=argv[i];
    if(!value.startsWith("--")) continue;
    const key=value.slice(2), next=argv[i+1];
    if(next!==undefined && !next.startsWith("--")){ out[key]=next; i+=1; }
    else out[key]="true";
  }
  return out;
}
function rankTask(value){ return ["routine","standard","complex","cross_system"].indexOf(value); }
function escalatedTaskComplexity(base,changedFiles){
  const changed=Number.isFinite(changedFiles) ? changedFiles : 0;
  let floor="routine";
  if(changed>=31) floor="cross_system";
  else if(changed>=11) floor="complex";
  else if(changed>=4) floor="standard";
  return rankTask(base)>=rankTask(floor) ? base : floor;
}
function roundUpHuman(hours){ return CONFIG.humanBuckets.find((x)=>hours<=x) || CONFIG.maxHumanHours; }
function roundUpMachine(minutes){ return CONFIG.machineBucketsMinutes.find((x)=>minutes<=x) || CONFIG.machineBucketsMinutes.at(-1); }
function calmerMinimumPassHours(profile,effectiveTask,effectiveReporting){
  const domainFloors=(profile.reviewDomains||[])
    .map((key)=>Number(CALMER.domainFloorsHours?.[key]||0));
  const domainFloor=domainFloors.length ? Math.max(...domainFloors) : 0;
  const taskFloor=Number(CONFIG.taskComplexityHours[effectiveTask]||0)*0.25;
  const reportingFloor=Number(CONFIG.reportingComplexityHours[effectiveReporting]||0)*0.25;
  return roundUpHuman(Math.max(domainFloor,taskFloor+reportingFloor));
}
function profileFor({gateId,workflowFile}){
  if(workflowFile && CONFIG.gateProfiles[workflowFile]) return [workflowFile,CONFIG.gateProfiles[workflowFile]];
  if(gateId){
    const found=Object.entries(CONFIG.gateProfiles).find(([,p])=>p.gateId===gateId);
    if(found) return found;
  }
  throw new Error("Unknown worktree gate; provide a configured gateId or workflowFile");
}
export function listWorktreeGateProfiles(){ return CONFIG.gateProfiles; }

export function proposeWorktreeGateTimeframe({
  gateId,workflowFile,changedFiles=0,taskComplexity,reportingComplexity,overrideHours
}={}){
  const [resolvedWorkflowFile,profile]=profileFor({gateId,workflowFile});
  const changed=Math.max(0,Number.parseInt(String(changedFiles),10)||0);
  const effectiveTask=clean(taskComplexity) || escalatedTaskComplexity(profile.taskComplexity,changed);
  const effectiveReporting=clean(reportingComplexity) || profile.reportingComplexity;
  if(!(effectiveTask in CONFIG.taskComplexityHours)) throw new Error(`Unsupported task complexity: ${effectiveTask}`);
  if(!(effectiveReporting in CONFIG.reportingComplexityHours)) throw new Error(`Unsupported reporting complexity: ${effectiveReporting}`);

  const humanAssumptions=profile.reviewDomains.map((key)=>{
    const assumption=CONFIG.humanResponseAssumptions[key];
    if(!assumption) throw new Error(`Unknown human response domain: ${key}`);
    return {key,...assumption};
  });
  const humanResponseHours=humanAssumptions.length ? Math.max(...humanAssumptions.map((x)=>x.typicalHours)) : 0;
  const coordinationHours=Math.max(0,(humanAssumptions.length-1)*6);
  const taskHours=CONFIG.taskComplexityHours[effectiveTask];
  const reportingHours=CONFIG.reportingComplexityHours[effectiveReporting];
  const baselineRawHumanHours=humanResponseHours+coordinationHours+taskHours+reportingHours;
  const baselineHumanFollowupHours=roundUpHuman(baselineRawHumanHours);
  const minimumPassHours=calmerMinimumPassHours(profile,effectiveTask,effectiveReporting);
  const humanFollowupHours=minimumPassHours;

  const scopeMultiplier=changed>=31?1.75:changed>=11?1.4:changed>=4?1.2:1;
  const complexityMultiplier={routine:0.8,standard:1,complex:1.25,cross_system:1.5}[effectiveTask];
  const rawMachineMinutes=Number((profile.machineBaselineMinutes*scopeMultiplier*complexityMultiplier).toFixed(1));
  const machineEtaMinutes=roundUpMachine(rawMachineMinutes);

  const isManual=profile.gateType==="manual_mutation";
  const recommendedHours=isManual ? humanFollowupHours : null;
  let acceptedHours=recommendedHours, ownerOverride=false, overrideDeltaHours=0;
  const hasOverride=overrideHours!==undefined && overrideHours!==null && String(overrideHours).trim()!=="";
  if(hasOverride){
    if(!isManual) throw new Error("overrideHours is only valid for manual_mutation gates");
    const parsed=Number(overrideHours);
    if(!Number.isFinite(parsed) || parsed<minimumPassHours || parsed>CONFIG.maxHumanHours){
      throw new Error(`overrideHours must be between CALMER minimum ${minimumPassHours} and ${CONFIG.maxHumanHours}`);
    }
    acceptedHours=parsed;
    overrideDeltaHours=Number((parsed-recommendedHours).toFixed(3));
    ownerOverride=Math.abs(overrideDeltaHours)>0.01;
  }

  return {
    schemaVersion:CONFIG.schemaVersion,
    gateId:profile.gateId,
    workflowFile:resolvedWorkflowFile,
    gateType:profile.gateType,
    changedFiles:changed,
    taskComplexity:effectiveTask,
    reportingComplexity:effectiveReporting,
    machine:{rawMinutes:rawMachineMinutes,estimatedMinutes:machineEtaMinutes,baselineMinutes:profile.machineBaselineMinutes},
    humanFollowup:{
      reviewDomains:profile.reviewDomains,
      assumptions:humanAssumptions,
      responseHours:humanResponseHours,
      coordinationHours,
      taskHours,
      reportingHours,
      rawHours:minimumPassHours,
      recommendedHours:humanFollowupHours,
      baselineRawHours:baselineRawHumanHours,
      baselineRecommendedHours:baselineHumanFollowupHours,
      calmerMinimumPassHours:minimumPassHours,
      calmerSofteningHours:Math.max(0,baselineHumanFollowupHours-minimumPassHours)
    },
    manualWindow:isManual?{
      recommendedHours,
      acceptedHours,
      ownerOverride,
      overrideDeltaHours,
      maximumHours:CONFIG.maxHumanHours
    }:null,
    interpretation:isManual
      ?"Human response/evidence-gathering planning window for a mutating gate. This does not waive authority requirements."
      :"Machine execution ETA plus human follow-up planning window if intervention, review, or reporting is needed. It does not delay or weaken the automated gate.",
    calmer:{
      mode:CALMER.mode,
      pressure:CALMER.pressure,
      hardControlsPreserved:true,
      minimumPassHours,
      baselinePlanningHours:baselineHumanFollowupHours,
      softenedPlanningHours:humanFollowupHours
    },
    calibration:"Planning heuristic, not an SLA. CALMER minimizes planning/evidence friction only; automated checks, authority requirements, hard Boundaries, ENFORCER blockers and mandatory approvals remain unchanged.",
    generatedAt:new Date().toISOString()
  };
}

export function writeWorktreeGateTimeframe(target,proposal){
  const output=resolve(target);
  mkdirSync(dirname(output),{recursive:true});
  writeFileSync(output,JSON.stringify(proposal,null,2)+"\n","utf8");
  return output;
}
export function renderWorktreeGateSummary(p){
  const lines=[
    `## DataNest AI gate timeframe — ${p.gateId}`,
    "",
    `- Gate type: **${p.gateType}**`,
    `- Changed files measured: **${p.changedFiles}**`,
    `- Effective complexity: **${p.taskComplexity} / ${p.reportingComplexity}**`,
    `- Machine ETA: **~${p.machine.estimatedMinutes} min**`,
    `- Human follow-up window if needed: **~${p.humanFollowup.recommendedHours} h**`
  ];
  if(p.manualWindow){
    lines.push(`- Manual gate planning window: **${p.manualWindow.acceptedHours} h**`);
    if(p.manualWindow.ownerOverride) lines.push(`- Owner override delta: **${p.manualWindow.overrideDeltaHours} h**`);
  }
  lines.push("",p.interpretation,"",p.calibration,"");
  return lines.join("\n");
}

const directInvocation=process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(directInvocation){
  const args=parseArgs(process.argv.slice(2));
  const proposal=proposeWorktreeGateTimeframe({
    gateId:args.gate,workflowFile:args.workflow,changedFiles:args["changed-files"],
    taskComplexity:args["task-complexity"],reportingComplexity:args["reporting-complexity"],
    overrideHours:args["override-hours"]
  });
  if(args.output) writeWorktreeGateTimeframe(args.output,proposal);
  const summary=renderWorktreeGateSummary(proposal);
  if(process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary+"\n","utf8");
  console.log(JSON.stringify(proposal,null,2));
}
