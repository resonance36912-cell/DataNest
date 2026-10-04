#!/usr/bin/env node
/**
 * Opens (or updates) a GitHub issue when a PR's CI fails repeatedly.
 *
 * Triggered from the failure path of .github/workflows/ssr-gate.yml. It looks at
 * the recent run history for the same branch/workflow and only files an issue
 * once the consecutive-failure streak reaches the threshold — a single red run
 * stays a PR comment, a persistent one becomes a tracked issue.
 *
 * The issue body carries the triage links: diagnostics.zip, Playwright HTML
 * report, traces/screenshots, videos and logs. Repeat failures append a comment
 * with the newest run's links instead of opening duplicate issues.
 *
 * Env (all escalation knobs are set from workflow_dispatch inputs or repo
 * variables in .github/workflows/ssr-gate.yml — no code edit needed to tune):
 *   GITHUB_TOKEN            required (needs `issues: write`)
 *   GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_SHA, GITHUB_WORKFLOW, ...
 *   PR_NUMBER               pull request number (skips when absent)
 *   FAIL_STREAK_THRESHOLD   consecutive failures required (default 3, min 2)
 *   ESCALATION_ENABLED      "false"/"0"/"off" disables escalation entirely
 *   ISSUE_LABELS            comma list (default "ci-failure")
 *   ISSUE_ASSIGNEES         comma list of usernames (default none)
 *   DRY_RUN                 "true" (or --dry-run) simulates every GitHub write:
 *                           nothing is created, commented, assigned or closed, but
 *                           the plan is logged and the chat notification still goes
 *                           out marked [DRY RUN]
 *   HISTORY_STORE           runs kept in the stored ledger (0 = HISTORY_LIMIT)
 *   HISTORY_LIMIT           how many past runs to fetch/keep as retry history (default 25, max 100)
 *   HISTORY_ROWS            how many of those runs the Metrics streak history shows
 *                           (default 10, 0 hides the history entirely)
 *   HISTORY_DAYS            age-based retention: drop runs older than N days from
 *                           the history (default 0 = no age limit); the tighter of
 *                           HISTORY_LIMIT / HISTORY_DAYS wins
 *   CODEOWNERS_ASSIGN       "false" disables CODEOWNERS routing (default on)
 *   CODEOWNERS_FILE         override the CODEOWNERS path (default: auto-detect)
 *   CODEOWNERS_EXCLUDE      comma list of handles to never assign/mention
 *   ESCALATION_RULES_FILE   per-branch rules (default .github/escalation-rules.json);
 *                           a matching rule overrides threshold/labels/assignees/enabled
 *   BUNDLE_URL, REPORT_URL, RESULTS_URL, VIDEOS_URL, LOGS_URL
 *   ARCHIVE_OBJECT_KEY, ARCHIVE_TTL_DAYS   optional off-platform archive info
 *
 * Never fails the job: any error is logged and the process exits 0.
 */

import { validateEscalationConfig, formatEscalationConfig } from "./lib/escalation-config.mjs";
import { pruneHistory, parseLedger, renderLedger } from "./lib/history-prune.mjs";

const env = process.env;
const API = env["GITHUB_API_URL"] ?? "https://api.github.com";
const token = env["GITHUB_TOKEN"];
const repoFull = env["GITHUB_REPOSITORY"];
const prNumber = env["PR_NUMBER"];

// Every knob is schema-validated up front: a misformatted threshold, label or
// assignee is reported with the exact reason instead of failing obscurely later.
const configResult = validateEscalationConfig(env);
console.log(formatEscalationConfig(configResult));
const {
  threshold,
  labels,
  assignees,
  enabled: escalationEnabled,
  backoffMinutes,
  backoffFactor,
  backoffMaxMinutes,
  jitterPct,
  historyLimit,
  historyStore,
  historyRows,
  historyDays,
  historyFilter,
} = configResult.value;

// Exponential backoff with jitter: the Nth update to the same streak issue must
// wait base * factor^(N-1) minutes (capped), ±jitter, so a rapid burst of red
// runs produces one update instead of a comment per run. Jitter is deterministic
// per run so parallel jobs of the same run agree on the window.
const jitterFor = (seed) => {
  let h = 2166136261;
  for (const ch of String(seed)) h = (Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0);
  return ((h % 2001) / 1000 - 1) * (jitterPct / 100); // -jitter..+jitter
};
const backoffWindowMinutes = (updateCount) => {
  const raw = backoffMinutes * Math.pow(backoffFactor, Math.max(0, updateCount - 1));
  const capped = Math.min(raw, backoffMaxMinutes);
  return Math.max(0, capped * (1 + jitterFor(`${runId ?? ""}:${updateCount}`)));
};

// CODEOWNERS routing: assign the owners of the failing code once the streak
// crosses the threshold. Opt out with CODEOWNERS_ASSIGN=false.
// Dry run: read GitHub, simulate every write, still notify chat (marked).
const dryRun =
  process.argv.includes("--dry-run") ||
  ["true", "1", "on", "yes"].includes(String(env["DRY_RUN"] ?? "").trim().toLowerCase());

if (dryRun) {
  console.log("🧪 DRY RUN — GitHub writes are simulated; chat notification still fires (marked [DRY RUN]).");
}

const codeownersEnabled = !["false", "0", "off", "no"].includes(
  String(env["CODEOWNERS_ASSIGN"] ?? "true").trim().toLowerCase(),
);

const bail = (msg) => {
  console.log(`ℹ️ Flaky-PR issue skipped — ${msg}`);
  process.exit(0);
};

if (!configResult.ok) bail(`invalid escalation configuration (${configResult.errors.length} error(s) above)`);
if (!escalationEnabled) bail("escalation disabled (ESCALATION_ENABLED)");
if (!token) bail("no GITHUB_TOKEN available");
if (!repoFull) bail("GITHUB_REPOSITORY is not set");
if (!prNumber) bail("not a pull request run");


const [owner, repo] = repoFull.split("/");
const runId = env["GITHUB_RUN_ID"];
const runUrl = `${env["GITHUB_SERVER_URL"] ?? "https://github.com"}/${repoFull}/actions/runs/${runId}`;
const sha = env["GITHUB_SHA"] ?? "";
const shortSha = sha.slice(0, 7);
const branch = configResult.branch;
const workflow = env["GITHUB_WORKFLOW"] ?? "CI";
const jobName = env["JOB_NAME"] ?? env["GITHUB_JOB"] ?? "ssr-gate";

// Simulated responses for the mutating calls, so the whole decision path (create
// vs comment vs assign vs de-dupe) still runs end to end during a dry run.
let simulatedIssueNumber = 0;
const simulate = (path, init) => {
  const method = init.method ?? "GET";
  const body = init.body ? JSON.parse(init.body) : {};
  const pretty = Object.entries(body)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? `[${v.join(", ")}]` : String(v).split("\n")[0].slice(0, 80)}`)
    .join(" · ");
  console.log(`🧪 [dry-run] would ${method} ${path}${pretty ? ` — ${pretty}` : ""}`);
  if (method === "POST" && /\/issues$/.test(path)) {
    simulatedIssueNumber = simulatedIssueNumber || 999999;
    return {
      number: simulatedIssueNumber,
      html_url: `${env["GITHUB_SERVER_URL"] ?? "https://github.com"}/${repoFull}/issues/(dry-run)`,
      dryRun: true,
    };
  }
  return null;
};

const gh = async (path, init = {}) => {
  const method = init.method ?? "GET";
  if (dryRun && method !== "GET") return simulate(path, init);
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${init.method ?? "GET"} ${path} failed [${res.status}]: ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
};

try {
  // --- 1. consecutive failure streak on this branch ---------------------------
  const workflowFile = (env["GITHUB_WORKFLOW_REF"] ?? "").split("/").pop()?.split("@")[0] ?? "";
  const scope = workflowFile ? `/actions/workflows/${encodeURIComponent(workflowFile)}/runs` : "/actions/runs";
  const history = await gh(
    `/repos/${owner}/${repo}${scope}?branch=${encodeURIComponent(branch)}&event=pull_request&per_page=${historyLimit}`,
  );

  // Newest first, current run included. Retention (count cap + age cap) is
  // applied by the shared deterministic pruner so the streak view, the stored
  // ledger and the comment cleanup can never disagree.
  const observed = (history.workflow_runs ?? []).filter(
    (r) => r.status === "completed" || String(r.id) === String(runId),
  );
  const pruneNow = Date.now();
  const runWindow = pruneHistory({
    incoming: observed,
    limit: historyLimit,
    days: historyDays,
    pinnedIds: [runId],
    now: pruneNow,
  });
  // Keep the full API objects for the runs we retained (conclusion, urls, etc).
  const byRunId = new Map(observed.map((r) => [String(r.id), r]));
  const runs = runWindow.kept.map((e) => byRunId.get(e.id) ?? e);
  const droppedByAge = runWindow.agedOutCount;
  const historyWindow = `${runs.length} run${runs.length === 1 ? "" : "s"} kept (limit ${historyLimit}${
    historyDays ? `, max age ${historyDays}d` : ", no age limit"
  }${droppedByAge ? `, ${droppedByAge} aged out` : ""}${
    runWindow.overLimitCount ? `, ${runWindow.overLimitCount} over limit` : ""
  })`;

  let streak = 0;
  const streakRuns = [];
  for (const r of runs) {
    const failed = String(r.id) === String(runId) || r.conclusion === "failure";
    if (!failed) break;
    streak += 1;
    streakRuns.push(r);
  }

  console.log(`Failure streak on ${branch}: ${streak} (threshold ${threshold})`);
  if (streak < threshold) {
    bail(`streak is ${streak}, below the threshold of ${threshold}`);
  }

  // --- 2. links ---------------------------------------------------------------
  const link = (label, url) => (url ? `[${label}](${url})` : `_${label} not produced_`);
  const links = [
    `| \`diagnostics.zip\` | Everything in one archive | ${link("download", env["BUNDLE_URL"])} |`,
    `| \`playwright-report\` | HTML report (\`index.html\`) | ${link("download", env["REPORT_URL"])} |`,
    `| \`test-results\` | Traces, screenshots, Vitest junit/json | ${link("download", env["RESULTS_URL"])} |`,
    `| \`playwright-videos\` | Failed-spec screen recordings | ${link("download", env["VIDEOS_URL"])} |`,
    `| \`test-logs\` | build / wrangler / playwright / vitest logs | ${link("download", env["LOGS_URL"])} |`,
  ].join("\n");

  const archiveLine = env["ARCHIVE_OBJECT_KEY"]
    ? `\n_Long-term archive: \`${env["ARCHIVE_OBJECT_KEY"]}\` (TTL ${env["ARCHIVE_TTL_DAYS"] ?? "?"} days)._\n`
    : "";

  const runList = streakRuns
    .slice(0, 5)
    .map((r) => `- ${String(r.id) === String(runId) ? "**" : ""}[run ${r.id}](${r.html_url})${String(r.id) === String(runId) ? "** (this run)" : ""} · ${(r.head_sha ?? "").slice(0, 7)} · ${r.created_at}`)
    .join("\n");

  // Parsed from the Playwright/Vitest JSON reports of *this* run; empty when the
  // reports are absent (e.g. the build failed before tests ran).
  const { buildTestFailureSummary, failingTestFiles, collectTestFailures } = await import(
    "./lib/test-failure-summary.mjs"
  );
  const failureSummary = buildTestFailureSummary();

  // --- 2b. metrics ------------------------------------------------------------
  // Short, always-current health snapshot for the issue: how long we've been red,
  // how much retrying is going on, and when this branch was last green.
  const thisRunRetries = collectTestFailures().reduce(
    (n, f) => n + Math.max(0, (f.attempts?.length ?? 1) - 1),
    0,
  );
  // Job-level re-runs across the whole streak (run_attempt > 1 means re-run).
  const jobReruns = streakRuns.reduce((n, r) => n + Math.max(0, (r.run_attempt ?? 1) - 1), 0);
  const lastSuccess = runs.find((r) => r.conclusion === "success");
  const ago = (iso) => {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    return `${Math.round(mins / 1440)}d ago`;
  };
  const streakStarted = streakRuns[streakRuns.length - 1]?.created_at;
  const streakIdCandidate = String(streakRuns[streakRuns.length - 1]?.id ?? runId);

  // Direct jump-off points: the newest failing runs (with their attempt view and
  // per-run log/artifact pages) plus this run's uploaded diagnostics.
  const failingRunRows = streakRuns
    .slice(0, 3)
    .map((r) => {
      const isThis = String(r.id) === String(runId);
      const attempt = r.run_attempt ?? 1;
      const cells = [
        `[run ${r.id}](${r.html_url})${isThis ? " **(this run)**" : ""}`,
        `\`${(r.head_sha ?? "").slice(0, 7)}\``,
        `${r.created_at} (${ago(r.created_at)})`,
        `[attempt ${attempt}](${r.html_url}/attempts/${attempt}) · [logs](${r.html_url}#artifacts) · [re-run](${r.html_url})`,
      ];
      return `| ${cells.join(" | ")} |`;
    })
    .join("\n");

  // Compact streak history: newest-first outcome strip plus one line per run, so
  // the issue shows when the red streak began and how it has evolved since.
  const glyph = (r) => {
    if (String(r.id) === String(runId)) return "✗";
    if (r.conclusion === "success") return "✓";
    if (r.conclusion === "failure") return "✗";
    if (r.conclusion === "cancelled") return "∅";
    return "·";
  };
  // Outcome filter (display only — streak counting and the stored ledger keep
  // every retained run). The current run always counts as a failure.
  const outcomeOf = (r) =>
    String(r.id) === String(runId) ? "failure" : (r.conclusion ?? r.status ?? "unknown");
  const matchesFilter = (r) =>
    historyFilter === "all" ||
    (historyFilter === "failures" ? outcomeOf(r) === "failure" : outcomeOf(r) === "success");
  const filteredRuns = runs.filter(matchesFilter);
  const historyRuns = historyRows > 0 ? filteredRuns.slice(0, historyRows) : [];
  const filterNote =
    historyFilter === "all" ? "" : ` · filter: ${historyFilter} only (${filteredRuns.length} of ${runs.length} runs)`;

  // Compact digest of the whole retained window — always available, so setting
  // HISTORY_ROWS=0 hides the per-run table but never the key signal.
  const outcomeCounts = runs.reduce((acc, r) => {
    const k = String(r.id) === String(runId) ? "failure" : (r.conclusion ?? "other");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, /** @type {Record<string, number>} */ ({}));
  const countsText =
    Object.entries(outcomeCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k, n]) => `${n} ${k}`)
      .join(" · ") || "no runs retained";
  const latest = runs[0];
  const lastOutcome = latest
    ? `${String(latest.id) === String(runId) ? "failure (this run)" : (latest.conclusion ?? latest.status ?? "unknown")} · ${ago(latest.created_at)}`
    : "unknown";
  const historyDigest =
    `streak started ${streakStarted ? `${streakStarted} (${ago(streakStarted)})` : "unknown"}` +
    ` · last outcome ${lastOutcome} · ${countsText} · ${historyWindow}${filterNote}`;
  const strip = historyRuns.map(glyph).join(" ");
  const historyTableRows = historyRuns
    .map((r) => {
      const isThis = String(r.id) === String(runId);
      const outcome = isThis ? "failure (this run)" : (r.conclusion ?? r.status ?? "unknown");
      const streakStart = streakRuns.length && String(r.id) === streakIdCandidate ? " ← streak started" : "";
      const attempt = (r.run_attempt ?? 1) > 1 ? ` (attempt ${r.run_attempt})` : "";
      return `| ${glyph(r)} | ${r.created_at} (${ago(r.created_at)}) | ${outcome}${attempt} | [run ${r.id}](${r.html_url})${streakStart} |`;
    })
    .join("\n");

  const logLinks = [
    ["diagnostics.zip", env["BUNDLE_URL"]],
    ["Playwright report", env["REPORT_URL"]],
    ["Traces & screenshots", env["RESULTS_URL"]],
    ["Videos", env["VIDEOS_URL"]],
    ["Run logs (build / wrangler / playwright / vitest)", env["LOGS_URL"]],
  ]
    .filter(([, url]) => url)
    .map(([label, url]) => `[${label}](${url})`)
    .join(" · ");

  // Same metrics, in a shape the Slack/Teams notifier can render as rows.
  const metricsRows = [
    ["Current failure streak", `${streak} consecutive runs (threshold ${threshold})`],
    ["Streak started", streakStarted ? `${streakStarted} (${ago(streakStarted)})` : "unknown"],
    ["Test retries (this run)", String(thisRunRetries)],
    ["Job re-runs (during streak)", String(jobReruns)],
    [
      "Last successful run",
      lastSuccess
        ? `${lastSuccess.created_at} (${ago(lastSuccess.created_at)})`
        : `none in the retained history (${historyWindow})`,
    ],
    [
      "Retry window",
      `${backoffMinutes}m base × ${backoffFactor} (cap ${backoffMaxMinutes}m, ±${jitterPct}% jitter)`,
    ],
    ...(historyRows > 0
      ? [[`Streak history (newest first${historyFilter === "all" ? "" : `, ${historyFilter} only`})`, strip || "n/a"]]
      : [["Streak history", "rows hidden (HISTORY_ROWS=0)"]]),
    ["History summary", historyDigest],
    ["History retention", historyWindow],
  ];

  const metricsSection = `${"<!-- ci-metrics -->"}
#### Metrics

| Metric | Value |
| --- | --- |
| Current failure streak | **${streak}** consecutive runs (threshold ${threshold}) |
| Streak started | ${streakStarted ? `${streakStarted} (${ago(streakStarted)})` : "_unknown_"} |
| Test retries (this run) | ${thisRunRetries} |
| Job re-runs (during streak) | ${jobReruns} |
| Last successful run | ${
    lastSuccess
      ? `[run ${lastSuccess.id}](${lastSuccess.html_url}) · ${lastSuccess.created_at} (${ago(lastSuccess.created_at)})`
      : `_none in the retained history (${historyWindow})_`
  } |
| Retry window | ${backoffMinutes}m base × ${backoffFactor} (cap ${backoffMaxMinutes}m, ±${jitterPct}% jitter) |
| History summary | ${historyDigest} |
| Logs for this run | ${logLinks || "_no artifacts uploaded_"} |

Latest failing runs:

| Run | Commit | When | Jump to |
| --- | --- | --- | --- |
${failingRunRows || "| _none captured_ | | | |"}

${
  historyRows === 0
    ? `_Per-run streak history is hidden (\`HISTORY_ROWS=0\`) — summary: ${historyDigest}._`
    : `<details><summary>Streak history (newest first, last ${historyRows} of ${historyWindow}${
        historyFilter === "all" ? "" : `, ${historyFilter} only`
      }): <code>${strip}</code></summary>

| | When | Outcome | Run |
| --- | --- | --- | --- |
${historyTableRows || `| | _no ${historyFilter === "all" ? "history available" : `${historyFilter} in the retained window`}_ | | |`}

Legend: ✗ failed · ✓ succeeded · ∅ cancelled · · other

</details>`
}
`;

  // --- CODEOWNERS routing -----------------------------------------------------
  // Once a streak crosses the threshold the issue is assigned to the owners of
  // the code involved: failing spec files first (most precise), falling back to
  // the PR's changed files when no spec paths were parsed. Users are assigned;
  // teams cannot be assignees, so they get @-mentioned in the body instead.
  let ownerUsers = [];
  let ownerTeams = [];
  let ownersSection = "";
  if (codeownersEnabled) {
    try {
      const { loadCodeowners, resolveOwners } = await import("./lib/codeowners.mjs");
      const codeowners = loadCodeowners(process.cwd(), env["CODEOWNERS_FILE"]);
      if (!codeowners.rules.length) {
        console.log("CODEOWNERS routing skipped — no CODEOWNERS file with usable rules.");
      } else {
        const specPaths = failingTestFiles();
        let paths = specPaths;
        let sourceLabel = "failing spec files";
        if (!paths.length) {
          const changed = await gh(`/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`).catch(
            () => [],
          );
          paths = (changed ?? []).map((f) => f.filename).filter(Boolean);
          sourceLabel = "PR changed files";
        }
        const resolved = resolveOwners(codeowners, paths, {
          maxUsers: Math.max(0, 10 - assignees.length),
          exclude: [...assignees, ...(env["CODEOWNERS_EXCLUDE"] ?? "").split(",")],
        });
        ownerUsers = resolved.users;
        ownerTeams = resolved.teams;
        console.log(
          `CODEOWNERS (${codeowners.path}) matched ${resolved.matchedPaths.length}/${paths.length} ${sourceLabel} → ` +
            `users [${ownerUsers.join(", ") || "none"}], teams [${ownerTeams.join(", ") || "none"}]`,
        );
        if (ownerUsers.length || ownerTeams.length) {
          const mentions = [...ownerUsers, ...ownerTeams].map((h) => `@${h}`).join(" ");
          const rows = Object.entries(resolved.byPath)
            .slice(0, 8)
            .map(([file, owners]) => `| \`${file}\` | ${owners.join(" ")} |`)
            .join("\n");
          ownersSection = `### Routed to code owners

${mentions} — owners of the ${sourceLabel} for this failure streak (source: \`${codeowners.path}\`).

<details><summary>Ownership matches</summary>

| Path | Owners |
| --- | --- |
${rows}

</details>

`;
        }
      }
    } catch (err) {
      console.log(`CODEOWNERS routing failed (continuing without owners): ${err.message}`);
    }
  }
  const allAssignees = [...new Set([...assignees, ...ownerUsers])].slice(0, 10);

  const section = `### ${workflow} · ${jobName} failed (${streak} consecutive runs)

Latest: ${runUrl} · commit \`${shortSha}\` · branch \`${branch}\`

${failureSummary}
${metricsSection}
${ownersSection}| Artifact | Contents | Link |
| --- | --- | --- |
${links}
${archiveLine}
<details><summary>Failure streak</summary>

${runList}

</details>

Reproduce locally:
\`\`\`bash
git fetch origin && git checkout ${sha || branch}
bun install --frozen-lockfile
bun run test:e2e
\`\`\`
`;

  // --- 3. idempotency key -----------------------------------------------------
  // Stable per (repo, workflow, job, branch, streak): every run inside the same
  // consecutive-failure streak resolves to the same key, so repeated runs update
  // one issue. A green run breaks the streak, so the next streak gets a new key
  // (and a fresh issue) instead of reviving a stale one.
  const streakId = String(streakRuns[streakRuns.length - 1]?.id ?? runId);
  const slug = (s) => String(s).replace(/[^A-Za-z0-9._/-]+/g, "-");
  const key = `ci-fail-streak:${slug(workflowFile || workflow)}:${slug(jobName)}:${slug(branch)}:${streakId}`;
  const marker = `<!-- ${key} -->`;
  // Second-level guard: one update per workflow run, so a re-run of the same
  // step (or a retried job) never appends the same section twice.
  const runMarker = `<!-- ci-run:${runId} -->`;
  console.log(`Idempotency key: ${key}`);

  // Open-issue listing is strongly consistent; /search/issues is not (its index
  // lags by seconds to minutes, which is exactly how duplicates get created).

  const findByMarker = async () => {
    const matches = [];
    for (let page = 1; page <= 3; page += 1) {
      const batch = await gh(
        `/repos/${owner}/${repo}/issues?state=open&per_page=100&page=${page}&sort=created&direction=desc`,
      );
      const issues = (batch ?? []).filter((i) => !i.pull_request);
      matches.push(...issues.filter((i) => (i.body ?? "").includes(marker)));
      if ((batch ?? []).length < 100) break;
    }
    if (matches.length) return matches.sort((a, b) => a.number - b.number);
    // Fallback for repos with >300 open issues.
    const search = await gh(
      `/search/issues?q=${encodeURIComponent(`repo:${repoFull} is:issue is:open "${key}"`)}`,
    ).catch(() => ({ items: [] }));
    return (search.items ?? []).sort((a, b) => a.number - b.number);
  };

  // --- 4. create or update the tracking issue --------------------------------
  const found = await findByMarker();
  const existing = found[0];

  let issueUrl = existing?.html_url ?? "";
  let issueNumber = existing?.number;
  let action = existing ? "updated" : "opened";

  if (existing) {
    // Close any duplicate that slipped through a previous race, pointing at the
    // canonical (lowest-numbered) issue.
    for (const dupe of found.slice(1)) {
      await gh(`/repos/${owner}/${repo}/issues/${dupe.number}`, {
        method: "PATCH",
        body: JSON.stringify({ state: "closed" }),
      }).catch((err) => console.log(`Could not close duplicate #${dupe.number}: ${err.message}`));
      await gh(`/repos/${owner}/${repo}/issues/${dupe.number}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: `Duplicate of #${existing.number} — same failure streak (\`${key}\`).` }),
      }).catch(() => {});
      console.log(`🧹 Closed duplicate issue #${dupe.number}`);
    }

    const comments = await gh(
      `/repos/${owner}/${repo}/issues/${existing.number}/comments?per_page=100`,
    ).catch(() => []);
    const alreadyReported =
      (existing.body ?? "").includes(runMarker) ||
      (comments ?? []).some((c) => (c.body ?? "").includes(runMarker));

    // Retry window: count previous per-run updates on this issue and hold off
    // until the backoff window since the most recent one has elapsed.
    const runUpdates = (comments ?? []).filter((c) => /<!-- ci-run:\d+ -->/.test(c.body ?? ""));
    const lastUpdateAt = runUpdates.length
      ? runUpdates[runUpdates.length - 1].created_at
      : existing.created_at;
    const windowMin = backoffWindowMinutes(runUpdates.length + 1);
    const elapsedMin = (Date.now() - new Date(lastUpdateAt).getTime()) / 60000;
    if (!alreadyReported && elapsedMin < windowMin) {
      const waitMin = Math.max(1, Math.ceil(windowMin - elapsedMin));
      console.log(
        `⏳ Backoff — issue #${existing.number} was updated ${elapsedMin.toFixed(1)}m ago; ` +
          `window is ${windowMin.toFixed(1)}m (update #${runUpdates.length + 1}). Next update in ~${waitMin}m.`,
      );
      if (env["GITHUB_STEP_SUMMARY"]) {
        const { appendFileSync } = await import("node:fs");
        appendFileSync(
          env["GITHUB_STEP_SUMMARY"],
          `\n⏳ Triage issue #${existing.number} left untouched — inside the ${windowMin.toFixed(0)}m retry window (next update in ~${waitMin}m).\n\n`,
        );
      }
      bail(`inside the retry window for issue #${existing.number} (~${waitMin}m remaining)`);
    }

    if (alreadyReported) {
      action = "unchanged";
      console.log(`↩️ Run ${runId} already recorded on issue #${existing.number} — nothing to do.`);
    } else {
      await gh(`/repos/${owner}/${repo}/issues/${existing.number}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: `${runMarker}\n${section}` }),
      });
      console.log(`💬 Commented on existing issue #${existing.number}`);
      // Owners can change as the streak moves onto different specs — top up the
      // assignee list on the existing issue (the API ignores duplicates).
      const missing = allAssignees.filter((a) => !(existing.assignees ?? []).some((u) => u.login === a));
      if (missing.length) {
        await gh(`/repos/${owner}/${repo}/issues/${existing.number}/assignees`, {
          method: "POST",
          body: JSON.stringify({ assignees: missing }),
        })
          .then(() => console.log(`👤 Assigned code owners: ${missing.join(", ")}`))
          .catch((err) => console.log(`Could not assign ${missing.join(", ")}: ${err.message}`));
      }
    }
  } else {
    const title = `CI failing repeatedly on PR #${prNumber} (${branch}) — ${streak} runs in a row`;
    const body = `${marker}\n${runMarker}\nAutomated triage issue: the **${workflow}** gate has failed ${streak} consecutive times on PR #${prNumber}.\n\n${section}\n_Tracking key: \`${key}\` — later runs in this streak update this issue. Close manually once the gate is green._`;
    const issue = await gh(`/repos/${owner}/${repo}/issues`, {
      method: "POST",
      body: JSON.stringify({
        title,
        body,
        labels,
        ...(allAssignees.length ? { assignees: allAssignees } : {}),
      }),
    }).catch(async (err) => {
      // Labels/assignees may not exist in the repo; retry with just the issue.
      console.log(`Retrying issue creation without labels/assignees: ${err.message}`);
      return gh(`/repos/${owner}/${repo}/issues`, {
        method: "POST",
        body: JSON.stringify({ title, body }),
      });
    });
    issueUrl = issue.html_url;
    issueNumber = issue.number;
    console.log(`🐛 Opened issue #${issue.number}: ${issue.html_url}`);

    // Race window: two jobs of the same run can create simultaneously. Keep the
    // lowest-numbered issue and close ours if it lost the race.
    const after = await findByMarker();
    const canonical = after[0];
    if (canonical && canonical.number < issue.number) {
      await gh(`/repos/${owner}/${repo}/issues/${issue.number}`, {
        method: "PATCH",
        body: JSON.stringify({ state: "closed" }),
      }).catch(() => {});
      await gh(`/repos/${owner}/${repo}/issues/${issue.number}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: `Duplicate of #${canonical.number} — same failure streak (\`${key}\`).` }),
      }).catch(() => {});
      issueUrl = canonical.html_url;
      issueNumber = canonical.number;
      action = "updated";
      console.log(`🧹 Lost creation race — closed #${issue.number}, keeping #${canonical.number}`);
    }
  }

  // --- 4b. deterministic history pruning -------------------------------------
  // Rebuild the stored ledger from (previous ledger + runs observed now), then
  // apply the exact same retention as above. Stale per-run comments outside the
  // retained window are deleted so the issue never accumulates old runs.
  if (issueNumber && action !== "unchanged") {
    try {
      const all = await gh(
        `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`,
      ).catch(() => []);
      const ledgerComment = (all ?? []).find((c) => (c.body ?? "").includes("<!-- ci-history -->"));
      const window = pruneHistory({
        stored: parseLedger(ledgerComment?.body),
        incoming: runs,
        limit: historyStore,
        days: historyDays,
        pinnedIds: [runId],
        now: pruneNow,
      });
      const ledgerBody = renderLedger({
        kept: window.kept,
        limit: historyStore,
        days: historyDays,
        agedOutCount: window.agedOutCount,
        overLimitCount: window.overLimitCount,
        updatedAt: new Date(pruneNow).toISOString(),
      });

      if (ledgerComment) {
        await gh(`/repos/${owner}/${repo}/issues/comments/${ledgerComment.id}`, {
          method: "PATCH",
          body: JSON.stringify({ body: ledgerBody }),
        });
      } else {
        await gh(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
          method: "POST",
          body: JSON.stringify({ body: ledgerBody }),
        });
      }

      // Drop per-run comments for runs that fell out of the retained window.
      let removed = 0;
      for (const c of all ?? []) {
        const m = /<!-- ci-run:(\d+) -->/.exec(c.body ?? "");
        if (!m || window.keptIds.has(m[1]) || String(m[1]) === String(runId)) continue;
        await gh(`/repos/${owner}/${repo}/issues/comments/${c.id}`, { method: "DELETE" })
          .then(() => {
            removed += 1;
          })
          .catch((err) => console.log(`Could not prune comment ${c.id}: ${err.message}`));
      }
      console.log(
        `🧹 History pruned — ${window.kept.length}/${historyLimit} runs retained` +
          `${window.agedOutCount ? `, ${window.agedOutCount} aged out` : ""}` +
          `${window.overLimitCount ? `, ${window.overLimitCount} over limit` : ""}` +
          `${removed ? `, ${removed} stale comment(s) deleted` : ""}.`,
      );
    } catch (err) {
      console.log(`History pruning skipped: ${err.message}`);
    }
  }

  // --- 5. chat notification (Slack and/or Teams) ------------------------------
  if (action === "unchanged") {
    console.log("Chat notification skipped — this run was already reported.");
  } else {
    const { notifyChat } = await import("./lib/chat-notify.mjs");
    await notifyChat({
      title: `${dryRun ? "[DRY RUN] " : ""}Triage issue ${action}: ${workflow} · ${jobName} failed ${streak} runs in a row`,
      subtitle: [
        `*Repo:* ${repoFull}`,
        `*Branch:* ${branch}${shortSha ? ` (\`${shortSha}\`)` : ""}`,
        `*PR:* #${prNumber}`,
        issueNumber ? `*Issue:* #${dryRun ? "simulated" : issueNumber}` : "",
        dryRun ? "*Mode:* dry run — no GitHub changes were made" : "",
      ]
        .filter(Boolean)
        .join("   "),
      links: [
        ["All diagnostics (zip)", env["BUNDLE_URL"] ?? ""],
        ["Playwright report", env["REPORT_URL"] ?? ""],
        ["Traces & screenshots", env["RESULTS_URL"] ?? ""],
        ["Videos", env["VIDEOS_URL"] ?? ""],
        ["Run logs", env["LOGS_URL"] ?? ""],
        ["Workflow run", runUrl],
      ],
      metrics: metricsRows,
      buttonUrl: issueUrl || runUrl,
      buttonText: issueNumber ? `Open issue #${issueNumber}` : "Open workflow run",
    });
  }

  if (env["GITHUB_STEP_SUMMARY"]) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(
      env["GITHUB_STEP_SUMMARY"],
      `\n🐛 Repeated failure (${streak} runs) — triage issue${issueNumber && !dryRun ? ` #${issueNumber}` : ""} ${action}${dryRun ? " **(dry run — no GitHub changes)**" : ""} (key \`${key}\`).\n\n`,
    );
  }
} catch (err) {
  console.log(`⚠️ Could not file the repeated-failure issue: ${err.message}`);
  process.exit(0);
}
