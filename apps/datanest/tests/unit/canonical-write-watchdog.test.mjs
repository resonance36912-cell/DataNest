import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidence, isAuthorized } from "../../scripts/canonical-write-watchdog.mjs";

test("merged PR provenance is authorized", () => {
  const evidence = buildEvidence({
    repository: "DataNest-Supository/DataNest",
    ref: "refs/heads/main",
    sha: "abc",
    prs: [{ number: 42, state: "closed", merged_at: "2026-10-01T12:00:00Z", base: { ref: "main" } }]
  });
  assert.equal(evidence.result, "authorized-merge-provenance");
  assert.equal(isAuthorized(evidence), true);
});

test("no merged PR is a canonical-write anomaly", () => {
  const evidence = buildEvidence({
    repository: "DataNest-Supository/DataNest",
    ref: "refs/heads/main",
    sha: "abc",
    prs: [{ number: 43, state: "open", merged_at: null, base: { ref: "main" } }]
  });
  assert.equal(evidence.result, "canonical-write-anomaly");
  assert.equal(isAuthorized(evidence), false);
});

test("empty association list is anomalous", () => {
  const evidence = buildEvidence({
    repository: "DataNest-Supository/MirrorNest",
    ref: "refs/heads/release/x",
    sha: "def",
    prs: []
  });
  assert.equal(evidence.result, "canonical-write-anomaly");
});

test("merged PR for a different base branch is still a canonical-write anomaly", () => {
  const evidence = buildEvidence({
    repository: "DataNest-Supository/DataNest",
    ref: "refs/heads/main",
    sha: "ghi",
    prs: [{ number: 44, state: "closed", merged_at: "2026-10-01T12:30:00Z", base: { ref: "develop" } }]
  });
  assert.equal(evidence.result, "canonical-write-anomaly");
  assert.equal(isAuthorized(evidence), false);
});

test("verification unavailable is not treated as authorized", () => {
  const evidence = {
    result: "verification-unavailable",
    reason: "github-associated-prs-api-returned-403"
  };
  assert.equal(isAuthorized(evidence), false);
});
