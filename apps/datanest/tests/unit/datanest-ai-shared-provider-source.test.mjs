import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const chatUrl=new URL("../../supabase/functions/datanest-ai-chat/index.ts",import.meta.url);
const managerUrl=new URL("../../supabase/functions/manage-ai-provider-v2/index.ts",import.meta.url);
const migrationUrl=new URL("../../supabase/migrations/20260928134500_add_project_shared_ai_provider_config.sql",import.meta.url);

const chat=await readFile(chatUrl,"utf8");
const manager=await readFile(managerUrl,"utf8");
const migration=await readFile(migrationUrl,"utf8");

test("DataNest AI prefers personal providers and provisions the governed project shared provider",()=>{
  assert.match(chat,/service_get_ai_provider_connection_v3/);
  assert.match(chat,/service_sync_shared_ai_provider_connection_v1/);
  assert.match(chat,/metadata\.scope\|\|\"\"\)!==\"project_shared_copy\"/);
  assert.match(chat,/if\(input\.requestedConnection\)return existing/);
});

test("environment shared-provider fallback remains available and endpoint-bound",()=>{
  for(const name of [
    "DATANEST_SHARED_AI_BASE_URL",
    "DATANEST_SHARED_AI_HOST",
    "DATANEST_SHARED_AI_MODEL",
    "DATANEST_SHARED_AI_SECRET",
    "DATANEST_SHARED_AI_LABEL"
  ]){
    assert.match(chat,new RegExp(name));
  }
  assert.match(chat,/url\.protocol!==\"https:\"/);
  assert.match(chat,/url\.hostname\.toLowerCase\(\)!==endpointHost/);
  assert.match(chat,/\(url\.port&&url\.port!==\"443\"\)/);
});

test("shared provider manager is owner-admin scoped and never exposes stored secrets in status",()=>{
  assert.match(manager,/action===\"shared_status\"/);
  assert.match(manager,/action===\"connect_shared\"/);
  assert.match(manager,/action===\"disable_shared\"/);
  assert.match(manager,/\[\"owner\",\"admin\"\]\.includes/);
  assert.match(manager,/service_get_shared_ai_provider_status_v1/);
  assert.match(manager,/service_upsert_shared_ai_provider_config_v1/);
  assert.match(manager,/service_disable_shared_ai_provider_config_v1/);
  assert.doesNotMatch(manager,/decrypted_secret/);
});

test("shared provider database contract keeps secrets in Vault and service-only RPCs",()=>{
  assert.match(migration,/create table if not exists public\.ai_shared_provider_configs/);
  assert.match(migration,/vault\.create_secret/);
  assert.match(migration,/vault\.update_secret/);
  assert.match(migration,/service_sync_shared_ai_provider_connection_v1/);
  assert.match(migration,/metadata->>'scope'='project_shared_copy'/);
  assert.match(migration,/revoke execute on function public\.service_upsert_shared_ai_provider_config_v1/);
  assert.match(migration,/grant execute on function public\.service_upsert_shared_ai_provider_config_v1[\s\S]*to service_role/);
});
