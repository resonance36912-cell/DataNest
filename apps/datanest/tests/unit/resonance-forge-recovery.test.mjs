import test from "node:test";
import assert from "node:assert/strict";
import {
  createRecoverySnapshot,
  validateRecoverySnapshot,
  retentionDecision,
  validatePortableSnapshot,
} from "../../lib/resonance-forge-recovery.mjs";

const candidate = {
  repository: "DataNest-Supository/DataNest",
  commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  canonicalBaseSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  environment: "candidate",
  manifestDigest: "manifest-sha256-example",
  createdAt: "2026-09-30T15:00:00.000Z",
  events: [{ eventId: "event-1", commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }],
  evidence: [{ evidenceId: "evidence-1", commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }],
  reconciliation: [{ operationId: "op-1", outcome: "new" }],
};

test("recovery snapshot is deterministic and self-validating", () => {
  const a = createRecoverySnapshot(candidate);
  const b = createRecoverySnapshot({ ...candidate, events: [...candidate.events] });
  assert.equal(a.snapshotDigest, b.snapshotDigest);
  assert.equal(validateRecoverySnapshot(a), true);
});

test("recovery rejects tampering", () => {
  const snapshot = createRecoverySnapshot(candidate);
  assert.throws(() => validateRecoverySnapshot({ ...snapshot, environment: "production" }), /digest mismatch/);
});

test("recovery cannot carry production authorization", () => {
  const snapshot = createRecoverySnapshot(candidate);
  assert.throws(() => validateRecoverySnapshot({ ...snapshot, authorizationGranted: true }), /digest mismatch|grant authority/);
});

test("conflict and blocked records require explicit review", () => {
  assert.equal(retentionDecision("conflict").retain, true);
  assert.equal(retentionDecision("conflict").deletionRequiresExplicitReview, true);
  assert.equal(retentionDecision("blocked").deletionRequiresExplicitReview, true);
});

test("portable snapshot contract is explicit", () => {
  const snapshot = createRecoverySnapshot(candidate);
  assert.deepEqual(validatePortableSnapshot(snapshot), {
    portable: true,
    encoding: "utf-8",
    digestAlgorithm: "sha256",
  });
});
