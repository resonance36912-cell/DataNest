import test from "node:test";
import assert from "node:assert/strict";
import { createEvidenceEnvelope, validateEvidenceEnvelope, ingestEvidence } from "../../lib/resonance-forge-evidence-ingestion.mjs";

const sha="a".repeat(40);
const candidate={candidateId:"c1",repository:"DataNest-Supository/DataNest",commitSha:sha};

test("evidence identity and digest are deterministic",()=> {
  const a=createEvidenceEnvelope({...candidate,type:"unit",result:"pass",producer:"ci"});
  const b=createEvidenceEnvelope({...candidate,type:"unit",result:"pass",producer:"ci"});
  assert.equal(a.evidenceId,b.evidenceId); assert.equal(a.digest,b.digest);
});
test("candidate and SHA binding is enforced",()=> {
  const e=createEvidenceEnvelope({...candidate,type:"security",result:"pass",producer:"scanner"});
  assert.equal(validateEvidenceEnvelope(e,{...candidate,commitSha:"b".repeat(40)}).valid,false);
  assert.equal(validateEvidenceEnvelope(e,{...candidate,candidateId:"c2"}).valid,false);
});
test("tampering is detected",()=> {
  const e=createEvidenceEnvelope({...candidate,type:"browser",result:"pass",producer:"browser"});
  e.result="fail";
  assert.equal(validateEvidenceEnvelope(e,candidate).valid,false);
});
test("duplicates are idempotently suppressed and pending is retained",()=> {
  const e=createEvidenceEnvelope({...candidate,type:"governance",result:"pending",producer:"review"});
  const out=ingestEvidence([e,e],candidate);
  assert.equal(out.accepted.length,1); assert.equal(out.accepted[0].result,"pending");
});
