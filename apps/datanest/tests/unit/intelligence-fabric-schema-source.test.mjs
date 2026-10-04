import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migrationDir=path.join(root,"supabase/migrations");
function migration(suffix){
  const file=fs.readdirSync(migrationDir).find(name=>name.endsWith(suffix));
  assert.ok(file,`Missing migration *${suffix}`);
  return fs.readFileSync(path.join(migrationDir,file),"utf8");
}

test("Phase F foundation defines canonical Intelligence Fabric tables",()=>{
  const source=migration("_add_intelligence_fabric_foundations.sql");
  for(const table of ["ilm_profiles","intelligence_route_decisions","intelligence_evaluation_runs","intelligence_capability_evidence"]){
    assert.match(source,new RegExp("create table public\\."+table,"i"));
  }
});

test("ILM profiles are versioned governed orchestration profiles",()=>{
  const source=migration("_add_intelligence_fabric_foundations.sql");
  for(const token of ["version","profile_key","allowed_purposes","default_capability","allowed_resource_kinds","memory_policy","routing_policy","evaluation_policy","supersedes_profile_id"]){
    assert.match(source,new RegExp(token,"i"));
  }
  for(const state of ["draft","active","suspended","superseded","retired"]){
    assert.match(source,new RegExp("'"+state+"'","i"));
  }
  assert.match(source,/one_active|where status='active'/i);
});

test("route decisions preserve memory, resource, provider and policy provenance",()=>{
  const source=migration("_add_intelligence_fabric_foundations.sql");
  for(const token of ["certified_memory_ids","resource_id","capability_id","provider_connection_id","provider_key","model_label","route_kind","decision","reason_codes","policy_evidence","resource_evidence"]){
    assert.match(source,new RegExp(token,"i"));
  }
  for(const value of ["provider_model","local_model","managed_model","tool_agent","memory_only","selected","rejected","review_required"]){
    assert.match(source,new RegExp("'"+value+"'","i"));
  }
});

test("evaluation and capability evidence are append-only trace evidence",()=>{
  const source=migration("_add_intelligence_fabric_foundations.sql");
  for(const table of ["intelligence_evaluation_runs","intelligence_capability_evidence"]){
    assert.match(source,new RegExp("trace_id text not null","i"));
    assert.doesNotMatch(source,new RegExp("delete from public\\."+table,"i"));
  }
  assert.match(source,/evaluator_kind text not null/i);
  assert.match(source,/evidence_kind text not null/i);
  assert.match(source,/evaluation_version text not null/i);
});

test("Intelligence Fabric schema stores neither credentials nor raw staging content",()=>{
  const source=migration("_add_intelligence_fabric_foundations.sql");
  assert.doesNotMatch(source,/(password|api_key|secret_value|access_token|refresh_token|decrypted_secret)\s+(?:text|jsonb)/i);
  assert.doesNotMatch(source,/(raw_prompt|raw_content|chain_of_thought|reasoning_tokens)\s+(?:text|jsonb)/i);
});

test("existing memory usage authority and Resource Fabric are not replaced",()=>{
  const source=migration("_add_intelligence_fabric_foundations.sql");
  for(const table of ["certified_memory","ai_usage_requests","resource_registry","capabilities","capability_leases"]){
    assert.doesNotMatch(source,new RegExp("drop table[\\s\\S]*public\\."+table,"i"));
  }
  assert.doesNotMatch(source,/create table public\.certified_memory/i);
});

test("new Intelligence Fabric tables use RLS and authenticated read-only grants",()=>{
  const source=migration("_add_intelligence_fabric_foundations.sql");
  for(const table of ["ilm_profiles","intelligence_route_decisions","intelligence_evaluation_runs","intelligence_capability_evidence"]){
    assert.match(source,new RegExp("alter table public\\."+table+" enable row level security","i"));
    assert.match(source,new RegExp("revoke all on table public\\."+table+" from public,anon,authenticated","i"));
    assert.match(source,new RegExp("grant select on table public\\."+table+" to authenticated","i"));
    assert.doesNotMatch(source,new RegExp("grant\\s+[^;]*(?:insert|update|delete)[^;]*on table public\\."+table+"[^;]*to authenticated","i"));
  }
});
