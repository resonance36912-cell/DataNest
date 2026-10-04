import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

test("reviewer qualification registry is service-only and scoped",()=>{
  const migration=read("supabase/staging-migrations/20260929100000_add_language_reviewer_registry.sql");
  assert.match(migration,/create table if not exists public\.ai_language_reviewer_qualifications/);
  assert.match(migration,/qualification_scope in \('source_language_review','semantic_equivalence'\)/);
  assert.match(migration,/revoke all on table public\.ai_language_reviewer_qualifications from public,anon,authenticated/);
  assert.match(migration,/grant select,insert,update on table public\.ai_language_reviewer_qualifications to service_role/);
  assert.match(migration,/revoked_by uuid/);
  assert.match(migration,/revoked_at timestamptz/);
  assert.match(migration,/revocation_reason text/);
  assert.match(migration,/where active=true/);
  assert.doesNotMatch(migration,/unique\(project_id,user_id,language_tag,qualification_scope\)/);
});

test("certification gateway requires registry coverage for LANGUAGE_REVIEW",()=>{
  const source=read("supabase/functions/datanest-ai-certification/index.ts");
  assert.match(source,/action==="register_language_reviewer"/);
  assert.match(source,/Owner authority is required to register language reviewer qualifications/);
  assert.match(source,/action==="revoke_language_reviewer"/);
  assert.match(source,/qualificationCoverageForReviewedLanguages/);
  assert.match(source,/Active language reviewer qualification is required for every reviewed language/);
  assert.match(source,/reviewer_qualification_status:"registry_verified"/);
  assert.match(source,/reviewer_qualification_ids:qualificationCoverage\.qualificationIds/);
  assert.match(source,/language_review_policy:"datanest-language-review-v3"/);
  assert.match(source,/assertLanguageReviewQualificationsCurrent/);
  assert.match(source,/A reviewer qualification bound to LANGUAGE_REVIEW is no longer active/);
  assert.match(source,/LANGUAGE_REVIEW predates the current reviewer qualification policy/);
  assert.match(source,/\.insert\(\{/);
  assert.doesNotMatch(source,/\.upsert\(\{[\s\S]*ai_language_reviewer_qualifications/);
  assert.match(source,/revoked_by:user\.id/);
  assert.match(source,/revoked_at:now/);
});

test("certification console exposes qualification registry without claiming accreditation",()=>{
  const source=read("src/components/DataNestAiCertificationPanel.tsx");
  assert.match(source,/Language reviewer qualifications/);
  assert.match(source,/Registry entries are project governance evidence, not external accreditation/);
  assert.match(source,/Register my reviewer qualification/);
  assert.match(source,/Revoke qualification/);
  assert.match(source,/passing review requires active reviewer-registry coverage/);
});
