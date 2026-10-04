import test from "node:test";
import assert from "node:assert/strict";
import { createRegistrySnapshot, digestSnapshot, validateRegistrySnapshot } from "../../lib/resonance-forge-registry.mjs";

const sha = "a".repeat(40);

test("snapshot is deterministic for identical inputs", () => {
  const a = createRegistrySnapshot({ repositories: { x: { b: 2, a: 1 } } }, "2026-09-30T00:00:00.000Z");
  const b = createRegistrySnapshot({ repositories: { x: { a: 1, b: 2 } } }, "2026-09-30T00:00:00.000Z");
  assert.equal(a.snapshotDigest, b.snapshotDigest);
});

test("snapshot validates its own digest", () => {
  const snapshot = createRegistrySnapshot({ candidates: {
    c1: { repository: "DataNest-Supository/DataNest", commitSha: sha, canonicalBaseSha: "b".repeat(40), environment: "candidate" }
  }}, "2026-09-30T00:00:00.000Z");
  assert.equal(validateRegistrySnapshot(snapshot).valid, true);
  assert.notEqual(digestSnapshot({...snapshot, repositories: { tampered: true }}), snapshot.snapshotDigest);
});

test("read-only projection cannot assert production authorization", () => {
  const snapshot = createRegistrySnapshot({ candidates: {
    c1: { repository: "DataNest-Supository/DataNest", commitSha: sha, canonicalBaseSha: "b".repeat(40), environment: "production", authorizationState: "production" }
  }}, "2026-09-30T00:00:00.000Z");
  assert.equal(validateRegistrySnapshot(snapshot).valid, false);
});

test("specialized tree projection remains non-authorizing", () => {
  const snapshot = createRegistrySnapshot({ trees: {
    botsquad: { authority: "advisory", productionAuthority: false, refPrefix: "automation/botsquad/" },
    environment: { authority: "advisory", productionAuthority: false, ref: "automation/environment-feed" },
    enforcer: { authority: "defensive-enforcement", productionAuthority: false, ref: "automation/enforcer" },
    guardian: { authority: "health-observation-and-safe-healing", productionAuthority: false, ref: "automation/guardian" },
    conductor: { authority: "process-synchronization", productionAuthority: false, ref: "automation/conductor" },
    suggester: { authority: "optimization-advisory", productionAuthority: false, ref: "automation/suggester" },
    calmer: { authority: "governance-friction-optimization", productionAuthority: false, ref: "automation/calmer" },
    regulator: { authority: "transparent-system-regulation", productionAuthority: false, ref: "automation/regulator" },
    "visibility-utility": { authority: "visibility-market-intelligence-advisory", productionAuthority: false, ref: "automation/visibility-utility" }
  }}, "2026-10-01T00:00:00.000Z");
  assert.equal(validateRegistrySnapshot(snapshot).valid, true);
  assert.equal(snapshot.trees.botsquad.productionAuthority, false);
});

test("specialized tree projection rejects production authority escalation", () => {
  const snapshot = createRegistrySnapshot({ trees: {
    botsquad: { authority: "production", productionAuthority: true }
  }}, "2026-10-01T00:00:00.000Z");
  const validation = validateRegistrySnapshot(snapshot);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some(error => error.includes("specialized tree")));
});
