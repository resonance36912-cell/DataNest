import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migration=fs.readFileSync(
  path.join(root,"supabase/migrations/20260929084708_add_verified_memory_outcome_evidence.sql"),
  "utf8"
);
const certification=fs.readFileSync(
  path.join(root,"supabase/functions/datanest-ai-certification/index.ts"),
  "utf8"
);
const panel=fs.readFileSync(
  path.join(root,"src/components/DataNestAiCertificationPanel.tsx"),
  "utf8"
);

test("Verified Memory outcome evidence is append-only governed evidence",()=>{
  assert.match(migration,/create table if not exists public\.certified_memory_outcome_evidence/);
  assert.match(migration,/usage_receipt_id uuid not null references public\.certified_memory_usage_receipts/);
  assert.match(migration,/signal in \('supported','neutral','challenged','contradicted','unknown'\)/);
  assert.match(migration,/alter table public\.certified_memory_outcome_evidence enable row level security/);
  assert.match(migration,/revoke all on table public\.certified_memory_outcome_evidence from public,anon,authenticated/);
  assert.match(migration,/grant select,insert on table public\.certified_memory_outcome_evidence to service_role/);
});

test("outcome evidence must reference memory actually selected by the receipt",()=>{
  assert.match(migration,/target_memory=any\(coalesce\(receipt_row\.selected_memory_ids/);
  assert.match(migration,/Outcome evidence memory was not selected by the referenced usage receipt/);
});

test("adverse outcomes accelerate review without silently changing truth status",()=>{
  assert.match(migration,/target_signal in \('challenged','contradicted'\) and memory_row\.active/);
  assert.match(migration,/set review_after=least\(coalesce\(review_after,now\(\)\),now\(\)\)/);
  assert.match(migration,/'certification_changed',false/);
  assert.match(migration,/'confidence_changed',false/);
  assert.doesNotMatch(migration,/set\s+confidence\s*=/i);
  assert.doesNotMatch(migration,/set\s+certification_class\s*=/i);
});

test("only governed owner or admin actors may record memory outcomes",()=>{
  assert.match(migration,/actor_role is null or actor_role not in \('owner','admin'\)/);
  assert.match(migration,/Owner or Admin outcome-review authority is required/);
  assert.match(migration,/service_record_certified_memory_outcome_v1/);
  assert.match(migration,/to service_role/);
});

test("certification gateway records and exposes non-authoritative outcome evidence",()=>{
  assert.match(certification,/loadRecentMemoryOutcomes/);
  assert.match(certification,/memoryOutcomeItems/);
  assert.match(certification,/action==="record_memory_outcome"/);
  assert.match(certification,/service_record_certified_memory_outcome_v1/);
  assert.match(certification,/non_authoritative_outcome_signal:true/);
});

test("governance UI explains outcome evidence does not equal automatic truth",()=>{
  assert.match(panel,/Verified Memory outcome evidence/);
  assert.match(panel,/Outcome signals are audit evidence, not automatic truth/);
  assert.match(panel,/positive use never raises certification authority by itself/);
  assert.match(panel,/REVIEW TRIGGERED/);
  assert.match(panel,/EVIDENCE ONLY/);
});
