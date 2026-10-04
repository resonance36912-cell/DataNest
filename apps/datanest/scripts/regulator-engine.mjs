#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

async function readJson(filename,fallback={}){
  try{return JSON.parse(await readFile(filename,"utf8"));}catch{return fallback;}
}
const fingerprint=value=>"sha256:"+createHash("sha256").update(JSON.stringify(value)).digest("hex");

function requirement({source,requirementClass,severity,title,detail,evidence=[]}){
  const core={source,requirementClass,severity,title,detail,evidence};
  return {
    id:fingerprint(core),
    ...core,
    botsquadTasks:["audit","stress-test","acquisition-scout","supply-readiness","action-plan"],
    productionAuthorization:false
  };
}

export function buildRegulatorState({
  config,boundaries={},guardian={},enforcer={},calmer={},environment={},conductor={},suggester={},botsquad={},visibility={},
  generatedAt=new Date().toISOString()
}){
  const requirements=[];

  const sourceContracts=[
    ["guardian",guardian,"datanest-guardian-snapshot-v1","health","high"],
    ["enforcer",enforcer,"datanest-enforcer-assessment-v1","security","high"],
    ["calmer",calmer,"datanest-calmer-state-v1","governance","medium"],
    ["environment",environment,"datanest-environment-feed-v1","environment","medium"],
    ["conductor",conductor,"datanest-conductor-state-v1","timing","medium"],
    ["suggester",suggester,"datanest-suggester-feed-v1","optimization","medium"],
    ["botsquad",botsquad,"datanest-botsquad-consolidated-feed-v1","transparency","medium"],
    ["visibility-utility",visibility,"datanest-visibility-utility-state-v1","market-visibility","medium"]
  ];
  for(const [name,value,schema,requirementClass,severity] of sourceContracts){
    if(value?.schemaVersion===schema && value?.productionAuthorization===false) continue;
    requirements.push(requirement({
      source:name,requirementClass,severity,
      title:"Initialize or refresh "+name+" regulatory evidence",
      detail:"REGULATOR requires a current non-authorizing "+schema+" input before declaring full harmony.",
      evidence:[name+".schemaVersion",name+".productionAuthorization"]
    }));
  }

  for(const blocker of enforcer?.blockers||[]){
    requirements.push(requirement({
      source:"enforcer",requirementClass:"security",severity:"critical",
      title:"Resolve ENFORCER blocker",detail:String(blocker),evidence:["enforcer.blockers"]
    }));
  }
  for(const review of enforcer?.reviews||[]){
    requirements.push(requirement({
      source:"enforcer",requirementClass:"security",severity:"high",
      title:"Resolve ENFORCER review condition",detail:String(review),evidence:["enforcer.reviews"]
    }));
  }
  for(const drift of guardian?.drift?.optimalConditionDrift||[]){
    requirements.push(requirement({
      source:"guardian",requirementClass:"health",severity:"high",
      title:"Restore GUARDIAN blueprint alignment",detail:JSON.stringify(drift),
      evidence:["guardian.drift.optimalConditionDrift"]
    }));
  }
  for(const item of environment?.reviewRequired||[]){
    requirements.push(requirement({
      source:"environment",requirementClass:"environment",severity:"high",
      title:"Resolve ENVIRONMENT review requirement",detail:JSON.stringify(item),
      evidence:["environment.reviewRequired"]
    }));
  }
  if(calmer?.status==="softening-suspended"){
    requirements.push(requirement({
      source:"calmer",requirementClass:"governance",severity:"high",
      title:"Restore conditions required for governance softening",
      detail:"CALMER suspended softening because a non-negotiable health/security condition is not satisfied.",
      evidence:["calmer.status"]
    }));
  }
  const seoScore=Number(visibility?.assessment?.seo?.score||0);
  const platformCoverage=Number(visibility?.assessment?.platform?.coveragePercent||0);
  if(visibility?.schemaVersion==="datanest-visibility-utility-state-v1" && (seoScore<80 || platformCoverage<70)){
    requirements.push(requirement({
      source:"visibility-utility",requirementClass:"market-visibility",severity:"medium",
      title:"Improve DataNest visibility baseline",
      detail:`VISIBILITY-UTILITY reports SEO ${seoScore}/100 and platform coverage ${platformCoverage}%.`,
      evidence:["visibility.assessment.seo.score","visibility.assessment.platform.coveragePercent"]
    }));
  }
  for(const missing of (visibility?.missingInputs||[]).slice(0,20)){
    requirements.push(requirement({
      source:"visibility-utility",requirementClass:"market-visibility",severity:"medium",
      title:"Resolve market-evidence gap: "+String(missing),
      detail:"Market projection confidence is limited until this input is configured or explicitly waived.",
      evidence:["visibility.missingInputs",missing]
    }));
  }

  if(conductor?.allProcessesFresh===false){
    requirements.push(requirement({
      source:"conductor",requirementClass:"timing",severity:"medium",
      title:"Restore synchronized process timing",
      detail:"CONDUCTOR reports one or more specialized processes are stale, active, blocked or awaiting refresh.",
      evidence:["conductor.processes","conductor.nextCommand"]
    }));
  }

  const promotableSuggestionTypes=new Set([
    "code-streamlining",
    "learning-optimization",
    "governance-friction",
    "function-evolution",
    "route-to-market"
  ]);
  for(const suggestion of (suggester?.suggestions||[])
    .filter(x=>x.automationClass!=="autonomous-safe" && promotableSuggestionTypes.has(x.type))
    .slice(0,50)){
    requirements.push(requirement({
      source:"suggester",requirementClass:"optimization",
      severity:suggestion.priority==="critical"?"critical":suggestion.priority==="high"?"high":"medium",
      title:suggestion.title||"Review optimization requirement",
      detail:suggestion.detail||"",
      evidence:["suggester.suggestions",suggestion.fingerprint].filter(Boolean)
    }));
  }
  for(const risk of (botsquad?.risks||[]).slice(0,30)){
    requirements.push(requirement({
      source:"botsquad",requirementClass:"transparency",severity:"medium",
      title:"Audit BOTSQUAD risk",detail:typeof risk==="string"?risk:JSON.stringify(risk),
      evidence:["botsquad.risks"]
    }));
  }

  const unique=[], seen=new Set();
  for(const item of requirements){
    if(seen.has(item.id)) continue;
    seen.add(item.id); unique.push(item);
  }
  const rank={critical:0,high:1,medium:2,low:3};
  unique.sort((a,b)=>(rank[a.severity]??9)-(rank[b.severity]??9)||a.title.localeCompare(b.title));

  const hardRuleCount=Array.isArray(boundaries?.hardRules)?boundaries.hardRules.length:0;
  const scopeCount=Array.isArray(boundaries?.scopes)?boundaries.scopes.length:0;
  const status=unique.some(x=>x.severity==="critical")?"blocked"
    :unique.length?"attention":"harmonized";

  const botsquadPacket={
    schemaVersion:"datanest-regulator-botsquad-requirements-v1",
    generatedAt,
    authority:"requirement-request",
    productionAuthorization:false,
    status,
    requirements:unique,
    roles:config.botsquadRoles||[],
    instructions:[
      "Audit every requirement against evidence and Boundaries.",
      "Stress-test assumptions, failure modes and recovery paths.",
      "Identify only free/open/already-authorized acquisition options; do not purchase or acquire credentials.",
      "Assess supply readiness of approved resources/capabilities/evidence.",
      "Return bounded action plans for SUGGESTER/CONDUCTOR or human review."
    ]
  };

  return {
    schemaVersion:"datanest-regulator-state-v1",
    generatedAt,
    authority:"transparent-system-regulation",
    productionAuthorization:false,
    status,
    harmony:{
      boundariesLoaded:hardRuleCount>0&&scopeCount>0,
      boundaryScopeCount:scopeCount,
      hardRuleCount,
      guardianStatus:guardian?.status||"missing",
      enforcerStatus:enforcer?.status||"missing",
      calmerStatus:calmer?.status||"missing",
      environmentCompatible:environment?.environmentCompatible??null,
      conductorFresh:conductor?.allProcessesFresh??null
    },
    requirements:unique,
    botsquadPacket,
    transparency:{
      requirementCount:unique.length,
      critical:unique.filter(x=>x.severity==="critical").length,
      high:unique.filter(x=>x.severity==="high").length,
      medium:unique.filter(x=>x.severity==="medium").length,
      secretValuesPublished:false,
      privateAuthenticationMaterialPublished:false,
      financialCommitmentsAuthorized:false
    },
    controls:config.controls||{}
  };
}

async function main(){
  const config=await readJson("config/regulator.tree.json",null);
  const boundaries=await readJson("config/boundaries.policy.json",null);
  if(!config||!boundaries) throw new Error("REGULATOR requires tree and Boundaries configs.");

  const guardian=await readJson(process.env.REGULATOR_GUARDIAN_PATH||"/tmp/regulator/guardian.json",{});
  const enforcer=await readJson(process.env.REGULATOR_ENFORCER_PATH||"/tmp/regulator/enforcer.json",{});
  const calmer=await readJson(process.env.REGULATOR_CALMER_PATH||"/tmp/regulator/calmer.json",{});
  const environment=await readJson(process.env.REGULATOR_ENVIRONMENT_PATH||"/tmp/regulator/environment.json",{});
  const conductor=await readJson(process.env.REGULATOR_CONDUCTOR_PATH||"/tmp/regulator/conductor.json",{});
  const suggester=await readJson(process.env.REGULATOR_SUGGESTER_PATH||"/tmp/regulator/suggester.json",{});
  const botsquad=await readJson(process.env.REGULATOR_BOTSQUAD_PATH||"/tmp/regulator/botsquad.json",{});
  const visibility=await readJson(process.env.REGULATOR_VISIBILITY_PATH||"/tmp/regulator/visibility.json",{});

  const state=buildRegulatorState({config,boundaries,guardian,enforcer,calmer,environment,conductor,suggester,botsquad,visibility});
  await mkdir("regulator/state",{recursive:true});
  await mkdir("regulator/requirements",{recursive:true});
  await mkdir("regulator/transparency",{recursive:true});
  await writeFile("regulator/state/latest.json",JSON.stringify(state,null,2)+"\n");
  await writeFile("regulator/requirements/botsquad.json",JSON.stringify(state.botsquadPacket,null,2)+"\n");
  await writeFile("regulator/transparency/latest.json",JSON.stringify({
    schemaVersion:"datanest-regulator-transparency-v1",
    generatedAt:state.generatedAt,
    status:state.status,
    productionAuthorization:false,
    harmony:state.harmony,
    transparency:state.transparency,
    requirements:state.requirements.map(x=>({
      id:x.id,source:x.source,requirementClass:x.requirementClass,severity:x.severity,title:x.title,evidence:x.evidence
    }))
  },null,2)+"\n");
  process.stdout.write(JSON.stringify({status:state.status,...state.transparency},null,2)+"\n");
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
