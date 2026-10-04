import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migration=fs.readFileSync(
  path.join(root,"supabase/migrations/20260929102655_governance_outcome_feedback_v1.sql"),
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

test("outcome feedback bridge is append-only and non-authoritative",()=>{
  assert.match(migration,/create table if not exists public\.governance_outcome_feedback_links/);
  assert.match(migration,/source_outcome_evidence_id uuid not null unique/);
  assert.match(migration,/authoritative_change boolean not null default false check \(authoritative_change=false\)/);
  assert.match(migration,/memory_truth_changed boolean not null default false check \(memory_truth_changed=false\)/);
  assert.match(migration,/automatic_candidate_created boolean not null default false check \(automatic_candidate_created=false\)/);
});

test("only adverse Certified Memory outcomes can be routed and routing is Owner/Admin only",()=>{
  const body=privateBody("route_certified_memory_outcome_to_governance_v1");
  assert.match(body,/for update/);
  assert.match(body,/Owner or Admin outcome-feedback routing authority is required/);
  assert.match(body,/outcome\.signal not in \('challenged','contradicted'\)/);
  assert.match(body,/Only challenged or contradicted Certified Memory outcomes/);
  assert.match(body,/select l\.observation_id into existing_observation/);
  assert.match(body,/if existing_observation is not null then\s+return existing_observation;/);
});

test("routing creates one governance observation without changing Certified Memory truth or candidates",()=>{
  const body=privateBody("route_certified_memory_outcome_to_governance_v1");
  assert.match(body,/private\.record_governance_observation_v1/);
  assert.match(body,/'certified_memory_review'/);
  assert.match(body,/'truth_status_changed',false/);
  assert.match(body,/'certification_changed',false/);
  assert.match(body,/'confidence_changed',false/);
  assert.match(body,/'automatic_candidate_created',false/);
  assert.doesNotMatch(body,/update public\.certified_memory/i);
  assert.doesNotMatch(body,/create_governance_improvement_candidate_v1/);
  assert.doesNotMatch(body,/cast_governance_vote_v1|close_governance_proposal_v1|ratify_governance_protocol_v1/);
});

test("workspace exposes adverse outcomes only to Owner/Admin and omits raw source evidence payload",()=>{
  const body=privateBody("get_governance_improvement_workspace_v1");
  assert.match(body,/if caller_role in \('owner','admin'\) then/);
  assert.match(body,/o\.signal in \('challenged','contradicted'\)/);
  assert.match(body,/'can_route_outcome_feedback',caller_role in \('owner','admin'\)/);
  assert.match(body,/'outcome_feedback',coalesce\(outcome_feedback,'\[\]'::jsonb\)/);
  assert.match(body,/'outcome_feedback_changes_memory_truth_status',false/);
  assert.match(body,/'outcome_feedback_creates_improvement_candidate_automatically',false/);
  assert.doesNotMatch(body,/o\.evidence/);
});

test("outcome feedback table uses RLS, Owner/Admin read policy and no direct authenticated writes",()=>{
  assert.match(migration,/alter table public\.governance_outcome_feedback_links enable row level security/);
  assert.match(migration,/pm\.role in \('owner','admin'\)/);
  assert.match(migration,/revoke all on table public\.governance_outcome_feedback_links from public,anon,authenticated/);
  assert.match(migration,/grant select on table public\.governance_outcome_feedback_links to authenticated/);
  assert.doesNotMatch(migration,/grant (insert|update|delete) on table public\.governance_outcome_feedback_links/i);
});

test("public routing API remains SECURITY INVOKER over checked private function",()=>{
  assert.match(
    migration,
    /create or replace function public\.route_certified_memory_outcome_to_governance_v1[\s\S]*?security invoker/
  );
  assert.match(
    migration,
    /revoke execute on function public\.route_certified_memory_outcome_to_governance_v1\(uuid,text,text\)\s+from public,anon/
  );
  assert.match(
    migration,
    /grant execute on function public\.route_certified_memory_outcome_to_governance_v1\(uuid,text,text\)\s+to authenticated/
  );
});

test("outcome-feedback control is mapped into the control-evidence graph",()=>{
  assert.match(migration,/CGO-OUT-001/);
  assert.match(migration,/Governed outcome-feedback bridge/);
  assert.match(migration,/iso-30401-2018/);
  assert.match(migration,/iso-iec-42001-2023/);
  assert.match(migration,/iso-iec-5259-series/);
  assert.match(migration,/nist-ai-rmf-1-0/);
});

test("Governance UI exposes explicit outcome routing with pre-migration-safe defaults",()=>{
  assert.match(panel,/OUTCOME FEEDBACK/);
  assert.match(panel,/route_certified_memory_outcome_to_governance_v1/);
  assert.match(panel,/outcome_feedback:raw\.outcome_feedback\|\|\[\]/);
  assert.match(panel,/truth status changed: no/);
  assert.match(panel,/Route to governance observation/);
  assert.match(panel,/outcome feedback changes memory truth: no/);
});

test("documentation advances the baseline and records the implemented roadmap boundary",()=>{
  assert.match(docs,/Version: `continuous-governance-v1\.3`/);
  assert.match(docs,/Outcome feedback integration/);
  assert.match(docs,/challenged or contradicted use outcome → human routing review → append-only governance observation/);
  assert.match(docs,/outcome feedback integration.*implemented in v1\.3/i);
});
