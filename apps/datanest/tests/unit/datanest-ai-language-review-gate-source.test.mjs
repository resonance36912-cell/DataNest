import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

test("staging validation contract allows a distinct language review gate",()=>{
  const migration=read("supabase/staging-migrations/20260929093000_add_language_review_gate.sql");
  assert.match(migration,/LANGUAGE_REVIEW/);
  assert.match(migration,/ai_validation_runs_gate_check/);
  assert.doesNotMatch(migration,/CERTIFIED|certified_memory/);
});

test("certification requires language review only for evidence that signals it",()=>{
  const source=read("supabase/functions/datanest-ai-certification/index.ts");
  assert.match(source,/requiredGateOrder\(languageReviewRequired:boolean\)/);
  assert.match(source,/\["AUDIT","VERIFY","LANGUAGE_REVIEW","VALIDATE","STRESS_TEST"\]/);
  assert.match(source,/loadLanguageReviewByCandidate/);
  assert.match(source,/summarizeLanguageReviewEvidence/);
  assert.match(source,/languageReview\.required&&latest\.get\("LANGUAGE_REVIEW"\)!==true/);
  assert.match(source,/Owner authority is required for language or derivation-review candidates/);
  assert.match(source,/reviewer_qualification_status:"registry_verified"/);
  assert.match(source,/reviewer_qualification_ids:qualificationCoverage\.qualificationIds/);
  assert.match(source,/review\.reviewedLanguages,\s*"source_language_review"/);
  assert.match(source,/!languageReview\.required\s*&&\s*!refreshedDerivationReview\.required\s*&&\s*allAutomatedCertificationGatesPassed/);
});

test("language review evidence is derived from reviewer inputs rather than a generic pass button",()=>{
  const source=read("supabase/functions/datanest-ai-certification/index.ts");
  assert.match(source,/governedLanguageReviewResult/);
  assert.match(source,/reviewedLanguages:body\.reviewedLanguages/);
  assert.match(source,/reviewBasis:body\.reviewBasis/);
  assert.match(source,/meaningPreserved:body\.meaningPreserved/);
  assert.match(source,/unresolvedAmbiguity:body\.unresolvedAmbiguity/);
  assert.match(source,/passed=review\.passed/);
});

test("certification console exposes the conditional language review evidence form",()=>{
  const source=read("src/components/DataNestAiCertificationPanel.tsx");
  assert.match(source,/languageGateOrder=\["AUDIT","VERIFY","LANGUAGE_REVIEW","VALIDATE","STRESS_TEST"\]/);
  assert.match(source,/Reviewed BCP 47 languages/);
  assert.match(source,/Review basis and limitations/);
  assert.match(source,/Meaning, negation, quantities and modal force are preserved/);
  assert.match(source,/No unresolved semantic ambiguity remains/);
  assert.match(source,/passing review requires active reviewer-registry coverage/);
  assert.match(source,/Registry entries are project governance evidence, not external accreditation/);
  assert.match(source,/if\(!candidateRuns\.has\(run\.gate\)\)candidateRuns\.set/);
});
