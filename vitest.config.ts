import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Vitest config lives here (not in vite.config.ts) so the `test` key is
// properly typed. tests/e2e/* are Playwright specs driven by
// playwright.ssr.config.ts — vitest must not collect them.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Only project unit tests under src/ — nothing else is collected.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.output/**", "tests/e2e/**"],
    passWithNoTests: true,
    // CI writes machine-readable reports so failures can be uploaded as artifacts.
    ...(process.env["CI"]
      ? {
          reporters: ["default", "junit", "json"] as const,
          outputFile: {
            junit: "test-results/vitest/junit.xml",
            json: "test-results/vitest/results.json",
          },
        }
      : {}),
  },
});
