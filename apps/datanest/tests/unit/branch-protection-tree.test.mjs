import test from "node:test";
import assert from "node:assert/strict";
import { classifyBranch, assertPolicyShape } from "../../scripts/branch-protection-tree.mjs";

test("main is canonical", () => {
  assert.equal(classifyBranch("main").name, "canonical");
});

test("release branches are canonical", () => {
  assert.equal(classifyBranch("release/2026-10-01").name, "canonical");
});

test("automation branches are protected automation", () => {
  assert.equal(classifyBranch("automation/guardian").name, "protected_automation");
});

test("ordinary branches remain ordinary", () => {
  assert.equal(classifyBranch("feat/example").name, "ordinary");
});

test("canonical policy retains hard non-human protection floors", () => {
  assert.doesNotThrow(assertPolicyShape);
  const policy = classifyBranch("main").policy;
  assert.equal(policy.pullRequestRequired, true);
  assert.equal(policy.requiredApprovingReviews, 1);
  assert.equal(policy.dismissStaleReviews, true);
  assert.equal(policy.requireConversationResolution, true);
  assert.equal(policy.requireLinearHistory, true);
  assert.equal(policy.allowForcePushes, false);
  assert.equal(policy.allowDeletions, false);
  assert.equal(policy.enforceAdmins, true);
  assert.ok(policy.requiredStatusChecks.includes("BRANCH-X Protection Tree"));
});
