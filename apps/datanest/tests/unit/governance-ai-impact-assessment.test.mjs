import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migration=fs.readFileSync(
  path.join(root,"supabase/migrations/20260929095814_governance_ai_impact_assessments_v1.sql"),
  "utf8"
);
const panel=fs.readFileSync(
  path.join(root,"src/components/GovernanceImprovementPanel.tsx"),
  "utf8"
);
const docs=fs.readFileSync(
  path.join(root,"docs/CONTINUOUS_GOVERNANCE_OPTIMIZATION.md"),
  "utf8"
);

function privateBody(name){
  const start=migration.indexOf("create or replace function private."+name);
  assert.notEqual(start,-1,"missing private function "+name);
  const next=migration.indexOf("create or replace function ",start+40);
  return migration.slice(start,next===-1?migration.length:next);
}

test("AI impact assessments are versioned decision-support evidence, not authority",()=>{
  assert.match(migration,/create table if not exists public\.governance_ai_impact_assessments/);
  assert.match(migration,/create table if not exists public\.governance_ai_impact_reviews/);
  assert.match(migration,/governance_effect boolean not null default false check \(governance_effect=false\)/);
  assert.match(migration,/deployment_authority boolean not null default false check \(deployment_authority=false\)/);
  assert.match(migration,/conformity_claim boolean not null default false check \(conformity_claim=false\)/);
  assert.match(docs,/decision-support review states/i);
});

test("impact authoring is scoped to known standards and preserves supersession history",()=>{
  const body=privateBody("version_governance_ai_impact_assessment_v1");
  assert.match(body,/Owner, Admin or Operator impact-assessment authoring authority is required/);
  assert.match(body,/unknown active standards reference/);
  assert.match(body,/supersedes_id/);
  assert.match(body,/'iso-iec-42005-2025'/);
  assert.match(body,/'iso-iec-23894-2023'/);
  assert.match(body,/'nist-ai-rmf-1-0'/);
  assert.match(body,/'automatic_governance_effect',false/);
  assert.match(body,/'deployment_authority',false/);
});

test("assessment review requires Owner or Admin and remains non-authoritative",()=>{
  const body=privateBody("review_governance_ai_impact_assessment_v1");
  assert.match(body,/Owner or Admin impact-assessment review authority is required/);
  assert.match(body,/target_decision not in \('needs_evidence','needs_action','monitor','closed'\)/);
  assert.match(body,/'deployment_authority',false/);
  assert.match(body,/'automatic_governance_effect',false/);
  assert.doesNotMatch(body,/cast_governance_vote_v1|close_governance_proposal_v1|ratify_governance_protocol_v1/);
});

test("routing requires explicit needs_action review and only creates a normal improvement candidate",()=>{
  const body=privateBody("route_governance_ai_impact_to_improvement_v1");
  assert.match(body,/assessment\.status<>'needs_action'/);
  assert.match(body,/Owner or Admin impact-routing authority is required/);
  assert.match(body,/private\.create_governance_improvement_candidate_v1/);
  assert.match(body,/'no_automatic_deployment',true/);
  assert.match(body,/'no_automatic_vote',true/);
  assert.match(body,/'no_automatic_ratification',true/);
  assert.doesNotMatch(body,/cast_governance_vote_v1|close_governance_proposal_v1|ratify_governance_protocol_v1/);
});

test("impact-assessment tables are RLS read-only surfaces with checked RPC mutation",()=>{
  for(const table of ["governance_ai_impact_assessments","governance_ai_impact_reviews"]){
    assert.match(migration,new RegExp("alter table public\\."+table+" enable row level security"));
    assert.match(migration,new RegExp("revoke all on table public\\."+table+" from public,anon,authenticated"));
    assert.match(migration,new RegExp("grant select on table public\\."+table+" to authenticated"));
  }
  assert.doesNotMatch(migration,/grant (insert|update|delete) on table public\.governance_ai_impact/i);

  for(const fn of [
    "version_governance_ai_impact_assessment_v1",
    "review_governance_ai_impact_assessment_v1",
    "route_governance_ai_impact_to_improvement_v1"
  ]){
    assert.match(migration,new RegExp("create or replace function public\\."+fn+"[\\s\\S]*?security invoker"));
  }
});

test("all impact-assessment foreign-key paths have covering indexes",()=>{
  for(const indexName of [
    "governance_ai_impact_created_by_idx",
    "governance_ai_impact_reviewed_by_idx",
    "governance_ai_impact_candidate_idx",
    "governance_ai_impact_supersedes_idx",
    "governance_ai_impact_reviews_assessment_idx",
    "governance_ai_impact_reviews_reviewed_by_idx"
  ]) assert.match(migration,new RegExp("create index if not exists "+indexName));
});

test("impact assessment is connected to the control-evidence graph",()=>{
  assert.match(migration,/CGO-IMP-001/);
  assert.match(migration,/Versioned AI impact assessment lifecycle/);
  assert.match(migration,/source-artifact-present/);
  assert.match(migration,/'runtime_pass_claim',false/);
  assert.match(migration,/e\.control_id=v_control_id/);
  assert.doesNotMatch(migration,/e\.control_id=control_id/);
});

test("Governance workspace exposes impact authoring, review and explicit routing with pre-migration defaults",()=>{
  assert.match(panel,/AI IMPACT ASSESSMENT/);
  assert.match(panel,/version_governance_ai_impact_assessment_v1/);
  assert.match(panel,/review_governance_ai_impact_assessment_v1/);
  assert.match(panel,/route_governance_ai_impact_to_improvement_v1/);
  assert.match(panel,/impact_assessments:raw\.impact_assessments\|\|\[\]/);
  assert.match(panel,/deployment authority: no/);
  assert.match(panel,/Route to improvement candidate/);
});
