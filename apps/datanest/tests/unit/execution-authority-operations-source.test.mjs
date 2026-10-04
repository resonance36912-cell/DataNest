import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migrationPath=path.join(root,"supabase/migrations/20260927110125_add_authority_execution_governed_operations.sql");
function sql(){return fs.readFileSync(migrationPath,"utf8");}

test("Phase D governed operations migration exists",()=>{
  assert.equal(fs.existsSync(migrationPath),true);
});

test("all governed authority operations exist",()=>{
  const source=sql();
  for(const fn of [
    "propose_authority_envelope_v1","approve_authority_envelope_v1","reject_authority_envelope_v1","revoke_authority_envelope_v1",
    "issue_capability_lease_v1","release_capability_lease_v1","set_execution_circuit_breaker_v1",
    "get_execution_authority_workspace_v1","service_authorize_execution_v1"
  ]) assert.match(source,new RegExp("create or replace function public\\."+fn+"\\(","i"));
});

test("private helpers validate identity, sponsorship, autonomy, breakers, ceilings and events",()=>{
  const source=sql();
  for(const fn of [
    "execution_validate_context","execution_active_member_role","execution_validate_operations",
    "execution_validate_resource_ceiling","execution_breaker_category","execution_record_event"
  ]){
    assert.match(source,new RegExp("create or replace function private\\."+fn+"\\(","i"));
    assert.match(source,new RegExp("revoke all on function private\\."+fn+"\\(","i"));
  }
});

test("operator proposals stop at A3 and A4 proposal requires owner/admin",()=>{
  const source=sql();
  assert.match(source,/target_autonomy_level='A4'[\s\S]*caller_role not in \('owner','admin'\)/i);
  assert.match(source,/A4 proposal requires owner or admin authority/i);
});

test("A3 is independently approved and A4 generic automation is denied",()=>{
  const source=sql();
  assert.match(source,/autonomy_level='A3'[\s\S]*array\['owner','admin'\]/i);
  assert.match(source,/A3 authority requires independent review/i);
  assert.match(source,/autonomy_level='A4'[\s\S]*array\['owner'\]/i);
  assert.match(source,/A4 authority requires an independent owner review/i);
  assert.match(source,/A4 cannot issue a generic automated Capability Lease/i);
  assert.match(source,/a4_high_impact_generic_automation_denied/i);
});

test("Capability Lease issuance remains distinct from resource reservation",()=>{
  const source=sql();
  assert.match(source,/insert into public\.capability_leases/i);
  assert.match(source,/capability\.capability=any\(envelope\.permitted_capabilities\)/i);
  assert.match(source,/target_expires_at<=now\(\) or target_expires_at>envelope\.expires_at/i);
  assert.match(source,/target_max_operations>max_envelope_operations[\s\S]*exceed Authority Envelope resource ceiling/i);
  assert.doesNotMatch(source,/insert into public\.reservations[\s\S]*issue_capability_lease_v1/i);
});

test("Circuit breakers are owner/admin controlled and missing required breaker fails closed",()=>{
  const source=sql();
  assert.match(source,/set_execution_circuit_breaker_v1/i);
  assert.match(source,/array\['owner','admin'\]/i);
  assert.match(source,/breaker_missing/i);
  assert.match(source,/breaker_halted/i);
});

test("service evaluator is service-role only, idempotent, row-locked and atomically consumes lease budget",()=>{
  const source=sql();
  assert.match(source,/service_authorize_execution_v1/i);
  assert.match(source,/for update/i);
  assert.match(source,/execution_authority_decisions[\s\S]*trace_id/i);
  assert.match(source,/used_operations=used_operations\+1/i);
  assert.match(source,/status\s*=\s*case\s+when\s+used_operations\s*\+\s*1\s*>=\s*max_operations\s+then\s*'exhausted'\s+else\s+status\s+end/i);
  assert.match(source,/revoke all on function public\.service_authorize_execution_v1\([^;]+from public,anon,authenticated/i);
  assert.match(source,/grant execute on function public\.service_authorize_execution_v1\([^;]+to service_role/i);
});

test("service evaluator fails closed on identity, sponsor, envelope, lease, operation, breaker, health and ceiling",()=>{
  const source=sql();
  for(const reason of [
    "identity_mismatch","sponsor_inactive","envelope_not_approved","envelope_expired","lease_not_active","lease_expired","lease_exhausted",
    "operation_not_permitted","capability_not_permitted","autonomy_insufficient","a4_high_impact_generic_automation_denied",
    "breaker_missing","breaker_halted","capability_disabled","capability_unavailable","capability_health_unknown",
    "capability_concurrency_exhausted","resource_ceiling_invalid"
  ]) assert.match(source,new RegExp(reason,"i"));
});

test("human transition_job_status is not replaced or redefined",()=>{
  const source=sql();
  assert.doesNotMatch(source,/create or replace function public\.transition_job_status/i);
  assert.doesNotMatch(source,/drop function[\s\S]*transition_job_status/i);
});

test("Phase C evaluator remains an independent prerequisite rather than being replaced",()=>{
  const source=sql();
  assert.doesNotMatch(source,/create or replace function public\.service_evaluate_data_policy_v1/i);
  assert.doesNotMatch(source,/drop function[\s\S]*service_evaluate_data_policy_v1/i);
});

test("authority mutations emit attributable events and no destructive executor is introduced",()=>{
  const source=sql();
  for(const event of [
    "AUTHORITY_ENVELOPE_PROPOSED","AUTHORITY_ENVELOPE_APPROVED","AUTHORITY_ENVELOPE_REJECTED","AUTHORITY_ENVELOPE_REVOKED",
    "CAPABILITY_LEASE_ISSUED","CAPABILITY_LEASE_RELEASED","EXECUTION_CIRCUIT_BREAKER_CHANGED","EXECUTION_AUTHORITY_EVALUATED"
  ]) assert.match(source,new RegExp(event,"i"));
  assert.doesNotMatch(source,/delete from/i);
  assert.doesNotMatch(source,/truncate\s+/i);
});
