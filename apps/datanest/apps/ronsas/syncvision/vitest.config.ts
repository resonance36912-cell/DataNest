import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary", "html", "lcov"],
      reportsDirectory: "./coverage",
      // Coverage is collected only for the legacy-branding merge surface so the
      // threshold is meaningful (CI fails if anyone weakens these paths).
      include: ["src/lib/confidenceReport.ts"],
      // Per-file ratchet thresholds. The CI job `test:legacy-branding` runs this
      // config with `--coverage` against ONLY the four legacy-branding test files,
      // which collectively exercise the merge / fallback / resolution code paths
      // (the un-covered ~50% of the module is the unrelated PDF + signed-URL
      // rendering surface, covered by other suites). These floors lock in the
      // current legacy-branding coverage — a regression that drops a sentinel-leak
      // branch will fall under the floor and fail CI.
      thresholds: {
        "src/lib/confidenceReport.ts": {
          lines: 49,
          functions: 50,
          branches: 65,
          statements: 49,
        },
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
});
