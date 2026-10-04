import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const policyPath = path.join(root, "config", "branch-protection.tree.json");
const canonicalPath = path.join(root, ".github", "rulesets", "BRANCH-X-Canonical.json");
const automationPath = path.join(root, ".github", "rulesets", "BRANCH-X-Automation.json");

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

function ruleTypes(ruleset) {
  return new Set((ruleset.rules ?? []).map((r) => r.type));
}

function statusChecks(ruleset) {
  const out = new Set();
  for (const rule of ruleset.rules ?? []) {
    if (rule.type !== "required_status_checks") continue;
    for (const check of rule.parameters?.required_status_checks ?? []) {
      if (check?.context) out.add(check.context);
    }
  }
  return out;
}

function refs(ruleset) {
  return new Set(ruleset.conditions?.ref_name?.include ?? []);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateRulesetContract() {
  const policy = readJson(policyPath);
  const canonical = readJson(canonicalPath);
  const automation = readJson(automationPath);

  assert(policy.tree === "BRANCH-X", "policy tree must be BRANCH-X");
  assert(policy.failClosed === true, "policy must be fail-closed");

  assert(canonical.name === "BRANCH-X Canonical", "canonical ruleset name mismatch");
  assert(canonical.target === "branch", "canonical target must be branch");
  assert(canonical.enforcement === "active", "canonical ruleset must be active");
  assert((canonical.bypass_actors ?? []).length === 0, "canonical bypass actors must be empty");
  assert(refs(canonical).has("refs/heads/main"), "canonical ruleset must target main");
  assert(refs(canonical).has("refs/heads/release/**"), "canonical ruleset must target release/**");

  const canonicalPolicy = policy.branchClasses.canonical;
  const canonicalTypes = ruleTypes(canonical);
  for (const required of ["pull_request","required_status_checks","required_linear_history","non_fast_forward","deletion"]) {
    assert(canonicalTypes.has(required), "canonical ruleset missing rule: " + required);
  }

  const pr = canonical.rules.find((r) => r.type === "pull_request");
  assert(pr?.parameters?.required_approving_review_count === canonicalPolicy.requiredApprovingReviews, "canonical review floor mismatch");
  assert(pr?.parameters?.dismiss_stale_reviews_on_push === canonicalPolicy.dismissStaleReviews, "canonical stale-review mismatch");
  assert(pr?.parameters?.required_review_thread_resolution === canonicalPolicy.requireConversationResolution, "canonical conversation-resolution mismatch");

  const checks = statusChecks(canonical);
  for (const expected of canonicalPolicy.requiredStatusChecks) {
    assert(checks.has(expected), "canonical missing required status check: " + expected);
  }

  assert(automation.name === "BRANCH-X Automation", "automation ruleset name mismatch");
  assert(automation.target === "branch", "automation target must be branch");
  assert(automation.enforcement === "active", "automation ruleset must be active");
  assert((automation.bypass_actors ?? []).length === 0, "automation bypass actors must be empty");
  for (const expected of ["refs/heads/automation/**","refs/heads/audit/**","refs/heads/ci/**"]) {
    assert(refs(automation).has(expected), "automation ruleset missing target: " + expected);
  }

  const automationPolicy = policy.branchClasses.protected_automation;
  const automationTypes = ruleTypes(automation);
  assert(automationPolicy.allowForcePushes === false && automationTypes.has("non_fast_forward"), "automation force-push protection mismatch");
  assert(automationPolicy.allowDeletions === false && automationTypes.has("deletion"), "automation deletion protection mismatch");
  assert(automationPolicy.pullRequestRequired === false && !automationTypes.has("pull_request"), "automation ruleset must remain directly writable");

  const automationChecks = statusChecks(automation);
  for (const expected of automationPolicy.requiredStatusChecks) {
    assert(automationChecks.has(expected) || expected === "CI", "automation missing required status check: " + expected);
  }

  return {
    repository: policy.authority,
    canonical: { refs: [...refs(canonical)].sort(), requiredStatusChecks: [...checks].sort() },
    automation: { refs: [...refs(automation)].sort(), requiredStatusChecks: [...automationChecks].sort() },
    result: "valid"
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(validateRulesetContract(), null, 2));
}
