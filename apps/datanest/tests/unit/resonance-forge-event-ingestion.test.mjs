import test from "node:test";
import assert from "node:assert/strict";
import { createEventEnvelope, ingestEvents, sha256 } from "../../lib/resonance-forge-event-ingestion.mjs";

const sha = "a".repeat(40);
const payload = {
  repository: { full_name: "DataNest-Supository/DataNest", updated_at: "2026-09-30T00:00:00.000Z" },
  ref: "refs/heads/forge/architecture-v1",
  after: sha,
  action: "push"
};

test("event envelope is deterministic and payload-bound", () => {
  const a = createEventEnvelope("push", payload, "2026-09-30T00:00:00.000Z");
  const b = createEventEnvelope("push", { action: "push", after: sha, ref: payload.ref, repository: payload.repository }, "2026-09-30T00:00:00.000Z");
  assert.equal(a.eventId, b.eventId);
  assert.equal(a.payloadDigest, b.payloadDigest);
  assert.equal(a.commitSha, sha);
  assert.equal(a.eventId.length, 64);
  assert.equal(sha256(payload), a.payloadDigest);
});

test("ingestion is idempotent and deterministically ordered", () => {
  const input = [
    { eventName: "push", payload, observedAt: "2026-09-30T00:00:00.000Z" },
    { eventName: "push", payload, observedAt: "2026-09-30T00:00:00.000Z" }
  ];
  const result = ingestEvents(input);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejected.length, 0);
});

test("malformed events are rejected without authority inference", () => {
  const result = ingestEvents([{ eventName: "push", payload: { repository: { full_name: "DataNest-Supository/DataNest" }, after: "not-a-sha" } }]);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].reason, "repository and exact commit SHA are required");
});
