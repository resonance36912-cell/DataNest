import test from "node:test";
import assert from "node:assert/strict";
import {
  REQUIRED_EVIDENCE,
  canTransition,
  transitionPromotion,
  validateExactShaIdentity,
  validateEvidenceForCandidate,
  validateProductionPolicy,
  validateRequiredEvidence
} from "../../lib/resonance-forge-phase-a.mjs";

const sha = "a".repeat(40);
const base = "b".repeat(40);
const candidate = {
  repository: "DataNest-Supository/DataNest",
  commitSha: sha,
  canonicalBaseSha: base,
  environment: "candidate"
};

test("exact-SHA identity is fail-closed", () => {
  assert.equal(validateExactShaIdentity(candidate).valid, true);
  assert.equal(validateExactShaIdentity({...candidate, commitSha: "bad"}).valid, false);
});

test("evidence must bind to the exact candidate SHA", () => {
  const evidence = { evidenceId: "e1", repository: candidate.repository, commitSha: sha, type: "unit", result: "pass", producer: "ci" };
  assert.equal(validateEvidenceForCandidate(evidence, candidate).valid, true);
  assert.equal(validateEvidenceForCandidate({...evidence, commitSha: base}, candidate).valid, false);
});

test("required evidence is complete only when every required reference exists", () => {
  assert.equal(validateRequiredEvidence(REQUIRED_EVIDENCE).valid, true);
  assert.equal(validateRequiredEvidence(REQUIRED_EVIDENCE.slice(0, -1)).valid, false);
});

test("promotion is monotonic", () => {
  assert.equal(canTransition("r_and_d", "live_candidate"), true);
  assert.equal(canTransition("r_and_d", "governance_review"), false);
  assert.equal(canTransition("production", "human_authorized"), false);
});

test("missing evidence blocks candidate", () => {
  const result = transitionPromotion(
    { state: "live_candidate", history: [] },
    "evidence_complete",
    { evidenceRefs: [] }
  );
  assert.equal(result.ok, false);
  assert.equal(result.state.state, "blocked");
});

test("human authorization cannot be inferred", () => {
  const result = transitionPromotion(
    { state: "governance_review", history: [] },
    "human_authorized",
    { humanAuthorized: false }
  );
  assert.equal(result.ok, false);
  assert.equal(result.state.state, "blocked");
});

test("production requires exact identity and production environment", () => {
  const result = transitionPromotion(
    { state: "human_authorized", history: [] },
    "production",
    { candidate: {...candidate, environment: "candidate"} }
  );
  assert.equal(result.ok, false);
  assert.equal(result.state.state, "blocked");
});

test("production policy prevents Forge authority", () => {
  const policy = {
    canonicalProductionAuthority: true,
    forgeProductionAuthority: false,
    humanProductionAuthorizationRequired: true,
    exactShaPromotionRequired: true
  };
  assert.equal(validateProductionPolicy(candidate, policy).valid, true);
  assert.equal(validateProductionPolicy(candidate, {...policy, forgeProductionAuthority: true}).valid, false);
});
