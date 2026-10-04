import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migration=fs.readFileSync(
  path.join(root,"supabase/migrations/20260929084713_add_verified_memory_product_projections.sql"),
  "utf8"
);
const chat=fs.readFileSync(
  path.join(root,"supabase/functions/datanest-ai-chat/index.ts"),
  "utf8"
);
const fabric=fs.readFileSync(
  path.join(root,"src/components/IntelligenceFabricPanel.tsx"),
  "utf8"
);

test("Verified Memory has three stable product projections",()=>{
  assert.match(migration,/'datanest_ai',1,'active','datanest_ai'/);
  assert.match(migration,/'development_command',1,'active','development_command'/);
  assert.match(migration,/'legal_eagle',1,'active','legal_eagle'/);
  assert.match(migration,/'legal_eagle',true,[\s\S]*0\.70,16,true/);
});

test("future projects receive default projections",()=>{
  assert.match(migration,/seed_verified_memory_projection_profiles_v1/);
  assert.match(migration,/after insert on public\.projects/);
  assert.match(migration,/execute function private\.seed_verified_memory_projection_profiles_v1/);
});

test("Owner and Admin can version projections without rewriting Certified Memory",()=>{
  assert.match(migration,/upsert_certified_memory_projection_profile_v1/);
  assert.match(migration,/caller_role not in \('owner','admin'\)/);
  assert.match(migration,/set status='superseded'/);
  assert.match(migration,/coalesce\(max\(p\.version\),0\)\+1/);
  assert.doesNotMatch(migration,/update public\.certified_memory\s+set applicability/);
});

test("projection-aware retrieval enforces product and jurisdiction boundaries",()=>{
  assert.match(migration,/get_ranked_certified_memory_context_v3/);
  assert.match(migration,/target_product_scope is distinct from projection\.product_scope/);
  assert.match(migration,/projection\.require_jurisdiction/);
  assert.match(migration,/coalesce\(m\.confidence,0\.75\)>=projection\.min_confidence/);
  assert.match(migration,/projection\.include_unscoped/);
  assert.match(migration,/cardinality\(projection\.allowed_categories\)=0/);
  assert.match(migration,/m\.category=any\(projection\.excluded_categories\)/);
  assert.match(migration,/'strategy','verified-memory-ranked-v3'/);
});

test("DataNest AI selects the projection for each reasoning mode and fails closed when projection retrieval is unavailable",()=>{
  assert.match(chat,/const projectionKey=legalMode/);
  assert.match(chat,/"legal_eagle"/);
  assert.match(chat,/"development_command"/);
  assert.match(chat,/"datanest_ai"/);
  assert.match(chat,/get_ranked_certified_memory_context_v3/);
  assert.match(chat,/target_projection_key:input\.projectionKey/);
  assert.match(chat,/certified_memory_projection_unavailable/);
  assert.doesNotMatch(chat,/get_ranked_certified_memory_context_v2/);
  assert.doesNotMatch(chat,/get_certified_memory_context/);
});

test("usage receipts preserve projection key and version",()=>{
  assert.match(migration,/add column if not exists projection_key text/);
  assert.match(migration,/add column if not exists projection_version bigint/);
  assert.match(migration,/service_record_certified_memory_usage_v2/);
  assert.match(migration,/Memory receipt projection identity is invalid/);
  assert.match(chat,/target_projection_key:input\.selection\.projection\.key/);
  assert.match(chat,/target_projection_version:input\.selection\.projection\.version/);
  assert.match(fabric,/item\.projection_key/);
  assert.match(fabric,/item\.projection_version/);
});
