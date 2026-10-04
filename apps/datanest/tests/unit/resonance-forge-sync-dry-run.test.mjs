import test from "node:test";
import assert from "node:assert/strict";
import { createEventEnvelope } from "../../lib/resonance-forge-event-ingestion.mjs";
import { createEvidenceEnvelope } from "../../lib/resonance-forge-evidence-ingestion.mjs";
import { createSyncObservation, runSyncDryRun } from "../../lib/resonance-forge-sync-dry-run.mjs";

const candidate = {
  candidateId: "dry-run-candidate",
  repository: "DataNest-Supository/DataNest",
  commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  canonicalBaseSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  environment: "candidate",
  manifestDigest: "manifest-v1"
};

const payload = {
  repository: { full_name: candidate.repository, updated_at: "2026-09-30T00:00:00.000Z" },
  ref: "refs/heads/forge/architecture-v1",
  after: candidate.commitSha
};

function fixture() {
  const event = createEventEnvelope("push", payload, "2026-09-30T00:00:00.000Z");
  const evidence = createEvidenceEnvelope({
    candidateId: candidate.candidateId,
    repository: candidate.repository,
    commitSha: candidate.commitSha,
    type: "unit",
    result: "pass",
    producer: "forge-sync-dry-run",
    observedAt: "2026-09-30T00:00:00.000Z"
  });
  return { candidate, event, evidence };
}

test("creates an exact-SHA-bound synchronization observation", () => {
  const { event, evidence } = fixture();
  const observation = createSyncObservation(candidate, event, evidence);
  assert.equal(observation.repository, candidate.repository);
  assert.equal(observation.commitSha, candidate.commitSha);
  assert.match(observation.sourceId, /^[0-9a-f]{64}$/);
  assert.match(observation.payloadDigest, /^[0-9a-f]{64}$/);
});

test("dry run is deterministic and never grants authorization", () => {
  const { event, evidence } = fixture();
  const input = { candidate, events: [{ eventName: "push", payload, observedAt: event.observedAt }], evidence: [evidence] };
  const first = runSyncDryRun(input);
  const second = runSyncDryRun(input);
  assert.deepEqual(first, second);
  assert.equal(first.reconciliation.accepted.length, 1);
  assert.equal(first.reconciliation.accepted[0].outcome, "new");
  assert.equal(first.authorizationGranted, false);
  assert.equal(first.productionMutation, false);
});

test("mismatched event SHA is retained as a pairing error", () => {
  const { evidence } = fixture();
  const mismatchedEvent = createEventEnvelope("push", {
    ...payload,
    after: "cccccccccccccccccccccccccccccccccccccccc"
  }, "2026-09-30T00:00:00.000Z");
  assert.throws(() => createSyncObservation(candidate, mismatchedEvent, evidence), /repository\/SHA/);
});
