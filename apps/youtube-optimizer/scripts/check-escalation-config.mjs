#!/usr/bin/env node
/**
 * CI pre-flight: validate the escalation knobs (threshold, labels, assignees,
 * enabled toggle) and the per-branch rules file against their schema, then print
 * the effective config for the current branch. Fails fast with actionable logs.
 *
 * Runs early in the workflow so a misformatted workflow_dispatch input, repo
 * variable, or `.github/escalation-rules.json` entry breaks the build immediately
 * instead of silently swallowing triage issue creation on the failure path.
 *
 * Usage:
 *   node scripts/check-escalation-config.mjs
 *   node scripts/check-escalation-config.mjs --branch release/2.1   # dry-run a branch
 *   node scripts/check-escalation-config.mjs --explain              # show all rules
 */

import { validateEscalationConfig, formatEscalationConfig, branchMatches } from "./lib/escalation-config.mjs";
import { readFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const flagValue = (name) => {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith("--")) return args[idx + 1];
  const inline = args.find((a) => a.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : undefined;
};

const branch = flagValue("branch");
const result = validateEscalationConfig(process.env, branch ? { branch } : {});

console.log(formatEscalationConfig(result));

if (args.includes("--explain")) {
  const file = process.env["ESCALATION_RULES_FILE"] ?? ".github/escalation-rules.json";
  if (existsSync(file)) {
    const rules = JSON.parse(readFileSync(file, "utf8")).rules ?? [];
    console.log("\nRules (first match wins):");
    rules.forEach((rule, i) => {
      const patterns = Array.isArray(rule.branches) ? rule.branches : [];
      const hit = patterns.length && branchMatches(patterns, result.branch) ? " ← matches" : "";
      console.log(`  ${i}. ${rule.name ?? `rules[${i}]`} [${patterns.join(", ")}]${hit}`);
      if (rule.description) console.log(`     ${rule.description}`);
    });
  }
}

if (!result.ok) {
  console.error("\n❌ Invalid escalation configuration.");
  console.error(
    "Fix the workflow_dispatch input, the repo/org Actions variable, or the rules file:\n" +
      "  fail_streak_threshold / FAIL_STREAK_THRESHOLD  → whole number 2..50\n" +
      '  issue_labels / CI_ISSUE_LABELS                 → comma list, e.g. "ci-failure,flaky"\n' +
      '  issue_assignees / CI_ISSUE_ASSIGNEES           → comma list of usernames, e.g. "octocat,hubot"\n' +
      "  escalation_enabled / CI_ESCALATION_ENABLED     → true or false\n" +
      "  backoff_minutes / CI_BACKOFF_MINUTES           → whole number 0..1440 (base retry window)\n" +
      "  CI_BACKOFF_FACTOR / CI_BACKOFF_MAX_MINUTES     → growth 1..10 / cap 0..10080 minutes\n" +
      "  CI_BACKOFF_JITTER_PCT                          → whole number 0..50\n" +
      "  history_limit / CI_HISTORY_LIMIT               → whole number 1..100 (past runs kept)\n" +
      "  history_store / CI_HISTORY_STORE               → whole number 0..500 (ledger size; 0 = same as limit)\n" +
      "  history_filter / CI_HISTORY_FILTER             → all | failures | successes (history table outcomes)\n" +
      "  history_rows / CI_HISTORY_ROWS                 → whole number 0..50 (rows shown; 0 hides)\n" +
      "  history_days / CI_HISTORY_DAYS                 → whole number 0..365 (age limit; 0 = none)\n" +
      "  .github/escalation-rules.json                  → { \"rules\": [{ \"branches\": [\"main\"], \"threshold\": 2 }] }\n" +
      "    rule fields: name, description, branches, threshold, labels, addLabels, assignees, addAssignees,\n" +
      "                 enabled, backoffMinutes, backoffFactor, backoffMaxMinutes, jitterPct,\n" +
      "                 historyLimit, historyRows, historyDays",
  );
  process.exit(1);
}

console.log("\n✅ Escalation configuration is valid.");
