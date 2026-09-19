#!/usr/bin/env node
/**
 * CI gate: Lighthouse (performance / SEO / best-practices) against the
 * production build.
 *
 * 1. builds the app (skip with SKIP_BUILD=1)
 * 2. serves the built Nitro Node server
 * 3. runs Lighthouse on every route in lighthouse-thresholds.json
 * 4. fails when a category is below its absolute floor OR regressed more
 *    than `maxRegression` points against .lighthouse/baseline.json
 *
 * Refresh the baseline only via scripts/lh-baseline-refresh.mjs (never in CI).
 */
import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  buildDiffArtifact,
  buildSummary,
  categoryScores,
  extractRouteReport,
} from "./lh-report.mjs";
import { baselinePath, describeTrack, resolveTrack } from "./lh-track.mjs";

const PORT = Number(process.env["LH_PORT"] ?? 8789);
const BASE = `http://127.0.0.1:${PORT}`;
const SERVER_ENTRY = path.join(".output", "server", "index.mjs");
const CONFIG_PATH = "lighthouse-thresholds.json";
/**
 * Baseline track: CI-runner numbers and local-machine numbers live in separate
 * baseline files so they never overwrite each other (see scripts/lh-track.mjs).
 */
let TRACK;
try {
  TRACK = resolveTrack(process.env);
} catch (err) {
  console.error(`[lh-gate] FAIL — ${err.message}`);
  process.exit(1);
}
const BASELINE_PATH = baselinePath(TRACK);
/** A brand-new track seeds its comparison from the ci baseline, then diverges. */
const FALLBACK_BASELINE_PATH = ".lighthouse/baseline.json";
const LOG_PATH = ".lighthouse/BASELINE_LOG.md";
const UPDATE_BASELINE = process.env["UPDATE_BASELINE"] === "1";
/** Preview the refresh diff without writing baseline, log or summary files. */
const DRY_RUN = process.env["LH_DRY_RUN"] === "1";
/** Record an intentional drop instead of failing on it (refresh flow only). */
const ACCEPT_REGRESSION = process.env["ACCEPT_REGRESSION"] === "1";
const REFRESH_REASON = (process.env["REFRESH_REASON"] ?? "").trim();
const SUMMARY_PATH = ".lighthouse/summary.md";
/** Machine-readable baseline diff artifact, uploaded with the PR run. */
const DIFF_JSON_PATH = ".lighthouse/diff.json";

const log = (msg) => console.log(`[lh-gate] ${msg}`);

// CI must never rewrite the committed baseline: an unexpected regression has to
// fail the build, not silently become the new normal. Refreshes are a local,
// reviewed, committed change (see scripts/lh-baseline-refresh.mjs).
const IN_CI = process.env["CI"] === "true" || process.env["CI"] === "1";
if (UPDATE_BASELINE && !DRY_RUN && IN_CI && process.env["ALLOW_BASELINE_REFRESH_IN_CI"] !== "1") {
  console.error(
    "[lh-gate] FAIL — baseline refresh is not allowed in CI. Run `bun run gate:lighthouse:refresh -- --reason \"…\"` locally and commit .lighthouse/baseline.json.",
  );
  process.exit(1);
}
if (UPDATE_BASELINE && !REFRESH_REASON) {
  console.error(
    '[lh-gate] FAIL — refreshing the baseline requires REFRESH_REASON. Use `bun run gate:lighthouse:refresh -- --reason "why"`.',
  );
  process.exit(1);
}

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const baselineSource = existsSync(BASELINE_PATH)
  ? BASELINE_PATH
  : existsSync(FALLBACK_BASELINE_PATH)
    ? FALLBACK_BASELINE_PATH
    : null;
const storedBaseline = baselineSource ? JSON.parse(readFileSync(baselineSource, "utf8")) : {};
const { __meta: baselineMeta, ...baseline } = storedBaseline;

/**
 * Optional route-level targeting: LH_ROUTES="/,/pricing" audits (and, during a
 * refresh, rewrites the baseline for) only those routes. Every other route
 * keeps its existing baseline entry untouched.
 */
const routeFilter = (process.env["LH_ROUTES"] ?? "")
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean)
  .map((r) => (r.startsWith("/") ? r : `/${r}`));

const unknownRoutes = routeFilter.filter((r) => !config.routes.includes(r));
if (unknownRoutes.length) {
  console.error(
    `[lh-gate] FAIL — unknown route(s) ${unknownRoutes.join(", ")}. Known routes: ${config.routes.join(", ")}`,
  );
  process.exit(1);
}
const targetRoutes = routeFilter.length ? routeFilter : config.routes;
if (routeFilter.length) log(`route targeting: ${targetRoutes.join(", ")}`);

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)),
    );
  });
}

async function waitForServer(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/`, { redirect: "manual" });
      if (res.status > 0) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not answer on ${BASE} in time`);
}

function resolveChromePath() {
  if (process.env["CHROME_PATH"]) return process.env["CHROME_PATH"];

  // Playwright uses its per-user cache unless PLAYWRIGHT_BROWSERS_PATH is set.
  // Recent Chrome-for-Testing builds use chrome-linux64/chrome while older
  // Playwright Chromium builds used chrome-linux/chrome. Support both so the
  // Lighthouse gate follows Playwright upgrades without a runner-specific path.
  const roots = [
    process.env["PLAYWRIGHT_BROWSERS_PATH"],
    process.env["HOME"] ? path.join(process.env["HOME"], ".cache", "ms-playwright") : undefined,
  ].filter(Boolean);

  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root).filter((d) => d.startsWith("chromium-")).sort().reverse()) {
      for (const relative of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
        const candidate = path.join(root, dir, relative);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return undefined;
}

async function auditRoute(route, chromePath) {
  const [{ default: lighthouse }, chromeLauncher] = await Promise.all([
    import("lighthouse"),
    import("chrome-launcher"),
  ]);

  const routeKey = route === "/" ? "root" : route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  const userDataDir = path.resolve(".lighthouse", ".chrome-profiles", `${process.pid}-${routeKey}`);
  rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10 });
  mkdirSync(userDataDir, { recursive: true });

  const chrome = await chromeLauncher.launch({
    chromePath,
    userDataDir,
    chromeFlags: [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  try {
    const result = await lighthouse(
      `${BASE}${route}`,
      { port: chrome.port, output: "json", logLevel: "error" },
      {
        extends: "lighthouse:default",
        settings: {
          onlyCategories: config.categories,
          formFactor: "desktop",
          screenEmulation: {
            mobile: false,
            width: 1350,
            height: 940,
            deviceScaleFactor: 1,
            disabled: false,
          },
        },
      },
    );
    if (!result?.lhr) throw new Error(`Lighthouse returned no report for ${route}`);
    try {
      return extractRouteReport(result.lhr, config.categories);
    } catch (err) {
      throw new Error(`${route}: ${err.message}`);
    }
  } finally {
    await chrome.kill();
    try {
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch (err) {
      log(`warning: could not remove Chrome profile ${userDataDir}: ${err.message}`);
    }
  }
}

/**
 * Configurable regression allowance, most specific wins:
 *   LH_MAX_REGRESSION env  >  maxRegressionByRoute[route][category]
 *   >  maxRegressionByCategory[category]  >  maxRegression
 * Drops within the allowance pass silently; bigger ones fail unless the
 * refresh flow set ACCEPT_REGRESSION (--accept-regression).
 */
const ENV_MAX_REGRESSION = Number(process.env["LH_MAX_REGRESSION"]);
function regressionLimit(route, category) {
  if (Number.isFinite(ENV_MAX_REGRESSION)) return ENV_MAX_REGRESSION;
  const perRoute = config.maxRegressionByRoute?.[route]?.[category];
  if (typeof perRoute === "number") return perRoute;
  const perCategory = config.maxRegressionByCategory?.[category];
  if (typeof perCategory === "number") return perCategory;
  return config.maxRegression;
}

/** Human-readable allowance list for logs and the PR summary. */
function describeLimits() {
  const perRoute = Object.keys(config.maxRegressionByRoute ?? {}).filter((r) =>
    targetRoutes.includes(r),
  );
  const base = config.categories
    .map((c) => `${c} ≤${regressionLimit("__default__", c)}`)
    .join(", ");
  const overrides = perRoute
    .flatMap((r) =>
      Object.entries(config.maxRegressionByRoute[r]).map(([c, v]) => `${r} ${c} ≤${v}`),
    )
    .join(", ");
  const envNote = Number.isFinite(ENV_MAX_REGRESSION) ? " (LH_MAX_REGRESSION override)" : "";
  return `${base}${overrides ? `; ${overrides}` : ""}${envNote}`;
}

function evaluate(route, scores) {
  const failures = [];
  const floors = { ...config.minScores.default, ...(config.minScores[route] ?? {}) };
  const prev = baseline[route] ?? {};

  for (const [key, score] of Object.entries(scores)) {
    const floor = floors[key];
    // Absolute floors are always hard failures — even during a refresh.
    if (typeof floor === "number" && score < floor) {
      failures.push(`${route} ${key}: ${score} below floor ${floor}`);
    }
    const before = prev[key];
    const limit = regressionLimit(route, key);
    if (typeof before === "number" && before - score > limit) {
      const msg = `${route} ${key}: regressed ${before} → ${score} (max drop ${limit})`;
      if (ACCEPT_REGRESSION) log(`WARN accepted regression — ${msg}`);
      else failures.push(msg);
    }
  }
  return failures;
}

/**
 * Emit the machine-readable diff artifact (.lighthouse/diff.json) so Lighthouse
 * changes can be tracked over time by dashboards/bots instead of re-parsing the
 * markdown. Never allowed to fail the gate on its own.
 */
function writeDiffArtifact(results, failures) {
  try {
    const artifact = buildDiffArtifact({
      results,
      baseline,
      categories: config.categories,
      failures,
      maxRegression: describeLimits(),
      baselineMeta,
      track: TRACK,
      baselineSource,
      env: process.env,
    });
    writeFileSync(DIFF_JSON_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
    log(
      `diff artifact written to ${DIFF_JSON_PATH} (${artifact.totals.routes} route(s), ` +
        `${artifact.totals.categoriesRegressed} regressed / ${artifact.totals.categoriesImproved} improved categories, ` +
        `${artifact.totals.auditsChanged} audits changed)`,
    );
  } catch (err) {
    log(`WARN could not write diff artifact: ${err.message}`);
  }
}

/**
 * Emit the markdown regression summary: always to .lighthouse/summary.md, and
 * to $GITHUB_STEP_SUMMARY when running in Actions so it lands in the job/PR
 * output. Never allowed to fail the gate on its own.
 */
function writeSummary(results, failures) {
  try {
    const markdown = buildSummary({
      results,
      baseline,
      categories: config.categories,
      failures,
      maxRegression: describeLimits(),
      baselineMeta,
      track: TRACK,
      trackDescription: describeTrack(TRACK),
      baselineSource,
    });
    if (DRY_RUN) {
      log("dry run — diff preview (no files written):");
      console.log(`\n${markdown}\n`);
      return;
    }
    mkdirSync(path.dirname(SUMMARY_PATH), { recursive: true });
    writeFileSync(SUMMARY_PATH, `${markdown}\n`);
    writeDiffArtifact(results, failures);
    const stepSummary = process.env["GITHUB_STEP_SUMMARY"];
    if (stepSummary) appendFileSync(stepSummary, `${markdown}\n`);
    log(`summary written to ${SUMMARY_PATH}`);
  } catch (err) {
    log(`WARN could not write summary: ${err.message}`);
  }
}

async function main() {
  if (process.env["SKIP_BUILD"] !== "1") {
    log("building production bundle…");
    await run("bun", ["run", "build"]);
  }
  if (!existsSync(SERVER_ENTRY)) {
    throw new Error(`${SERVER_ENTRY} missing - run bun run build first`);
  }

  log(`baseline track: ${describeTrack(TRACK)}`);
  log(
    baselineSource
      ? `baseline source: ${baselineSource}${baselineSource === BASELINE_PATH ? "" : " (seeded from ci track)"}`
      : "baseline source: none yet — this run establishes the numbers",
  );
  log(`regression allowance: ${describeLimits()}`);
  const chromePath = resolveChromePath();
  log(`chrome: ${chromePath ?? "system default"}`);

  log(`starting production Nitro server on ${BASE}...`);
  const server = spawn(process.execPath, [SERVER_ENTRY], {
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(PORT) },
  });

  let exitCode = 0;
  const results = {};
  try {
    await waitForServer();
    const failures = [];
    for (const route of targetRoutes) {
      log(`auditing ${route}…`);
      const report = await auditRoute(route, chromePath);
      results[route] = report;
      const scores = categoryScores(report, config.categories);
      log(
        `  ${Object.entries(scores)
          .map(([k, v]) => `${k}=${v}`)
          .join("  ")}`,
      );
      failures.push(...evaluate(route, scores));
    }

    if (UPDATE_BASELINE) {
      const meta = {
        track: TRACK,
        updatedAt: new Date().toISOString(),
        reason: REFRESH_REASON,
        acceptedRegression: ACCEPT_REGRESSION,
        routes: routeFilter.length ? targetRoutes : "all",
        commit: process.env["REFRESH_COMMIT"] || null,
        by: process.env["REFRESH_BY"] || null,
        previousUpdatedAt: baselineMeta?.updatedAt ?? null,
      };
      if (DRY_RUN) {
        log(
          `dry run — would rewrite ${BASELINE_PATH} for ${
            routeFilter.length ? targetRoutes.join(", ") : "all routes"
          } (reason: ${REFRESH_REASON}); no baseline or log entry written`,
        );
      } else {
        mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
        // Merge, so a targeted refresh never drops baselines for untouched routes.
        writeFileSync(
          BASELINE_PATH,
          `${JSON.stringify({ __meta: meta, ...baseline, ...results }, null, 2)}\n`,
        );
        log(
          `baseline written to ${BASELINE_PATH} for ${
            routeFilter.length ? targetRoutes.join(", ") : "all routes"
          } (reason: ${REFRESH_REASON})`,
        );
        const entry = `- ${meta.updatedAt} · ${meta.by ?? "unknown"} · ${meta.commit ?? "no-commit"}${
          ACCEPT_REGRESSION ? " · accepted-regression" : ""
        }\n  track: ${TRACK}\n  routes: ${routeFilter.length ? targetRoutes.join(", ") : "all"}\n  ${REFRESH_REASON}\n`;
        appendFileSync(
          LOG_PATH,
          existsSync(LOG_PATH) ? entry : `# Lighthouse baseline refresh log\n\n${entry}`,
        );
        log(`refresh recorded in ${LOG_PATH}`);
      }
    }



    writeSummary(results, failures);

    if (failures.length) {
      throw new Error(`Lighthouse gate failed:\n  ${failures.join("\n  ")}`);
    }
    log("PASS — performance, SEO and best-practices within budget");
  } catch (err) {
    console.error(`[lh-gate] FAIL — ${err.message}`);
    exitCode = 1;
  } finally {
    server.kill("SIGTERM");
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(`[lh-gate] FAIL — ${err.message}`);
  process.exit(1);
});
