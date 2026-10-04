import { readFileSync, existsSync } from "node:fs";
import process from "node:process";

const ROOT = process.cwd();
const configPath = `${ROOT}/config/branch-protection.tree.json`;
const config = JSON.parse(readFileSync(configPath, "utf8"));

function matches(branch, pattern) {
  if (pattern === branch) return true;
  if (pattern === "**") return true;
  if (pattern.endsWith("/**")) return branch.startsWith(pattern.slice(0, -3));
  return false;
}

export function classifyBranch(branch) {
  for (const [name, policy] of Object.entries(config.branchClasses)) {
    if (policy.patterns.some((pattern) => matches(branch, pattern))) {
      return { name, policy };
    }
  }
  throw new Error(`No branch policy matches ${branch}`);
}

export function assertPolicyShape() {
  if (config.failClosed !== true) throw new Error("BRANCH-X must fail closed");
  if (!config.canonicalBranches.exact.includes("main")) {
    throw new Error("main must remain canonical");
  }
  const canonical = config.branchClasses.canonical;
  if (canonical.pullRequestRequired !== true) throw new Error("canonical PR requirement missing");
  if (canonical.requiredApprovingReviews < 0) throw new Error("canonical review floor cannot be negative");
  if (canonical.allowForcePushes !== false) throw new Error("canonical force-push protection missing");
  if (canonical.allowDeletions !== false) throw new Error("canonical deletion protection missing");
  if (canonical.enforceAdmins !== true) throw new Error("canonical admin enforcement missing");
  if (canonical.requireConversationResolution !== true) throw new Error("conversation-resolution requirement missing");
  if (canonical.requireLinearHistory !== true) throw new Error("linear-history requirement missing");
  if (!canonical.requiredStatusChecks.includes("BRANCH-X Protection Tree")) {
    throw new Error("self-verification status check missing");
  }
}

export function verifyRepositoryFiles() {
  const required = [
    ".github/workflows/branch-protection-tree.yml",
    "config/branch-protection.tree.json",
    "scripts/branch-protection-tree.mjs",
    "tests/unit/branch-protection-tree.test.mjs",
    ".github/CODEOWNERS"
  ];
  const missing = required.filter((path) => !existsSync(`${ROOT}/${path}`));
  if (missing.length) throw new Error(`BRANCH-X missing files: ${missing.join(", ")}`);
}

export function buildEvidence({ branch = process.env.GITHUB_REF_NAME || "unknown" } = {}) {
  assertPolicyShape();
  const classification = classifyBranch(branch);
  return {
    schemaVersion: config.schemaVersion,
    tree: config.tree,
    branch,
    classification: classification.name,
    canonical: classification.name === "canonical",
    policy: {
      pullRequestRequired: classification.policy.pullRequestRequired,
      requiredApprovingReviews: classification.policy.requiredApprovingReviews,
      allowForcePushes: classification.policy.allowForcePushes,
      allowDeletions: classification.policy.allowDeletions,
      enforceAdmins: classification.policy.enforceAdmins,
      requiredStatusChecks: classification.policy.requiredStatusChecks
    },
    protectedPathFamilies: config.protectedPathFamilies,
    githubNativeProtection: "required-administration-credential-for-configuration",
    repositoryNativeVerification: "enabled"
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyRepositoryFiles();
  const evidence = buildEvidence();
  console.log(JSON.stringify(evidence, null, 2));
}
