#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { inspectTreeEvidence } from "./tree-evidence.mjs";

async function readJson(filename,fallback={}){
  try{return JSON.parse(await readFile(filename,"utf8"));}catch{return fallback;}
}
const hash=value=>"sha256:"+createHash("sha256").update(String(value)).digest("hex");

function suggestion({source,type,priority,title,detail,automationClass="review-required",actionId=null,evidence=[]}){
  const fingerprint=hash(JSON.stringify({source,type,title,detail,actionId,evidence}));
  return {
    fingerprint,source,type,priority,title,detail,automationClass,actionId,evidence
  };
}

export function buildSuggesterFeed({
  config,
  guardian={},
  knowledge={},
  environment={},
  enforcer={},
  botsquad={},
  conductor={},
  calmer={},
  regulator={},
  visibility={},
  previous={},
  headSha=null,
  generatedAt=new Date().toISOString()
}){
  const suggestions=[];
  const now=new Date(generatedAt);
  const sourceEvidence={
    guardian:inspectTreeEvidence(guardian,"datanest-guardian-snapshot-v1",45,now),
    knowledge:inspectTreeEvidence(knowledge,"datanest-knowledge-feed-v1",420,now),
    environment:inspectTreeEvidence(environment,"datanest-environment-feed-v1",420,now),
    enforcer:inspectTreeEvidence(enforcer,"datanest-enforcer-assessment-v1",210,now),
    botsquad:inspectTreeEvidence(botsquad,"datanest-botsquad-consolidated-feed-v1",420,now),
    conductor:inspectTreeEvidence(conductor,"datanest-conductor-state-v1",30,now),
    calmer:inspectTreeEvidence(calmer,"datanest-calmer-feed-v1",45,now),
    regulator:inspectTreeEvidence(regulator,"datanest-regulator-state-v1",45,now),
    visibility:inspectTreeEvidence(visibility,"datanest-visibility-utility-feed-v1",240,now)
  };
  const automationReady=Object.values(sourceEvidence).every(source=>source.valid) &&
    ["healthy","healing"].includes(guardian?.status) &&
    enforcer?.status==="pass" && environment?.environmentCompatible===true &&
    conductor?.allProcessesFresh===true &&
    (!headSha || (guardian?.headSha===headSha && conductor?.headSha===headSha));
  for(const [source,evidence] of Object.entries(sourceEvidence)){
    if(evidence.valid) continue;
    suggestions.push(suggestion({source,type:"source-evidence",priority:"high",
      title:"Refresh "+source+" evidence",detail:evidence.reasons.join(", "),
      evidence:[source+".generatedAt"]}));
  }

  const redundant=Number(guardian?.observed?.branches?.redundantBranchCount||0);
  if(redundant>0){
    suggestions.push(suggestion({
      source:"guardian",
      type:"branch-health",
      priority:"high",
      title:"Heal provably redundant branches",
      detail:`${redundant} branch(es) are classified by GUARDIAN as zero-unique-commit cleanup candidates.`,
      automationClass:"autonomous-safe",
      actionId:"heal-redundant-branches",
      evidence:[{path:"guardian.observed.branches.redundantBranches",value:guardian?.observed?.branches?.redundantBranches||[],headSha:guardian?.headSha||null}]
    }));
  }

  const refinements=Number(guardian?.observed?.source?.safeRefinementCount||0);
  if(refinements>0){
    suggestions.push(suggestion({
      source:"guardian",
      type:"source-health",
      priority:"medium",
      title:"Propose deterministic source streamlining",
      detail:`${refinements} normalization refinement(s) are available for a review PR.`,
      automationClass:"autonomous-safe",
      actionId:"heal-byte-safe-source-noise",
      evidence:[{path:"guardian.observed.source.safeRefinements",value:guardian?.observed?.source?.safeRefinements||[],headSha:guardian?.headSha||null}]
    }));
  }

  for(const candidate of (guardian?.observed?.source?.redundancyCandidates||[]).slice(0,50)){
    suggestions.push(suggestion({
      source:"guardian",
      type:"code-streamlining",
      priority:candidate?.severity==="high"?"high":"medium",
      title:"Review code/workflow streamlining candidate",
      detail:JSON.stringify(candidate),
      automationClass:"review-required",
      evidence:["guardian.observed.source.redundancyCandidates"]
    }));
  }

  for(const drift of guardian?.drift?.optimalConditionDrift||[]){
    suggestions.push(suggestion({
      source:"guardian",
      type:"blueprint-drift",
      priority:"high",
      title:"Resolve blueprint drift: "+String(drift.control||drift.dimension||"condition"),
      detail:JSON.stringify(drift),
      automationClass:"review-required",
      evidence:["guardian.drift.optimalConditionDrift"]
    }));
  }

  for(const item of environment?.reviewRequired||[]){
    suggestions.push(suggestion({
      source:"environment",
      type:"environment-adaptation",
      priority:"high",
      title:"Review ENVIRONMENT adaptation",
      detail:JSON.stringify(item),
      automationClass:"review-required",
      evidence:["environment.reviewRequired"]
    }));
  }

  for(const blocker of enforcer?.blockers||[]){
    suggestions.push(suggestion({
      source:"enforcer",
      type:"security-defence",
      priority:"critical",
      title:"Resolve ENFORCER blocker",
      detail:String(blocker),
      automationClass:"review-required",
      evidence:["enforcer.blockers"]
    }));
  }

  for(const review of enforcer?.reviews||[]){
    suggestions.push(suggestion({
      source:"enforcer",
      type:"security-review",
      priority:"high",
      title:"Review ENFORCER health condition",
      detail:String(review),
      automationClass:"review-required",
      evidence:["enforcer.reviews"]
    }));
  }

  for(const candidate of knowledge?.optimizationCandidates||[]){
    suggestions.push(suggestion({
      source:"knowledge",
      type:"learning-optimization",
      priority:"medium",
      title:"Review Knowledge optimization candidate",
      detail:JSON.stringify(candidate),
      automationClass:"review-required",
      evidence:["knowledge.optimizationCandidates"]
    }));
  }

  for(const recommendation of (botsquad?.recommendations||[]).slice(0,50)){
    suggestions.push(suggestion({
      source:"botsquad",
      type:"ai-optimization",
      priority:"medium",
      title:"Evaluate BOTSQUAD optimization",
      detail:typeof recommendation==="string"?recommendation:JSON.stringify(recommendation),
      automationClass:"review-required",
      evidence:["botsquad.recommendations"]
    }));
  }
  for(const recommendation of (botsquad?.uxEaseFeed||[]).slice(0,30)){
    suggestions.push(suggestion({
      source:"botsquad",
      type:"ux-ease",
      priority:"medium",
      title:"Evaluate UX ease suggestion",
      detail:typeof recommendation==="string"?recommendation:JSON.stringify(recommendation),
      automationClass:"review-required",
      evidence:["botsquad.uxEaseFeed"]
    }));
  }
  for(const gate of (calmer?.gateSoftening||[]).filter(x=>Number(x.maximumSofteningHours||0)>0).slice(0,30)){
    suggestions.push(suggestion({
      source:"calmer",
      type:"governance-friction",
      priority:"low",
      title:"Apply CALMER minimum-pass planning window",
      detail:JSON.stringify(gate),
      automationClass:"review-required",
      evidence:["calmer.gateSoftening"]
    }));
  }

  for(const req of (regulator?.requirements||[]).slice(0,50)){
    suggestions.push(suggestion({
      source:"regulator",
      type:"harmony-requirement",
      priority:req.severity==="critical"?"critical":req.severity==="high"?"high":"medium",
      title:req.title||"Resolve REGULATOR requirement",
      detail:req.detail||"",
      automationClass:"review-required",
      evidence:["regulator.requirements",req.id].filter(Boolean)
    }));
  }

  for(const missing of (visibility?.missingInputs||[]).slice(0,20)){
    suggestions.push(suggestion({
      source:"visibility-utility",
      type:"market-evidence",
      priority:"medium",
      title:"Configure visibility evidence source: "+String(missing),
      detail:"VISIBILITY-UTILITY cannot raise projection confidence until this configured input is available.",
      automationClass:"review-required",
      evidence:["visibility.missingInputs",missing]
    }));
  }

  for(const route of (visibility?.routes||[]).slice(0,5)){
    suggestions.push(suggestion({
      source:"visibility-utility",
      type:"route-to-market",
      priority:route.opportunityScore>=80?"high":"medium",
      title:"Consider route to market: "+String(route.label||route.id||"market route"),
      detail:JSON.stringify({
        opportunityScore:route.opportunityScore,
        confidence:route.confidence,
        projectedOutcome:route.projectedOutcome,
        implementationClass:route.implementationClass
      }),
      automationClass:"review-required",
      evidence:["visibility.routes",route.id].filter(Boolean)
    }));
  }

  for(const recommendation of (botsquad?.functionEvolutionFeed||[]).slice(0,30)){
    suggestions.push(suggestion({
      source:"botsquad",
      type:"function-evolution",
      priority:"medium",
      title:"Evaluate function evolution suggestion",
      detail:typeof recommendation==="string"?recommendation:JSON.stringify(recommendation),
      automationClass:"review-required",
      evidence:["botsquad.functionEvolutionFeed"]
    }));
  }

  const unique=[];
  const seen=new Set();
  for(const item of suggestions){
    if(seen.has(item.fingerprint)) continue;
    seen.add(item.fingerprint);
    unique.push(item);
  }

  const priorityRank={critical:0,high:1,medium:2,low:3};
  unique.sort((a,b)=>
    (priorityRank[a.priority]??9)-(priorityRank[b.priority]??9) ||
    a.title.localeCompare(b.title)
  );

  const commands=unique
    .filter(item=>automationReady && item.automationClass==="autonomous-safe" &&
      config?.automationClasses?.autonomousSafe?.includes(item.actionId))
    .map(item=>({
      actionId:item.actionId,
      automationClass:item.automationClass,
      fingerprint:item.fingerprint,
      sourceSuggestion:item.title
    }));

  const previousFingerprints=new Set((previous?.suggestions||[]).map(x=>x.fingerprint));
  return {
    schemaVersion:"datanest-suggester-feed-v1",
    generatedAt,
    headSha,
    sourceEvidence,
    automationReady,
    authority:"optimization-advisory",
    productionAuthorization:false,
    conductor:{
      generatedAt:conductor?.generatedAt||null,
      allProcessesFresh:conductor?.allProcessesFresh??null,
      nextCommand:conductor?.nextCommand||null
    },
    sourceHealth:{
      guardianStatus:guardian?.status||"missing",
      guardianHealthScore:guardian?.health?.score??null,
      enforcerStatus:enforcer?.status||"missing",
      environmentCompatible:environment?.environmentCompatible??null,
      knowledgeItems:Number(knowledge?.itemCount||0),
      botsquadAvailable:botsquad?.schemaVersion==="datanest-botsquad-consolidated-feed-v1",
      calmerTier:calmer?.tier||null,
      regulatorStatus:regulator?.status||"missing",
      visibilitySeoScore:visibility?.seoScore??null,
      visibilityScore:visibility?.visibilityScore??null,
      marketEvidenceMissing:Number(visibility?.missingInputs?.length||0)
    },
    suggestions:unique,
    commands,
    summary:{
      total:unique.length,
      autonomousSafe:commands.length,
      reviewRequired:unique.filter(x=>x.automationClass!=="autonomous-safe").length,
      awaitingSynchronization:unique.filter(x=>x.automationClass==="autonomous-safe").length-commands.length,
      newSincePrevious:unique.filter(x=>!previousFingerprints.has(x.fingerprint)).length
    },
    controls:config?.controls||{}
  };
}

async function main(){
  const config=await readJson("config/suggester.tree.json",null);
  if(!config) throw new Error("Missing SUGGESTER config.");

  const guardian=await readJson(process.env.SUGGESTER_GUARDIAN_PATH||"/tmp/suggester/guardian.json",{});
  const knowledge=await readJson(process.env.SUGGESTER_KNOWLEDGE_PATH||"/tmp/suggester/knowledge.json",{});
  const environment=await readJson(process.env.SUGGESTER_ENVIRONMENT_PATH||"/tmp/suggester/environment.json",{});
  const enforcer=await readJson(process.env.SUGGESTER_ENFORCER_PATH||"/tmp/suggester/enforcer.json",{});
  const botsquad=await readJson(process.env.SUGGESTER_BOTSQUAD_PATH||"/tmp/suggester/botsquad.json",{});
  const conductor=await readJson(process.env.SUGGESTER_CONDUCTOR_PATH||"/tmp/suggester/conductor.json",{});
  const calmer=await readJson(process.env.SUGGESTER_CALMER_PATH||"/tmp/suggester/calmer.json",{});
  const regulator=await readJson(process.env.SUGGESTER_REGULATOR_PATH||"/tmp/suggester/regulator.json",{});
  const visibility=await readJson(process.env.SUGGESTER_VISIBILITY_PATH||"/tmp/suggester/visibility.json",{});
  const previous=await readJson(process.env.SUGGESTER_PREVIOUS_PATH||"/tmp/suggester/previous.json",{});

  const headSha=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
  const feed=buildSuggesterFeed({config,guardian,knowledge,environment,enforcer,botsquad,conductor,calmer,regulator,visibility,previous,headSha});
  feed.triggeringConductorRunId=process.env.SUGGESTER_CONDUCTOR_RUN_ID||null;
  await mkdir("suggester/feeds",{recursive:true});
  await writeFile("suggester/feeds/datanest.json",JSON.stringify(feed,null,2)+"\n");
  process.stdout.write(JSON.stringify(feed.summary,null,2)+"\n");
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
