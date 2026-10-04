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

test("Phase E foundation migration defines canonical Resource Fabric tables",()=>{
  const source=migration("_add_resource_fabric_foundations.sql");
  for(const table of ["resource_registry","resource_project_bindings","resource_health_observations","sovereign_node_policies"]){
    assert.match(source,new RegExp("create table public\\."+table,"i"));
  }
  for(const kind of ["local_node","cloud_worker","gpu_runtime","browser_runtime","model_endpoint","storage_endpoint","api_endpoint","external_service","agent_runtime","product_capability","human_specialist"]){
    assert.match(source,new RegExp("'"+kind+"'","i"));
  }
});

test("Resource Registry carries trust privacy health location cost and limits without credentials",()=>{
  const source=migration("_add_resource_fabric_foundations.sql");
  for(const token of ["trust_level","location_class","region_hint","supported_visibility_classes","cost_profile","limits","health_status","health_summary","last_seen_at"]){
    assert.match(source,new RegExp(token,"i"));
  }
  for(const visibility of ["public","nest_private","project_restricted","organization_restricted","high_sensitivity","local_only"]){
    assert.match(source,new RegExp("'"+visibility+"'","i"));
  }
  assert.doesNotMatch(source,/(password|api_key|secret_value|access_token|refresh_token)\s+(?:text|jsonb)/i);
});

test("existing capabilities gain a compatibility resource link without destructive replacement",()=>{
  const source=migration("_add_resource_fabric_foundations.sql");
  assert.match(source,/alter table public\.capabilities[\s\S]*add column(?: if not exists)? resource_id uuid references public\.resource_registry/i);
  assert.match(source,/create index[\s\S]*capabilities_resource_idx/i);
  assert.doesNotMatch(source,/drop table[\s\S]*public\.capabilities/i);
  assert.doesNotMatch(source,/rename\s+(?:table|column)[\s\S]*capabilities/i);
  assert.doesNotMatch(source,/delete from public\.capabilities/i);
});

test("legacy capability groups are conservatively backfilled into Resource Fabric",()=>{
  const source=migration("_add_resource_fabric_foundations.sql");
  assert.match(source,/legacy:/i);
  assert.match(source,/trust_level[\s\S]*'unknown'/i);
  assert.match(source,/health_status[\s\S]*'unknown'/i);
  assert.match(source,/location_class[\s\S]*'unknown'/i);
  assert.match(source,/update public\.capabilities[\s\S]*set resource_id=/i);
});

test("health observations are append-only and trace-idempotent",()=>{
  const source=migration("_add_resource_fabric_foundations.sql");
  assert.match(source,/create table public\.resource_health_observations/i);
  assert.match(source,/trace_id text not null/i);
  assert.match(source,/create unique index[\s\S]*resource_health_observations[\s\S]*trace/i);
  const block=source.match(/create table public\.resource_health_observations \([\s\S]*?\n\);/i);
  assert.ok(block);
  assert.doesNotMatch(block[0],/on delete cascade/i);
  assert.doesNotMatch(source,/delete from public\.resource_health_observations/i);
});

test("sovereign node policy is versioned and interactive remote control is disabled",()=>{
  const source=migration("_add_resource_fabric_foundations.sql");
  for(const token of ["version","allowed_capabilities","resource_ceiling","schedule_policy","allowed_visibility_classes","data_scope","prohibited_operations","network_policy","supersedes_policy_id"]){
    assert.match(source,new RegExp(token,"i"));
  }
  assert.match(source,/interactive_remote_control boolean not null default false/i);
  assert.match(source,/check\s*\(\s*interactive_remote_control=false\s*\)/i);
});

test("all new public Resource Fabric tables use RLS and explicit client grants",()=>{
  const source=migration("_add_resource_fabric_foundations.sql");
  for(const table of ["resource_registry","resource_project_bindings","resource_health_observations","sovereign_node_policies"]){
    assert.match(source,new RegExp("alter table public\\."+table+" enable row level security","i"));
    assert.match(source,new RegExp("revoke all on table public\\."+table+" from public,anon,authenticated","i"));
    assert.match(source,new RegExp("grant select on table public\\."+table+" to authenticated","i"));
    assert.doesNotMatch(source,new RegExp("grant\\s+[^;]*(?:insert|update|delete)[^;]*on table public\\."+table+"[^;]*to authenticated","i"));
  }
});

test("existing reservation and Phase D authorization identities remain untouched",()=>{
  const source=migration("_add_resource_fabric_foundations.sql");
  assert.doesNotMatch(source,/drop table[\s\S]*public\.reservations/i);
  assert.doesNotMatch(source,/drop table[\s\S]*public\.capability_leases/i);
  assert.doesNotMatch(source,/alter table public\.reservations[\s\S]*rename/i);
  assert.doesNotMatch(source,/alter table public\.capability_leases[\s\S]*rename/i);
});
