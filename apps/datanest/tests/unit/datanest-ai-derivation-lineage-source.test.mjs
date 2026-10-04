import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

test("staging stores immutable derivation lineage and append-only semantic reviews",()=>{
  const migration=read("supabase/staging-migrations/20260929103000_add_evidence_derivation_lineage.sql");
  assert.match(migration,/create table if not exists public\.ai_evidence_derivations/);
  assert.match(migration,/unique\(project_id,child_event_id\)/);
  assert.match(migration,/child_event_id <> parent_event_id/);
  assert.match(migration,/create table if not exists public\.ai_evidence_derivation_reviews/);
  assert.match(migration,/decision in \('equivalent','changed'\)/);
  assert.match(migration,/grant select,insert on table public\.ai_evidence_derivations to service_role/);
  assert.match(migration,/grant select,insert on table public\.ai_evidence_derivation_reviews to service_role/);
  assert.doesNotMatch(migration,/grant .*update.*ai_evidence_derivation_reviews/i);
  assert.match(migration,/evidence_context jsonb/);
});

test("external AI intake accepts explicit lineage as one immutable declaration",()=>{
  const source=read("supabase/functions/datanest-ai-intake/index.ts");
  assert.match(source,/derivedFromEventId/);
  assert.match(source,/derivationKind/);
  assert.match(source,/transformationVersion/);
  assert.match(source,/ensureEvidenceDerivation/);
  assert.match(source,/already bound to different immutable derivation lineage/);
  assert.match(source,/root_event_id/);
});

test("learning counts root source families before legacy independence keys",()=>{
  const learning=read("supabase/functions/_shared/datanestAiLearning.ts");
  const trends=read("supabase/functions/_shared/datanestAiTrends.ts");
  assert.match(learning,/from\("ai_evidence_derivations"\)/);
  assert.match(learning,/derivationFamilyId/);
  assert.match(trends,/evidenceIndependenceIdentity/);
  assert.match(trends,/derivationReviewRequired/);
  assert.match(trends,/languageReviewRequired\|\|derivationReviewRequired\?"high"/);
});

test("certification requires current qualified semantic equivalence and binds the review hash",()=>{
  const source=read("supabase/functions/datanest-ai-certification/index.ts");
  assert.match(source,/loadDerivationReviewByCandidate/);
  assert.match(source,/action==="review_evidence_derivation"/);
  assert.match(source,/"semantic_equivalence"/);
  assert.match(source,/derivationReview\.required&&derivationReview\.blocked/);
  assert.match(source,/derivation_review_hash/);
  assert.match(source,/promotionDerivationReview\.reviewHash/);
  assert.match(source,/Derived evidence review is no longer current/);
});

test("certification console exposes source-family review without claiming independence",()=>{
  const source=read("src/components/DataNestAiCertificationPanel.tsx");
  assert.match(source,/Source-family derivation review required/);
  assert.match(source,/review never makes a derivation independent corroboration/);
  assert.match(source,/Confirm semantic equivalence/);
  assert.match(source,/Record material change/);
  assert.match(source,/Explicit BCP 47 language metadata is required/);
});
