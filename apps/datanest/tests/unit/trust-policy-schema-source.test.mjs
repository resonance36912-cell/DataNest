import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migrationPath=path.join(root,"supabase/migrations/20260927113000_add_trust_policy_foundations.sql");

function sql(){
  return fs.existsSync(migrationPath)?fs.readFileSync(migrationPath,"utf8"):"";
}

test("Phase C trust policy foundation migration exists",()=>{
  assert.equal(fs.existsSync(migrationPath),true,"20260927113000_add_trust_policy_foundations.sql must exist");
});

test("visibility and reuse remain independent governed dimensions",()=>{
  const source=sql(); if(!source)return;
  for(const value of ["public","nest_private","project_restricted","organization_restricted","high_sensitivity","local_only"]){
    assert.match(source,new RegExp(value,"i"));
  }
  for(const value of ["runtime_only","session_context","project_learning_eligible","project_certified_memory","platform_learning_eligible","datanest_certified_knowledge","publicly_reusable"]){
    assert.match(source,new RegExp(value,"i"));
  }
  assert.match(source,/create table public\.data_policy_bindings/i);
  assert.match(source,/visibility_class text not null/i);
  assert.match(source,/reuse_state text not null/i);
});

test("approved subject and evidence vocabularies are pinned",()=>{
  const source=sql(); if(!source)return;
  for(const value of ["project","product","job","ai_event","certified_memory","portfolio_item","file","transparency_artifact","other"]){
    assert.match(source,new RegExp("'"+value+"'","i"));
  }
  for(const value of ["verified","partial","planned","unknown"]){
    assert.match(source,new RegExp("'"+value+"'","i"));
  }
  for(const value of ["draft","active","restricted","suspended","retired"]){
    assert.match(source,new RegExp("'"+value+"'","i"));
  }
});

test("trust policy tables are RLS protected and authenticated clients are read only",()=>{
  const source=sql(); if(!source)return;
  for(const table of ["data_policy_bindings","trust_manifests","provider_trust_profiles"]){
    assert.match(source,new RegExp("alter table public\\."+table+" enable row level security","i"));
    assert.match(source,new RegExp("grant select on table public\\."+table+" to authenticated","i"));
    assert.doesNotMatch(source,new RegExp("grant\\s+[^;]*(?:insert|update|delete)[^;]*on table public\\."+table+"[^;]*to authenticated","i"));
  }
  assert.match(source,/grant select,insert,update,delete on table public\.data_policy_bindings to service_role/i);
  assert.match(source,/grant select,insert,update,delete on table public\.trust_manifests to service_role/i);
  assert.match(source,/grant select,insert,update,delete on table public\.provider_trust_profiles to service_role/i);
});

test("trust policy read models use invoker security",()=>{
  const source=sql(); if(!source)return;
  for(const view of ["active_data_policy_binding_view","active_trust_manifest_view","active_provider_trust_profile_view"]){
    assert.match(source,new RegExp("create (?:or replace )?view public\\."+view+"[\\s\\S]*security_invoker\\s*=\\s*true","i"));
    assert.match(source,new RegExp("grant select on table public\\."+view+" to authenticated","i"));
  }
});

test("active history constraints preserve a single active decision while retaining superseded rows",()=>{
  const source=sql(); if(!source)return;
  assert.match(source,/create unique index data_policy_bindings_one_active_subject_uidx[\s\S]*where status='active'/i);
  assert.match(source,/create unique index trust_manifests_one_active_project_uidx[\s\S]*where status='active'[\s\S]*scope_type='project'/i);
  assert.match(source,/create unique index trust_manifests_one_active_product_uidx[\s\S]*where status='active'[\s\S]*scope_type='product'/i);
  assert.match(source,/create unique index provider_trust_profiles_one_current_uidx[\s\S]*where status in \('active','restricted','suspended'\)/i);
  assert.match(source,/supersedes_binding_id uuid/i);
  assert.match(source,/supersedes_manifest_id uuid/i);
  assert.match(source,/supersedes_profile_id uuid/i);
});

test("provider trust profiles contain policy metadata but no credential value fields",()=>{
  const source=sql(); if(!source)return;
  const match=source.match(/create table public\.provider_trust_profiles\s*\(([\s\S]*?)\n\);/i);
  assert.ok(match,"provider_trust_profiles table definition must exist");
  const table=match[1];
  assert.match(table,/allowed_visibility_classes text\[\]/i);
  assert.match(table,/allowed_purposes text\[\]/i);
  assert.match(table,/prohibited_purposes text\[\]/i);
  assert.match(table,/training_reuse_posture text/i);
  assert.match(table,/credential_boundary_description text/i);
  assert.doesNotMatch(table,/(api_key|secret_value|password|access_token|refresh_token)\s+(?:text|jsonb)/i);
});

test("every explicit foreign key introduced by Task 1 is indexed",()=>{
  const source=sql(); if(!source)return;
  for(const token of [
    "data_policy_bindings_project_idx","data_policy_bindings_proposed_by_idx","data_policy_bindings_approved_by_idx","data_policy_bindings_supersedes_idx",
    "trust_manifests_project_idx","trust_manifests_product_idx","trust_manifests_created_by_idx","trust_manifests_approved_by_idx","trust_manifests_supersedes_idx",
    "provider_trust_profiles_project_idx","provider_trust_profiles_connection_idx","provider_trust_profiles_created_by_idx","provider_trust_profiles_approved_by_idx","provider_trust_profiles_supersedes_idx"
  ]){
    assert.match(source,new RegExp(token,"i"));
  }
});

test("Phase C foundation is additive and does not rewrite existing product, memory, or file access authority",()=>{
  const source=sql(); if(!source)return;
  assert.doesNotMatch(source,/drop table/i);
  assert.doesNotMatch(source,/delete from public\.(?:products|portfolio_items|certified_memory|jobs|project_members)/i);
  assert.doesNotMatch(source,/alter table public\.certified_memory\s+drop/i);
  assert.doesNotMatch(source,/alter table public\.products\s+drop/i);
  assert.doesNotMatch(source,/create or replace function public\.authorize_datanest_ai_file_access/i);
});

test("Trust Manifests start report-only and decision evidence is append-only",()=>{
  const source=sql(); if(!source)return;
  assert.match(source,/enforcement_mode text not null default 'report_only'/i);
  assert.match(source,/check \(enforcement_mode in \('report_only','enforced'\)\)/i);
  assert.match(source,/approved_provider_keys text\[\] not null default '\{\}'/i);
  assert.match(source,/create table public\.data_policy_decisions/i);
  assert.match(source,/outcome text not null check \(outcome in \('allow','deny','review_required'\)\)/i);
  assert.match(source,/enforcement_mode text not null check \(enforcement_mode in \('report_only','enforced'\)\)/i);
  assert.match(source,/policy_version text not null/i);
  const match=source.match(/create table public\.data_policy_decisions\s*\(([\s\S]*?)\n\);/i);
  assert.ok(match,"data_policy_decisions table definition must exist");
  assert.doesNotMatch(match[1],/\bcontent\s+(?:text|jsonb)/i);
  assert.doesNotMatch(source,/grant\s+[^;]*(?:update|delete)[^;]*on table public\.data_policy_decisions[^;]*to service_role/i);
});

test("policy decision evidence is project-readable and fully indexed",()=>{
  const source=sql(); if(!source)return;
  assert.match(source,/alter table public\.data_policy_decisions enable row level security/i);
  assert.match(source,/grant select on table public\.data_policy_decisions to authenticated/i);
  assert.doesNotMatch(source,/grant\s+[^;]*(?:insert|update|delete)[^;]*on table public\.data_policy_decisions[^;]*to authenticated/i);
  for(const token of [
    "data_policy_decisions_project_time_idx","data_policy_decisions_trace_idx",
    "data_policy_decisions_manifest_idx","data_policy_decisions_binding_idx",
    "data_policy_decisions_provider_profile_idx","data_policy_decisions_retention_policy_idx"
  ]) assert.match(source,new RegExp(token,"i"));
});

test("provider trust current-state uniqueness includes suspended explicit denial",()=>{
  const source=sql(); if(!source)return;
  assert.match(source,/provider_trust_profiles_one_current_uidx[\s\S]*where status in \('active','restricted','suspended'\)/i);
});
