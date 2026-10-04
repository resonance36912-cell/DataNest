import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const baselinePath=path.join(root,"supabase/migrations/20260927110124_add_authority_execution_foundations.sql");
const migrationPath=path.join(root,"supabase/migrations/20260927123000_align_phase_d_authority_with_approved_spec.sql");

function source(){
  return fs.readFileSync(migrationPath,"utf8");
}

test("preserves the merged Phase D baseline and adds an approved-spec conformance migration",()=>{
  assert.equal(fs.existsSync(baselinePath),true,"PR #135 Phase D baseline migration must remain");
  assert.equal(fs.existsSync(migrationPath),true,"approved-spec conformance migration must exist");
});

test("adds explicit authority approvals and canonical envelope lifecycle without auto-activating legacy authority",()=>{
  const sql=source();
  assert.match(sql,/create table public\.authority_approvals\b/i);
  assert.match(sql,/add column status text/i);
  assert.match(sql,/draft[^\n]*proposed[^\n]*approved[^\n]*active[^\n]*paused[^\n]*exhausted[^\n]*expired[^\n]*revoked[^\n]*superseded[^\n]*rejected/i);
  assert.match(sql,/add column requested_autonomy text/i);
  assert.match(sql,/add column granted_autonomy text/i);
  assert.match(sql,/add column allowed_consequence_classes text\[\]/i);
  assert.match(sql,/status=case approval_state[\s\S]*when 'approved' then 'approved'/i);
  assert.doesNotMatch(sql,/approval_state='approved'[\s\S]{0,220}status='active'/i);
});

test("keeps consequence authority explicit instead of inferring it from the legacy operation gradient",()=>{
  const sql=source();
  for(const consequence of [
    "read_only","advisory","preparatory","reversible_write","external_communication",
    "externally_visible_change","resource_execution","production_change","destructive",
    "legal_commitment","financial_commitment","ownership_or_governance","constitutional"
  ]) assert.match(sql,new RegExp(consequence));
  assert.match(sql,/allowed_consequence_classes='\{\}'::text\[\]/i);
  assert.doesNotMatch(sql,/permitted_operations[\s\S]{0,240}allowed_consequence_classes\s*=\s*permitted_operations/i);
});

test("extends leases with canonical capability, target and consequence scope while preserving history",()=>{
  const sql=source();
  assert.match(sql,/alter table public\.capability_leases/i);
  assert.match(sql,/add column capability_key text/i);
  assert.match(sql,/add column allowed_target_types text\[\]/i);
  assert.match(sql,/add column allowed_target_references text\[\]/i);
  assert.match(sql,/add column allowed_consequence_classes text\[\]/i);
  assert.match(sql,/released[\s\S]*cancelled/i);
  assert.match(sql,/capability_key[\s\S]*public\.capabilities/i);
  assert.doesNotMatch(sql,/delete from public\.capability_leases/i);
});

test("migrates circuit breakers to approved categories and three-state semantics",()=>{
  const sql=source();
  for(const category of ["autonomous_writes","external_communications","deployments","resource_execution"]){
    assert.match(sql,new RegExp(category));
  }
  for(const state of ["enabled","paused","blocked"]) assert.match(sql,new RegExp(state));
  assert.match(sql,/autonomous_write[\s\S]*autonomous_writes/i);
  assert.match(sql,/deployment[\s\S]*deployments/i);
  assert.match(sql,/external_communication[\s\S]*external_communications/i);
  assert.match(sql,/open[\s\S]*enabled/i);
  assert.match(sql,/halted[\s\S]*blocked/i);
  assert.match(sql,/create trigger[\s\S]*execution_circuit_breakers/i);
});

test("extends execution decisions and runs with canonical route and authority provenance",()=>{
  const sql=source();
  for(const token of [
    "route_key","requesting_user_id","actor_type","actor_reference","requested_consequence_class",
    "requested_autonomy","granted_autonomy","capability_keys","capability_lease_ids",
    "breaker_category","breaker_state","phase_c_decision_id","exact_evidence_identity",
    "enforcement_mode","ceiling_snapshot"
  ]) assert.match(sql,new RegExp("add column "+token+"\\b","i"));
  assert.match(sql,/alter table public\.runs[\s\S]*authority_envelope_id/i);
  assert.match(sql,/execution_authority_decision_id/i);
  assert.match(sql,/authority_trace_id/i);
});

test("does not turn the legacy cost field into a canonical Phase D monetary authority",()=>{
  const sql=source();
  assert.doesNotMatch(sql,/add column max_cost_minor/i);
  assert.doesNotMatch(sql,/resource_limits[\s\S]{0,200}max_cost_minor/i);
});

test("is additive and never deletes or truncates historical Phase D records",()=>{
  const sql=source();
  assert.doesNotMatch(sql,/delete\s+from\s+public\.(authority_envelopes|capability_leases|execution_authority_decisions|execution_circuit_breakers)/i);
  assert.doesNotMatch(sql,/truncate\s+/i);
  assert.doesNotMatch(sql,/drop\s+table\s+public\.(authority_envelopes|capability_leases|execution_authority_decisions|execution_circuit_breakers)/i);
});
