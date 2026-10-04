#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

async function readJson(filename,fallback={}){
  try{return JSON.parse(await readFile(filename,"utf8"));}catch{return fallback;}
}
const clamp=value=>Math.max(0,Math.min(1,Number(value)||0));
const round=value=>Math.round(clamp(value)*1000)/1000;

function statusScore(status){
  return status==="healthy"||status==="pass"?1
    :status==="healing"?0.95
    :status==="degraded"||status==="review"?0.75
    :0;
}

export function deriveCalmerMetrics({guardian={},enforcer={},conductor={},knowledge={},suggester={}}={}){
  const checks=Array.isArray(guardian?.checks)?guardian.checks:[];
  const scoredChecks=checks.filter(x=>Number(x?.weight||0)>0);
  const accuracy=scoredChecks.length
    ?scoredChecks.reduce((sum,item)=>{
        const earned=Number(item?.earned||0), weight=Math.max(1,Number(item?.weight||1));
        return sum+clamp(earned/weight);
      },0)/scoredChecks.length
    :statusScore(guardian?.status);

  const guardianPerformance=Number.isFinite(Number(guardian?.health?.score))
    ?clamp(Number(guardian.health.score)/100)
    :statusScore(guardian?.status);
  const conductorPerformance=conductor?.allProcessesFresh===true?1
    :conductor?.allProcessesFresh===false?0.7:0.5;
  const performance=(guardianPerformance*0.7)+(conductorPerformance*0.3);

  const security=enforcer?.status==="pass"?1
    :enforcer?.status==="review"?0.8:0;

  const knowledgeItems=Number(knowledge?.itemCount ?? knowledge?.items?.length ?? guardian?.observed?.knowledge?.itemCount ?? 0);
  const suggestions=Number(suggester?.summary?.total||0);
  const botCount=Number(guardian?.observed?.botsquad?.botCount||0);
  const contribution=
    Math.min(1,knowledgeItems/100)*0.5+
    Math.min(1,suggestions/20)*0.25+
    Math.min(1,botCount/10)*0.25;

  return {
    accuracy:round(accuracy),
    performance:round(performance),
    security:round(security),
    contribution:round(contribution)
  };
}

export function classifyCalmerTier(metrics,tiers){
  const order=["diamond","gold","stone"];
  for(const tier of order){
    const minimums=tiers?.[tier]?.minimums||{};
    if(Object.entries(minimums).every(([key,value])=>Number(metrics?.[key]||0)>=Number(value))){
      return tier;
    }
  }
  return "unqualified";
}

function baselineHumanHours(profile,gateConfig){
  const assumptions=(profile.reviewDomains||[]).map(key=>gateConfig.humanResponseAssumptions?.[key]).filter(Boolean);
  const response=assumptions.length?Math.max(...assumptions.map(x=>Number(x.typicalHours||0))):0;
  const coordination=Math.max(0,(assumptions.length-1)*6);
  const task=Number(gateConfig.taskComplexityHours?.[profile.taskComplexity]||0);
  const reporting=Number(gateConfig.reportingComplexityHours?.[profile.reportingComplexity]||0);
  return response+coordination+task+reporting;
}

function roundUpHuman(hours,buckets,maxHours){
  return (buckets||[]).find(x=>hours<=x) || maxHours || hours;
}

export function buildGateSoftening(config,gateConfig,{suspend=false}={}){
  const proposals=[];
  for(const [workflowFile,profile] of Object.entries(gateConfig?.gateProfiles||{})){
    const floors=(profile.reviewDomains||[])
      .map(key=>Number(config?.domainFloorsHours?.[key]||0));
    const domainFloor=floors.length?Math.max(...floors):0;
    const taskFloor=Number(gateConfig?.taskComplexityHours?.[profile.taskComplexity]||0)*0.25;
    const reportingFloor=Number(gateConfig?.reportingComplexityHours?.[profile.reportingComplexity]||0)*0.25;
    const rawFloor=Math.max(domainFloor,taskFloor+reportingFloor);
    const minimumPassHours=roundUpHuman(rawFloor,gateConfig.humanBuckets,gateConfig.maxHumanHours);
    const baselineRaw=baselineHumanHours(profile,gateConfig);
    const baselineHours=roundUpHuman(baselineRaw,gateConfig.humanBuckets,gateConfig.maxHumanHours);
    proposals.push({
      workflowFile,
      gateId:profile.gateId,
      gateType:profile.gateType,
      reviewDomains:profile.reviewDomains||[],
      baselinePlanningHours:baselineHours,
      minimumPassPlanningHours:suspend?baselineHours:minimumPassHours,
      maximumSofteningHours:suspend?0:Math.max(0,baselineHours-minimumPassHours),
      hardControlsPreserved:true,
      softeningSuspended:suspend,
      note:"Planning/evidence-response softening only; automated checks and authority requirements remain unchanged."
    });
  }
  return proposals;
}

export function buildCalmerState({
  config,gateConfig,guardian={},enforcer={},conductor={},knowledge={},suggester={},
  generatedAt=new Date().toISOString()
}){
  const metrics=deriveCalmerMetrics({guardian,enforcer,conductor,knowledge,suggester});
  const baseTier=classifyCalmerTier(metrics,config.tiers||{});
  const suspend=enforcer?.status==="block"||guardian?.status==="critical";
  const tier=suspend?"unqualified":baseTier;
  const gateSoftening=buildGateSoftening(config,gateConfig,{suspend});
  const tierConfig=config?.tiers?.[tier]||null;
  const scopes=(config.tierScopes||["functions","processes","builds"]).map(scope=>({
    scope,
    tier: tierConfig?.label||"UNQUALIFIED",
    metrics,
    benefits:tierConfig?.benefits||[],
    evidenceReuseMinutes:tierConfig?Number(config?.evidenceReuseMinutes?.[tier]||0):0,
    fastLaneEligible:!!tierConfig && tier!=="stone" && !suspend
  }));
  return {
    schemaVersion:"datanest-calmer-state-v1",
    generatedAt,
    authority:"governance-friction-optimization",
    productionAuthorization:false,
    pressure:config.pressure,
    status:suspend?"softening-suspended":tier==="unqualified"?"baseline-required":"softening-active",
    metrics,
    tier:tierConfig?.label||"UNQUALIFIED",
    packages:scopes,
    gateSoftening,
    nonNegotiable:config.nonNegotiable||[],
    controls:config.controls||{},
    summary:{
      gateCount:gateSoftening.length,
      softenableGateCount:gateSoftening.filter(x=>x.maximumSofteningHours>0).length,
      totalPotentialPlanningHoursReduced:gateSoftening.reduce((sum,x)=>sum+x.maximumSofteningHours,0),
      hardControlsRemoved:0
    }
  };
}

async function main(){
  const config=await readJson("config/calmer.tree.json",null);
  const gateConfig=await readJson("config/worktree-gate-timeframes.json",null);
  if(!config||!gateConfig) throw new Error("CALMER requires tree and gate-timeframe configs.");

  const guardian=await readJson(process.env.CALMER_GUARDIAN_PATH||"/tmp/calmer/guardian.json",{});
  const enforcer=await readJson(process.env.CALMER_ENFORCER_PATH||"/tmp/calmer/enforcer.json",{});
  const conductor=await readJson(process.env.CALMER_CONDUCTOR_PATH||"/tmp/calmer/conductor.json",{});
  const knowledge=await readJson(process.env.CALMER_KNOWLEDGE_PATH||"/tmp/calmer/knowledge.json",{});
  const suggester=await readJson(process.env.CALMER_SUGGESTER_PATH||"/tmp/calmer/suggester.json",{});

  const state=buildCalmerState({config,gateConfig,guardian,enforcer,conductor,knowledge,suggester});
  await mkdir("calmer/state",{recursive:true});
  await mkdir("calmer/feeds",{recursive:true});
  await writeFile("calmer/state/latest.json",JSON.stringify(state,null,2)+"\n");
  await writeFile("calmer/feeds/datanest.json",JSON.stringify({
    schemaVersion:"datanest-calmer-feed-v1",
    generatedAt:state.generatedAt,
    authority:"minimum-friction-advisory",
    productionAuthorization:false,
    status:state.status,
    tier:state.tier,
    metrics:state.metrics,
    packages:state.packages,
    gateSoftening:state.gateSoftening,
    summary:state.summary
  },null,2)+"\n");
  process.stdout.write(JSON.stringify({status:state.status,tier:state.tier,...state.summary},null,2)+"\n");
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
