#!/usr/bin/env node
/**
 * Controlled Lighthouse baseline refresh.
 *
 *   bun run gate:lighthouse:refresh -- --reason "inline critical CSS changes LCP"
 *   bun run gate:lighthouse:refresh -- --reason "…" --routes "/,/pricing"
 *   bun run gate:lighthouse:refresh -- --reason "…" --track ci   # local|ci lanes
 *   bun run gate:lighthouse:refresh -- --reason "…" --accept-regression
 *   bun run gate:lighthouse:refresh -- --reason "…" --skip-build
 *   bun run gate:lighthouse:refresh -- --reason "…" --dry-run   # preview only
 *   bun run gate:lighthouse:refresh -- --reason "…" --max-regression 10
 *
 * Guardrails (so CI stays strict):
 *  - refuses to run in CI unless ALLOW_BASELINE_REFRESH_IN_CI=1
 *  - requires a human-written --reason, recorded in .lighthouse/baseline.json
 *    (__meta) and appended to .lighthouse/BASELINE_LOG.md
 *  - absolute score floors from lighthouse-thresholds.json still fail hard
 *  - regressions vs the old baseline only pass with explicit
 *    --accept-regression, so an unintentional drop still blocks the refresh
 *
 * The refreshed baseline is a normal reviewable code change: commit it.
 */
import { spawnSync } from "node:child_process";
import process from "node:process";

import { DEFAULT_TRACKS, describeTrack, resolveTrack, baselinePath } from "./lh-track.mjs";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
function value(name) {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i !== -1 ? argv[i + 1] : undefined;
}

const IN_CI = process.env["CI"] === "true" || process.env["CI"] === "1";
if (IN_CI && !argv.includes("--dry-run") && process.env["ALLOW_BASELINE_REFRESH_IN_CI"] !== "1") {
  console.error(
    "[lh-refresh] refusing to refresh the baseline in CI — run it locally and commit .lighthouse/baseline.json.",
  );
  process.exit(1);
}

// Baseline track: local machines and CI runners keep separate baseline files.
const trackFlag = (value("track") ?? "").trim().toLowerCase();
if (trackFlag) process.env["LH_TRACK"] = trackFlag;
let track;
try {
  track = resolveTrack(process.env);
} catch (err) {
  console.error(`[lh-refresh] ${err.message} (known tracks: ${DEFAULT_TRACKS.join(", ")})`);
  process.exit(1);
}

const reason = (value("reason") ?? process.env["REFRESH_REASON"] ?? "").trim();
if (reason.length < 10 || reason.startsWith("--")) {
  console.error(
    '[lh-refresh] a descriptive --reason is required, e.g.\n  bun run gate:lighthouse:refresh -- --reason "lazy-loaded motion engine lowers TBT baseline"',
  );
  process.exit(1);
}

const git = (args) => {
  const r = spawnSync("git", args, { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "";
};

const env = {
  ...process.env,
  UPDATE_BASELINE: "1",
  LH_TRACK: track,
  REFRESH_REASON: reason,
  REFRESH_COMMIT: git(["rev-parse", "--short", "HEAD"]) || "",
  REFRESH_BY: git(["config", "user.name"]) || process.env["USER"] || "",
};
if (flag("accept-regression")) env["ACCEPT_REGRESSION"] = "1";
if (flag("skip-build")) env["SKIP_BUILD"] = "1";
// Optional one-off override of the configured regression allowance.
const maxRegression = (value("max-regression") ?? "").trim();
if (maxRegression) {
  if (!Number.isFinite(Number(maxRegression))) {
    console.error("[lh-refresh] --max-regression must be a number of points");
    process.exit(1);
  }
  env["LH_MAX_REGRESSION"] = maxRegression;
}

// --dry-run: audit + print the before/after diff, but write nothing.
const dryRun = flag("dry-run");
if (dryRun) env["LH_DRY_RUN"] = "1";

// Route-level targeting: only the listed routes are re-audited and rewritten;
// every other route keeps its committed baseline.
const routes = (value("routes") ?? process.env["LH_ROUTES"] ?? "").trim();
if (routes) env["LH_ROUTES"] = routes;

console.log(`[lh-refresh] track: ${describeTrack(track)} → ${baselinePath(track)}`);
console.log(`[lh-refresh] reason: ${reason}`);
console.log(`[lh-refresh] routes: ${routes || "all (from lighthouse-thresholds.json)"}`);
if (dryRun) console.log("[lh-refresh] DRY RUN — no baseline, log or summary file will be written");
console.log(
  `[lh-refresh] regressions vs current baseline: ${
    flag("accept-regression") ? "accepted (intentional)" : "will block the refresh"
  }`,
);

const res = spawnSync("node", ["scripts/ci-lighthouse-gate.mjs"], {
  stdio: "inherit",
  env,
});
if (res.status === 0 && dryRun) {
  console.log("[lh-refresh] dry run complete — re-run without --dry-run to commit the new baseline.");
}
if (res.status !== 0) {
  console.error(
    "[lh-refresh] baseline NOT refreshed — the gate failed. Fix the regression, or re-run with --accept-regression if the change is intentional.",
  );
}
process.exit(res.status ?? 1);
