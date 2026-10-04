import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migration=fs.readFileSync(
  path.join(root,"supabase/migrations/20260929232500_optimize_canonical_memory_consolidation_fk_indexes.sql"),
  "utf8"
);

test("canonical memory consolidation foreign keys have covering indexes",()=>{
  assert.match(migration,/certified_memory_consolidated_into_fk_idx\s+on public\.certified_memory\(consolidated_into_memory_id\)/);
  assert.match(migration,/certified_memory_consolidation_members_memory_fk_idx\s+on public\.certified_memory_consolidation_members\(memory_id\)/);
  assert.match(migration,/certified_memory_consolidations_proposed_by_idx\s+on public\.certified_memory_consolidations\(proposed_by\)/);
  assert.match(migration,/certified_memory_consolidations_decided_by_idx\s+on public\.certified_memory_consolidations\(decided_by\)/);
});

test("canonical memory index hardening is performance-only",()=>{
  assert.doesNotMatch(migration,/alter table/i);
  assert.doesNotMatch(migration,/create policy/i);
  assert.doesNotMatch(migration,/grant\s/i);
  assert.doesNotMatch(migration,/revoke\s/i);
  assert.doesNotMatch(migration,/update\s+public\./i);
  assert.doesNotMatch(migration,/delete\s+from/i);
});
