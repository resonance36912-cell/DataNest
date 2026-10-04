import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWorkflowState,
  evaluateProcessSchedule,
  selectSafeSuggestionAction,
  selectNextCommand
} from "../../scripts/conductor-orchestrator.mjs";

const now=new Date("2026-10-01T10:00:00Z");
const config={
  retryCooldownMinutes:30,
  processOrder:[
    {id:"knowledge",workflow:"knowledge-tree.yml",workflowName:"Knowledge Tree",maxAgeMinutes:360,dependencies:[],dispatch:{enabled:true}},
    {id:"environment",workflow:"environment-tree.yml",workflowName:"ENVIRONMENT Tree",maxAgeMinutes:360,dependencies:[],dispatch:{enabled:true}},
    {id:"enforcer",workflow:"enforcer.yml",workflowName:"ENFORCER Defence Tree",maxAgeMinutes:180,dependencies:["knowledge","environment"],dispatch:{enabled:true}},
    {id:"guardian",workflow:"guardian.yml",workflowName:"GUARDIAN Health & Healing Tree",maxAgeMinutes:30,dependencies:["knowledge","environment","enforcer"],dispatch:{enabled:true}}
  ],
  safeSuggestionActions:{
    "heal-redundant-branches":{
      workflow:"maintenance.yml",
      workflowName:"DataNest Maintenance",
      inputs:{task:"branch-cleaner"},
      requiresSuggestionNewerThanWorkflow:true
    }
  }
};

const run=(minutesAgo,overrides={})=>({
  id:Math.round(minutesAgo*10)+1,
  status:"completed",
  conclusion:"success",
  created_at:new Date(now.getTime()-minutesAgo*60000).toISOString(),
  updated_at:new Date(now.getTime()-minutesAgo*60000).toISOString(),
  ...overrides
});

test("a newer failure invalidates an earlier successful dependency",()=>{
  const workflowStates=states({knowledge:[run(1,{conclusion:"failure"}),run(10)],environment:[run(10)],enforcer:[run(10)],guardian:[run(10)]});
  const processes=evaluateProcessSchedule(config,workflowStates,now);
  assert.equal(processes[0].successFresh,false);
  assert.equal(processes[0].retryCooldown,true);
  assert.ok(processes.find(x=>x.id==="enforcer").blockedBy.includes("knowledge"));
});

test("an older active run prevents a duplicate even after a newer success",()=>{
  const state=normalizeWorkflowState([run(1),run(5,{status:"in_progress",conclusion:null})],now);
  assert.equal(state.active,true);
});

test("downstream runs must start after their latest dependency evidence",()=>{
  const workflowStates=states({knowledge:[run(5)],environment:[run(10)],enforcer:[run(1,{run_started_at:run(15).created_at})],guardian:[run(1)]});
  const processes=evaluateProcessSchedule(config,workflowStates,now);
  const enforcer=processes.find(x=>x.id==="enforcer");
  assert.equal(enforcer.inputsNewer,true);
  assert.equal(enforcer.due,true);
  assert.ok(processes.find(x=>x.id==="guardian").blockedBy.includes("enforcer"));
});

test("old source revisions and future timestamps cannot satisfy the schedule",()=>{
  const old=states({knowledge:[run(1,{head_sha:"a".repeat(40)})]});
  assert.equal(evaluateProcessSchedule(config,old,now,"b".repeat(40))[0].successFresh,false);
  assert.equal(normalizeWorkflowState([run(-5)],now).latestSuccessful.ageMinutes,null);
});

test("invalid dependency graphs fail closed",()=>{
  assert.throws(()=>evaluateProcessSchedule({processOrder:[{id:"a",dependencies:["b"]}]},{},now),/dependency order/);
});

const suggestionFingerprint="sha256:"+"c".repeat(64);
const safeFeed=()=>({schemaVersion:"datanest-suggester-feed-v1",productionAuthorization:false,automationReady:true,
  generatedAt:now.toISOString(),commands:[{automationClass:"autonomous-safe",actionId:"heal-redundant-branches",fingerprint:suggestionFingerprint}]});

test("safe dispatch rejects replayed, stale, future, unauthorized and unready feeds",()=>{
  const workflowStates=states({maintenance:[run(120)]});
  assert.ok(selectSafeSuggestionAction(config,safeFeed(),workflowStates,now));
  assert.equal(selectSafeSuggestionAction(config,safeFeed(),workflowStates,now,{attemptedSuggestions:[suggestionFingerprint]}),null);
  for(const override of [{generatedAt:run(40).created_at},{generatedAt:run(-1).created_at},{productionAuthorization:true},{automationReady:false},{schemaVersion:"invalid"}]){
    assert.equal(selectSafeSuggestionAction(config,{...safeFeed(),...override},workflowStates,now),null);
  }
});

test("command input cannot bypass the active maintenance check",()=>{
  const feed=safeFeed(); feed.commands[0].workflowStateId="invented-id";
  const workflowStates=states({maintenance:[run(1,{status:"in_progress",conclusion:null})]});
  assert.equal(selectSafeSuggestionAction(config,feed,workflowStates,now),null);
});

test("dispatch reservations and active SUGGESTER prevent duplicate work",()=>{
  const workflowStates=states({knowledge:[run(10)],environment:[run(10)],enforcer:[run(10)],guardian:[run(10)],suggester:[run(1,{status:"queued",conclusion:null})]});
  const processes=evaluateProcessSchedule(config,workflowStates,now);
  assert.equal(selectNextCommand(config,processes,{},workflowStates,now),null);
  assert.equal(selectNextCommand(config,processes,{},workflowStates,now,{reservation:{createdAt:run(1).created_at}}),null);
});

test("a visible completed dispatch releases the reservation for the next process",()=>{
  const workflowStates=states({knowledge:[run(1)],environment:[run(10)],enforcer:[run(15)],guardian:[run(10)],suggester:[]});
  const processes=evaluateProcessSchedule(config,workflowStates,now);
  const command=selectNextCommand(config,processes,{},workflowStates,now,{reservation:{createdAt:run(2).created_at,workflow:"knowledge-tree.yml"}});
  assert.equal(command.processId,"enforcer");
});

function states(values){
  return Object.fromEntries(Object.entries(values).map(([id,runs])=>[id,normalizeWorkflowState(runs,now)]));
}

test("CONDUCTOR dispatches the oldest required dependency before its dependent process",()=>{
  const workflowStates=states({
    knowledge:[run(500)],
    environment:[run(10)],
    enforcer:[run(250)],
    guardian:[run(60)],
    suggester:[],
    maintenance:[run(10)]
  });
  const processes=evaluateProcessSchedule(config,workflowStates,now);
  const command=selectNextCommand(config,processes,{},workflowStates,now);
  assert.equal(command.type,"process-dispatch");
  assert.equal(command.processId,"knowledge");
});

test("CONDUCTOR does not duplicate an active workflow",()=>{
  const workflowStates=states({
    knowledge:[run(1,{status:"in_progress",conclusion:null}),run(500)],
    environment:[run(10)],
    enforcer:[run(10)],
    guardian:[run(10)],
    suggester:[],
    maintenance:[run(10)]
  });
  const processes=evaluateProcessSchedule(config,workflowStates,now);
  const knowledge=processes.find(x=>x.id==="knowledge");
  assert.equal(knowledge.active,true);
  assert.equal(knowledge.due,false);
  const command=selectNextCommand(config,processes,{},workflowStates);
  assert.equal(command.type,"wait");
  assert.equal(command.workflow,null);
});

test("CONDUCTOR triggers SUGGESTER when process graph is fresh",()=>{
  const workflowStates=states({
    knowledge:[run(10)],
    environment:[run(10)],
    enforcer:[run(10)],
    guardian:[run(10)],
    suggester:[],
    maintenance:[run(10)]
  });
  const processes=evaluateProcessSchedule(config,workflowStates,now);
  const command=selectNextCommand(config,processes,{},workflowStates,now);
  assert.equal(command.type,"trigger-suggester");
  assert.equal(command.workflow,"suggester.yml");
});

test("CONDUCTOR consumes allowlisted SUGGESTER autonomous commands after synchronization",()=>{
  const workflowStates=states({
    knowledge:[run(10)],
    environment:[run(10)],
    enforcer:[run(10)],
    guardian:[run(10)],
    suggester:[],
    maintenance:[run(120)]
  });
  const processes=evaluateProcessSchedule(config,workflowStates,now);
  const suggester={
    schemaVersion:"datanest-suggester-feed-v1",productionAuthorization:false,automationReady:true,
    generatedAt:new Date(now.getTime()-30*60000).toISOString(),
    commands:[{
      actionId:"heal-redundant-branches",
      automationClass:"autonomous-safe",
      fingerprint:"sha256:"+"a".repeat(64)
    }]
  };
  const command=selectNextCommand(config,processes,suggester,workflowStates,now);
  assert.equal(command.type,"safe-suggestion-dispatch");
  assert.equal(command.workflow,"maintenance.yml");
  assert.equal(command.inputs.task,"branch-cleaner");
});

test("CONDUCTOR treats a newer failed prerequisite as stale even when an older success is fresh",()=>{
  const workflowStates=states({
    knowledge:[
      run(40,{id:100,status:"completed",conclusion:"failure"}),
      run(60,{id:99,status:"completed",conclusion:"success"})
    ],
    environment:[run(10)],
    enforcer:[run(10)],
    guardian:[run(10)],
    maintenance:[run(10)]
  });
  const processes=evaluateProcessSchedule(config,workflowStates,now);
  const knowledge=processes.find(x=>x.id==="knowledge");
  const enforcer=processes.find(x=>x.id==="enforcer");
  assert.equal(knowledge.operationalFresh,false);
  assert.equal(knowledge.due,true);
  assert.equal(enforcer.dependenciesReady,false);
  const command=selectNextCommand(config,processes,{},workflowStates);
  assert.equal(command.processId,"knowledge");
});
