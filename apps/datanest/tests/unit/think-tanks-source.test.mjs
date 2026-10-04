import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync(
  new URL("../../supabase/migrations/20260925022558_datanest_think_tanks_v1.sql",import.meta.url),
  "utf8"
);
const workspace=readFileSync(
  new URL("../../src/components/ThinkTankWorkspace.tsx",import.meta.url),
  "utf8"
);
const app=readFileSync(
  new URL("../../src/components/DataNestApp.tsx",import.meta.url),
  "utf8"
);

test("Think Tanks are project-scoped and exposed in DataNest navigation",()=>{
  assert.match(app,/label:"Think Tanks"/);
  assert.match(app,/view==="thinktank"/);
  assert.match(workspace,/THINK TANKS \+ DATANEST AI/);
  assert.match(migration,/private\.has_project_access\(project_id\)/);
});

test("Think Tank AI responses must be linked to a governed Job request",()=>{
  assert.match(migration,/public\.ai_usage_requests%rowtype/);
  assert.match(migration,/job_id=ctx\.job_id/);
  assert.match(migration,/user_id=caller/);
  assert.match(migration,/target_trace_id not like 'DN-AI-%'/);
  assert.match(workspace,/supabase\.functions\.invoke\("datanest-ai-chat"/);
  assert.match(workspace,/DataNest AI commands require a Job-linked Think Tank channel/);
  assert.match(workspace,/record_think_tank_ai_message_v1/);
});

test("decisions and learning require independent human review",()=>{
  assert.match(migration,/A stakeholder cannot confirm their own decision proposal/);
  assert.match(migration,/A stakeholder cannot approve their own learning candidate/);
  assert.match(workspace,/Independent owner\/admin confirmation required/);
  assert.match(workspace,/Independent review required/);
});

test("reviewed learning enters certified retrieval without automatic training or contribution acceptance",()=>{
  assert.match(migration,/'think_tank_human_reviewed'/);
  assert.match(migration,/'reusable_knowledge'/);
  assert.match(migration,/'submitted'/);
  assert.match(migration,/'uncertified'/);
  assert.match(migration,/'not_eligible'/);
  assert.match(migration,/'automatic_model_training',false/);
  assert.match(migration,/'contribution_auto_accepted',false/);
  assert.doesNotMatch(migration,/update public\.project_members\s+set role/i);
  assert.match(workspace,/does not retrain the model, auto-accept contribution value, mint Sparks, or grant authority/);
});

test("Think Tank command surface includes governed collaboration workflows",()=>{
  for(const command of ["answer","summarize","record_decision","extract_actions","propose_learning"]){
    assert.match(workspace,new RegExp(command));
  }
  assert.match(workspace,/ACTION:/);
  assert.match(workspace,/propose_think_tank_learning_v1/);
  assert.match(workspace,/create_think_tank_decision_v1/);
  assert.match(workspace,/create_think_tank_action_v1/);
});
