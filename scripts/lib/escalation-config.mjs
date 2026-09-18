/**
 * Schema validation + per-branch rules for the repeated-failure escalation knobs.
 *
 * Layer 1 (base): workflow_dispatch inputs / repo variables, free-form strings a
 * human typed. Validated loudly so a typo (`three`, `@octo cat`) fails early.
 *   FAIL_STREAK_THRESHOLD  integer >= 2, <= 50           (default 3)
 *   ISSUE_LABELS           comma list, 1..20 labels       (default "ci-failure")
 *   ISSUE_ASSIGNEES        comma list, 0..10 usernames    (default none)
 *   ESCALATION_ENABLED     true/false/1/0/on/off/yes/no   (default true)
 *   BACKOFF_MINUTES        integer 0..1440, base retry window (default 10)
 *   BACKOFF_FACTOR         number 1..10, exponential growth  (default 2)
 *   BACKOFF_MAX_MINUTES    integer 0..10080, window cap      (default 240)
 *   BACKOFF_JITTER_PCT     integer 0..50, +/- randomisation  (default 20)
 *   HISTORY_LIMIT          integer 1..100, how many past runs are fetched from
 *                          the API and used for the streak window (default 25)
 *   HISTORY_STORE          integer 0..500, how many runs the stored ledger keeps
 *                          (0 = same as HISTORY_LIMIT). Set this above
 *                          HISTORY_LIMIT to retain more than you fetch/show.
 *   HISTORY_FILTER         "all" | "failures" | "successes": which outcomes the
 *                          Metrics history table lists         (default all)
 *   HISTORY_ROWS           integer 0..50, how many of those runs are shown in
 *                          the Metrics streak history (0 hides it) (default 10)
 *   HISTORY_DAYS           integer 0..365, age-based retention: runs older than
 *                          this are dropped from history (0 = no age limit,
 *                          default 0). Combines with HISTORY_LIMIT — whichever
 *                          bound is tighter wins.
 *
 * Layer 2 (per-branch rules): `.github/escalation-rules.json` (override the path
 * with ESCALATION_RULES_FILE, or pass the JSON inline via ESCALATION_RULES).
 * The first rule whose branch pattern matches the current branch wins; its
 * fields override the base config. Glob syntax: `*` (no `/`), `**`, `?`, plus
 * `!negated` patterns and an optional `regex:` prefix for full control.
 *
 *   {
 *     "$schema": "internal://escalation-rules-v1",
 *     "rules": [
 *       { "name": "main", "branches": ["main"], "threshold": 2,
 *         "labels": ["ci-failure", "priority:high"], "assignees": ["octocat"] },
 *       { "name": "release", "branches": ["release/*", "hotfix/**"],
 *         "threshold": 2, "addLabels": ["release-blocker"] },
 *       { "name": "experiments", "branches": ["exp/*", "spike/*"],
 *         "enabled": false }
 *     ]
 *   }
 *
 * Rule fields: name?, description?, branches (>=1 pattern), threshold?, labels?,
 * addLabels?, assignees?, addAssignees?, enabled?. `labels`/`assignees` replace
 * the base list; `addLabels`/`addAssignees` append to it.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const BOOL_TRUE = new Set(["true", "1", "on", "yes", "y"]);
const BOOL_FALSE = new Set(["false", "0", "off", "no", "n"]);

const LABEL_RE = /^[\w .:/'"()&+#!?[\]{}<>@^~=-]+$/u;
const USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

const DEFAULT_RULES_FILE = ".github/escalation-rules.json";
const RULE_KEYS = new Set([
  "name",
  "description",
  "branches",
  "threshold",
  "labels",
  "addLabels",
  "assignees",
  "addAssignees",
  "enabled",
  "backoffMinutes",
  "backoffFactor",
  "backoffMaxMinutes",
  "jitterPct",
  "historyLimit",
  "historyStore",
  "historyRows",
  "historyDays",
  "historyFilter",
]);

/** Numeric range check shared by the backoff knobs. */
function checkNumber(value, { min, max, integer }, errors, where) {
  const num = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(num)) {
    errors.push(`${where}: must be a number — got ${JSON.stringify(value)}`);
    return null;
  }
  if (integer && !Number.isInteger(num)) {
    errors.push(`${where}: must be a whole number — got ${num}`);
    return null;
  }
  if (num < min || num > max) {
    errors.push(`${where}: must be between ${min} and ${max} — got ${num}`);
    return null;
  }
  return num;
}

const BACKOFF_SPECS = {
  backoffMinutes: { env: "BACKOFF_MINUTES", default: 10, min: 0, max: 1440, integer: true },
  backoffFactor: { env: "BACKOFF_FACTOR", default: 2, min: 1, max: 10, integer: false },
  backoffMaxMinutes: { env: "BACKOFF_MAX_MINUTES", default: 240, min: 0, max: 10080, integer: true },
  jitterPct: { env: "BACKOFF_JITTER_PCT", default: 20, min: 0, max: 50, integer: true },
};

// How much historical retry data we fetch/keep vs. how much of it we render.
const HISTORY_SPECS = {
  historyLimit: { env: "HISTORY_LIMIT", default: 25, min: 1, max: 100, integer: true },
  historyStore: { env: "HISTORY_STORE", default: 0, min: 0, max: 500, integer: true },
  historyRows: { env: "HISTORY_ROWS", default: 10, min: 0, max: 50, integer: true },
  historyDays: { env: "HISTORY_DAYS", default: 0, min: 0, max: 365, integer: true },
};

// Outcome filter for the rendered history table (never affects streak counting
// or the stored ledger — only what the Metrics table lists).
const HISTORY_FILTERS = ["all", "failures", "successes"];
const HISTORY_FILTER_ALIASES = {
  all: "all",
  any: "all",
  none: "all",
  failure: "failures",
  failures: "failures",
  failed: "failures",
  fail: "failures",
  red: "failures",
  success: "successes",
  successes: "successes",
  succeeded: "successes",
  passed: "successes",
  green: "successes",
};

/** Normalise a history filter value, pushing an error when unrecognised. */
function checkHistoryFilter(value, errors, where) {
  const key = String(value).trim().toLowerCase();
  const resolved = HISTORY_FILTER_ALIASES[key];
  if (!resolved) {
    errors.push(
      `${where}: must be one of ${HISTORY_FILTERS.join(", ")} — got ${JSON.stringify(value)}`,
    );
    return null;
  }
  return resolved;
}

const NUMERIC_SPECS = { ...BACKOFF_SPECS, ...HISTORY_SPECS };

const csv = (value) =>
  String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const uniq = (arr) => [...new Set(arr)];

/** Validate a label list; pushes problems onto `errors`. */
function checkLabels(labels, errors, where) {
  if (labels.length > 20) errors.push(`${where}: at most 20 labels — got ${labels.length}`);
  for (const label of labels) {
    if (label.length > 50) errors.push(`${where}: label "${label.slice(0, 20)}…" exceeds 50 characters`);
    else if (!LABEL_RE.test(label)) errors.push(`${where}: label "${label}" contains unsupported characters`);
  }
}

/** Validate a username list; pushes problems onto `errors`. */
function checkAssignees(users, errors, where) {
  if (users.length > 10) errors.push(`${where}: at most 10 usernames — got ${users.length}`);
  for (const user of users) {
    if (!USERNAME_RE.test(user)) {
      errors.push(
        `${where}: "${user}" is not a valid GitHub username (letters, digits and single hyphens, max 39 chars)`,
      );
    }
  }
}

/** Validate a threshold number; pushes problems onto `errors`. */
function checkThreshold(value, errors, warnings, where) {
  if (!Number.isInteger(value)) {
    errors.push(`${where}: must be a whole number >= 2 — got ${JSON.stringify(value)}`);
    return false;
  }
  if (value < 2) {
    errors.push(`${where}: must be >= 2 (a single red run stays a PR comment) — got ${value}`);
    return false;
  }
  if (value > 50) {
    errors.push(`${where}: must be <= 50 — got ${value}`);
    return false;
  }
  if (value > 10) warnings.push(`${where} is ${value}; escalation will rarely trigger.`);
  return true;
}

/**
 * Compile a branch pattern into a matcher.
 * Supports `regex:<expr>`, leading `!` negation, `**`, `*` (not crossing `/`), `?`.
 */
export function compileBranchPattern(pattern) {
  const negated = pattern.startsWith("!");
  const body = negated ? pattern.slice(1) : pattern;
  let test;
  if (body.startsWith("regex:")) {
    test = new RegExp(`^(?:${body.slice(6)})$`);
  } else {
    let src = "";
    for (let i = 0; i < body.length; i += 1) {
      const ch = body[i];
      if (ch === "*") {
        if (body[i + 1] === "*") {
          src += ".*";
          i += 1;
        } else {
          src += "[^/]*";
        }
      } else if (ch === "?") src += "[^/]";
      else src += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
    test = new RegExp(`^${src}$`);
  }
  return { negated, matches: (branch) => test.test(branch) };
}

/** True when `branch` matches the pattern list (negations exclude). */
export function branchMatches(patterns, branch) {
  let hit = false;
  for (const pattern of patterns) {
    const compiled = compileBranchPattern(pattern);
    if (!compiled.matches(branch)) continue;
    if (compiled.negated) return false;
    hit = true;
  }
  return hit;
}

/** Read rules from ESCALATION_RULES (inline JSON) or the rules file. */
function loadRules(env, cwd, errors) {
  const inline = env["ESCALATION_RULES"];
  const file = env["ESCALATION_RULES_FILE"] ?? DEFAULT_RULES_FILE;
  let raw;
  let source;
  if (inline && String(inline).trim()) {
    raw = String(inline);
    source = "ESCALATION_RULES (inline)";
  } else {
    const path = resolve(cwd, file);
    if (!existsSync(path)) return { rules: [], source: `${file} (absent — base config only)` };
    raw = readFileSync(path, "utf8");
    source = file;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    errors.push(`${source}: not valid JSON — ${err.message}`);
    return { rules: [], source };
  }
  const rules = Array.isArray(parsed) ? parsed : parsed?.rules;
  if (!Array.isArray(rules)) {
    errors.push(`${source}: expected an array of rules, or an object with a "rules" array`);
    return { rules: [], source };
  }
  return { rules, source };
}

/**
 * Validate the base config plus per-branch rules and resolve the effective values.
 *
 * @param {Record<string, string | undefined>} env
 * @param {{ branch?: string, cwd?: string }} [options]
 */
export function validateEscalationConfig(env = process.env, options = {}) {
  const errors = [];
  const warnings = [];
  const branch = options.branch ?? (env["GITHUB_HEAD_REF"] || env["GITHUB_REF_NAME"] || "unknown");
  const cwd = options.cwd ?? process.cwd();

  // --- ESCALATION_ENABLED --------------------------------------------------
  const rawEnabled = String(env["ESCALATION_ENABLED"] ?? "true").trim().toLowerCase();
  let enabled = true;
  if (rawEnabled === "" || BOOL_TRUE.has(rawEnabled)) enabled = true;
  else if (BOOL_FALSE.has(rawEnabled)) enabled = false;
  else {
    errors.push(
      `ESCALATION_ENABLED must be a boolean (true/false/1/0/on/off/yes/no) — got "${env["ESCALATION_ENABLED"]}"`,
    );
  }

  // --- FAIL_STREAK_THRESHOLD ----------------------------------------------
  const rawThreshold = String(env["FAIL_STREAK_THRESHOLD"] ?? "").trim();
  let threshold = 3;
  if (rawThreshold !== "") {
    if (!/^\d+$/.test(rawThreshold)) {
      errors.push(`FAIL_STREAK_THRESHOLD must be a whole number >= 2 — got "${env["FAIL_STREAK_THRESHOLD"]}"`);
    } else {
      const parsed = Number(rawThreshold);
      if (checkThreshold(parsed, errors, warnings, "FAIL_STREAK_THRESHOLD")) threshold = parsed;
    }
  }

  // --- ISSUE_LABELS --------------------------------------------------------
  const rawLabels = env["ISSUE_LABELS"];
  let labels =
    rawLabels === undefined || String(rawLabels).trim() === "" ? ["ci-failure"] : csv(rawLabels);
  if (labels.length === 0) errors.push(`ISSUE_LABELS resolved to an empty list — got "${rawLabels}"`);
  checkLabels(labels, errors, "ISSUE_LABELS");
  const dupeLabels = labels.filter((l, i) => labels.indexOf(l) !== i);
  if (dupeLabels.length) warnings.push(`ISSUE_LABELS has duplicates: ${uniq(dupeLabels).join(", ")}`);

  // --- ISSUE_ASSIGNEES ----------------------------------------------------
  let assignees = csv(env["ISSUE_ASSIGNEES"]).map((a) => a.replace(/^@/, ""));
  checkAssignees(assignees, errors, "ISSUE_ASSIGNEES");
  const dupeUsers = assignees.filter((u, i) => assignees.indexOf(u) !== i);
  if (dupeUsers.length) warnings.push(`ISSUE_ASSIGNEES has duplicates: ${uniq(dupeUsers).join(", ")}`);

  labels = uniq(labels);
  assignees = uniq(assignees);

  // --- Backoff window ------------------------------------------------------
  const backoff = {};
  for (const [key, spec] of Object.entries(NUMERIC_SPECS)) {
    const raw = env[spec.env];
    if (raw === undefined || String(raw).trim() === "") {
      backoff[key] = spec.default;
      continue;
    }
    const parsed = checkNumber(raw, spec, errors, spec.env);
    backoff[key] = parsed === null ? spec.default : parsed;
  }
  // 0 means "store exactly what we fetch"; anything smaller than the fetch
  // window would silently throw away runs we just read, so clamp it up.
  if (!backoff.historyStore) {
    backoff.historyStore = backoff.historyLimit;
  } else if (backoff.historyStore < backoff.historyLimit) {
    warnings.push(
      `HISTORY_STORE (${backoff.historyStore}) is below HISTORY_LIMIT (${backoff.historyLimit}); raising it to ${backoff.historyLimit} so fetched runs are not dropped.`,
    );
    backoff.historyStore = backoff.historyLimit;
  }
  if (backoff.historyRows > backoff.historyLimit) {
    warnings.push(
      `HISTORY_ROWS (${backoff.historyRows}) exceeds HISTORY_LIMIT (${backoff.historyLimit}); only ${backoff.historyLimit} runs are available.`,
    );
    backoff.historyRows = backoff.historyLimit;
  }
  const rawFilter = env["HISTORY_FILTER"];
  let historyFilter = "all";
  if (rawFilter !== undefined && String(rawFilter).trim() !== "") {
    historyFilter = checkHistoryFilter(rawFilter, errors, "HISTORY_FILTER") ?? "all";
  }
  if (historyFilter !== "all" && backoff.historyRows === 0) {
    warnings.push(
      `HISTORY_FILTER="${historyFilter}" has no effect while HISTORY_ROWS=0 (the history table is hidden).`,
    );
  }
  if (backoff.backoffMaxMinutes < backoff.backoffMinutes) {
    warnings.push(
      `BACKOFF_MAX_MINUTES (${backoff.backoffMaxMinutes}) is below BACKOFF_MINUTES (${backoff.backoffMinutes}); the cap wins.`,
    );
  }

  // --- Per-branch rules ----------------------------------------------------
  const { rules, source: rulesSource } = loadRules(env, cwd, errors);
  let matchedRule = null;

  rules.forEach((rule, index) => {
    const where = `${rulesSource} rules[${index}]${rule?.name ? ` (${rule.name})` : ""}`;
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    for (const key of Object.keys(rule)) {
      if (!RULE_KEYS.has(key)) {
        errors.push(`${where}: unknown field "${key}" (allowed: ${[...RULE_KEYS].join(", ")})`);
      }
    }
    const patterns = rule.branches;
    if (!Array.isArray(patterns) || patterns.length === 0) {
      errors.push(`${where}: "branches" must be a non-empty array of patterns`);
      return;
    }
    for (const pattern of patterns) {
      if (typeof pattern !== "string" || pattern.trim() === "") {
        errors.push(`${where}: branch patterns must be non-empty strings — got ${JSON.stringify(pattern)}`);
        continue;
      }
      try {
        compileBranchPattern(pattern);
      } catch (err) {
        errors.push(`${where}: invalid pattern "${pattern}" — ${err.message}`);
      }
    }
    if (rule.threshold !== undefined) checkThreshold(rule.threshold, errors, warnings, `${where}.threshold`);
    for (const key of ["labels", "addLabels"]) {
      if (rule[key] === undefined) continue;
      if (!Array.isArray(rule[key])) errors.push(`${where}.${key}: must be an array of labels`);
      else checkLabels(rule[key].map(String), errors, `${where}.${key}`);
    }
    for (const key of ["assignees", "addAssignees"]) {
      if (rule[key] === undefined) continue;
      if (!Array.isArray(rule[key])) errors.push(`${where}.${key}: must be an array of usernames`);
      else checkAssignees(rule[key].map((u) => String(u).replace(/^@/, "")), errors, `${where}.${key}`);
    }
    for (const [key, spec] of Object.entries(NUMERIC_SPECS)) {
      if (rule[key] !== undefined) checkNumber(rule[key], spec, errors, `${where}.${key}`);
    }
    if (rule.historyFilter !== undefined) {
      checkHistoryFilter(rule.historyFilter, errors, `${where}.historyFilter`);
    }
    if (rule.enabled !== undefined && typeof rule.enabled !== "boolean") {
      errors.push(`${where}.enabled: must be true or false — got ${JSON.stringify(rule.enabled)}`);
    }

    // First matching rule wins; later matches are reported so the ordering is obvious.
    const isMatch = Array.isArray(patterns) && branchMatches(patterns.filter((p) => typeof p === "string"), branch);
    if (isMatch && !matchedRule) matchedRule = { rule, index, label: where };
    else if (isMatch) warnings.push(`${where} also matches "${branch}" but an earlier rule won.`);
  });

  if (matchedRule && errors.length === 0) {
    const { rule } = matchedRule;
    if (rule.threshold !== undefined) threshold = rule.threshold;
    if (Array.isArray(rule.labels)) labels = uniq(rule.labels.map(String));
    if (Array.isArray(rule.addLabels)) labels = uniq([...labels, ...rule.addLabels.map(String)]);
    if (Array.isArray(rule.assignees)) assignees = uniq(rule.assignees.map((u) => String(u).replace(/^@/, "")));
    if (Array.isArray(rule.addAssignees)) {
      assignees = uniq([...assignees, ...rule.addAssignees.map((u) => String(u).replace(/^@/, ""))]);
    }
    if (typeof rule.enabled === "boolean") enabled = rule.enabled;
    for (const key of Object.keys(NUMERIC_SPECS)) {
      if (rule[key] !== undefined) backoff[key] = Number(rule[key]);
    }
    if (rule.historyFilter !== undefined) {
      historyFilter = checkHistoryFilter(rule.historyFilter, errors, `${matchedRule.label}.historyFilter`) ?? historyFilter;
    }
    if (labels.length === 0) errors.push(`${matchedRule.label}: resolved label list is empty`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    branch,
    rulesSource,
    ruleCount: Array.isArray(rules) ? rules.length : 0,
    matchedRule: matchedRule
      ? { name: matchedRule.rule.name ?? `rules[${matchedRule.index}]`, index: matchedRule.index }
      : null,
    value: { threshold, labels, assignees, enabled, historyFilter, ...backoff },
  };
}

/** Human-readable, log-friendly rendering of a validation result. */
export function formatEscalationConfig(result) {
  const { threshold, labels, assignees, enabled } = result.value;
  const lines = [
    "Escalation config (resolved: branch rule > dispatch input > repo variable > default)",
    `  branch                 ${result.branch}`,
    `  rules                  ${result.rulesSource} (${result.ruleCount} rule${result.ruleCount === 1 ? "" : "s"})`,
    `  matched rule           ${result.matchedRule ? result.matchedRule.name : "none — base config"}`,
    `  ESCALATION_ENABLED     ${enabled}`,
    `  FAIL_STREAK_THRESHOLD  ${threshold}`,
    `  ISSUE_LABELS           ${labels.join(", ") || "none"}`,
    `  ISSUE_ASSIGNEES        ${assignees.join(", ") || "none"}`,
    `  BACKOFF                ${result.value.backoffMinutes}m base × ${result.value.backoffFactor} (cap ${result.value.backoffMaxMinutes}m, ±${result.value.jitterPct}% jitter)`,
  ];
  lines.push(
    `  HISTORY                fetch ${result.value.historyLimit} runs, store ${result.value.historyStore}, show ${result.value.historyRows} in Metrics (${result.value.historyFilter} outcomes), age limit ${
      result.value.historyDays ? `${result.value.historyDays}d` : "none"
    }`,
  );
  for (const w of result.warnings) lines.push(`  ⚠️  ${w}`);
  for (const e of result.errors) lines.push(`  ❌ ${e}`);
  return lines.join("\n");
}
