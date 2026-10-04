import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migration=fs.readFileSync(
  path.join(root,"supabase/migrations/20260929091545_governance_control_evidence_graph_v1.sql"),
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

function functionBody(name){
  const start=migration.indexOf("create or replace function private."+name);
  assert.notEqual(start,-1,"missing private function "+name);
  const next=migration.indexOf("create or replace function ",start+40);
  return migration.slice(start,next===-1?migration.length:next);
}

test("control-evidence graph is project-scoped, append-only and non-authoritative",()=>{
  for(const table of [
    "governance_control_catalog",
    "governance_control_evidence",
    "governance_standard_watch_events"
  ]) assert.match(migration,new RegExp("create table if not exists public\\."+table));

  assert.match(migration,/governance_effect boolean not null default false check \(governance_effect=false\)/);
  assert.match(migration,/authoritative_change boolean not null default false check \(authoritative_change=false\)/);
  assert.match(migration,/'evidence_frequency_increases_truth_status',false/);
  assert.match(migration,/'control_catalog_creates_authority',false/);
});

test("relevant open provenance and control standards are registered as references, not conformity claims",()=>{
  for(const key of ["w3c-prov-o-2013","nist-oscal-1-2-2","slsa-1-2"]){
    assert.match(migration,new RegExp(key));
  }
  assert.match(migration,/W3C PROV-O/);
  assert.match(migration,/NIST OSCAL/);
  assert.match(migration,/SLSA specification/);
  assert.match(migration,/'conformity_claim',false/);
  assert.match(docs,/NIST states that AI RMF 1\.0 is being revised/i);
});

test("baseline controls map standards to implementation without claiming runtime success",()=>{
  for(const key of ["CGO-AUTH-001","CGO-STD-001","CGO-PROV-001","CGO-REL-001"]){
    assert.match(migration,new RegExp(key));
  }
  assert.match(migration,/'claim_scope','source-artifact-present'/);
  assert.match(migration,/'runtime_pass_claim',false/);
  assert.match(docs,/standards reference → implementation control → source implementation → test\/workflow\/deployment\/operational evidence/);
});

test("standards watch creates evidence but cannot rewrite applicability or create governance automatically",()=>{
  const body=functionBody("record_governance_standard_watch_event_v1");
  assert.match(body,/private\.record_governance_observation_v1/);
  assert.match(body,/'standards_change'/);
  assert.match(body,/'automatic_applicability_change',false/);
  assert.match(body,/'automatic_standard_mutation',false/);
  assert.match(body,/'automatic_candidate_creation',false/);
  assert.doesNotMatch(body,/review_governance_standard_v1/);
  assert.doesNotMatch(body,/create_governance_improvement_candidate_v1/);
  assert.doesNotMatch(body,/cast_governance_vote_v1|close_governance_proposal_v1|ratify_governance_protocol_v1/);
});

test("control catalog versioning validates project standards and has no governance effect",()=>{
  const body=functionBody("version_governance_control_v1");
  assert.match(body,/Owner or Admin control-catalog authority is required/);
  assert.match(body,/unknown active standards reference/);
  assert.match(body,/'conformity_claim',false/);
  assert.match(body,/'governance_effect',false/);
  assert.doesNotMatch(body,/cast_governance_vote_v1|close_governance_proposal_v1|ratify_governance_protocol_v1/);
});

test("control evidence accepts operators but remains provenance only",()=>{
  const body=functionBody("record_governance_control_evidence_v1");
  assert.match(body,/owner','admin','operator/);
  assert.match(body,/'conformity_claim',false/);
  assert.match(body,/'authoritative_change',false/);
  assert.match(body,/GOVERNANCE_CONTROL_EVIDENCE_RECORDED/);
});

test("new tables use RLS, read-only table grants and covering foreign-key indexes",()=>{
  for(const table of [
    "governance_control_catalog",
    "governance_control_evidence",
    "governance_standard_watch_events"
  ]){
    assert.match(migration,new RegExp("alter table public\\."+table+" enable row level security"));
    assert.match(migration,new RegExp("revoke all on table public\\."+table+" from public,anon,authenticated"));
    assert.match(migration,new RegExp("grant select on table public\\."+table+" to authenticated"));
  }
  assert.doesNotMatch(migration,/grant (insert|update|delete) on table public\.governance_/i);

  for(const indexName of [
    "governance_control_catalog_created_by_idx",
    "governance_control_catalog_supersedes_idx",
    "governance_control_evidence_control_idx",
    "governance_control_evidence_recorded_by_idx",
    "governance_standard_watch_standard_idx",
    "governance_standard_watch_observation_idx",
    "governance_standard_watch_recorded_by_idx"
  ]) assert.match(migration,new RegExp("create index if not exists "+indexName));
});

test("public mutation surface stays SECURITY INVOKER over checked private functions",()=>{
  for(const fn of [
    "version_governance_control_v1",
    "record_governance_control_evidence_v1",
    "record_governance_standard_watch_event_v1"
  ]){
    assert.match(migration,new RegExp("create or replace function public\\."+fn+"[\\s\\S]*?security invoker"));
    assert.match(migration,new RegExp("revoke execute on function public\\."+fn+"[\\s\\S]*?from public,anon"));
  }
});

test("Governance workspace exposes control evidence and standards lifecycle watch with safe pre-migration defaults",()=>{
  assert.match(panel,/CONTROL-EVIDENCE GRAPH/);
  assert.match(panel,/Standards lifecycle watch/);
  assert.match(panel,/record_governance_control_evidence_v1/);
  assert.match(panel,/record_governance_standard_watch_event_v1/);
  assert.match(panel,/controls:raw\.controls\|\|\[\]/);
  assert.match(panel,/standard_watch:raw\.standard_watch\|\|\[\]/);
  assert.match(panel,/automatic applicability change: no/);
  assert.match(panel,/governance effect: no/);
});
