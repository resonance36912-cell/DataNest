import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migrationPath=path.join(root,"supabase/migrations/20260927110124_add_authority_execution_foundations.sql");
function sql(){return fs.readFileSync(migrationPath,"utf8");}

test("Phase D foundation migration uses CLI-generated filename",()=>{
  assert.equal(fs.existsSync(migrationPath),true);
});

test("Authority Envelopes encode bounded attributable authority",()=>{
  const source=sql();
  assert.match(source,/create table public\.authority_envelopes/i);
  for(const value of ["human","agent","application","model","service","workflow"]) assert.match(source,new RegExp("'"+value+"'","i"));
  for(const value of ["A0","A1","A2","A3","A4"]) assert.match(source,new RegExp("'"+value+"'","i"));
  for(const value of ["observe","prepare","write","execute","promote","destruct"]) assert.match(source,new RegExp("'"+value+"'","i"));
  for(const token of ["sponsor_user_id","resource_ceiling","evidence_requirements","expires_at","trace_key","reversibility"]) assert.match(source,new RegExp(token,"i"));
  assert.doesNotMatch(source,/(api_key|password|secret_value|access_token|refresh_token)\s+(?:text|jsonb)/i);
});

test("Capability Leases are authorization leases distinct from existing reservations",()=>{
  const source=sql();
  assert.match(source,/create table public\.capability_leases/i);
  assert.match(source,/authority_envelope_id uuid not null references public\.authority_envelopes/i);
  assert.match(source,/capability_id uuid not null references public\.capabilities/i);
  assert.match(source,/max_operations integer not null/i);
  assert.match(source,/used_operations integer not null default 0/i);
  assert.match(source,/status in \('active','released','expired','revoked','exhausted'\)/i);
  assert.match(source,/alter table public\.reservations\s+add column authority_lease_id uuid references public\.capability_leases/i);
  assert.doesNotMatch(source,/rename\s+(?:table|column)[\s\S]*reservations/i);
  assert.doesNotMatch(source,/drop table[\s\S]*reservations/i);
});

test("execution circuit breakers and append-only decision evidence exist",()=>{
  const source=sql();
  assert.match(source,/create table public\.execution_circuit_breakers/i);
  for(const value of ["autonomous_write","deployment","external_communication","resource_execution"]) assert.match(source,new RegExp("'"+value+"'","i"));
  assert.match(source,/state in \('open','halted'\)/i);
  assert.match(source,/create table public\.execution_authority_decisions/i);
  assert.match(source,/outcome in \('allow','deny','review_required'\)/i);
  assert.match(source,/breaker_snapshot jsonb/i);
  assert.match(source,/capability_state_snapshot jsonb/i);
  assert.match(source,/resource_usage_snapshot jsonb/i);
});

test("all new public authority tables are RLS protected and authenticated clients are read-only",()=>{
  const source=sql();
  for(const table of ["authority_envelopes","capability_leases","execution_circuit_breakers","execution_authority_decisions"]){
    assert.match(source,new RegExp("alter table public\\."+table+" enable row level security","i"));
    assert.match(source,new RegExp("grant select on table public\\."+table+" to authenticated","i"));
    assert.doesNotMatch(source,new RegExp("grant\\s+[^;]*(?:insert|update|delete)[^;]*on table public\\."+table+"[^;]*to authenticated","i"));
    assert.match(source,new RegExp("private\\.has_project_access\\(project_id\\)","i"));
  }
});

test("foundation indexes every explicit authority foreign key and preserves history",()=>{
  const source=sql();
  for(const token of [
    "authority_envelopes_project_job_state_expiry_idx","authority_envelopes_sponsor_idx","authority_envelopes_product_idx","authority_envelopes_actor_user_idx",
    "capability_leases_envelope_idx","capability_leases_capability_idx",
    "execution_circuit_breakers_updated_by_idx",
    "execution_authority_decisions_job_created_idx","execution_authority_decisions_envelope_idx","execution_authority_decisions_lease_idx","execution_authority_decisions_capability_idx","execution_authority_decisions_sponsor_idx",
    "reservations_authority_lease_idx"
  ]) assert.match(source,new RegExp(token,"i"));
  assert.doesNotMatch(source,/delete from/i);
  assert.doesNotMatch(source,/truncate\s+/i);
});

test("A4 cannot be issued as a generic authorization lease at schema level",()=>{
  const source=sql();
  assert.match(source,/approval_level text not null check \(approval_level in \('A0','A1','A2','A3'\)\)/i);
});
