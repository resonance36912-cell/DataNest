import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { buildGuardianSnapshot } from "../../scripts/guardian-health.mjs";

const dimensions=[
  "source-control","runtime","ci-runner","delivery","backend","ai-inference",
  "registry","backup-recovery","dependency-posture","branch-hygiene","evidence-observability"
];

const blueprint={
  schemaVersion:"datanest-guardian-blueprint-v1",
  blueprintVersion:1,
  requiredTrees:[{id:"knowledge"},{id:"boundaries"},{id:"botsquad"},{id:"environment"},{id:"enforcer"},{id:"guardian"},{id:"conductor"},{id:"suggester"},{id:"calmer"},{id:"regulator"},{id:"visibility-utility"}],
  environment:{requiredDimensions:dimensions,requiredStatus:"compatible",requiredCompatible:true},
  coordination:{conductorMaxAgeMinutes:30,suggesterMaxAgeMinutes:30,requiredConductorAuthority:"process-synchronization",requiredSuggesterAuthority:"optimization-advisory"},
  feedFreshness:{calmerMinutes:45,regulatorMinutes:45,visibilityUtilityMinutes:240},
  governanceHarmony:{calmerHardControlsRemoved:0,regulatorFinancialCommitmentsAuthorized:false},
  marketVisibility:{minimumSeoScore:80,minimumPlatformCoveragePercent:70},
  knowledge:{minimumApprovedItems:1},
  sourceHealth:{maximumHighReviewerFindings:0},
  healthThresholds:{healthy:90,criticalBelow:70}
};

const config={healing:{autonomous:["safe"]}};
const environment={
  schemaVersion:"datanest-environment-feed-v1",
  generatedAt:"2026-10-01T07:50:00Z",
  target:"guardian",
  productionAuthorization:false,
  environmentCompatible:true,
  findings:dimensions.map(dimension=>({dimension,status:"compatible",detail:"ok",adaptationClass:"none"})),
  reviewRequired:[]
};
const enforcer={schemaVersion:"datanest-enforcer-assessment-v1",generatedAt:"2026-10-01T07:50:00Z",productionAuthorization:false,status:"pass",blockers:[],reviews:[]};
const knowledge={
  schemaVersion:"datanest-knowledge-feed-v1",
  generatedAt:"2026-10-01T07:50:00Z",
  target:"datanest",
  productionAuthorization:false,
  itemCount:5,
  items:[{id:"1"}]
};
const botsquad={
  schemaVersion:"datanest-botsquad-consolidated-feed-v1",
  generatedAt:"2026-10-01T07:50:00Z",
  target:"datanest",
  productionAuthorization:false,
  botCount:9
};
const treeContracts={knowledge:true,boundaries:true,botsquad:true,environment:true,enforcer:true,guardian:true,conductor:true,suggester:true,calmer:true,regulator:true,"visibility-utility":true};
const conductorState={schemaVersion:"datanest-conductor-state-v1",productionAuthorization:false,generatedAt:"2026-10-01T07:50:00.000Z",authority:"process-synchronization",allProcessesFresh:true,nextCommand:{type:"trigger-suggester"}};
const suggesterFeed={schemaVersion:"datanest-suggester-feed-v1",productionAuthorization:false,generatedAt:"2026-10-01T07:55:00.000Z",authority:"optimization-advisory",summary:{total:0,autonomousSafe:0}};
const calmerState={schemaVersion:"datanest-calmer-state-v1",productionAuthorization:false,generatedAt:"2026-10-01T07:55:00.000Z",status:"softening-active",tier:"GOLD",summary:{hardControlsRemoved:0}};
const regulatorState={schemaVersion:"datanest-regulator-state-v1",productionAuthorization:false,generatedAt:"2026-10-01T07:55:00.000Z",status:"harmonized",transparency:{requirementCount:0,financialCommitmentsAuthorized:false}};
const visibilityState={schemaVersion:"datanest-visibility-utility-state-v1",productionAuthorization:false,generatedAt:"2026-10-01T07:55:00.000Z",status:"ready",assessment:{seo:{score:95},visibilityScore:90,platform:{coveragePercent:90}}};
const sourceState={"config/a.json":{sha256:"sha256:a",bytes:1}};
const reviewerReport={summary:{filesReviewed:20,high:0,medium:0,low:0,findings:0},refinements:[],nextSteps:[]};
const branchReport={github:{branches:[
  {name:"main",classification:{decision:"keep",status:"identical"}}
]},apply:{deleted:[],failed:[]}};

test("GUARDIAN CLI binds snapshots to checkout rather than an unrelated event SHA",async()=>{
  const root=await mkdtemp(path.join(tmpdir(),"guardian-sha-"));
  try{
    await mkdir(path.join(root,"config"));
    await writeFile(path.join(root,"config/guardian.tree.json"),JSON.stringify({remoteRepositories:[],feeds:[]}));
    await writeFile(path.join(root,"config/guardian.blueprint.json"),JSON.stringify({requiredTrees:[],blueprintSources:[]}));
    const git=(...args)=>execFileSync("git",args,{cwd:root,encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
    git("init");git("add","config");
    git("-c","user.name=Guardian test","-c","user.email=guardian@example.invalid","commit","-m","fixture");
    execFileSync(process.execPath,[fileURLToPath(new URL("../../scripts/guardian-health.mjs",import.meta.url)),"--out-dir","output"],{
      cwd:root,env:{...process.env,GITHUB_SHA:"f".repeat(40)},stdio:"pipe"
    });
    const output=JSON.parse(await readFile(path.join(root,"output/snapshots/latest.json"),"utf8"));
    assert.equal(output.headSha,git("rev-parse","HEAD"));
    assert.notEqual(output.headSha,"f".repeat(40));
  }finally{await rm(root,{recursive:true,force:true});}
});

function snapshot(overrides={}){
  return buildGuardianSnapshot({
    config,blueprint,environment,enforcer,knowledge,botsquad,conductorState,suggesterFeed,calmerState,regulatorState,visibilityState,branchReport,reviewerReport,
    previousSnapshot:null,sourceState,treeContracts,headSha:"a".repeat(40),
    generatedAt:"2026-10-01T08:00:00.000Z",
    ...overrides
  });
}

test("GUARDIAN reports optimal blueprint health",()=>{
  const result=snapshot();
  assert.equal(result.status,"healthy");
  assert.equal(result.health.score,100);
  assert.equal(result.productionAuthorization,false);
  assert.equal(result.drift.optimalConditionDrift.length,0);
});

test("missing source and branch reports cannot produce healthy evidence",()=>{
  const result=snapshot({reviewerReport:{},branchReport:{}});
  assert.notEqual(result.status,"healthy");
  assert.equal(result.observed.source.available,false);
  assert.equal(result.observed.branches.available,false);
  assert.ok(result.drift.optimalConditionDrift.some(x=>x.control==="source-health"));
  assert.ok(result.drift.optimalConditionDrift.some(x=>x.control==="branch-health"));
});

test("expired, future and authority-changing defensive evidence is critical",()=>{
  for(const overrides of [{generatedAt:"2026-09-01T00:00:00Z"},{generatedAt:"2026-10-02T00:00:00Z"},{productionAuthorization:true}]){
    const result=snapshot({enforcer:{...enforcer,...overrides}});
    assert.equal(result.status,"critical");
  }
});

test("required trees and blueprint sources are checked even when omitted from observations",()=>{
  const result=snapshot({treeContracts:{},blueprint:{...blueprint,blueprintSources:["config/expected.json"]}});
  assert.equal(result.status,"critical");
  assert.ok(result.observed.trees.missing.includes("guardian"));
  assert.ok(result.drift.optimalConditionDrift.some(x=>x.control==="blueprint-integrity"));
});

test("unique, unknown and open-PR branches never become autonomous candidates",()=>{
  const result=snapshot({branchReport:{github:{branches:[
    {name:"unique",classification:{decision:"delete_candidate",status:"ahead",ahead:1}},
    {name:"unknown",classification:{decision:"delete_candidate",status:"unknown",ahead:0}},
    {name:"open-pr",openPr:{number:1},classification:{decision:"delete_candidate",status:"behind",ahead:0}}
  ]}}});
  assert.deepEqual(result.healing.candidates.redundantBranches,[]);
});

test("removed blueprint sources remain visible in snapshot drift",()=>{
  const result=snapshot({previousSnapshot:snapshot(),sourceState:{}});
  assert.deepEqual(result.drift.sincePrevious.sourceChanges,[{path:"config/a.json",before:"sha256:a",after:null}]);
});

test("GUARDIAN enters healing state for provably redundant branches",()=>{
  const result=snapshot({
    branchReport:{github:{branches:[
      {name:"main",classification:{decision:"keep",status:"identical"}},
      {name:"old-merged",classification:{decision:"delete_candidate",ahead:0,status:"behind"}}
    ]},apply:{deleted:[],failed:[]}}
  });
  assert.equal(result.status,"healing");
  assert.deepEqual(result.healing.candidates.redundantBranches,["old-merged"]);
  assert.ok(result.health.score>=90);
});

test("GUARDIAN treats ENFORCER block as critical",()=>{
  const result=snapshot({enforcer:{status:"block",blockers:["security-workflow-failure"],reviews:[]}});
  assert.equal(result.status,"critical");
  assert.equal(result.observed.enforcer.status,"block");
  assert.ok(result.drift.optimalConditionDrift.some(x=>x.control==="enforcer"));
});

test("GUARDIAN measures source and ENVIRONMENT changes against previous snapshot",()=>{
  const previous=snapshot();
  const changedEnvironment={
    ...environment,
    findings:environment.findings.map(item=>item.dimension==="runtime"?{...item,status:"review"}:item),
    environmentCompatible:false
  };
  const result=snapshot({
    environment:changedEnvironment,
    sourceState:{"config/a.json":{sha256:"sha256:b",bytes:2}},
    previousSnapshot:previous
  });
  assert.equal(result.status,"degraded");
  assert.equal(result.drift.sincePrevious.sourceChanges.length,1);
  assert.ok(result.drift.sincePrevious.environmentChanges.some(x=>x.dimension==="runtime"));
  assert.ok(result.drift.optimalConditionDrift.some(x=>x.dimension==="runtime"));
});

test("GUARDIAN degrades when a required tree contract or BOTSQUAD feed is missing",()=>{
  const result=snapshot({
    treeContracts:{...treeContracts,guardian:false},
    botsquad:{}
  });
  assert.equal(result.status,"critical");
  assert.ok(result.observed.trees.missing.includes("guardian"));
  assert.ok(result.drift.optimalConditionDrift.some(x=>x.control==="botsquad-feed"));
});

test("GUARDIAN degrades when coordination state is stale",()=>{
  const result=snapshot({
    conductorState:{...conductorState,generatedAt:"2026-10-01T06:00:00.000Z"},
    suggesterFeed:{...suggesterFeed,generatedAt:"2026-10-01T06:00:00.000Z"}
  });
  assert.equal(result.status,"degraded");
  assert.ok(result.drift.optimalConditionDrift.some(x=>x.control==="coordination"));
});

test("GUARDIAN treats explicit CALMER or REGULATOR boundary violation as critical",()=>{
  const calmerViolation=snapshot({calmerState:{...calmerState,summary:{hardControlsRemoved:1}}});
  assert.equal(calmerViolation.status,"critical");
  const regulatorViolation=snapshot({regulatorState:{...regulatorState,transparency:{financialCommitmentsAuthorized:true}}});
  assert.equal(regulatorViolation.status,"critical");
});

test("GUARDIAN degrades on weak or missing VISIBILITY-UTILITY evidence",()=>{
  const weak=snapshot({visibilityState:{...visibilityState,assessment:{...visibilityState.assessment,seo:{score:60}}}});
  assert.equal(weak.status,"degraded");
  assert.ok(weak.drift.optimalConditionDrift.some(x=>x.control==="market-visibility"));

  const missing=snapshot({visibilityState:{}});
  assert.equal(missing.status,"degraded");
  assert.ok(missing.observed.sourceEvidence.visibility.reasons.length>0);
});
