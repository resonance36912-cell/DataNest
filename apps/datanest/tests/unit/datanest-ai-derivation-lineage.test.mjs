import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalDerivationKind,
  evidenceIndependenceIdentity,
  semanticReviewStatus
} from "../../supabase/functions/_shared/datanestEvidenceDerivation.ts";
import { candidateFromRepeatedEvidence } from "../../supabase/functions/_shared/datanestAiTrends.ts";

test("derivation kinds are explicit and normalized",()=>{
  assert.equal(canonicalDerivationKind("Translation"),"translation");
  assert.equal(canonicalDerivationKind("semantic-summary".replace("semantic-","")),"summary");
  assert.throws(()=>canonicalDerivationKind("automatic_guess"),/Unsupported evidence derivation kind/);
});

test("derived evidence identity collapses to the immutable root family before legacy independence keys",()=>{
  assert.equal(evidenceIndependenceIdentity({
    id:"e1",
    derivationFamilyId:"root-1",
    independenceKey:"provider-a"
  }),"derivation-family:root-1");
  assert.equal(evidenceIndependenceIdentity({
    id:"e2",
    independenceKey:"file-sha256:abc"
  }),"independence-key:file-sha256:abc");
});

test("translations of one source cannot manufacture independent corroboration",()=>{
  const base={
    content:"Project owners must review semantic equivalence before derived evidence can support certification.",
    jobId:"job",
    sessionId:"session",
    sourceType:"ai_companion",
    sourceUserId:"user",
    metadata:{learning_eligible:true}
  };
  const candidate=candidateFromRepeatedEvidence([
    {id:"t1",...base,derivationFamilyId:"root-source",derivationKind:"translation",independenceKey:"provider-a"},
    {id:"t2",...base,derivationFamilyId:"root-source",derivationKind:"translation",independenceKey:"provider-b"},
    {id:"t3",...base,derivationFamilyId:"root-source",derivationKind:"paraphrase",independenceKey:"provider-c"}
  ]);
  assert.ok(candidate);
  assert.equal(candidate.independentEvidenceCount,1);
  assert.equal(candidate.derivationReviewRequired,true);
  assert.equal(candidate.riskClass,"high");
});

test("semantic review status fails closed on absent or revoked qualification evidence",()=>{
  assert.equal(semanticReviewStatus(undefined,false),"unreviewed");
  assert.equal(semanticReviewStatus("equivalent",false),"stale_review");
  assert.equal(semanticReviewStatus("equivalent",true),"reviewed_equivalent");
  assert.equal(semanticReviewStatus("changed",true),"reviewed_changed");
});
