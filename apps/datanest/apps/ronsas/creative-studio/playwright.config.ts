import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Resonance Creative Studio e2e tests.
 *
 * Local default:   spins up `bun run build && bun run preview` on :4173.
 * Preview default: set PLAYWRIGHT_BASE_URL=https://resonancestudio.lovable.app
 *                  (or any deployed URL) and the webServer is skipped.
 *
 * Credentials are seeded in e2e/global-setup.ts using SUPABASE_SERVICE_ROLE_KEY.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:4173";
const useLocalServer = !process.env.PLAYWRIGHT_BASE_URL;

/**
 * Identical rendering surface for every engine so a snapshot diff means real
 * artwork/copy drift, not a viewport or DPR difference between browsers.
 */
const VISUAL_VIEWPORT = {
  viewport: { width: 720, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: "light" as const,
  reducedMotion: "reduce" as const,
  timezoneId: "Africa/Johannesburg",
  locale: "en-ZA",
};

/** Specs that assert on pixels and therefore run on all three engines. */
const VISUAL_SPECS = /provider-card-visual\.spec\.ts$/;



export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // auth flow mutates a shared test account
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [
        ["list"],
        ["html", { open: "never" }],
        // Machine-readable run summary consumed by scripts/build-card-pr-comment.mjs
        ["json", { outputFile: "test-results/results.json" }],
      ]
    : [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...VISUAL_VIEWPORT,
        // Escape hatch for sandboxes/CI images that ship their own patched
        // Chromium instead of the build `playwright install` downloads.
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
    // Screenshot-based specs only. The auth/smoke specs stay Chromium-only so
    // the shared test account isn't driven by three browsers at once.
    {
      name: "firefox",
      testMatch: VISUAL_SPECS,
      use: { ...devices["Desktop Firefox"], ...VISUAL_VIEWPORT },
    },
    {
      name: "webkit",
      testMatch: VISUAL_SPECS,
      use: { ...devices["Desktop Safari"], ...VISUAL_VIEWPORT },
    },
  ],
  ...(useLocalServer
    ? {
        webServer: {
          command: "bun run build && bun run preview --port 4173 --strictPort",
          url: "http://localhost:4173",
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
      }
    : {}),
});
