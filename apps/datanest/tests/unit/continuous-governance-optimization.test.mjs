import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migration=fs.readFileSync(
  path.join(root,"supabase/migrations/20260929083316_continuous_governance_optimization_v1.sql"),
  "utf8"
);
const performanceMigration=fs.readFileSync(
  path.join(root,"supabase/migrations/20260929084736_optimize_continuous_governance_fk_indexes.sql"),
  "utf8"
);
const panel=fs.readFileSync(
  path.join(root,"src/components/GovernanceImprovementPanel.tsx"),
  "utf8"
);
const workspace=fs.readFileSync(
  path.join(root,"src/components/GovernanceWorkspace.tsx"),
  "utf8"
);
const docs=fs.readFileSync(
  path.join(root,"docs/CONTINUOUS_GOVERNANCE_OPTIMIZATION.md"),
  "utf8"
);

test("continuous governance uses an append-only evidence and improvement layer",()=>{
  assert.match(migration,/create table if not exists public\.governance_standards_register/);
  assert.match(migration,/create table if not exists public\.governance_observations/);
  assert.match(migration,/create table if not exists public\.governance_improvement_candidates/);
  assert.match(migration,/create table if not exists public\.governance_improvement_reviews/);
  assert.match(migration,/create table if not exists public\.governance_improvement_cycles/);
  assert.match(migration,/authoritative_change boolean not null default false check \(authoritative_change=false\)/);
  assert.match(migration,/governance_effect boolean not null default false check \(governance_effect=false\)/);
});

test("recognized standards are a living applicability register rather than conformity claims",()=>{
  for(const key of [
    "iso-iec-42001-2023",
    "iso-iec-42005-2025",
    "iso-iec-23894-2023",
    "iso-30401-2018",
    "iso-31000-2018",
    "iso-37301-2021",
    "iso-iec-38500-2024",
    "iso-iec-38507-2022",
    "iso-iec-38505-1-2026",
    "iso-iec-27001-2022",
    "iso-iec-27701-2025",
    "iso-iec-5338-2023",
    "iso-iec-5259-series",
    "nist-ai-rmf-1-0",
    "nist-csf-2-0",
    "oecd-ai-principles-2024"
  ])assert.match(migration,new RegExp(key));
  assert.match(migration,/'reference'/);
  assert.match(migration,/'conformity_claim',false/);
  assert.match(migration,/review_governance_standard_v1/);
  assert.match(migration,/now\(\)\+interval '90 days'/);
  assert.match(docs,/not a claim of ISO certification/i);
});

test("continuous learning cannot bypass Sovereign Governance authority",()=>{
  assert.match(migration,/'no_automatic_vote',true/);
  assert.match(migration,/'no_automatic_ratification',true/);
  assert.match(migration,/'no_direct_authority_change',true/);
  assert.match(migration,/'evidence_does_not_equal_truth',true/);
  assert.match(migration,/'learning_can_vote',false/);
  assert.match(migration,/'learning_can_close_proposals',false/);
  assert.match(migration,/'learning_can_ratify_protocols',false/);
  assert.match(migration,/'learning_can_grant_roles',false/);
  assert.match(migration,/'learning_can_change_financial_authority',false/);
  assert.match(migration,/'learning_can_amend_contracts',false/);
  assert.doesNotMatch(migration,/perform\s+public\.cast_governance_vote_v1/i);
  assert.doesNotMatch(migration,/perform\s+public\.close_governance_proposal_v1/i);
  assert.doesNotMatch(migration,/perform\s+public\.ratify_governance_protocol_v1/i);
});

test("improvements require evidence then Owner/Admin review before formal proposal routing",()=>{
  assert.match(migration,/An improvement candidate requires observation evidence or a standards reference/);
  assert.match(migration,/Owner or Admin improvement-review authority is required/);
  assert.match(migration,/target_decision not in \('needs_evidence','ready_for_governance','dismissed'\)/);
  assert.match(migration,/candidate\.status<>'ready_for_governance'/);
  assert.match(migration,/public\.create_governance_proposal_v1/);
  assert.match(migration,/target_proposal_type not in \('process_change','operational_rule','advisory'\)/);
  assert.match(migration,/'automatic_vote',false/);
  assert.match(migration,/'automatic_decision',false/);
  assert.match(migration,/'automatic_ratification',false/);
});

test("review cycles preserve descriptive longitudinal evidence without a composite governance score",()=>{
  assert.match(migration,/run_governance_improvement_cycle_v1/);
  assert.match(migration,/previous_cycle_id/);
  assert.match(migration,/'proposal_count'/);
  assert.match(migration,/'distinct_voter_count'/);
  assert.match(migration,/'average_decision_cycle_hours'/);
  assert.match(migration,/'standards_review_due_count'/);
  assert.match(migration,/'standards_review_due'/);
  assert.match(migration,/'high_risk_observations_present'/);
  assert.match(migration,/'open_governance_disputes'/);
  assert.doesNotMatch(migration,/governance_score/i);
});

test("continuous governance is visible as an explicit Governance workspace mode",()=>{
  assert.match(workspace,/GovernanceImprovementPanel/);
  assert.match(workspace,/Learning & Improvement/);
  assert.match(panel,/Learn about governance without learning around governance/);
  assert.match(panel,/Record 90-day review snapshot/);
  assert.match(panel,/Open formal process-change proposal/);
  assert.match(panel,/evidence repetition raises truth: no/);
});

test("exposed governance RPCs are security-invoker wrappers over non-exposed checked implementations",()=>{
  assert.match(migration,/create or replace function private\.record_governance_observation_v1/);
  assert.match(migration,/create or replace function public\.record_governance_observation_v1[\s\S]*security invoker/);
  assert.match(migration,/create or replace function private\.run_governance_improvement_cycle_v1/);
  assert.match(migration,/create or replace function public\.run_governance_improvement_cycle_v1[\s\S]*security invoker/);
  assert.match(migration,/set search_path=''/);
  assert.match(migration,/revoke execute on function private\.record_governance_observation_v1/);
  assert.match(migration,/grant execute on function private\.record_governance_observation_v1[\s\S]*to authenticated/);
});

test("continuous governance covers foreign-key lookup paths flagged by production advisors",()=>{
  for(const indexName of [
    "governance_standards_created_by_idx",
    "governance_standards_reviewed_by_idx",
    "governance_observations_recorded_by_idx",
    "governance_improvement_candidates_created_by_idx",
    "governance_improvement_candidates_reviewed_by_idx",
    "governance_improvement_reviews_reviewed_by_idx",
    "governance_improvement_cycles_created_by_idx",
    "governance_improvement_cycles_previous_cycle_idx"
  ]) assert.match(performanceMigration,new RegExp("create index if not exists "+indexName));
  assert.doesNotMatch(performanceMigration,/alter table|grant |revoke |create policy|drop policy/i);
});

test("database access keeps evidence tables read-only and mutations behind governed RPCs",()=>{
  for(const table of [
    "governance_standards_register",
    "governance_observations",
    "governance_improvement_candidates",
    "governance_improvement_reviews",
    "governance_improvement_cycles"
  ]){
    assert.match(migration,new RegExp("alter table public\\."+table+" enable row level security"));
    assert.match(migration,new RegExp("revoke all on table public\\."+table+" from public,anon,authenticated"));
    assert.match(migration,new RegExp("grant select on table public\\."+table+" to authenticated"));
  }
});
