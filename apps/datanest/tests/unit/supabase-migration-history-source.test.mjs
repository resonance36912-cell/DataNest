import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const migrationDir=path.join(root,"supabase/migrations");
const files=fs.readdirSync(migrationDir).filter(name=>name.endsWith(".sql"));
const versions=files.map(name=>name.split("_",1)[0]);

test("migration versions remain unique",()=>{
  assert.equal(new Set(versions).size,versions.length);
});

test("recent canonical production migration identities are preserved",()=>{
  for(const file of [
    "20260928223619_fix_development_command_runtime_access.sql",
    "20260929042816_link_transcheduler_job_requirements_user_interests.sql",
    "20260929043923_optimize_collective_verified_memory.sql",
    "20260929051213_fix_verified_memory_relevance_ranking.sql",
    "20260929053617_add_certified_memory_usage_receipts.sql",
    "20260929073824_external_audit_foundations.sql",
    "20260929073828_external_audit_memory_receipts.sql",
    "20260929073832_external_audit_ai_requests.sql",
    "20260929073845_external_audit_operations.sql",
    "20260929083316_continuous_governance_optimization_v1.sql",
    "20260929084704_add_verified_memory_review_lifecycle.sql",
    "20260929084708_add_verified_memory_outcome_evidence.sql",
    "20260929084713_add_verified_memory_product_projections.sql",
    "20260929084736_optimize_continuous_governance_fk_indexes.sql",
    "20260929090134_external_audit_release_hardening.sql",
    "20260929090517_add_canonical_memory_consolidation.sql",
    "20260929091545_governance_control_evidence_graph_v1.sql",
    "20260929092807_split_external_audit_reviewer_rls_policies.sql",
    "20260929095401_index_certified_memory_usage_receipts_request.sql",
    "20260929095814_governance_ai_impact_assessments_v1.sql"
  ]) assert.ok(files.includes(file),file+" is missing");
});
