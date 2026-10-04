import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeReviewedLanguages,
  governedLanguageReviewResult,
  qualificationCoverageForReviewedLanguages,
  reviewedLanguageCoverageSatisfied,
  summarizeLanguageReviewEvidence
} from "../../supabase/functions/_shared/datanestLanguageReview.ts";

test("language review summary identifies only evidence that requires review",()=>{
  const summary=summarizeLanguageReviewEvidence([
    {id:"e1",content:"Use compact headers",metadata:{source_language:"en-ZA",language_review_required:false}},
    {id:"e2",content:"Gebruik kort opskrifte",metadata:{
      source_language:"af",
      language_metadata_status:"declared",
      language_review_required:true,
      language_review_reasons:["declared_language_requires_review"]
    }},
    {id:"e3",content:"中文 headers",metadata:{language_metadata_status:"not_supplied"}}
  ]);
  assert.equal(summary.required,true);
  assert.deepEqual(summary.sourceLanguages,["af","en-ZA"]);
  assert.deepEqual(summary.evidenceIds,["e2","e3"]);
  assert.ok(summary.reasons.includes("declared_language_requires_review"));
  assert.ok(summary.reasons.includes("unicode_or_language_signal_requires_review"));
});

test("reviewed language coverage must be explicit valid BCP 47 metadata",()=>{
  assert.deepEqual(canonicalizeReviewedLanguages(["en-za","af","af"]),["af","en-ZA"]);
  assert.throws(()=>canonicalizeReviewedLanguages([]),/At least one reviewed/);
  assert.throws(()=>canonicalizeReviewedLanguages(["bad_tag"]),/valid BCP 47/);
});

test("reviewed language tags cover every specific declared source language",()=>{
  assert.equal(reviewedLanguageCoverageSatisfied(["af","en-ZA"],["af-ZA","en"]),true);
  assert.equal(reviewedLanguageCoverageSatisfied(["af","en-ZA"],["af"]),false);
  assert.equal(reviewedLanguageCoverageSatisfied(["und"],["zu-ZA"]),true);
  assert.equal(reviewedLanguageCoverageSatisfied(["af","en-ZA"],["mul"]),false);
});

test("passing language review requires preserved meaning and no unresolved ambiguity",()=>{
  assert.deepEqual(governedLanguageReviewResult({
    reviewedLanguages:["af"],
    reviewBasis:"Bilingual comparison against the preserved source evidence.",
    meaningPreserved:true,
    unresolvedAmbiguity:false
  }),{
    reviewedLanguages:["af"],
    reviewBasis:"Bilingual comparison against the preserved source evidence.",
    meaningPreserved:true,
    unresolvedAmbiguity:false,
    passed:true
  });
  assert.equal(governedLanguageReviewResult({
    reviewedLanguages:["zu-ZA"],
    reviewBasis:"Review found an unresolved modal-force ambiguity.",
    meaningPreserved:true,
    unresolvedAmbiguity:true
  }).passed,false);
  assert.equal(governedLanguageReviewResult({
    reviewedLanguages:["xh"],
    reviewBasis:"Review found that the proposed normalized knowledge changes meaning.",
    meaningPreserved:false,
    unresolvedAmbiguity:false
  }).passed,false);
});


test("reviewer qualification coverage follows reviewed language bases and active status",()=>{
  const qualifications=[
    {id:"q1",language_tag:"af",qualification_scope:"source_language_review",active:true},
    {id:"q2",language_tag:"zu-ZA",qualification_scope:"semantic_equivalence",active:true},
    {id:"q3",language_tag:"xh",qualification_scope:"source_language_review",active:false},
    {id:"q4",language_tag:"af-ZA",qualification_scope:"semantic_equivalence",active:true}
  ];
  assert.deepEqual(
    qualificationCoverageForReviewedLanguages(qualifications,["af-ZA","zu"]),
    {covered:true,qualificationIds:["q1","q2"],missingLanguages:[]}
  );
  assert.deepEqual(
    qualificationCoverageForReviewedLanguages(qualifications,["af"]),
    {covered:true,qualificationIds:["q1"],missingLanguages:[]}
  );
  assert.deepEqual(
    qualificationCoverageForReviewedLanguages(qualifications,["af","xh"]),
    {covered:false,qualificationIds:["q1"],missingLanguages:["xh"]}
  );
  assert.deepEqual(
    qualificationCoverageForReviewedLanguages(
      qualifications,
      ["af-ZA"],
      "source_language_review"
    ),
    {covered:true,qualificationIds:["q1"],missingLanguages:[]}
  );
  assert.deepEqual(
    qualificationCoverageForReviewedLanguages(
      qualifications,
      ["af-ZA","zu"],
      "semantic_equivalence"
    ),
    {covered:true,qualificationIds:["q2","q4"],missingLanguages:[]}
  );
  assert.deepEqual(
    qualificationCoverageForReviewedLanguages(
      qualifications,
      ["zu"],
      "source_language_review"
    ),
    {covered:false,qualificationIds:[],missingLanguages:["zu"]}
  );
});
