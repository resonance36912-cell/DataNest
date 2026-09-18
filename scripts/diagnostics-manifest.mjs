#!/usr/bin/env node
/**
 * Writes the self-contained debugging context for diagnostics.zip:
 *
 *   diagnostics-bundle/environment.json  machine-readable run context
 *   diagnostics-bundle/README.txt        human-readable index + same context
 *
 * Captures the commit SHA, Playwright/browser/device info, toolchain versions
 * and the *non-secret* environment that shaped the run, so a downloaded bundle
 * can be debugged weeks later without access to the original CI run.
 *
 * Secrets are never written: env vars in SECRET_KEYS are reported as
 * "set"/"unset" only, and anything unknown is omitted entirely.
 *
 * Usage: node scripts/diagnostics-manifest.mjs [outDir=diagnostics-bundle]
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

const outDir = process.argv[2] ?? "diagnostics-bundle";
mkdirSync(outDir, { recursive: true });

const run = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

// --- commit / CI context ------------------------------------------------------
const env = process.env;
const sha = env["GITHUB_SHA"] ?? run("git", ["rev-parse", "HEAD"]);
const branch =
  env["GITHUB_HEAD_REF"] ||
  env["GITHUB_REF_NAME"] ||
  run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);

const git = {
  sha,
  shortSha: sha ? sha.slice(0, 7) : null,
  branch: branch ?? null,
  subject: run("git", ["log", "-1", "--pretty=%s"]),
  author: run("git", ["log", "-1", "--pretty=%an"]),
  committedAt: run("git", ["log", "-1", "--pretty=%cI"]),
  dirty: run("git", ["status", "--porcelain"]) ? true : false,
};

const repo = env["GITHUB_REPOSITORY"] ?? null;
const ci = {
  provider: env["GITHUB_ACTIONS"] ? "github-actions" : "local",
  repository: repo,
  workflow: env["GITHUB_WORKFLOW"] ?? null,
  job: env["GITHUB_JOB"] ?? null,
  runId: env["GITHUB_RUN_ID"] ?? null,
  runAttempt: env["GITHUB_RUN_ATTEMPT"] ?? null,
  runUrl:
    repo && env["GITHUB_RUN_ID"]
      ? `${env["GITHUB_SERVER_URL"] ?? "https://github.com"}/${repo}/actions/runs/${env["GITHUB_RUN_ID"]}`
      : null,
  event: env["GITHUB_EVENT_NAME"] ?? null,
  pullRequest: env["GITHUB_REF"]?.match(/refs\/pull\/(\d+)\//)?.[1] ?? null,
  actor: env["GITHUB_ACTOR"] ?? null,
  triggeredAt: new Date().toISOString(),
};

// --- toolchain ---------------------------------------------------------------
const pkg = readJson("package.json") ?? {};
const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
const installedVersion = (name) => readJson(join("node_modules", name, "package.json"))?.version ?? null;

const toolchain = {
  node: process.version,
  bun: run("bun", ["--version"]),
  os: `${os.type()} ${os.release()}`,
  platform: `${process.platform}/${process.arch}`,
  cpus: os.cpus().length,
  totalMemoryGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
  runnerImage: env["ImageOS"] ?? env["RUNNER_OS"] ?? null,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  vite: installedVersion("vite") ?? deps["vite"] ?? null,
  vitest: installedVersion("vitest") ?? deps["vitest"] ?? null,
  wrangler: installedVersion("wrangler") ?? deps["wrangler"] ?? null,
};

// --- playwright / browser / device -------------------------------------------
// Config values are read statically so this never has to import ESM TS config.
const cfgPath = "playwright.ssr.config.ts";
const cfg = existsSync(cfgPath) ? readFileSync(cfgPath, "utf8") : "";
const pick = (re) => cfg.match(re)?.[1] ?? null;

const browsersDir = env["PLAYWRIGHT_BROWSERS_PATH"];
const installedBrowsers =
  browsersDir && existsSync(browsersDir)
    ? readdirSync(browsersDir).filter((d) => !d.startsWith("."))
    : [];

const playwright = {
  version:
    installedVersion("@playwright/test") ?? installedVersion("playwright-core") ?? deps["@playwright/test"] ?? null,
  cliVersion: (run("bunx", ["playwright", "--version"]) ?? "").replace(/^Version\s*/i, "") || null,
  config: cfgPath,
  testDir: pick(/testDir:\s*"([^"]+)"/),
  testMatch: pick(/testMatch:\s*(.+),/),
  workers: pick(/workers:\s*(\d+)/),
  retries: pick(/retries:\s*(\d+)/),
  timeoutMs: pick(/timeout:\s*([\d_]+)/),
  outputDir: pick(/outputDir:\s*"([^"]+)"/),
  trace: pick(/trace:\s*"([^"]+)"/),
  screenshot: pick(/screenshot:\s*"([^"]+)"/),
  video: cfg.match(/video:\s*(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]+")/)?.[1]?.replace(/\s+/g, " ") ?? null,
  browsersPath: browsersDir ?? "default (~/.cache/ms-playwright)",
  installedBrowsers,
  // These specs are HTTP-first; any browser run uses the config viewport below.
  device: {
    browser: "chromium (bundled)",
    viewport: cfg.match(/size:\s*\{\s*width:\s*(\d+),\s*height:\s*(\d+)/)
      ? `${cfg.match(/size:\s*\{\s*width:\s*(\d+)/)[1]}x${cfg.match(/height:\s*(\d+)/)[1]}`
      : "playwright default (1280x720)",
    headless: true,
    deviceScaleFactor: 1,
  },
  baseUrl: env["SSR_BASE_URL"] ?? pick(/baseURL:.*\?\?\s*"([^"]+)"/) ?? null,
};

// --- environment: safe values + presence-only for secrets --------------------
const SAFE_KEYS = [
  "CI",
  "NODE_ENV",
  "NODE_VERSION",
  "LH_TRACK",
  "SSR_BASE_URL",
  "SKIP_BUILD",
  "VERIFY_LANES",
  "PLAYWRIGHT_BROWSERS_PATH",
  "RUNNER_OS",
  "RUNNER_ARCH",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PROJECT_ID",
  "RETENTION_BUNDLE",
  "RETENTION_REPORT",
  "RETENTION_RESULTS",
  "RETENTION_LOGS",
  "RETENTION_VIDEOS",
  "RETENTION_LIGHTHOUSE",
];
const SECRET_KEYS = [
  "SLACK_WEBHOOK_URL",
  "GITHUB_TOKEN",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LOVABLE_API_KEY",
];

const environment = {};
for (const key of SAFE_KEYS) if (env[key] !== undefined) environment[key] = env[key];
const secretsPresence = {};
for (const key of SECRET_KEYS) secretsPresence[key] = env[key] ? "set" : "unset";

const manifest = {
  schema: "diagnostics-manifest/v1",
  generatedAt: new Date().toISOString(),
  git,
  ci,
  toolchain,
  playwright,
  environment,
  secrets: secretsPresence,
};

writeFileSync(join(outDir, "environment.json"), `${JSON.stringify(manifest, null, 2)}\n`);

// --- README ------------------------------------------------------------------
const kv = (obj) =>
  Object.entries(obj)
    .map(([k, v]) => `  ${k.padEnd(20)} ${v === null || v === "" ? "—" : Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");

const readme = `SSR crawler gate diagnostics
============================

Run        ${ci.runId ?? "local"}${ci.runAttempt ? ` (attempt ${ci.runAttempt})` : ""}${ci.job ? ` · job ${ci.job}` : ""}
Commit     ${git.shortSha ?? "unknown"} ${git.subject ? `— ${git.subject}` : ""}
           ${repo ?? "local checkout"}@${git.sha ?? "unknown"}${git.dirty ? " (dirty working tree)" : ""}
Branch     ${git.branch ?? "unknown"}${ci.pullRequest ? ` · PR #${ci.pullRequest}` : ""}
Trigger    ${ci.event ?? "manual"} by ${ci.actor ?? git.author ?? "unknown"} at ${ci.triggeredAt}
Run URL    ${ci.runUrl ?? "n/a"}

Contents
--------
  playwright-report/   Playwright HTML report — open index.html
  test-results/        traces (trace.zip), screenshots, *.webm videos,
                       logs/ (vitest.log, ssr-gate.log, build.log,
                       ssr-server.log, playwright.log) and the
                       Vitest junit/json reports
  environment.json     this context, machine-readable (schema v1)
  README.txt           this file

Playwright / browser / device
-----------------------------
${kv({
  version: playwright.version,
  cli: playwright.cliVersion,
  browser: playwright.device.browser,
  viewport: playwright.device.viewport,
  headless: playwright.device.headless,
  installedBrowsers: playwright.installedBrowsers,
  browsersPath: playwright.browsersPath,
  config: playwright.config,
  testDir: playwright.testDir,
  workers: playwright.workers,
  retries: playwright.retries,
  timeoutMs: playwright.timeoutMs,
  trace: playwright.trace,
  screenshot: playwright.screenshot,
  video: playwright.video,
  baseURL: playwright.baseUrl,
})}

Toolchain / runner
------------------
${kv(toolchain)}

Environment (non-secret)
------------------------
${kv(environment)}

Secrets (presence only — values never written)
----------------------------------------------
${kv(secretsPresence)}

Reproduce locally
-----------------
  git fetch origin && git checkout ${git.sha ?? "<sha>"}
  bun install --frozen-lockfile
  bun run test:e2e            # production build + wrangler SSR + Playwright specs

View a trace
------------
  bunx playwright show-trace test-results/playwright/**/trace.zip
`;

writeFileSync(join(outDir, "README.txt"), readme);
console.log(`Wrote ${join(outDir, "README.txt")} and ${join(outDir, "environment.json")}`);
console.log(`  commit ${git.shortSha ?? "?"} · playwright ${playwright.version ?? "?"} · node ${toolchain.node}`);
