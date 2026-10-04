import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeGitHubEvent,
  projectRepositoryRegistry,
  projectCandidateFromEvent
} from "../../lib/resonance-forge-event-projection.mjs";

const sha = "c".repeat(40);

test("normalizes supported GitHub events without granting authority", () => {
  const event = normalizeGitHubEvent("push", {
    ref: "refs/heads/forge/architecture-v1",
    after: sha,
    repository: { full_name: "DataNest-Supository/DataNest" }
  });
  assert.equal(event.accepted, true);
  assert.equal(event.commitSha, sha);
});

test("rejects events without an exact commit SHA", () => {
  const event = normalizeGitHubEvent("push", {
    ref: "refs/heads/main",
    after: "unknown",
    repository: { full_name: "DataNest-Supository/DataNest" }
  });
  assert.equal(event.accepted, false);
});

test("projects repository observations immutably", () => {
  const event = normalizeGitHubEvent("push", {
    ref: "refs/heads/main",
    after: sha,
    repository: { full_name: "DataNest-Supository/DataNest" }
  });
  const result = projectRepositoryRegistry({ repositories: {} }, event);
  assert.equal(result.changed, true);
  assert.equal(result.registry.repositories["DataNest-Supository/DataNest"].observedRefs["refs/heads/main"], sha);
});

test("candidate projection is explicitly unauthorized", () => {
  const event = normalizeGitHubEvent("pull_request", {
    action: "synchronize",
    pull_request: { head: { ref: "forge/architecture-v1", sha }, },
    repository: { full_name: "DataNest-Supository/DataNest" }
  });
  const result = projectCandidateFromEvent(event, { canonicalBaseSha: "d".repeat(40) });
  assert.equal(result.accepted, true);
  assert.equal(result.candidate.authorizationState, "unauthorized");
});
