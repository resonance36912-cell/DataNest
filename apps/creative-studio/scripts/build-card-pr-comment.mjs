#!/usr/bin/env node
/**
 * Build the markdown body for the provider-card visual PR comment.
 *
 * Reads Playwright's JSON report (test-results/results.json) for pass/fail
 * counts per engine, and the failed-snapshot triplets under test-results/ for
 * the per-provider × route × engine failure table. Emits markdown on stdout
 * (or to --out), with a sticky marker so CI can update one comment in place.
 *
 * Usage:
 *   node scripts/build-card-pr-comment.mjs [--results test-results]
 *                                          [--json test-results/results.json]
 *                                          [--artifact-url <url>]
 *                                          [--out test-results/pr-comment.md]
 */
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";

const argv = process.argv.slice(2);
const arg = (name, fallback = "") => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const RESULTS_DIR = arg("results", "test-results");
const JSON_REPORT = arg("json", join(RESULTS_DIR, "results.json"));
const ARTIFACT_URL = arg("artifact-url", "");
const OUT = arg("out", "");

export const MARKER = "<!-- provider-card-visual-report -->";

const PROVIDER_LABELS = {
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  x: "X (Twitter)",
  linkedin: "LinkedIn",
  slack: "Slack",
  discord: "Discord",
  telegram: "Telegram",
  pinterest: "Pinterest",
  google: "Google / Gmail",
  teams: "Microsoft Teams",
  imessage: "iMessage",
};
const ROUTE_LABELS = { home: "/", pricing: "/pricing" };

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function browserOf(dirPath) {
  const name = basename(dirPath);
  for (const engine of ["chromium", "firefox", "webkit"]) {
    if (name.endsWith(`-${engine}`) || name.includes(`-${engine}-`)) return engine;
  }
  return "unknown";
}

function dims(file) {
  try {
    const buf = readFileSync(file);
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  } catch {
    return null;
  }
}

/** Per-engine pass/fail/flaky counts from Playwright's JSON report. */
function readRunStats() {
  if (!existsSync(JSON_REPORT)) return null;
  let report;
  try {
    report = JSON.parse(readFileSync(JSON_REPORT, "utf8"));
  } catch {
    return null;
  }
  const engines = new Map();
  let total = 0;

  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const engine = t.projectName || "unknown";
        const row = engines.get(engine) ?? { passed: 0, failed: 0, flaky: 0, skipped: 0 };
        const status = t.status ?? "unknown"; // expected | unexpected | flaky | skipped
        if (status === "expected") row.passed += 1;
        else if (status === "flaky") row.flaky += 1;
        else if (status === "skipped") row.skipped += 1;
        else row.failed += 1;
        engines.set(engine, row);
        total += 1;
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);

  return { engines, total, duration: report.stats?.duration ?? 0 };
}

/** Failed snapshot triplets → one row per provider × route × engine. */
function readFailures() {
  return walk(RESULTS_DIR)
    .filter((f) => f.endsWith("-actual.png"))
    .map((actual) => {
      const dir = dirname(actual);
      const stem = basename(actual).replace(/-actual\.png$/, "");
      const [providerId, routeId = "home"] = stem.split("-");
      const expected = join(dir, `${stem}-expected.png`);
      const a = dims(actual);
      const e = existsSync(expected) ? dims(expected) : null;
      return {
        provider: PROVIDER_LABELS[providerId] || providerId,
        route: ROUTE_LABELS[routeId] || `/${routeId}`,
        engine: browserOf(dir),
        drift: e && a && (e.w !== a.w || e.h !== a.h) ? `${e.w}×${e.h} → ${a.w}×${a.h}` : "pixel diff",
      };
    })
    .sort((x, y) => `${x.provider}${x.route}${x.engine}`.localeCompare(`${y.provider}${y.route}${y.engine}`));
}

export function buildComment({ stats, failures, artifactUrl }) {
  const lines = [MARKER, "## Provider card visual tests", ""];

  if (!stats && failures.length === 0) {
    lines.push("No visual test results were produced for this run.");
    return lines.join("\n");
  }

  const failed = failures.length;
  lines.push(
    failed === 0
      ? "✅ **All provider link cards match their baselines.**"
      : `❌ **${failed} snapshot${failed === 1 ? "" : "s"} drifted from the baseline.**`,
    "",
  );

  if (stats) {
    lines.push("| Engine | Passed | Failed | Flaky | Skipped |", "| --- | ---: | ---: | ---: | ---: |");
    for (const [engine, r] of [...stats.engines].sort()) {
      lines.push(`| ${engine} | ${r.passed} | ${r.failed} | ${r.flaky} | ${r.skipped} |`);
    }
    lines.push("", `_${stats.total} card renders · ${(stats.duration / 1000).toFixed(1)}s_`, "");
  }

  if (failed) {
    lines.push("### Drifted cards", "", "| Provider | Route | Engine | Change |", "| --- | --- | --- | --- |");
    for (const f of failures) lines.push(`| ${f.provider} | \`${f.route}\` | ${f.engine} | ${f.drift} |`);
    lines.push("");
    lines.push(
      artifactUrl
        ? `📊 **[Download the HTML diff report](${artifactUrl})** — open \`card-diff-report.html\` from the \`provider-card-visual-report\` artifact to see expected vs actual vs diff for each card.`
        : "📊 Download the `provider-card-visual-report` artifact from this workflow run and open `card-diff-report.html` to see expected vs actual vs diff for each card.",
      "",
      "If the change is intentional, comment `/update-baselines` on this PR (write access required) and the baselines will be regenerated, verified and pushed to this branch — or re-baseline locally with `bun run test:cards:update`.",
    );
  }

  return lines.join("\n");
}

const body = buildComment({ stats: readRunStats(), failures: readFailures(), artifactUrl: ARTIFACT_URL });

if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, body, "utf8");
  console.error(`Wrote ${OUT}`);
} else {
  process.stdout.write(`${body}\n`);
}
