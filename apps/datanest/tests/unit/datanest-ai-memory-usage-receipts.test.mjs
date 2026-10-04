import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migration=fs.readFileSync(
  path.join(root,"supabase/migrations/20260929053617_add_certified_memory_usage_receipts.sql"),
  "utf8"
);
const requestIndex=fs.readFileSync(
  path.join(root,"supabase/migrations/20260929095401_index_certified_memory_usage_receipts_request.sql"),
  "utf8"
);
const chat=fs.readFileSync(
  path.join(root,"supabase/functions/datanest-ai-chat/index.ts"),
  "utf8"
);
const panel=fs.readFileSync(
  path.join(root,"src/components/IntelligenceFabricPanel.tsx"),
  "utf8"
);

test("memory usage receipts are append-only governed audit evidence",()=>{
  assert.match(migration,/create table if not exists public\.certified_memory_usage_receipts/);
  assert.match(migration,/unique\(project_id,trace_id\)/);
  assert.match(migration,/query_hash text not null check \(query_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(migration,/selected_memory_ids uuid\[\] not null default '\{\}'/);
  assert.match(migration,/on conflict\(project_id,trace_id\) do nothing/);
  assert.match(migration,/Memory receipt contains memory outside the project/);
  assert.match(migration,/service_record_certified_memory_usage_v1/);
  assert.match(migration,/revoke execute on function public\.service_record_certified_memory_usage_v1/);
  assert.match(migration,/to service_role/);
});

test("memory receipts never persist raw prompts",()=>{
  assert.doesNotMatch(migration,/\b(raw_prompt|raw_content|prompt_text|query_text)\s+(text|jsonb)\b/i);
  assert.match(migration,/target_query_hash text/);
  assert.match(chat,/const queryHash=await sha256Text\(input\.query\)/);
  assert.match(chat,/target_query_hash:queryHash/);
});

test("DataNest AI records ranked selection evidence before reasoning",()=>{
  assert.match(chat,/type CertifiedMemorySelection=/);
  assert.match(chat,/strategy:String\(payload\.strategy\|\|"verified-memory-ranked-v3"\)/);
  assert.match(chat,/projection:\{[\s\S]*key:String\(rawProjection\.key\|\|input\.projectionKey\)/);
  assert.match(chat,/memoryReceiptStatus=await recordCertifiedMemoryUsage/);
  assert.match(chat,/target_selected_memory_ids:selectedMemoryIds/);
  assert.match(chat,/memorySelectionStrategy=memorySelection\.strategy/);
  assert.match(chat,/memoryReceiptStatus,/);
});

test("deployment transition keeps receipt logging compatible",()=>{
  assert.match(chat,/service_record_certified_memory_usage_v2\|could not find the function/);
  assert.match(chat,/service_record_certified_memory_usage_v1\|could not find the function/);
  assert.match(chat,/if\(missingReceiptFunction\)return "not_available"/);
});

test("Intelligence Fabric exposes memory selection receipts and review health",()=>{
  assert.match(migration,/'memory_receipts'/);
  assert.match(migration,/'review_due_count'/);
  assert.match(migration,/'usage_receipt_count'/);
  assert.match(migration,/'memory_receipts_are_audit_evidence',true/);
  assert.match(migration,/'memory_receipts_exclude_raw_prompt',true/);
  assert.match(panel,/memory_receipts:Row\[\]/);
  assert.match(panel,/MEMORY RECEIPTS/);
  assert.match(panel,/Verified memory selection evidence/);
  assert.match(panel,/Audited verified-memory selections/);
});

test("memory receipt request lineage has a covering index",()=>{
  assert.match(requestIndex,/create index if not exists certified_memory_usage_receipts_request_idx/);
  assert.match(requestIndex,/on public\.certified_memory_usage_receipts\(ai_usage_request_id\)/);
  assert.match(requestIndex,/where ai_usage_request_id is not null/);
});
