#!/usr/bin/env node
/**
 * CI guard: catch config keys that live in the wrong file.
 *
 * `test` is a Vitest key and is NOT part of Vite's UserConfig type, so putting
 * it in vite.config.ts either breaks `tsc --noEmit` or forces an untyped cast.
 * Vitest options belong in vitest.config.ts (typed via `vitest/config`).
 *
 * Also verifies the config files are inside tsconfig `include`, otherwise a
 * typing error in them would never fail the CI typecheck.
 *
 * Usage: node scripts/check-config-keys.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => (existsSync(resolve(root, rel)) ? readFileSync(resolve(root, rel), "utf8") : null);

/** Keys that must never appear in vite.config.ts -> where they belong instead. */
const FORBIDDEN_IN_VITE_CONFIG = {
  test: "vitest.config.ts (`test` is a Vitest key, unknown to Vite's UserConfig type)",
  vitest: "vitest.config.ts",
};

const errors = [];

/** Strip comments and string literals so matches come from real code only. */
function stripNoise(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

// 1. vite.config.ts must not declare Vitest-only keys.
const viteConfig = read("vite.config.ts");
if (!viteConfig) {
  errors.push("vite.config.ts is missing — the Vite build cannot be configured.");
} else {
  const code = stripNoise(viteConfig);
  for (const [key, belongsIn] of Object.entries(FORBIDDEN_IN_VITE_CONFIG)) {
    const re = new RegExp(`(^|[{,\\s])${key}\\s*:\\s*\\{`, "m");
    if (re.test(code)) {
      errors.push(
        `vite.config.ts declares the \`${key}\` config key.\n` +
          `  -> Move it to ${belongsIn}.\n` +
          `  -> Do NOT re-add it behind a cast such as \`...({ ${key}: {...} } as Record<string, unknown>)\` —\n` +
          `     that silences the type error but hides real misconfiguration.`,
      );
    }
  }
  if (/as\s+Record<string,\s*unknown>/.test(code) && /\btest\b/.test(code)) {
    errors.push(
      "vite.config.ts casts part of its config to `Record<string, unknown>` to smuggle in test options.\n" +
        "  -> Delete the cast and put the options in vitest.config.ts instead.",
    );
  }
}

// 2. Vitest options must have a home.
const vitestConfig = read("vitest.config.ts");
if (!vitestConfig) {
  errors.push(
    "vitest.config.ts is missing — unit-test options have nowhere typed to live.\n" +
      "  -> Create it with `import { defineConfig } from \"vitest/config\"` and a `test` block.",
  );
} else {
  if (!/from\s+["']vitest\/config["']/.test(vitestConfig)) {
    errors.push(
      "vitest.config.ts does not import `defineConfig` from \"vitest/config\".\n" +
        "  -> Importing from \"vite\" leaves the `test` key untyped.",
    );
  }
  if (!/tests\/e2e/.test(vitestConfig)) {
    errors.push(
      "vitest.config.ts does not exclude `tests/e2e/**`.\n" +
        "  -> Playwright specs there fail under Vitest; add them to `test.exclude`.",
    );
  }
  if (!/include\s*:/.test(vitestConfig)) {
    errors.push(
      "vitest.config.ts has no explicit `test.include`.\n" +
        "  -> Scope collection (e.g. `src/**/*.{test,spec}.{ts,tsx}`) so stray specs are never picked up.",
    );
  }
}

// 3. Config files must be typechecked.
const tsconfigRaw = read("tsconfig.json");
if (!tsconfigRaw) {
  errors.push("tsconfig.json is missing — `bun run typecheck` cannot validate configs.");
} else {
  const include = tsconfigRaw.match(/"include"\s*:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
  for (const file of ["vite.config.ts", "vitest.config.ts", "playwright.ssr.config.ts"]) {
    if (existsSync(resolve(root, file)) && !include.includes(file)) {
      errors.push(
        `tsconfig.json "include" does not list ${file}.\n` +
          `  -> Add it, otherwise typing errors in that config never fail the CI typecheck step.`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(`\n✖ Config key validation failed (${errors.length} problem${errors.length > 1 ? "s" : ""}):\n`);
  for (const [i, message] of errors.entries()) console.error(`${i + 1}. ${message}\n`);
  console.error("Fix the items above, then re-run: bun run check:config\n");
  process.exit(1);
}

console.log("✔ Config keys valid: no Vitest options in vite.config.ts, vitest.config.ts scoped, configs typechecked.");
