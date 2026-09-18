import { defineConfig } from "@playwright/test";

/**
 * Dedicated config for the SSR crawler gate.
 *
 * These specs talk HTTP only (no browser, no JS) against a *production*
 * build served by wrangler, so they catch metadata and redirect regressions
 * that a dev-server check would miss. Orchestrated by scripts/ci-ssr-gate.mjs.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /ssr-.*\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: 0,
  workers: 1,
  reporter: process.env["CI"]
    ? [
        ["github"],
        ["list"],
        ["html", { open: "never" }],
        // Machine-readable run data: parsed by scripts/lib/test-failure-summary.mjs
        // to build the triage-issue failure summary.
        ["json", { outputFile: "test-results/playwright/results.json" }],
      ]
    : [["list"]],
  timeout: 30_000,
  // Traces/screenshots/videos/response bodies for failed runs, uploaded as CI artifacts.
  outputDir: "test-results/playwright",
  use: {
    baseURL: process.env["SSR_BASE_URL"] ?? "http://127.0.0.1:8788",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Video is recorded for every attempt and kept only when the spec fails,
    // so failed runs ship a replay alongside the trace. Specs that never open a
    // browser page (the HTTP-only crawler checks) simply produce no video.
    video: { mode: "retain-on-failure", size: { width: 1280, height: 720 } },
  },
});
