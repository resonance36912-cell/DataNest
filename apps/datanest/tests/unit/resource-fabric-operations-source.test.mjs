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

test("Phase E governed Resource Fabric RPC surface exists",()=>{
  const source=migration("_add_resource_fabric_governed_operations.sql");
  for(const fn of [
    "get_resource_fabric_workspace_v1",
    "register_project_resource_v1",
    "set_resource_project_binding_state_v1",
    "upsert_sovereign_node_policy_v1",
    "service_record_resource_health_v1",
    "service_resolve_resource_candidates_v1"
  ]) assert.match(source,new RegExp("create or replace function public\\."+fn+"\\(","i"));
});

test("private helpers validate project binding policy health and events",()=>{
  const source=migration("_add_resource_fabric_governed_operations.sql");
  for(const fn of [
    "resource_active_member_role",
    "resource_validate_visibility_classes",
    "resource_validate_operations",
    "resource_validate_binding",
    "resource_record_event"
  ]){
    assert.match(source,new RegExp("create or replace function private\\."+fn+"\\(","i"));
    assert.match(source,new RegExp("revoke all on function private\\."+fn+"\\(","i"));
  }
});

test("supply-side Resource mutations require owner/admin",()=>{
  const source=migration("_add_resource_fabric_governed_operations.sql");
  for(const fn of ["register_project_resource_v1","set_resource_project_binding_state_v1","upsert_sovereign_node_policy_v1"]){
    const match=source.match(new RegExp("create or replace function public\\."+fn+"\\([\\s\\S]*?\\$\\$;","i"));
    assert.ok(match,`Missing ${fn}`);
    assert.match(match[0],/array\['owner','admin'\]/i);
  }
});

test("sovereign node policy rejects non-local resources and remote control",()=>{
  const source=migration("_add_resource_fabric_governed_operations.sql");
  assert.match(source,/resource_kind<>'local_node'/i);
  assert.match(source,/interactive remote control/i);
  assert.match(source,/target_interactive_remote_control/i);
});

test("health ingestion is service-only idempotent and updates summaries without rewriting history",()=>{
  const source=migration("_add_resource_fabric_governed_operations.sql");
  assert.match(source,/service_record_resource_health_v1/i);
  assert.match(source,/service_role/i);
  assert.match(source,/resource_health_observations[\s\S]*trace_id/i);
  assert.match(source,/on conflict[\s\S]*do nothing/i);
  assert.match(source,/update public\.resource_registry[\s\S]*health_status=/i);
  assert.match(source,/update public\.capabilities[\s\S]*observed_at=/i);
  assert.doesNotMatch(source,/update public\.resource_health_observations/i);
  assert.match(source,/revoke all on function public\.service_record_resource_health_v1\([^;]+from public,anon,authenticated/i);
  assert.match(source,/grant execute on function public\.service_record_resource_health_v1\([^;]+to service_role/i);
});

test("candidate resolution is service-only and fail-closed on binding health privacy availability and concurrency",()=>{
  const source=migration("_add_resource_fabric_governed_operations.sql");
  assert.match(source,/service_resolve_resource_candidates_v1/i);
  for(const token of [
    "binding_inactive","resource_disabled","resource_health_unknown","resource_unhealthy",
    "visibility_not_supported","capability_disabled","capability_state_ineligible","capability_concurrency_exhausted"
  ]) assert.match(source,new RegExp(token,"i"));
  assert.match(source,/running\s*<\s*(?:row_record\.)?concurrency_limit/i);
  assert.match(source,/revoke all on function public\.service_resolve_resource_candidates_v1\([^;]+from public,anon,authenticated/i);
  assert.match(source,/grant execute on function public\.service_resolve_resource_candidates_v1\([^;]+to service_role/i);
});

test("candidate resolution does not create capacity or authorization",()=>{
  const source=migration("_add_resource_fabric_governed_operations.sql");
  const fn=source.match(/create or replace function public\.service_resolve_resource_candidates_v1\([\s\S]*?\$\$;/i);
  assert.ok(fn);
  assert.doesNotMatch(fn[0],/insert into public\.reservations/i);
  assert.doesNotMatch(fn[0],/insert into public\.capability_leases/i);
  assert.doesNotMatch(fn[0],/service_authorize_execution_v1/i);
});

test("Phase D and human lifecycle control functions are not replaced",()=>{
  const source=migration("_add_resource_fabric_governed_operations.sql");
  assert.doesNotMatch(source,/create or replace function public\.service_authorize_execution_v1/i);
  assert.doesNotMatch(source,/create or replace function public\.transition_job_status/i);
});

test("governed Resource mutations emit attributable events",()=>{
  const source=migration("_add_resource_fabric_governed_operations.sql");
  for(const event of [
    "RESOURCE_REGISTERED","RESOURCE_BINDING_STATE_CHANGED","SOVEREIGN_NODE_POLICY_VERSIONED","RESOURCE_HEALTH_OBSERVED"
  ]) assert.match(source,new RegExp(event,"i"));
});
