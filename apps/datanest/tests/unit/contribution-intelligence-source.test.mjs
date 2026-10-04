import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260925015523_datanest_contribution_intelligence_v1.sql", import.meta.url),
  "utf8"
);
const workspace = readFileSync(
  new URL("../../src/components/StakeholderWorkspace.tsx", import.meta.url),
  "utf8"
);

test("contribution intelligence uses the governed multidimensional reputation model",()=>{
  assert.match(migration,/impact_weight numeric not null default 0\.50/);
  assert.match(migration,/quality_weight numeric not null default 0\.20/);
  assert.match(migration,/collaboration_weight numeric not null default 0\.15/);
  assert.match(migration,/governance_weight numeric not null default 0\.10/);
  assert.match(migration,/knowledge_weight numeric not null default 0\.05/);
  assert.match(migration,/'rank_investment',false/);
  assert.match(migration,/'rank_sparks_balance',false/);
});

test("anti-gaming signals remain human-reviewed instead of silently penalizing open signals",()=>{
  assert.match(migration,/'reused_evidence'/);
  assert.match(migration,/'self_review'/);
  assert.match(migration,/'burst_certification'/);
  assert.match(migration,/'open_anomaly_is_penalty',false/);
  assert.match(migration,/open_signals_are_not_reputation_penalties/);
  assert.match(migration,/target_status not in \('confirmed','dismissed','resolved'\)/);
  assert.match(migration,/A stakeholder cannot adjudicate their own anomaly signal/);
});

test("progression requires independent human approval and does not grant a project role",()=>{
  assert.match(migration,/'progression_requires_human_approval',true/);
  assert.match(migration,/A stakeholder cannot approve their own progression/);
  assert.match(migration,/'grants_project_role',false/);
  assert.doesNotMatch(migration,/update public\.project_members\s+set role/i);
});

test("N0nymous Squad is pseudonymous, opt-in and capped at ten without authority",()=>{
  assert.match(migration,/squad_opt_in boolean not null default false/);
  assert.match(migration,/rank integer not null check \(rank between 1 and 10\)/);
  assert.match(migration,/'N0-'\s*\|\|\s*upper\(substr/);
  assert.match(migration,/where candidates\.squad_rank<=10/);
  assert.match(migration,/'squad_grants_admin',false/);
  assert.match(workspace,/N0NYMOUS SQUAD/);
  assert.match(workspace,/Authority/);
  assert.match(workspace,/None granted/);
});

test("stakeholder UI exposes trust, anomaly, rankings and explicit governance boundaries",()=>{
  assert.match(workspace,/90-day reputation/);
  assert.match(workspace,/Lifetime reputation/);
  assert.match(workspace,/Trust score/);
  assert.match(workspace,/Anomaly score/);
  assert.match(workspace,/Open signals are review flags, not penalties/);
  assert.match(workspace,/Progression recommendations require human approval/);
  assert.match(workspace,/Join consideration/);
});
