/**
 * Markdown reporting for the Lighthouse CI gate.
 *
 * Turns the current run + the committed baseline into a PR-friendly summary:
 * category before/after scores, Core Web Vitals deltas, and the individual
 * audits whose score changed since the baseline (the "what actually moved"
 * part that raw category numbers hide).
 */

const ARROW = { up: "🟢", down: "🔴", flat: "⚪" };

/** Metric audits tracked per route, in report order. */
export const TRACKED_METRICS = [
  ["first-contentful-paint", "FCP"],
  ["largest-contentful-paint", "LCP"],
  ["total-blocking-time", "TBT"],
  ["cumulative-layout-shift", "CLS"],
  ["speed-index", "SI"],
];

/** Audit-score deltas below this many points are treated as noise. */
const AUDIT_NOISE_FLOOR = 5;
/** Cap on how many changed audits are listed per route. */
const MAX_AUDITS_PER_ROUTE = 12;
/** Cap on movers listed in the TL;DR baseline diff section. */
const TOP_MOVERS = 5;

function direction(delta, lowerIsBetter = false) {
  if (delta === 0) return ARROW.flat;
  const better = lowerIsBetter ? delta < 0 : delta > 0;
  return better ? ARROW.up : ARROW.down;
}

function signed(delta, digits = 0) {
  if (delta === 0) return "±0";
  const value = digits ? delta.toFixed(digits) : String(Math.round(delta));
  return delta > 0 ? `+${value}` : value;
}

/**
 * Extract the reportable slice of a Lighthouse result: category scores,
 * tracked metric values, and every scorable audit's score (0-100).
 */
export function extractRouteReport(lhr, categories) {
  const scores = {};
  for (const key of categories) {
    const raw = lhr.categories[key]?.score;
    if (typeof raw !== "number") throw new Error(`missing "${key}" score`);
    scores[key] = Math.round(raw * 100);
  }

  const metrics = {};
  for (const [id] of TRACKED_METRICS) {
    const audit = lhr.audits?.[id];
    if (typeof audit?.numericValue === "number") {
      metrics[id] = {
        value: Math.round(audit.numericValue * 1000) / 1000,
        display: audit.displayValue ?? "",
      };
    }
  }

  const audits = {};
  for (const [id, audit] of Object.entries(lhr.audits ?? {})) {
    if (typeof audit?.score !== "number") continue;
    if (audit.scoreDisplayMode === "informative" || audit.scoreDisplayMode === "notApplicable") {
      continue;
    }
    audits[id] = { score: Math.round(audit.score * 100), title: audit.title ?? id };
  }

  return { ...scores, metrics, audits };
}

/** Strip the report extras so the numbers the gate evaluates stay untouched. */
export function categoryScores(routeReport, categories) {
  const out = {};
  for (const key of categories) out[key] = routeReport[key];
  return out;
}

function categoryTable(route, current, before, categories) {
  const rows = categories.map((key) => {
    const after = current[key];
    const prev = before?.[key];
    if (typeof prev !== "number") {
      return `| ${key} | – | **${after}** | new |`;
    }
    const delta = after - prev;
    return `| ${key} | ${prev} | **${after}** | ${direction(delta)} ${signed(delta)} |`;
  });
  return [
    `| category | before | after | Δ |`,
    `| --- | --- | --- | --- |`,
    ...rows,
  ].join("\n");
}

function metricsTable(current, before) {
  const rows = [];
  for (const [id, label] of TRACKED_METRICS) {
    const after = current.metrics?.[id];
    if (!after) continue;
    const prev = before?.metrics?.[id];
    const isCls = id === "cumulative-layout-shift";
    const digits = isCls ? 3 : 0;
    const unit = isCls ? "" : " ms";
    const shown = after.display || `${after.value}${unit}`;
    if (!prev) {
      rows.push(`| ${label} | – | **${shown}** | new |`);
      continue;
    }
    const delta = after.value - prev.value;
    const shownDelta = Math.abs(delta) < (isCls ? 0.001 : 1)
      ? "±0"
      : `${signed(delta, digits)}${unit}`;
    rows.push(
      `| ${label} | ${prev.display || prev.value} | **${shown}** | ${direction(delta, true)} ${shownDelta} |`,
    );
  }
  if (!rows.length) return "";
  return [`| metric | before | after | Δ |`, `| --- | --- | --- | --- |`, ...rows].join("\n");
}

function changedAudits(current, before) {
  if (!before?.audits) return { rows: [], hidden: 0 };
  const changes = [];
  for (const [id, audit] of Object.entries(current.audits ?? {})) {
    const prev = before.audits[id];
    if (typeof prev?.score !== "number") continue;
    const delta = audit.score - prev.score;
    if (Math.abs(delta) < AUDIT_NOISE_FLOOR) continue;
    changes.push({ id, title: audit.title, before: prev.score, after: audit.score, delta });
  }
  changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const shown = changes.slice(0, MAX_AUDITS_PER_ROUTE);
  const rows = shown.map(
    (c) =>
      `| ${direction(c.delta)} ${c.title} | ${c.before} | ${c.after} | ${signed(c.delta)} | \`${c.id}\` |`,
  );
  return { rows, hidden: changes.length - shown.length };
}

/** Cap on metric moves highlighted per route in the visible section. */
const TOP_METRICS_PER_ROUTE = 3;

/**
 * Per-route metric highlights, rendered outside the collapsed <details> so the
 * biggest Core Web Vitals moves for each targeted page are visible at a glance.
 */
function routeMetricHighlights({ results, baseline }) {
  const labels = new Map(TRACKED_METRICS);
  const blocks = [];
  for (const [route, current] of Object.entries(results)) {
    const before = baseline[route];
    const moves = [];
    for (const [id] of TRACKED_METRICS) {
      const after = current.metrics?.[id];
      if (!after) continue;
      const prev = before?.metrics?.[id];
      const isCls = id === "cumulative-layout-shift";
      const unit = isCls ? "" : " ms";
      const shown = after.display || `${after.value}${unit}`;
      if (!prev) {
        moves.push({ id, delta: 0, isNew: true, text: `${labels.get(id)}: – → **${shown}** (new)` });
        continue;
      }
      const delta = after.value - prev.value;
      const noise = isCls ? 0.001 : 1;
      if (Math.abs(delta) < noise) continue;
      const shownDelta = `${signed(delta, isCls ? 3 : 0)}${unit}`;
      moves.push({
        id,
        delta: isCls ? delta * 1000 : delta,
        text: `${direction(delta, true)} ${labels.get(id)}: ${prev.display || prev.value} → **${shown}** (${shownDelta})`,
      });
    }
    moves.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const top = moves.slice(0, TOP_METRICS_PER_ROUTE);
    blocks.push(
      `- \`${route}\` — ${
        top.length ? top.map((m) => m.text).join(" · ") : "no metric moved beyond noise"
      }`,
    );
  }
  if (!blocks.length) return [];
  return ["**Per-route metric deltas**", "", ...blocks, ""];
}

/**
 * Concise TL;DR: the biggest category and audit movers across all routes, plus
 * whether the baseline they are compared against came from an intentional
 * refresh (so reviewers know if a "regression" was already signed off).
 */
function baselineDiffSummary({ results, baseline, categories, baselineMeta }) {
  const catMovers = [];
  const auditMovers = [];
  for (const [route, current] of Object.entries(results)) {
    const before = baseline[route];
    if (!before) continue;
    for (const key of categories) {
      const prev = before[key];
      if (typeof prev !== "number") continue;
      const delta = current[key] - prev;
      if (delta !== 0) catMovers.push({ route, key, before: prev, after: current[key], delta });
    }
    for (const [id, audit] of Object.entries(current.audits ?? {})) {
      const prev = before.audits?.[id];
      if (typeof prev?.score !== "number") continue;
      const delta = audit.score - prev.score;
      if (Math.abs(delta) >= AUDIT_NOISE_FLOOR) {
        auditMovers.push({ route, id, title: audit.title, delta });
      }
    }
  }
  const bySize = (a, b) => Math.abs(b.delta) - Math.abs(a.delta);
  catMovers.sort(bySize);
  auditMovers.sort(bySize);

  const lines = ["### Baseline diff", ""];
  if (!catMovers.length && !auditMovers.length) {
    lines.push("No category or audit movement vs the committed baseline.", "");
  } else {
    if (catMovers.length) {
      lines.push(
        "**Biggest category changes**",
        "",
        ...catMovers
          .slice(0, TOP_MOVERS)
          .map(
            (m) =>
              `- ${direction(m.delta)} \`${m.route}\` ${m.key}: ${m.before} → **${m.after}** (${signed(m.delta)})`,
          ),
        "",
      );
    }
    if (auditMovers.length) {
      lines.push(
        "**Biggest audit changes**",
        "",
        ...auditMovers
          .slice(0, TOP_MOVERS)
          .map(
            (m) =>
              `- ${direction(m.delta)} \`${m.route}\` ${m.title} (${signed(m.delta)}) — \`${m.id}\``,
          ),
        "",
      );
    }
  }

  if (baselineMeta?.updatedAt) {
    const scope = Array.isArray(baselineMeta.routes)
      ? baselineMeta.routes.join(", ")
      : (baselineMeta.routes ?? "all");
    lines.push(
      `**Baseline origin:** intentional refresh on ${baselineMeta.updatedAt}` +
        `${baselineMeta.by ? ` by ${baselineMeta.by}` : ""}` +
        `${baselineMeta.commit ? ` (${baselineMeta.commit})` : ""} — routes: ${scope}` +
        `${baselineMeta.acceptedRegression ? " · regression accepted" : ""}`,
      `> ${baselineMeta.reason ?? "no reason recorded"}`,
      "",
    );
  } else {
    lines.push(
      "**Baseline origin:** no refresh provenance recorded — treat changes as unintentional drift.",
      "",
    );
  }
  return lines;
}

/**
 * Build the full markdown summary for a gate run.
 *
 * @param {object} args
 * @param {Record<string, object>} args.results  route → extractRouteReport()
 * @param {Record<string, object>} args.baseline committed baseline
 * @param {string[]} args.categories
 * @param {string[]} args.failures gate failure messages (empty = pass)
 * @param {number|string} args.maxRegression allowance (or a description of per-category allowances)
 */
export function buildSummary({
  results,
  baseline,
  categories,
  failures,
  maxRegression,
  baselineMeta,
  track,
  trackDescription,
  baselineSource,
}) {
  const routes = Object.keys(results);
  const status = failures.length ? "❌ **FAIL**" : "✅ **PASS**";
  const lines = [
    "## Lighthouse regression summary",
    "",
    `${status} — ${routes.length} route(s). Allowed drop vs baseline: ${
      typeof maxRegression === "number" ? `${maxRegression} pts` : maxRegression
    }. Absolute score floors always apply.`,
    "",
  ];

  if (track) {
    lines.push(
      `**Baseline track:** \`${track}\`${trackDescription ? ` — ${trackDescription}` : ""}${
        baselineSource ? ` · compared against \`${baselineSource}\`` : " · no baseline yet"
      }`,
      "",
    );
  }

  lines.push(...baselineDiffSummary({ results, baseline, categories, baselineMeta }));

  if (failures.length) {
    lines.push("### Gate failures", "");
    for (const f of failures) lines.push(`- ${f}`);
    lines.push("");
  }

  // At-a-glance matrix so reviewers see every route without expanding.
  lines.push(
    `| route | ${categories.map((c) => `${c} (before → after)`).join(" | ")} |`,
    `| --- | ${categories.map(() => "---").join(" | ")} |`,
  );
  for (const route of routes) {
    const cells = categories.map((key) => {
      const after = results[route][key];
      const prev = baseline[route]?.[key];
      if (typeof prev !== "number") return `– → **${after}** (new)`;
      const delta = after - prev;
      return `${prev} → **${after}** ${direction(delta)} ${signed(delta)}`;
    });
    lines.push(`| \`${route}\` | ${cells.join(" | ")} |`);
  }
  lines.push("");

  lines.push(...routeMetricHighlights({ results, baseline }));

  for (const route of routes) {
    const current = results[route];
    const before = baseline[route];
    lines.push(`<details><summary><code>${route}</code> — detail</summary>`, "");
    lines.push(categoryTable(route, current, before, categories), "");

    const metrics = metricsTable(current, before);
    if (metrics) lines.push("**Core metrics**", "", metrics, "");

    const { rows, hidden } = changedAudits(current, before);
    if (rows.length) {
      lines.push(
        "**Audits that changed**",
        "",
        `| audit | before | after | Δ | id |`,
        `| --- | --- | --- | --- | --- |`,
        ...rows,
        "",
      );
      if (hidden > 0) lines.push(`_…and ${hidden} more changed audit(s) below the cut-off._`, "");
    } else if (before?.audits) {
      lines.push(`_No audit score changed by ${AUDIT_NOISE_FLOOR}+ points._`, "");
    } else {
      lines.push("_No baseline audit detail to compare against yet._", "");
    }

    lines.push("</details>", "");
  }

  lines.push(
    "<!-- lighthouse-gate-summary -->",
    "",
    '_Baseline: `.lighthouse/baseline.json` — refresh deliberately with `bun run gate:lighthouse:refresh -- --reason "…"`._',
  );

  return lines.join("\n");
}

/** Schema version of the machine-readable diff artifact. */
export const DIFF_SCHEMA_VERSION = 1;

/**
 * Machine-readable baseline diff artifact.
 *
 * Stable JSON shape so Lighthouse changes can be tracked over time (dashboards,
 * trend charts, bots) without re-parsing the markdown summary.
 *
 * {
 *   schemaVersion, generatedAt, status, commit, branch, prNumber, runId,
 *   allowance, baselineMeta,
 *   routes: { "/": { categories: { perf: {before, after, delta, regressed} },
 *                    metrics:    { lcp:  {before, after, delta, unit} },
 *                    audits:     [ {id, title, before, after, delta} ] } },
 *   totals: { routes, categoriesRegressed, categoriesImproved, auditsChanged },
 *   failures: [...]
 * }
 */
export function buildDiffArtifact({
  results,
  baseline,
  categories,
  failures = [],
  maxRegression,
  baselineMeta,
  track = null,
  baselineSource = null,
  env = {},
}) {
  const routes = {};
  const totals = {
    routes: 0,
    categoriesRegressed: 0,
    categoriesImproved: 0,
    auditsChanged: 0,
  };

  for (const [route, current] of Object.entries(results)) {
    totals.routes += 1;
    const before = baseline[route];
    const entry = { isNew: !before, categories: {}, metrics: {}, audits: [] };

    for (const key of categories) {
      const after = current[key];
      const prev = before?.[key];
      const delta = typeof prev === "number" ? after - prev : null;
      entry.categories[key] = {
        before: typeof prev === "number" ? prev : null,
        after,
        delta,
        regressed: typeof delta === "number" && delta < 0,
      };
      if (typeof delta === "number") {
        if (delta < 0) totals.categoriesRegressed += 1;
        else if (delta > 0) totals.categoriesImproved += 1;
      }
    }

    for (const [id, label] of TRACKED_METRICS) {
      const after = current.metrics?.[id];
      if (!after) continue;
      const prev = before?.metrics?.[id];
      const unit = id === "cumulative-layout-shift" ? "unitless" : "ms";
      entry.metrics[id] = {
        label,
        unit,
        before: prev ? prev.value : null,
        beforeDisplay: prev?.display ?? null,
        after: after.value,
        afterDisplay: after.display ?? null,
        delta: prev ? Math.round((after.value - prev.value) * 1000) / 1000 : null,
        lowerIsBetter: true,
      };
    }

    for (const [id, audit] of Object.entries(current.audits ?? {})) {
      const prev = before?.audits?.[id]?.score;
      if (typeof prev !== "number") continue;
      const delta = audit.score - prev;
      if (Math.abs(delta) < AUDIT_NOISE_FLOOR) continue;
      entry.audits.push({ id, title: audit.title, before: prev, after: audit.score, delta });
    }
    entry.audits.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    totals.auditsChanged += entry.audits.length;

    routes[route] = entry;
  }

  return {
    schemaVersion: DIFF_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    status: failures.length ? "fail" : "pass",
    track,
    baselineSource,
    allowance: typeof maxRegression === "number" ? `${maxRegression} pts` : (maxRegression ?? null),
    commit: env["GITHUB_SHA"] ?? null,
    branch: env["GITHUB_HEAD_REF"] || env["GITHUB_REF_NAME"] || null,
    repository: env["GITHUB_REPOSITORY"] ?? null,
    runId: env["GITHUB_RUN_ID"] ?? null,
    prNumber: env["PR_NUMBER"] ? Number(env["PR_NUMBER"]) : null,
    baselineMeta: baselineMeta ?? null,
    totals,
    routes,
    failures,
  };
}
