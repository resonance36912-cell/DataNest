import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyCertifiedMemoryRelation } from "../../supabase/functions/_shared/datanestAiTrends.ts";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migration=fs.readFileSync(
  path.join(root,"supabase/migrations/20260929043923_optimize_collective_verified_memory.sql"),
  "utf8"
);
const relevanceRepair=fs.readFileSync(
  path.join(root,"supabase/migrations/20260929051213_fix_verified_memory_relevance_ranking.sql"),
  "utf8"
);
const chat=fs.readFileSync(
  path.join(root,"supabase/functions/datanest-ai-chat/index.ts"),
  "utf8"
);
const certification=fs.readFileSync(
  path.join(root,"supabase/functions/datanest-ai-certification/index.ts"),
  "utf8"
);

test("certified memory relation classifier detects near-duplicate knowledge",()=>{
  const hint=classifyCertifiedMemoryRelation(
    "Privileged service credentials must remain server-side and never reach browser clients",
    "Service credentials must remain server-side and must never reach browser clients"
  );
  assert.equal(hint.relation,"duplicates");
  assert.ok(hint.similarity>=0.9);
});

test("certified memory relation classifier detects negation conflicts",()=>{
  const hint=classifyCertifiedMemoryRelation(
    "Use compact job headers for the DataNest workflow",
    "Do not use compact job headers for the DataNest workflow"
  );
  assert.equal(hint.relation,"contradicts");
  assert.equal(hint.polarityConflict,true);
});

test("certified memory relation classifier detects scalar conflicts",()=>{
  const hint=classifyCertifiedMemoryRelation(
    "Set upload limit to 10 MB for this workflow",
    "Set upload limit to 20 MB for this workflow"
  );
  assert.equal(hint.relation,"contradicts");
  assert.equal(hint.scalarConflict,true);
});

test("verified memory migration adds scope, ageing, ranking and relation graph",()=>{
  assert.match(migration,/add column if not exists applicability jsonb/);
  assert.match(migration,/add column if not exists review_after timestamptz/);
  assert.match(migration,/create table if not exists public\.certified_memory_relations/);
  assert.match(migration,/relation_kind in \('supports','extends','duplicates','narrows','contradicts','supersedes'\)/);
  assert.match(migration,/get_ranked_certified_memory_context_v2/);
  assert.match(migration,/ts_rank_cd/);
  assert.match(migration,/relevance_score\*0\.55/);
  assert.match(migration,/trust_score\*0\.25/);
  assert.match(migration,/least\(1,s\.scope_score\)\*0\.15/);
  assert.match(migration,/freshness_score\*0\.05/);
  assert.match(migration,/'strategy','verified-memory-ranked-v1'/);
  assert.match(migration,/service_promote_certified_memory_v2/);
});

test("DataNest AI keeps projection identity fail-closed when the ranked v3 contract is unavailable",()=>{
  assert.match(chat,/get_ranked_certified_memory_context_v3/);
  assert.match(chat,/target_projection_key:input\.projectionKey/);
  assert.match(chat,/target_query:input\.query/);
  assert.match(chat,/target_product_scope:input\.productScope/);
  assert.match(chat,/target_jurisdiction:input\.jurisdiction/);
  assert.match(chat,/target_visibility_class:input\.visibilityClass/);
  assert.match(chat,/PGRST202/);
  assert.match(chat,/certified_memory_projection_unavailable/);
  assert.doesNotMatch(chat,/get_ranked_certified_memory_context_v2/);
  assert.doesNotMatch(chat,/get_certified_memory_context/);
  assert.match(chat,/productScope:legalMode\?"legal_eagle":developmentMode\?"development_command":"datanest_ai"/);
});

test("promotion blocks unresolved contradictions and duplicate memory pollution",()=>{
  assert.match(certification,/classifyCertifiedMemoryRelation/);
  assert.match(certification,/Candidate conflicts with active Verified Memory/);
  assert.match(certification,/Candidate substantially duplicates active Verified Memory/);
  assert.match(certification,/Owner access is required for explicit knowledge supersession/);
  assert.match(certification,/service_promote_certified_memory_v2/);
  assert.match(certification,/target_applicability:applicability/);
  assert.match(certification,/target_review_after:reviewAfter/);
});


test("verified memory relevance matches any meaningful query term instead of requiring every term",()=>{
  assert.match(relevanceRepair,/to_tsquery\('simple',string_agg\(token,' \\| ' order by token\)\)/);
  assert.match(relevanceRepair,/limit 24/);
  assert.match(relevanceRepair,/cross join query_terms q/);
  assert.doesNotMatch(relevanceRepair,/plainto_tsquery/);
});
