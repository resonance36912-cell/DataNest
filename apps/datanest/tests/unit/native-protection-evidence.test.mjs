import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("native protection evidence template is structurally valid", () => {
  const template = JSON.parse(fs.readFileSync("evidence/native-protection/EVIDENCE-TEMPLATE.json", "utf8"));
  assert.equal(template.schemaVersion, "datanest-native-protection-evidence-v1");
  assert.equal(template.result, "protected");
  assert.equal(template.evidenceSource, "GitHub-native ruleset observation");
  assert.deepEqual(template.refs, ["main", "release/**"]);
  assert.equal(template.rulesets.length, 2);
  for (const ruleset of template.rulesets) {
    assert.equal(ruleset.enforcement, "active");
    assert.ok(Array.isArray(ruleset.targetPatterns));
    assert.ok(Array.isArray(ruleset.ruleTypes));
    assert.ok(Array.isArray(ruleset.requiredStatusChecks));
  }
});

test("native protection audit preserves fail-closed result distinctions", () => {
  const workflow = fs.readFileSync(".github/workflows/native-protection-audit.yml", "utf8");
  assert.match(workflow, /"result": \(\s*\n\s*"api-access-unavailable"/);
  assert.match(workflow, /"protected"/);
  assert.match(workflow, /"protection-gap"/);
  assert.match(workflow, /if not api_ok/);
  assert.match(workflow, /result == "api-access-unavailable"/);
  assert.match(workflow, /result == "protection-gap"/);
  assert.match(workflow, /rulesetsEndpointHttp/);
  assert.match(workflow, /mainEndpointHttp/);
});

test("native protection audit exposes deep canonical and automation observations", () => {
  const workflow = fs.readFileSync(".github/workflows/native-protection-audit.yml", "utf8");
  assert.match(workflow, /expected_automation = policy\["branchClasses"\]\["protected_automation"\]/);
  assert.match(workflow, /required_automation_types/);
  assert.match(workflow, /"bypassActorsEmpty"/);
  assert.match(workflow, /"requiredApprovingReviewCount"/);
  assert.match(workflow, /"dismissStaleReviewsOnPush"/);
  assert.match(workflow, /"requiredReviewThreadResolution"/);
  assert.match(workflow, /"strictRequiredStatusChecksPolicy"/);
  assert.match(workflow, /"doNotEnforceOnCreate"/);
  assert.match(workflow, /"refs": sorted\(automation_refs\)/);
  assert.match(workflow, /"ruleTypes": sorted\(automation_types\)/);
});

test("native protection reconciliation requires an explicit administration credential",()=>{
  const workflow=fs.readFileSync(".github/workflows/native-protection-reconcile.yml","utf8");
  assert.match(workflow,/DATANEST_GITHUB_ADMIN_TOKEN/);
  assert.match(workflow,/administration credential/i);
  assert.match(workflow,/rulesets/);
  assert.match(workflow,/-X POST/);
  assert.match(workflow,/-X PUT/);
  assert.match(workflow,/X-GitHub-Api-Version: 2026-03-10/);
  assert.match(workflow,/active-rules-main\.json/);
});
