import assert from "node:assert/strict";
import test from "node:test";
import {
  advisorList,
  buildArchiveTips,
  classifyBranch,
  evaluateSupabaseProject,
  extractAuditIds,
  getStrictBlockers,
  migrationNameFromFile,
  compareMigrationParity,
  normalizeBranchFamily,
  indexPullRequestsByBranch,
  isArchivedPruneTarget,
  normalizeSupabaseProjectPayload,
  parseArgs,
} from "../../scripts/branch-cleaner.mjs";

const config = {
  baseBranch: "main",
  staleDays: 14,
  protectedPatterns: ["^main$", "^release/"],
};
const now = new Date("2026-09-26T18:00:00Z");

test("normalizes iterative branch families without conflating the feature stem", () => {
  assert.equal(normalizeBranchFamily("feat/datanest-ai-command-context-lock-v4"), "feat/datanest-ai-command-context-lock");
  assert.equal(normalizeBranchFamily("fix/staging-routing-current-main-20260925"), "fix/staging-routing");
});

test("extracts unique audit IDs", () => {
  assert.deepEqual(extractAuditIds("AUD-003 then AUD-010 and AUD-003"), ["AUD-003", "AUD-010"]);
});

test("indexes only pull requests from the audited repository", () => {
  const indexed = indexPullRequestsByBranch([
    { id:1, head:{ ref:"feat/local", repo:{ full_name:"DataNest-Supository/DataNest" } } },
    { id:2, head:{ ref:"feat/local", repo:{ full_name:"DataNest-Supository/DataNest" } } },
    { id:3, head:{ ref:"feat/fork", repo:{ full_name:"external/fork" } } },
    { id:4, head:{ repo:{ full_name:"DataNest-Supository/DataNest" } } },
  ], "DataNest-Supository/DataNest");
  assert.deepEqual(indexed.get("feat/local").map((pr) => pr.id), [1, 2]);
  assert.equal(indexed.has("feat/fork"), false);
});

test("maps only exact archive refs to branch tips", () => {
  const tips = buildArchiveTips([
    { ref:"refs/tags/branch-archive/feat/example", object:{ sha:"abc123" } },
    { ref:"refs/tags/unrelated/feat/example", object:{ sha:"skip" } },
    { ref:"refs/tags/branch-archive/", object:{ sha:"skip-empty" } },
  ], "branch-archive/");
  assert.equal(tips.get("feat/example"), "abc123");
  assert.equal(tips.size, 1);
});

test("normalizes Supabase advisor and collection payloads", () => {
  assert.deepEqual(advisorList({ lints:[{ name:"lint" }] }), [{ name:"lint" }]);
  assert.deepEqual(advisorList({ advisors:[{ name:"advisor" }] }), [{ name:"advisor" }]);
  const project = normalizeSupabaseProjectPayload({
    branches:{ branches:[{ name:"main" }] },
    securityAdvisors:{ lints:[{ name:"security" }] },
    performanceAdvisors:{ advisors:[{ name:"performance" }] },
    migrations:{ migrations:[{ name:"migration" }] },
  });
  assert.deepEqual(project.branches, [{ name:"main" }]);
  assert.deepEqual(project.securityAdvisors, [{ name:"security" }]);
  assert.deepEqual(project.performanceAdvisors, [{ name:"performance" }]);
  assert.deepEqual(project.migrations, [{ name:"migration" }]);
});

test("never marks the base branch for deletion", () => {
  const result = classifyBranch({ name:"main", updatedAt:"2026-01-01T00:00:00Z", compare:{ ahead_by:0 } }, config, now);
  assert.equal(result.decision, "keep");
  assert.equal(result.reason, "protected");
});

test("keeps branches with open pull requests", () => {
  const result = classifyBranch({ name:"feat/live", openPr:true, updatedAt:"2026-01-01T00:00:00Z", compare:{ ahead_by:0 } }, config, now);
  assert.equal(result.decision, "keep");
  assert.equal(result.reason, "open_pr");
});

test("proposes deletion immediately when a branch has no unique commits", () => {
  const result = classifyBranch({ name:"fix/merged", mergedPr:true, updatedAt:"2026-09-26T17:59:00Z", compare:{ ahead_by:0, behind_by:8, status:"behind" } }, config, now);
  assert.equal(result.decision, "delete_candidate");
  assert.equal(result.reason, "merged_no_unique_commits");
});

test("does not delete a branch that has post-merge unique commits", () => {
  const result = classifyBranch({ name:"fix/merged-but-changed", mergedPr:true, postMergeActivity:true, updatedAt:"2026-09-01T00:00:00Z", compare:{ ahead_by:2, behind_by:5 } }, config, now);
  assert.equal(result.decision, "review");
  assert.equal(result.reason, "post_merge_unique_commits");
});

test("distinguishes merged PR history from actual post-merge activity", () => {
  const result = classifyBranch({
    name:"fix/squash-merged",
    mergedPr:true,
    postMergeActivity:false,
    updatedAt:"2026-09-01T00:00:00Z",
    compare:{ ahead_by:3, behind_by:9, status:"diverged" },
  }, config, now);
  assert.equal(result.decision, "review");
  assert.equal(result.reason, "merged_pr_unique_history");
});

test("recognizes exact archive tags without making archived history deletable", () => {
  const result = classifyBranch({
    name:"fix/squash-merged",
    mergedPr:true,
    postMergeActivity:false,
    archiveMatchesTip:true,
    archiveTag:"branch-archive/fix/squash-merged",
    updatedAt:"2026-09-01T00:00:00Z",
    compare:{ ahead_by:3, behind_by:9, status:"diverged" },
  }, config, now);
  assert.equal(result.decision, "archived");
  assert.equal(result.reason, "merged_history_archived");
  assert.equal(result.archiveTag, "branch-archive/fix/squash-merged");
});

test("archived pruning requires both explicit mode and config opt-in", () => {
  const branch = {
    classification:{
      decision:"archived",
      reason:"merged_history_archived",
      archiveTag:"branch-archive/fix/example",
    },
  };
  assert.equal(isArchivedPruneTarget(branch, { allowArchivedPrune:false }, true), false);
  assert.equal(isArchivedPruneTarget(branch, { allowArchivedPrune:true }, false), false);
  assert.equal(isArchivedPruneTarget(branch, { allowArchivedPrune:true }, true), true);
});

test("marks ancestry-proven older variants as preserved but never delete candidates", () => {
  const result = classifyBranch({
    name:"feat/example-v2",
    updatedAt:"2026-09-26T17:00:00Z",
    compare:{ ahead_by:3, behind_by:5, status:"diverged" },
    familyHasNewerSibling:true,
    familyContainedBy:"feat/example-v3",
  }, config, now);
  assert.equal(result.decision, "review");
  assert.equal(result.reason, "superseded_reachable_from_sibling");
  assert.equal(result.preservedBy, "feat/example-v3");
});

test("labels Git-proven sibling divergence explicitly", () => {
  const result = classifyBranch({
    name:"feat/example-v2",
    updatedAt:"2026-09-26T17:00:00Z",
    compare:{ ahead_by:3, behind_by:5, status:"diverged" },
    familyHasNewerSibling:true,
    familyDivergedFrom:{ name:"feat/example-v3", status:"diverged", ahead:2, behind:4 },
  }, config, now);
  assert.equal(result.decision, "review");
  assert.equal(result.reason, "divergent_family_variant");
  assert.equal(result.divergedFrom, "feat/example-v3");
  assert.equal(result.familyAhead, 2);
  assert.equal(result.familyBehind, 4);
});

test("flags a failed default Supabase branch as a blocker", () => {
  const checks = evaluateSupabaseProject({
    project:{ status:"ACTIVE_HEALTHY" },
    branches:[{ name:"main", git_branch:"main", is_default:true, status:"MIGRATIONS_FAILED" }],
  }, { expectedGitBranch:"main" });
  assert.equal(checks[0].level, "blocker");
  assert.equal(checks[0].code, "supabase_branch_failure");
});

test("compare uncertainty can never become a delete candidate", () => {
  const result = classifyBranch({ name:"fix/unknown", updatedAt:"2026-01-01T00:00:00Z", compare:{ status:"unknown", ahead_by:null } }, config, now);
  assert.equal(result.decision, "keep");
  assert.equal(result.reason, "active_or_unresolved");
});

test("strict blockers are resolved before destructive apply", () => {
  const blockers = getStrictBlockers({
    globalChecks: [],
    projects: [{
      checks: [{
        level:"blocker",
        code:"supabase_branch_failure",
        detail:"main: MIGRATIONS_FAILED",
      }],
    }],
  });
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].code, "supabase_branch_failure");
});

test("migration parity reports missing and version-drifted history", () => {
  assert.equal(
    migrationNameFromFile("20260924230000_datanest_ai_production.sql"),
    "datanest_ai_production"
  );
  const parity = compareMigrationParity(
    [
      "20260924230000_datanest_ai_production.sql",
      "external_ai_companion_mode.sql",
      "20260926061000_governed_product_catalog.sql",
    ],
    [
      { version:"20260924230805", name:"datanest_ai_production" },
      { version:"20260924163640", name:"external_ai_companion_mode" },
      { version:"20260926055810", name:"add_governed_product_catalog" },
      { version:"20260924111936", name:"bootstrap_resonance_datanest_control_plane" },
    ]
  );
  assert.deepEqual(parity.liveOnly, [
    "add_governed_product_catalog",
    "bootstrap_resonance_datanest_control_plane",
  ]);
  assert.deepEqual(parity.repoOnly, ["governed_product_catalog"]);
  assert.equal(parity.versionMismatches.length, 2);
  assert.deepEqual(
    parity.versionMismatches.map((item) => item.name).sort(),
    ["datanest_ai_production", "external_ai_companion_mode"]
  );
});

test("unknown branch recency can never become a delete candidate", () => {
  const result = classifyBranch({
    name:"fix/unknown-recency",
    updatedAt:null,
    compare:{ ahead_by:0, behind_by:12, status:"behind" },
  }, config, now);
  assert.equal(result.decision, "keep");
  assert.equal(result.reason, "active_or_unresolved");
  assert.equal(Number.isNaN(result.ageDays), true);
});

test("missing Supabase verification is a strict blocker", () => {
  const blockers = getStrictBlockers({
    skipped:true,
    projects:[],
    globalChecks:[{
      level:"blocker",
      code:"supabase_audit_unavailable",
      detail:"Supabase verification is required before strict destructive cleanup.",
    }],
  });
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].code, "supabase_audit_unavailable");
});


test("git-only safe mode enables apply without archived pruning", () => {
  const args = parseArgs(["--git-only-safe-apply"]);
  assert.equal(args.apply, true);
  assert.equal(args.gitOnlySafeApply, true);
  assert.equal(args.pruneArchived, false);
});
