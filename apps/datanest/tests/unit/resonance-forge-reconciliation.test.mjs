import test from "node:test";
import assert from "node:assert/strict";
import { createOperationId, reconcileBatch, reconcileObservation, validateReconciliationRecord } from "../../lib/resonance-forge-reconciliation.mjs";

const sha = "a".repeat(40);
const base = "b".repeat(40);
const digest = "c".repeat(64);

function observation(overrides = {}) {
  return {
    sourceId: "event-1",
    repository: "DataNest-Supository/DataNest",
    commitSha: sha,
    candidateId: "candidate-1",
    canonicalBaseSha: base,
    environment: "candidate",
    manifestDigest: "manifest-1",
    observedAt: "2026-09-30T00:00:00.000Z",
    payloadDigest: digest,
    ...overrides
  };
}

test("operation identity is deterministic and exact-SHA bound", () => {
  const a = createOperationId(observation());
  const b = createOperationId(observation());
  assert.equal(a, b);
  assert.equal(a.length, 64);
});

test("new observation is classified as new", () => {
  const result = reconcileObservation(observation());
  assert.equal(result.outcome, "new");
  assert.equal(result.commitSha, sha);
  assert.equal(validateReconciliationRecord(result).valid, true);
});

test("identical observation is classified as duplicate", () => {
  const first = reconcileObservation(observation());
  const second = reconcileObservation(observation(), [first]);
  assert.equal(second.outcome, "duplicate");
  assert.equal(second.operationId, first.operationId);
});

test("same lineage with a newer observation is classified as updated", () => {
  const first = reconcileObservation(observation());
  const second = reconcileObservation(observation({
    sourceId: "event-2",
    observedAt: "2026-09-30T01:00:00.000Z",
    payloadDigest: "d".repeat(64)
  }), [first]);
  assert.equal(second.outcome, "updated");
  assert.equal(second.lineage, first.lineage);
});

test("different SHA is a new lineage, never an overwrite", () => {
  const first = reconcileObservation(observation());
  const second = reconcileObservation(observation({
    sourceId: "event-2",
    commitSha: "d".repeat(40),
    observedAt: "2026-09-30T01:00:00.000Z",
    payloadDigest: "e".repeat(64)
  }), [first]);
  assert.equal(second.outcome, "new");
  assert.notEqual(second.lineage, first.lineage);
});

test("invalid or authority-ambiguous input is blocked and retained", () => {
  const result = reconcileObservation(observation({
    commitSha: "not-a-sha",
    payloadDigest: "f".repeat(64)
  }));
  assert.equal(result.outcome, "blocked");
  assert.match(result.reason, /exact commit SHA/);
});

test("conflicting operation identity is retained as conflict", () => {
  const first = reconcileObservation(observation());
  const conflict = reconcileObservation(observation({ payloadDigest: "f".repeat(64) }), [{
    ...first,
    inputDigest: "e".repeat(64)
  }]);
  assert.equal(conflict.outcome, "conflict");
  assert.match(conflict.reason, /different input digest/);
});

test("batch reconciliation is deterministic and retains blocked/conflict records", () => {
  const result = reconcileBatch([
    observation(),
    observation({ sourceId: "bad", commitSha: "bad", payloadDigest: "1".repeat(64) })
  ]);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].outcome, "blocked");
});
