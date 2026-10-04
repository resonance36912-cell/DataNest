import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migration=fs.readFileSync(
  path.join(root,"supabase/migrations/20260929084704_add_verified_memory_review_lifecycle.sql"),
  "utf8"
);
const certification=fs.readFileSync(
  path.join(root,"supabase/functions/datanest-ai-certification/index.ts"),
  "utf8"
);
const certificationPanel=fs.readFileSync(
  path.join(root,"src/components/DataNestAiCertificationPanel.tsx"),
  "utf8"
);
const memoryPanel=fs.readFileSync(
  path.join(root,"src/components/DataNestAiMemoryPanel.tsx"),
  "utf8"
);

test("Certified Memory receives category-based review schedules",()=>{
  assert.match(migration,/certified_memory_review_interval_v1/);
  assert.match(migration,/\(security\|authorization\|authority\|privacy\|legal\|destructive\)/);
  assert.match(migration,/\(governance\|policy\)/);
  assert.match(migration,/\(architecture\|infrastructure\|schema\|migration\)/);
  assert.match(migration,/\(workflow\|product\|ecosystem\)/);
  assert.match(migration,/then interval '30 days'/);
  assert.match(migration,/then interval '60 days'/);
  assert.match(migration,/then interval '90 days'/);
  assert.match(migration,/then interval '180 days'/);
  assert.match(migration,/schedule_certified_memory_review_v1/);
  assert.match(migration,/before insert on public\.certified_memory/);
  assert.match(migration,/where active=true\s+and review_after is null/);
});

test("Certified Memory reviews are append-only governed evidence",()=>{
  assert.match(migration,/create table if not exists public\.certified_memory_reviews/);
  assert.match(migration,/decision in \('reaffirmed','review_required','retired'\)/);
  assert.match(migration,/alter table public\.certified_memory_reviews enable row level security/);
  assert.match(migration,/revoke all on table public\.certified_memory_reviews from public,anon,authenticated/);
  assert.match(migration,/grant select,insert on table public\.certified_memory_reviews to service_role/);
  assert.match(migration,/certified_memory_reviews_reviewer_idx/);
  assert.match(migration,/actor_role is null or actor_role not in \('owner','admin'\)/);
  assert.match(migration,/target_decision='retired' and actor_role<>'owner'/);
  assert.match(migration,/service_review_certified_memory_v1/);
});

test("review-due memory remains certified but is down-weighted",()=>{
  assert.match(migration,/then 0\.65\s+else 1\.0\s+end as review_factor/);
  assert.match(migration,/\) \* s\.review_factor as memory_score/);
  assert.match(migration,/'strategy','verified-memory-ranked-v2'/);
  assert.match(migration,/'review_due',\(review_after is not null and review_after<=now\(\)\)/);
  assert.match(migration,/'review_factor',round\(review_factor::numeric,6\)/);
});

test("certification gateway exposes review queue and governed review action",()=>{
  assert.match(certification,/loadCertifiedMemoryReviewQueue/);
  assert.match(certification,/\.lte\("review_after",now\)/);
  assert.match(certification,/memoryReviewItems/);
  assert.match(certification,/action==="review_memory"/);
  assert.match(certification,/service_review_certified_memory_v1/);
  assert.match(certification,/Owner authority is required to retire Certified Memory/);
});

test("governance UI surfaces review-due memory without relabeling it uncertified",()=>{
  assert.match(certificationPanel,/Verified Memory review queue/);
  assert.match(certificationPanel,/CERTIFIED · REVIEW DUE/);
  assert.match(certificationPanel,/Reaffirm reviewed memory/);
  assert.match(certificationPanel,/Retire from active memory/);
  assert.match(memoryPanel,/Project-wide reusable knowledge/);
  assert.match(memoryPanel,/CERTIFIED · REVIEW DUE/);
  assert.match(memoryPanel,/reviewFactor:item\.review_factor/);
});
