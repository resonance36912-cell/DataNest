import test from "node:test";
import assert from "node:assert/strict";
import { buildRegulatorState } from "../../scripts/regulator-engine.mjs";

const config={
  botsquadRoles:[
    {id:"regulator-auditor"},
    {id:"regulator-stress-tester"},
    {id:"regulator-acquisition-scout"},
    {id:"regulator-supply-coordinator"},
    {id:"regulator-action-planner"}
  ],
  controls:{
    mayPurchase:false,mayCommitFunds:false,mayAcquireCredentials:false,
    mayBypassSecurity:false,mayChangeBoundaries:false,mayMerge:false,mayDeployProduction:false
  }
};
const boundaries={scopes:[{id:"a"}],hardRules:[{id:"b"}]};
const validSources={
  guardian:{schemaVersion:"datanest-guardian-snapshot-v1",productionAuthorization:false,status:"healthy",drift:{optimalConditionDrift:[]}},
  enforcer:{schemaVersion:"datanest-enforcer-assessment-v1",productionAuthorization:false,status:"pass",blockers:[],reviews:[]},
  calmer:{schemaVersion:"datanest-calmer-state-v1",productionAuthorization:false,status:"softening-active"},
  environment:{schemaVersion:"datanest-environment-feed-v1",productionAuthorization:false,environmentCompatible:true,reviewRequired:[]},
  conductor:{schemaVersion:"datanest-conductor-state-v1",productionAuthorization:false,allProcessesFresh:true},
  suggester:{schemaVersion:"datanest-suggester-feed-v1",productionAuthorization:false,suggestions:[]},
  botsquad:{schemaVersion:"datanest-botsquad-consolidated-feed-v1",productionAuthorization:false,risks:[]},
  visibility:{
    schemaVersion:"datanest-visibility-utility-state-v1",
    productionAuthorization:false,
    status:"ready",
    assessment:{seo:{score:92},platform:{coveragePercent:90}},
    missingInputs:[]
  }
};

test("REGULATOR is harmonized when no requirement source is unresolved",()=>{
  const state=buildRegulatorState({
    config,boundaries,
    ...validSources
  });
  assert.equal(state.status,"harmonized");
  assert.equal(state.requirements.length,0);
  assert.equal(state.productionAuthorization,false);
  assert.equal(state.transparency.financialCommitmentsAuthorized,false);
});

test("REGULATOR turns security and health gaps into transparent BOTSQUAD requirements",()=>{
  const state=buildRegulatorState({
    config,boundaries,
    ...validSources,
    guardian:{...validSources.guardian,status:"degraded",drift:{optimalConditionDrift:[{control:"environment",dimension:"runtime"}]}},
    enforcer:{...validSources.enforcer,status:"block",blockers:["security-workflow-failure"]},
    calmer:{...validSources.calmer,status:"softening-suspended"},
    environment:{...validSources.environment,environmentCompatible:false,reviewRequired:[{dimension:"runtime"}]},
    conductor:{...validSources.conductor,allProcessesFresh:false}
  });
  assert.equal(state.status,"blocked");
  assert.ok(state.requirements.length>=4);
  assert.ok(state.botsquadPacket.requirements.every(x=>x.botsquadTasks.includes("audit")));
  assert.ok(state.botsquadPacket.requirements.every(x=>x.botsquadTasks.includes("stress-test")));
  assert.ok(state.botsquadPacket.requirements.every(x=>x.botsquadTasks.includes("acquisition-scout")));
  assert.equal(state.controls.mayPurchase,false);
});

test("REGULATOR deduplicates repeated review suggestions",()=>{
  const suggestion={
    source:"guardian",type:"code-streamlining",
    automationClass:"review-required",priority:"medium",title:"Same",detail:"same",
    fingerprint:"sha256:same"
  };
  const state=buildRegulatorState({
    config,boundaries,
    ...validSources,
    suggester:{...validSources.suggester,suggestions:[suggestion,suggestion]}
  });
  assert.equal(state.requirements.length,1);
});

test("REGULATOR makes missing source evidence visible instead of claiming harmony",()=>{
  const state=buildRegulatorState({config,boundaries});
  assert.equal(state.status,"attention");
  assert.ok(state.requirements.length>=8);
  assert.ok(state.requirements.some(x=>x.title.includes("guardian")));
});

test("REGULATOR converts visibility gaps into market requirements",()=>{
  const state=buildRegulatorState({
    config,boundaries,
    ...validSources,
    visibility:{
      ...validSources.visibility,
      assessment:{seo:{score:65},platform:{coveragePercent:55}},
      missingInputs:["local-trends"]
    }
  });
  assert.equal(state.status,"attention");
  assert.ok(state.requirements.some(x=>x.requirementClass==="market-visibility"&&x.title.includes("visibility baseline")));
  assert.ok(state.requirements.some(x=>x.title.includes("local-trends")));
});

test("REGULATOR does not re-ingest its own SUGGESTER echoes",()=>{
  const state=buildRegulatorState({
    config,boundaries,
    ...validSources,
    suggester:{...validSources.suggester,suggestions:[{
      source:"regulator",
      type:"harmony-requirement",
      automationClass:"review-required",
      priority:"high",
      title:"Resolve ENFORCER review condition",
      detail:"security-workflow-pending",
      fingerprint:"sha256:echo"
    }]}
  });
  assert.equal(state.requirements.length,0);
  assert.equal(state.status,"harmonized");
});
