import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migrationPath=path.join(root,"supabase/migrations/20260927114000_add_retention_policy_foundations.sql");
function sql(){return fs.existsSync(migrationPath)?fs.readFileSync(migrationPath,"utf8"):"";}

test("Phase C retention policy foundation migration exists",()=>{
  assert.equal(fs.existsSync(migrationPath),true,"20260927114000_add_retention_policy_foundations.sql must exist");
});

test("retention policy intent is versioned and non-destructive",()=>{
  const source=sql(); if(!source)return;
  assert.match(source,/create table public\.retention_policies/i);
  for(const value of ["retain","review_due","archive","minimize","delete_when_authorized","legal_hold"]){
    assert.match(source,new RegExp("'"+value+"'","i"));
  }
  assert.match(source,/status[\s\S]*draft[\s\S]*active[\s\S]*superseded[\s\S]*rejected/i);
  assert.doesNotMatch(source,/delete from/i);
  assert.doesNotMatch(source,/truncate\s+/i);
  assert.doesNotMatch(source,/anonymi[sz]e/i);
});

test("Trust Manifest receives an indexed nullable retention policy reference",()=>{
  const source=sql(); if(!source)return;
  assert.match(source,/alter table public\.trust_manifests[\s\S]*add column if not exists retention_policy_id uuid/i);
  assert.match(source,/references public\.retention_policies\(id\)/i);
  assert.match(source,/trust_manifests_retention_policy_idx/i);
});

test("retention holds, reviews, and lineage are project scoped",()=>{
  const source=sql(); if(!source)return;
  for(const table of ["retention_holds","retention_reviews","data_policy_lineage"]){
    assert.match(source,new RegExp("create table public\\."+table,"i"));
    assert.match(source,new RegExp("project_id uuid not null references public\\.projects\\(id\\)","i"));
    assert.match(source,new RegExp("alter table public\\."+table+" enable row level security","i"));
    assert.match(source,new RegExp("grant select on table public\\."+table+" to authenticated","i"));
    assert.doesNotMatch(source,new RegExp("grant\\s+[^;]*(?:insert|update|delete)[^;]*on table public\\."+table+"[^;]*to authenticated","i"));
  }
});

test("retention hold and lineage vocabularies are explicit",()=>{
  const source=sql(); if(!source)return;
  for(const value of ["legal","contractual","audit","security","governance","other"]){
    assert.match(source,new RegExp("'"+value+"'","i"));
  }
  for(const value of ["derived_from","summarizes","certifies","publishes","references","exports","evaluates"]){
    assert.match(source,new RegExp("'"+value+"'","i"));
  }
  for(const value of ["pending","keep","blocked","approved_for_future_disposition","superseded"]){
    assert.match(source,new RegExp("'"+value+"'","i"));
  }
});

test("duplicate active holds are constrained and history is supersession-oriented",()=>{
  const source=sql(); if(!source)return;
  assert.match(source,/create unique index retention_holds_one_active_type_uidx[\s\S]*where status='active'/i);
  assert.match(source,/supersedes_policy_id uuid/i);
  assert.match(source,/supersedes_review_id uuid/i);
  assert.match(source,/supersedes_lineage_id uuid/i);
});

test("retention review read model is security invoker and reports blockers without authorizing deletion",()=>{
  const source=sql(); if(!source)return;
  assert.match(source,/create (?:or replace )?view public\.retention_review_view[\s\S]*security_invoker\s*=\s*true/i);
  assert.match(source,/active_hold_count/i);
  assert.match(source,/active_lineage_count/i);
  assert.match(source,/future_disposition_blocked/i);
  assert.doesNotMatch(source,/execution_authorized/i);
});

test("all explicit retention foreign keys are indexed",()=>{
  const source=sql(); if(!source)return;
  for(const token of [
    "retention_policies_project_idx","retention_policies_supersedes_idx","retention_policies_created_by_idx","retention_policies_approved_by_idx",
    "retention_holds_project_idx","retention_holds_placed_by_idx","retention_holds_released_by_idx",
    "retention_reviews_project_idx","retention_reviews_policy_idx","retention_reviews_requested_by_idx","retention_reviews_reviewed_by_idx","retention_reviews_supersedes_idx",
    "data_policy_lineage_project_idx","data_policy_lineage_created_by_idx","data_policy_lineage_supersedes_idx","trust_manifests_retention_policy_idx"
  ])assert.match(source,new RegExp(token,"i"));
});

test("Phase C v1 introduces no destructive retention executor",()=>{
  const source=sql(); if(!source)return;
  assert.doesNotMatch(source,/create or replace function public\.(?:delete|purge|anonymize|execute_retention|apply_retention)/i);
  assert.doesNotMatch(source,/storage\.objects[\s\S]*(?:delete|update)/i);
  assert.doesNotMatch(source,/update public\.(?:certified_memory|products|portfolio_items|product_records|jobs)\s+set/i);
});

test("retention durations require attributable authority",()=>{
  const source=sql(); if(!source)return;
  assert.match(source,/authority_basis text/i);
  assert.match(source,/evidence_reference text/i);
  assert.match(source,/default_retention_days is null[\s\S]*review_interval_days is not null/i);
  assert.match(source,/default_retention_days is not null[\s\S]*authority_basis[\s\S]*evidence_reference/i);
  assert.match(source,/default_disposition_intent='delete_when_authorized'[\s\S]*authority_basis[\s\S]*evidence_reference/i);
});
