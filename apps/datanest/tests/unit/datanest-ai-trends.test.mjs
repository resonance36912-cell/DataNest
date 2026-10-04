import test from "node:test";
import assert from "node:assert/strict";
import {
  candidateFromRepeatedEvidence,
  classifyLearningRisk,
  evidenceSimilarity,
  isSyntheticLearningEvidence,
  normalizeTrendTokens,
  trendKeyForTokens,
  bestCandidateByEvidenceOverlap,
  stableCandidateIdFromHash
} from "../../supabase/functions/_shared/datanestAiTrends.ts";

test("near-duplicate requirements cluster", () => {
  const a=normalizeTrendTokens("Clipboard auto fill must require permission");
  const b=normalizeTrendTokens("Require clipboard permission before automatic fill");
  assert.ok(evidenceSimilarity(a,b)>=0.5);
});

test("trend keys are deterministic for equivalent token sets", () => {
  const a=normalizeTrendTokens("Keep trace IDs visible");
  const b=normalizeTrendTokens("Visible trace IDs keep");
  assert.equal(trendKeyForTokens(a),trendKeyForTokens(b));
});

test("security and authorization learnings are high risk", () => {
  assert.deepEqual(classifyLearningRisk("change authentication and RLS authorization"),{
    category:"authorization",
    riskClass:"high"
  });
});

test("one-off evidence does not become an auto candidate", () => {
  assert.equal(candidateFromRepeatedEvidence([{id:"e1",content:"single observation"}]),null);
});

test("repeated evidence can produce a low-risk candidate but not a certification", () => {
  const candidate=candidateFromRepeatedEvidence([
    {id:"e1",content:"Use the compact job header in DataNest AI",sessionId:"s1",jobId:"j1",sourceType:"human",sourceUserId:"u1"},
    {id:"e2",content:"Keep the compact job header for DataNest AI",sessionId:"s2",jobId:"j1",sourceType:"human",sourceUserId:"u1"}
  ]);
  assert.equal(candidate?.lifecycleState,"INTAKE");
  assert.equal(candidate?.riskClass,"low");
  assert.ok(candidate?.evidenceIds.length===2);
  assert.equal(candidate?.independentEvidenceCount,2);
  assert.ok((candidate?.confidence||0)>0.5);
});

test("stress fixtures are excluded from learning", () => {
  const stress={id:"e1",content:"stress-1790286496786-ebc9f6df-message-24"};
  assert.equal(isSyntheticLearningEvidence(stress),true);
  assert.equal(candidateFromRepeatedEvidence([
    stress,
    {id:"e2",content:"stress-1790286496786-ebc9f6df-message-1"}
  ]),null);
});

test("fixture metadata is excluded from learning", () => {
  assert.equal(isSyntheticLearningEvidence({
    id:"e1",
    content:"Keep trace IDs visible for every request",
    metadata:{test_fixture:"acceptance-suite"}
  }),true);
});

test("explicit contradictory evidence is flagged for owner review", () => {
  const candidate=candidateFromRepeatedEvidence([
    {id:"e1",content:"Use compact job header for DataNest workflow",sessionId:"s1"},
    {id:"e2",content:"Do not use compact job header for DataNest workflow",sessionId:"s2"}
  ]);
  assert.equal(candidate?.hasConflict,true);
  assert.ok((candidate?.confidence||1)<0.5);
});

test("repeated trend evidence reuses the candidate with the strongest evidence overlap", () => {
  const candidateId=bestCandidateByEvidenceOverlap(
    [
      {candidateId:"candidate-a",eventId:"e1"},
      {candidateId:"candidate-a",eventId:"e2"},
      {candidateId:"candidate-b",eventId:"e2"},
      {candidateId:"candidate-b",eventId:"e3"}
    ],
    ["e1","e2","e4"]
  );
  assert.equal(candidateId,"candidate-a");
});

test("candidate reuse requires at least two shared evidence events", () => {
  const candidateId=bestCandidateByEvidenceOverlap(
    [{candidateId:"candidate-a",eventId:"e1"}],
    ["e1","e2"]
  );
  assert.equal(candidateId,null);
});

test("candidate reuse requires substantial overlap for larger trend evidence sets", () => {
  const links=[
    {candidateId:"candidate-a",eventId:"e1"},
    {candidateId:"candidate-a",eventId:"e2"},
    {candidateId:"candidate-a",eventId:"e3"},
    {candidateId:"candidate-a",eventId:"e4"}
  ];
  assert.equal(
    bestCandidateByEvidenceOverlap(links,["e1","e2","e3","e4","e5","e6","e7","e8","e9","e10"]),
    null
  );
});

test("stable candidate ids map the same SHA-256 digest to the same UUID", () => {
  const digest="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const first=stableCandidateIdFromHash(digest);
  const second=stableCandidateIdFromHash(digest);
  assert.equal(first,second);
  assert.match(first,/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("stable candidate ids reject malformed digests", () => {
  assert.throws(()=>stableCandidateIdFromHash("not-a-sha256"),/sha-256/i);
});
