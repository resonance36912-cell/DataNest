import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migration=fs.readFileSync(
  path.join(root,"supabase/migrations/20260929090517_add_canonical_memory_consolidation.sql"),
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
const standards=fs.readFileSync(
  path.join(root,"docs/MEMORY_LEARNING_LANGUAGE_STANDARDS.md"),
  "utf8"
);

test("canonical consolidation preserves historical Certified Memory lineage",()=>{
  assert.match(migration,/add column if not exists consolidated_into_memory_id uuid/);
  assert.match(migration,/create table if not exists public\.certified_memory_consolidations/);
  assert.match(migration,/create table if not exists public\.certified_memory_consolidation_members/);
  assert.match(migration,/normalized_knowledge_snapshot text not null/);
  assert.match(migration,/content_hash_snapshot text not null/);
  assert.match(migration,/historical_source_preserved/);
  assert.match(migration,/set active=false,\s+consolidated_into_memory_id=proposal_row\.canonical_memory_id/);
  assert.doesNotMatch(migration,/delete from public\.certified_memory/);
});

test("canonical consolidation is proposal-based and owner-executed",()=>{
  assert.match(migration,/Owner or Admin authority is required to propose Certified Memory consolidation/);
  assert.match(migration,/Owner authority is required to execute or reject Certified Memory consolidation/);
  assert.match(migration,/status in \('proposed','executed','rejected'\)/);
  assert.match(migration,/service_propose_certified_memory_consolidation_v1/);
  assert.match(migration,/service_decide_certified_memory_consolidation_v1/);
  assert.match(migration,/Contradictory Certified Memory cannot be consolidated as equivalent knowledge/);
  assert.match(migration,/proposal is stale and must be reviewed again/);
});

test("canonical consolidation reuses a separately certified canonical memory rather than synthesizing truth",()=>{
  assert.match(migration,/canonical_memory_id uuid not null references public\.certified_memory/);
  assert.match(migration,/Canonical memory must be included in the consolidation member set/);
  assert.match(migration,/All consolidation members must be active, unconsolidated project memories in the same category/);
  assert.doesNotMatch(migration,/insert into public\.certified_memory\(/);
});

test("certification workspace exposes governed equivalent-memory proposals",()=>{
  assert.match(certification,/loadCanonicalMemoryConsolidationSuggestions/);
  assert.match(certification,/memoryConsolidationSuggestions/);
  assert.match(certification,/memoryConsolidationProposals/);
  assert.match(certification,/action==="propose_memory_consolidation"/);
  assert.match(certification,/service_propose_certified_memory_consolidation_v1/);
  assert.match(certification,/action==="decide_memory_consolidation"/);
  assert.match(certification,/service_decide_certified_memory_consolidation_v1/);
  assert.match(certification,/Owner authority is required to execute or reject a canonical memory consolidation/);
});

test("certification console keeps the human canonical choice explicit",()=>{
  assert.match(panel,/Equivalent Verified Memory/);
  assert.match(panel,/Keep first as canonical/);
  assert.match(panel,/Keep second as canonical/);
  assert.match(panel,/Execute canonical consolidation/);
  assert.match(panel,/Reject proposal/);
});

test("standards ledger documents consolidation as governed deduplication, not new certification",()=>{
  assert.match(standards,/Canonical memory consolidation/);
  assert.match(standards,/does not synthesize or certify new knowledge/);
  assert.match(standards,/historical source memories remain traceable/);
});
