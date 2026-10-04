import test from "node:test";
import assert from "node:assert/strict";
import {
  automatedLearningGateResults,
  candidateValidationSeal,
  validationRunMatchesSeal
} from "../../supabase/functions/_shared/datanestAiValidation.ts";

const hashA="a".repeat(64);
const hashB="b".repeat(64);

test("low-risk well-supported learning passes the three deterministic pre-stress gates",()=>{
  const runs=automatedLearningGateResults({
    normalizedKnowledge:"Keep trace IDs visible on every governed DataNest AI turn.",
    riskClass:"low",
    evidenceCount:3,
    independentEvidenceCount:3,
    confidence:0.84,
    hasConflict:false,
    contentHash:hashA,
    policyVersion:"datanest-ai-governed-memory-v2",
    evidenceHash:hashB
  });
  assert.deepEqual(runs.map(run=>[run.gate,run.passed]),[
    ["AUDIT",true],
    ["VERIFY",true],
    ["VALIDATE",true]
  ]);
});

test("automation waits for at least three evidence items",()=>{
  assert.deepEqual(automatedLearningGateResults({
    normalizedKnowledge:"Keep trace IDs visible on every governed DataNest AI turn.",
    riskClass:"low",
    evidenceCount:2,
    independentEvidenceCount:2,
    confidence:0.9,
    hasConflict:false,
    contentHash:hashA,
    policyVersion:"datanest-ai-governed-memory-v2",
    evidenceHash:hashB
  }),[]);
});

test("high-risk knowledge is never pre-validated automatically",()=>{
  assert.deepEqual(automatedLearningGateResults({
    normalizedKnowledge:"Change production authorization policy.",
    riskClass:"high",
    evidenceCount:10,
    independentEvidenceCount:5,
    confidence:1,
    hasConflict:false,
    contentHash:hashA,
    policyVersion:"datanest-ai-governed-memory-v2",
    evidenceHash:hashB
  }),[]);
});

test("contradictory low-risk evidence fails deterministic validation",()=>{
  const runs=automatedLearningGateResults({
    normalizedKnowledge:"Use compact job headers in the workspace.",
    riskClass:"low",
    evidenceCount:4,
    independentEvidenceCount:3,
    confidence:0.85,
    hasConflict:true,
    contentHash:hashA,
    policyVersion:"datanest-ai-governed-memory-v2",
    evidenceHash:hashB
  });
  assert.equal(runs.find(run=>run.gate==="VALIDATE")?.passed,false);
});

test("validation runs must match the exact candidate and evidence seal",()=>{
  const seal=candidateValidationSeal({
    contentHash:hashA,
    policyVersion:"datanest-ai-governed-memory-v2",
    evidenceHash:hashB,
    evidenceCount:3,
    riskClass:"low",
    hasConflict:false
  });
  assert.equal(validationRunMatchesSeal({...seal},seal),true);
  assert.equal(validationRunMatchesSeal({...seal,candidate_evidence_hash:"c".repeat(64)},seal),false);
  assert.equal(validationRunMatchesSeal({...seal,candidate_evidence_count:4},seal),false);
  assert.equal(validationRunMatchesSeal({...seal,candidate_policy_version:"old"},seal),false);
});
