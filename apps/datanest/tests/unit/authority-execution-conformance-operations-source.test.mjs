import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migrationPath=path.join(root,"supabase/migrations/20260927124000_add_phase_d_approved_authority_operations.sql");
function sql(){return fs.readFileSync(migrationPath,"utf8");}

test("approved Phase D canonical operations migration exists",()=>{
  assert.equal(fs.existsSync(migrationPath),true);
});

test("canonical autonomy and consequence helpers implement the approved minimum mapping",()=>{
  const source=sql();
  for(const fn of ["authority_autonomy_rank","authority_minimum_autonomy","authority_breaker_category","authority_route_mode","authority_evaluate_execution_v1"]){
    assert.match(source,new RegExp("create or replace function private\\."+fn+"\\(","i"));
  }
  for(const pair of [
    ["read_only","A0"],["advisory","A1"],["preparatory","A2"],["reversible_write","A3"],
    ["external_communication","A3"],["externally_visible_change","A3"],["resource_execution","A3"],
    ["production_change","A4"],["destructive","A4"],["legal_commitment","A4"],
    ["financial_commitment","A4"],["ownership_or_governance","A4"],["constitutional","A4"]
  ]){
    assert.match(source,new RegExp(pair[0]+"[\\s\\S]{0,140}"+pair[1],"i"));
  }
});

test("V2 envelope governance requires explicit consequence scope and separate activation",()=>{
  const source=sql();
  for(const fn of [
    "propose_authority_envelope_v2","approve_authority_envelope_v2","activate_authority_envelope_v2",
    "reject_authority_envelope_v2","pause_authority_envelope_v2","revoke_authority_envelope_v2"
  ]) assert.match(source,new RegExp("create or replace function public\\."+fn+"\\(","i"));
  assert.match(source,/target_allowed_consequence_classes text\[\]/i);
  assert.match(source,/requested autonomy[\s\S]*minimum autonomy/i);
  assert.match(source,/status='approved'[\s\S]*status='active'/i);
  assert.match(source,/status<>'approved'|status != 'approved'/i);
  assert.doesNotMatch(source,/permitted_operations[\s\S]{0,220}allowed_consequence_classes\s*=/i);
});

test("independent and A4 approvals cannot be self-approved",()=>{
  const source=sql();
  assert.match(source,/require_independent_approval[\s\S]*proposed_by=caller|proposed_by=caller[\s\S]*require_independent_approval/i);
  assert.match(source,/A4[\s\S]*proposed_by=caller|proposed_by=caller[\s\S]*A4/i);
  assert.match(source,/approval_type[\s\S]*independent/i);
  assert.match(source,/insert into public\.authority_approvals/i);
});

test("exact-action approvals bind operation target and evidence identity",()=>{
  const source=sql();
  assert.match(source,/create or replace function public\.record_exact_action_approval_v1\(/i);
  assert.match(source,/target_operation text/i);
  assert.match(source,/target_target_type text/i);
  assert.match(source,/target_target_reference text/i);
  assert.match(source,/target_exact_evidence_identity text/i);
  assert.match(source,/approval_type[\s\S]*exact_action/i);
  assert.match(source,/create or replace function public\.revoke_authority_approval_v1\(/i);
});

test("canonical leases require active parent authority and only tighten parent scope",()=>{
  const source=sql();
  assert.match(source,/create or replace function public\.issue_capability_lease_v2\(/i);
  assert.match(source,/envelope\.status<>'active'|status<>'active'/i);
  assert.match(source,/target_allowed_operations[\s\S]*allowed_operation_keys/i);
  assert.match(source,/target_allowed_consequence_classes[\s\S]*allowed_consequence_classes/i);
  assert.match(source,/target_allowed_target_types[\s\S]*allowed_target_types/i);
  assert.match(source,/target_allowed_target_references[\s\S]*allowed_target_references/i);
  assert.match(source,/target_expires_at[\s\S]*envelope\.expires_at/i);
  assert.match(source,/create or replace function public\.pause_capability_lease_v1\(/i);
  assert.match(source,/create or replace function public\.revoke_capability_lease_v1\(/i);
});

test("route modes are isolated, explicit, and default to report_only",()=>{
  const source=sql();
  assert.match(source,/'authority_execution:'\|\|target_route_key/i);
  assert.match(source,/target_route_key not in \('external_ai_provider','job_start'\)/i);
  assert.match(source,/coalesce[\s\S]{0,220}report_only/i);
  assert.match(source,/target_route_key not in \('external_ai_provider','job_start'\)/i);
  assert.match(source,/target_mode not in \('report_only','enforced'\)/i);
  assert.match(source,/create or replace function public\.set_authority_execution_route_mode_v1\(/i);
});

test("breaker safety automation can only tighten and never re-enable",()=>{
  const source=sql();
  assert.match(source,/create or replace function public\.service_tighten_execution_circuit_breaker_v1\(/i);
  assert.match(source,/target_state not in \('paused','blocked'\)/i);
  assert.doesNotMatch(source,/service_tighten_execution_circuit_breaker_v1[\s\S]{0,1800}target_state='enabled'/i);
  assert.match(source,/create or replace function public\.set_execution_circuit_breaker_v2\(/i);
});

test("canonical evaluator requires explicit consequence membership as well as autonomy rank",()=>{
  const source=sql();
  assert.match(source,/(?:target_consequence_class|conseq)\s*=\s*any\(envelope\.allowed_consequence_classes\)/i);
  assert.match(source,/authority_autonomy_rank\((?:target_requested_autonomy|req_auto)\)/i);
  assert.match(source,/authority_minimum_autonomy\((?:target_consequence_class|conseq)\)/i);
  assert.match(source,/granted_autonomy/i);
});

test("canonical evaluator fails closed on paused expired revoked exhausted or missing authority",()=>{
  const source=sql();
  for(const reason of [
    "envelope_missing","envelope_inactive","envelope_expired","autonomy_insufficient","consequence_not_permitted",
    "approval_missing","lease_missing","lease_expired","lease_revoked","lease_exhausted","lease_paused",
    "capability_unhealthy","breaker_paused","breaker_blocked","reservation_missing","trust_policy_denied"
  ]) assert.match(source,new RegExp(reason,"i"));
});

test("A4 execution requires an unexpired exact-action approval that matches the packet",()=>{
  const source=sql();
  assert.match(source,/target_requested_autonomy='A4'|minimum_autonomy='A4'/i);
  assert.match(source,/approval_type='exact_action'/i);
  assert.match(source,/operation_key\s*=\s*(?:target_operation|op)/i);
  assert.match(source,/coalesce\(a\.target_reference,''\)\s*=\s*coalesce\((?:target_target_reference|tgt_ref),''\)/i);
  assert.match(source,/exact_evidence_identity\s*=\s*(?:target_exact_evidence_identity|evidence_id)/i);
});

test("Phase C non-allow remains non-allow",()=>{
  const source=sql();
  assert.match(source,/from public\.data_policy_decisions/i);
  assert.match(source,/phase_c[\s\S]*outcome<>'allow'|policy_decision[\s\S]*outcome<>'allow'/i);
  assert.match(source,/trust_policy_denied/i);
});

test("idempotent evaluation and canonical lease consumption are race-safe",()=>{
  const source=sql();
  assert.match(source,/execution_authority_decisions[\s\S]*trace_id/i);
  assert.match(source,/idempotent_replay/i);
  assert.match(source,/for update[\s\S]*capability_leases/i);
  assert.match(source,/consumed_operation_count\s*=\s*consumed_operation_count\+1/i);
  assert.match(source,/target_consume_operation/i);
  assert.match(source,/enforcement_mode='enforced'|route_mode='enforced'/i);
});

test("service evaluator is service-role only and report-only never consumes lease counters",()=>{
  const source=sql();
  assert.match(source,/create or replace function public\.service_evaluate_execution_authority_v1\(/i);
  assert.match(source,/revoke all on function public\.service_evaluate_execution_authority_v1\([^;]+from public,anon,authenticated/i);
  assert.match(source,/grant execute on function public\.service_evaluate_execution_authority_v1\([^;]+to service_role/i);
  assert.match(source,/report_only[\s\S]*target_consume_operation[\s\S]*false|route_mode<>'enforced'[\s\S]*consume/i);
});

test("workspace and job summaries expose canonical route/readiness state without consuming authority",()=>{
  const source=sql();
  assert.match(source,/create or replace function public\.get_authority_execution_workspace_v1\(/i);
  assert.match(source,/create or replace function public\.get_job_execution_authority_summary_v1\(/i);
  for(const readiness of [
    "not_evaluated","report_only","ready_for_check","approval_required",
    "lease_missing","lease_expired","paused","blocked","authorized"
  ]) assert.match(source,new RegExp(readiness));
  assert.match(source,/authorized[\s\S]{0,260}enforced[\s\S]{0,260}allow|enforced[\s\S]{0,260}allow[\s\S]{0,260}authorized/i);
  assert.doesNotMatch(source,/get_job_execution_authority_summary_v1[\s\S]*consumed_operation_count\s*=|get_job_execution_authority_summary_v1[\s\S]*used_operations\s*=/i);
});

test("legacy V1 authority is retained for compatibility but never promoted directly to active canonical authority",()=>{
  const source=sql();
  assert.match(source,/legacy V1|compatibility/i);
  assert.doesNotMatch(source,/approval_state='approved'[\s\S]{0,280}status='active'/i);
  assert.doesNotMatch(source,/create or replace function public\.propose_authority_envelope_v1\(/i);
  assert.doesNotMatch(source,/drop function[\s\S]*propose_authority_envelope_v1/i);
});
