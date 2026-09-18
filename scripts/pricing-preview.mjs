#!/usr/bin/env node
/**
 * Pricing Patch Preview
 * ---------------------
 * Shows a unified-diff preview of every line that would change when applying
 * the canonical pricing fix-hints from `scripts/pricing-check.mjs`.
 *
 * Read-only by default. Pass `--apply` to actually write the files (with a
 * confirmation prompt unless `--yes` is also passed).
 *
 * Usage:
 *   node scripts/pricing-preview.mjs                 # full diff preview
 *   node scripts/pricing-preview.mjs --file docs/brand/README.md
 *   node scripts/pricing-preview.mjs --json          # machine-readable plan
 *   node scripts/pricing-preview.mjs --apply         # write changes (prompts)
 *   node scripts/pricing-preview.mjs --apply --yes   # write without prompt
 */

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { resolve, dirname, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Canonical map — keep in sync with scripts/pricing-check.mjs
// ---------------------------------------------------------------------------
const CANONICAL_TIERS = [0, 39, 119, 349, 899];
const CANONICAL_PAYG = [15, 65, 119, 179, 299, 549];
const CANONICAL_TOPUPS = [59, 169, 249];
const CANONICAL = new Set([...CANONICAL_TIERS, ...CANONICAL_PAYG, ...CANONICAL_TOPUPS]);

// stale price -> { to: canonical replacement, reason }
const FIX = {
  49:  { to: 39,  reason: "old hub-Starter" },
  79:  { to: 39,  reason: "drift to Starter" },
  99:  { to: 39,  reason: "old hub-Starter" },
  149: { to: 39,  reason: "old Starter (pre 2026-05-28)" },
  199: { to: 119, reason: "drift to Creator" },
  299: { to: 119, reason: "old Creator (pre 2026-05-28)" },
  449: { to: 349, reason: "drift to Pro" },
  499: { to: 349, reason: "old hub-Pro" },
  699: { to: 349, reason: "old Pro (pre 2026-05-28)" },
  999: { to: 899, reason: "drift to Business" },
};

// ---------------------------------------------------------------------------
// File walk (mirrors pricing-check.mjs)
// ---------------------------------------------------------------------------
const INCLUDE_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs",
  ".md", ".mdx", ".html", ".json", ".css",
]);
const SKIP_DIRS = new Set([
  "node_modules", "dist", "build", ".git", ".next", ".vite",
  "coverage", "playwright-report", "test-results",
]);
const SKIP_FILES = new Set([
  "scripts/pricing-audit.mjs",
  "scripts/pricing-check.mjs",
  "scripts/pricing-preview.mjs",
  "scripts/pricing-autopaste.mjs",
  "docs/pricing/spoke-diffs.md",
  "package-lock.json", "bun.lockb", "bun.lock", "yarn.lock", "pnpm-lock.yaml",
]);

const PRICE_RE = /\bR\s?(\d{1,5})(?!\d|\.)/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".") && entry !== ".env.example") continue;
    if (SKIP_DIRS.has(entry)) continue;
    const full = resolve(dir, entry);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, out);
    else if (INCLUDE_EXT.has(extname(full))) out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const argVal = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const wantJson = args.includes("--json");
const apply = args.includes("--apply");
const yes = args.includes("--yes");
const onlyFile = argVal("--file");

// ---------------------------------------------------------------------------
// Build patch plan
// ---------------------------------------------------------------------------
const files = walk(ROOT)
  .filter((f) => !SKIP_FILES.has(relative(ROOT, f)))
  .filter((f) => !onlyFile || relative(ROOT, f) === onlyFile);

/**
 * @typedef {{ line: number, before: string, after: string, replacements: Array<{from:number,to:number,reason:string}> }} LineChange
 * @typedef {{ file: string, changes: LineChange[], newContent: string }} FilePlan
 */

/** @type {FilePlan[]} */
const plan = [];

for (const file of files) {
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  if (!text.includes("R")) continue;

  const lines = text.split("\n");
  /** @type {LineChange[]} */
  const changes = [];
  const newLines = lines.map((line, i) => {
    const replacements = [];
    const updated = line.replace(PRICE_RE, (whole, digits) => {
      const price = Number(digits);
      if (CANONICAL.has(price)) return whole;
      const f = FIX[price];
      if (!f) return whole; // no confident replacement — skip
      replacements.push({ from: price, to: f.to, reason: f.reason });
      return whole.replace(String(price), String(f.to));
    });
    if (replacements.length) {
      changes.push({ line: i + 1, before: line, after: updated, replacements });
    }
    return updated;
  });

  if (changes.length) {
    plan.push({ file: relative(ROOT, file), changes, newContent: newLines.join("\n") });
  }
}

// ---------------------------------------------------------------------------
// Render unified-diff style preview
// ---------------------------------------------------------------------------
const C = process.stdout.isTTY ? {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
} : { red: (s)=>s, green: (s)=>s, dim: (s)=>s, bold: (s)=>s, cyan: (s)=>s };

function renderDiff() {
  if (!plan.length) {
    console.log(C.green("✓ Nothing to patch — all confident price tokens already match canonical."));
    return;
  }
  let totalLines = 0;
  for (const p of plan) {
    totalLines += p.changes.length;
    console.log(C.bold(C.cyan(`\n── ${p.file}  (${p.changes.length} line${p.changes.length===1?"":"s"})`)));
    console.log(C.dim(`--- ${p.file}`));
    console.log(C.dim(`+++ ${p.file}  (proposed)`));
    for (const ch of p.changes) {
      const tags = ch.replacements
        .map((r) => `R${r.from}→R${r.to} (${r.reason})`)
        .join(", ");
      console.log(C.dim(`@@ line ${ch.line}  ${tags}`));
      console.log(C.red(`- ${ch.before}`));
      console.log(C.green(`+ ${ch.after}`));
    }
  }
  console.log(C.bold(`\nSummary: ${plan.length} file(s), ${totalLines} line(s) would change.`));
  if (!apply) console.log(C.dim(`Re-run with --apply to write changes (use --yes to skip confirmation).`));
}

function prompt(q) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a); }));
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
if (wantJson) {
  console.log(JSON.stringify({
    canonical: { tiers: CANONICAL_TIERS, payg: CANONICAL_PAYG, topups: CANONICAL_TOPUPS },
    fixMap: FIX,
    filesChanged: plan.length,
    linesChanged: plan.reduce((n, p) => n + p.changes.length, 0),
    plan: plan.map(({ newContent, ...rest }) => rest),
  }, null, 2));
} else {
  renderDiff();
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------
if (apply && plan.length) {
  if (!yes) {
    const ans = await prompt(`\nApply ${plan.length} file change(s)? [y/N] `);
    if (!/^y(es)?$/i.test(ans.trim())) {
      console.log("Aborted. No files written.");
      process.exit(0);
    }
  }
  for (const p of plan) {
    writeFileSync(resolve(ROOT, p.file), p.newContent);
    console.log(C.green(`✓ wrote ${p.file}`));
  }
  console.log(C.bold(`\nApplied ${plan.length} file(s). Run \`node scripts/pricing-check.mjs\` to verify clean.`));
}

process.exit(plan.length && !apply ? 1 : 0);
