import test from "node:test";
import assert from "node:assert/strict";
import { validateRulesetContract } from "../../scripts/branch-protection-ruleset-contract.mjs";

test("BRANCH-X native ruleset definitions match the branch policy", () => {
  assert.doesNotThrow(() => validateRulesetContract());
});
