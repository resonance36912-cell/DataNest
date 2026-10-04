#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function textFile(filename){try{return await readFile(filename,"utf8");}catch{return "";}}
async function jsonFile(filename){try{return JSON.parse(await readFile(filename,"utf8"));}catch{return null;}}
async function exists(filename){try{await access(filename);return true;}catch{return false;}}

export function assessEnvironment(config,observed){
  const findings=[];
  const expected=config.expected||{};
  const add=(dimension,status,detail,adaptationClass="none")=>findings.push({dimension,status,detail,adaptationClass});
  const compatible=(condition,dimension,ok,drift,adaptationClass="human-review-required")=>
    add(dimension,condition?"compatible":"review",condition?ok:drift,condition?"none":adaptationClass);

  compatible(observed.canonicalRepository===expected.canonicalRepository,"source-control",
    "Canonical source repository matches the DataNest authority contract.",
    "Canonical source repository identity is missing or drifted.");
  compatible(observed.node22Configured,"runtime",
    "Node 22 setup is present in shared repository automation.",
    "Node 22 is not explicitly discoverable in the shared setup.");
  compatible(observed.ubuntu2404,"ci-runner",
    "Ubuntu 24.04 runner usage is present.",
    "Expected Ubuntu 24.04 runner was not found.");
  compatible(observed.deliveryProvider===expected.canonicalDelivery,"delivery",
    "Canonical delivery is "+expected.canonicalDelivery+".",
    "Canonical delivery observed as "+(observed.deliveryProvider||"unknown")+".");
  compatible(observed.backendAuthority===expected.backendAuthority,"backend",
    "Backend authority is "+expected.backendAuthority+".",
    "Backend authority observed as "+(observed.backendAuthority||"unknown")+".");
  compatible(observed.aiArchitecturePresent,"ai-inference",
    "Provider-neutral DataNest AI architecture is discoverable.",
    "AI inference architecture contract is missing.");
  compatible(observed.forgeMode===expected.forgeMode,"registry",
    "Resonance Forge remains in "+expected.forgeMode+" mode.",
    "Resonance Forge mode observed as "+(observed.forgeMode||"unknown")+".");
  compatible(observed.backupConfigured,"backup-recovery",
    "Governed backup/recovery authority is cataloged.",
    "Backup/recovery authority is not discoverable.");
  compatible(observed.lockfilePresent,"dependency-posture",
    "Locked dependency state is present for reproducible automation.",
    "Dependency lockfile is missing.");
  compatible(observed.botsquadProtected && observed.environmentProtected,"branch-hygiene",
    "BOTSQUAD and ENVIRONMENT automation branches are protected from generic cleanup.",
    "Automation branch protection needs alignment.");

  const treeConfigsOk=observed.requiredTreeConfigs.every(Boolean);
  add("evidence-observability",
    treeConfigsOk ? "compatible" : "adapt",
    treeConfigsOk ? "Specialized tree contracts are discoverable." : "One or more specialized tree contracts are missing.",
    treeConfigsOk ? "safe-auto-generated-metadata" : "human-review-required");

  return {
    schemaVersion:"datanest-environment-assessment-v1",
    generatedAt:new Date().toISOString(),
    authority:"advisory-environment-control",
    productionAuthorization:false,
    findings,
    compatible:findings.every(x=>x.status==="compatible"),
    safeApplied:["refreshed generated environment state","refreshed non-authorizing target compatibility feeds"],
    reviewRequired:findings.filter(x=>x.adaptationClass==="human-review-required")
  };
}

function feedFor(target,assessment,config){
  return {
    schemaVersion:"datanest-environment-feed-v1",
    target,
    authority:"advisory",
    productionAuthorization:false,
    generatedAt:assessment.generatedAt,
    environmentCompatible:assessment.compatible,
    findings:assessment.findings,
    reviewRequired:assessment.reviewRequired,
    adaptationPolicy:config.adaptationPolicy
  };
}

async function main(){
  const config=await jsonFile("config/environment.tree.json");
  if(!config) throw new Error("Missing environment tree config");
  const setup=await textFile(".github/actions/node-project-setup/action.yml");
  const ci=await textFile(".github/workflows/ci.yml");
  const boundary=await jsonFile("branch-cleaner.config.json")||{};
  const app=await jsonFile("public/.well-known/reson8-app.json")||{};
  const catalog=await jsonFile("config/supository.catalog.json")||{};

  const requiredTreeConfigs=[
    await jsonFile("config/knowledge-tree.json"),
    await jsonFile("config/boundaries.policy.json"),
    await jsonFile("config/botsquad.tree.json"),
    await jsonFile("config/enforcer.tree.json"),
    await jsonFile("config/guardian.tree.json"),
    await jsonFile("config/conductor.tree.json"),
    await jsonFile("config/suggester.tree.json"),
    await jsonFile("config/calmer.tree.json"),
    await jsonFile("config/regulator.tree.json"),
    await jsonFile("config/visibility-utility.tree.json"),
    config
  ];

  const observed={
    canonicalRepository:catalog?.canonicalRepository || null,
    node22Configured:/default\s*:\s*["']22["']/.test(setup) || /node-version\s*:\s*["']?22\b/.test(ci),
    ubuntu2404:/ubuntu-24\.04/.test(ci),
    deliveryProvider:app?.delivery?.provider || null,
    backendAuthority:String(catalog?.authority?.backend||"").startsWith("Supabase:") ? "Supabase" : null,
    aiArchitecturePresent:await exists("docs/DATANEST_AI_ARCHITECTURE.md"),
    forgeMode:catalog?.authority?.sovereignForge?.mode || null,
    backupConfigured:Boolean(catalog?.authority?.backupArtifacts),
    lockfilePresent:await exists("package-lock.json"),
    botsquadProtected:(boundary.protectedPatterns||[]).some(x=>x==="^automation/botsquad/"),
    environmentProtected:(boundary.protectedPatterns||[]).some(x=>x==="^automation/environment-feed$"),
    requiredTreeConfigs
  };

  const assessment=assessEnvironment(config,observed);
  await mkdir("environment/state",{recursive:true});
  await mkdir("environment/feeds",{recursive:true});
  await writeFile("environment/state/latest.json",JSON.stringify(assessment,null,2)+"\n");
  for(const feed of config.feeds||[]){
    await mkdir(path.dirname(feed.path),{recursive:true});
    await writeFile(feed.path,JSON.stringify(feedFor(feed.target,assessment,config),null,2)+"\n");
  }
  console.log(JSON.stringify({compatible:assessment.compatible,findings:assessment.findings.length},null,2));
}

if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
