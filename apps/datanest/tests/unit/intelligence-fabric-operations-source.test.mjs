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

test("Phase F governed RPC surface exists",()=>{
  const source=migration("_add_intelligence_fabric_governed_operations.sql");
  for(const fn of [
    "get_intelligence_fabric_workspace_v1",
    "upsert_ilm_profile_v1",
    "service_record_intelligence_route_v1",
    "service_record_intelligence_evaluation_v1",
    "service_record_intelligence_capability_evidence_v1"
  ]) assert.match(source,new RegExp("create or replace function public\\."+fn+"\\(","i"));
});

test("owner/admin alone can version ILM profiles",()=>{
  const source=migration("_add_intelligence_fabric_governed_operations.sql");
  const fn=source.match(/create or replace function public\.upsert_ilm_profile_v1\([\s\S]*?\$\$;/i);
  assert.ok(fn);
  assert.match(fn[0],/array\['owner','admin'\]/i);
  assert.doesNotMatch(fn[0],/array\['owner','admin','operator'\]/i);
});

test("service evidence RPCs are service-role only",()=>{
  const source=migration("_add_intelligence_fabric_governed_operations.sql");
  for(const fn of [
    "service_record_intelligence_route_v1",
    "service_record_intelligence_evaluation_v1",
    "service_record_intelligence_capability_evidence_v1"
  ]){
    assert.match(source,new RegExp("revoke all on function public\\."+fn+"\\([^;]+from public,anon,authenticated","i"));
    assert.match(source,new RegExp("grant execute on function public\\."+fn+"\\([^;]+to service_role","i"));
  }
});

test("profile mutation rejects credentials raw prompts and training claims",()=>{
  const source=migration("_add_intelligence_fabric_governed_operations.sql");
  assert.match(source,/credentials or secrets/i);
  assert.match(source,/raw staging|raw prompt|raw content/i);
  assert.match(source,/foundation model training|model training|fine-tun/i);
});

test("route recording validates memory resource capability and usage identity",()=>{
  const source=migration("_add_intelligence_fabric_governed_operations.sql");
  for(const token of ["certified_memory","resource_registry","capabilities","ai_usage_requests","project"]){
    assert.match(source,new RegExp(token,"i"));
  }
  assert.match(source,/INTELLIGENCE_ROUTE_RECORDED/i);
});

test("evaluation and capability evidence emit attributable events",()=>{
  const source=migration("_add_intelligence_fabric_governed_operations.sql");
  assert.match(source,/INTELLIGENCE_EVALUATION_RECORDED/i);
  assert.match(source,/INTELLIGENCE_CAPABILITY_EVIDENCE_RECORDED/i);
});

test("Intelligence Fabric does not grant capacity or execution authority",()=>{
  const source=migration("_add_intelligence_fabric_governed_operations.sql");
  for(const forbidden of [
    /insert into public\.reservations/i,
    /insert into public\.capability_leases/i,
    /service_authorize_execution_v1\s*\(/i,
    /promote_certified_memory\s*\(/i
  ]) assert.doesNotMatch(source,forbidden);
});
