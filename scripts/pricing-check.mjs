#!/usr/bin/env node
/**
 * Pricing Consistency Checker
 * ---------------------------
 * Scans the repo for ZAR price tokens (e.g. R149, R299, R699) and flags any
 * that don't match the canonical pricing in scripts/pricing-audit.mjs.
 *
 * Catches stale references like the pre-2026-05-28 R149/R299/R699 trio that
 * shipped before the margin rework — and any future drift between tier prices
 * in src/pages/Pricing.tsx, copy in About/Home/marketing pages, SEO meta, or
 * docs/.
 *
 * Usage:
 *   node scripts/pricing-check.mjs              # human report, exit 1 on mismatch
 *   node scripts/pricing-check.mjs --json
 *   node scripts/pricing-check.mjs --fix-hint   # show suggested replacements
 *
 * Wire into CI / pre-publish:
 *   "scripts": { "prepublish-check": "node scripts/pricing-check.mjs" }
 */

import { readFileSync, statSync, readdirSync } from "node:fs";
import { resolve, dirname, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Canonical Creative Studio pricing (ZAR). Keep in sync with pricing-audit.mjs.
// ---------------------------------------------------------------------------
const CANONICAL_TIERS = [0, 39, 119, 349, 899]; // subscriptions
const CANONICAL_PAYG = [15, 65, 119, 179, 299, 549]; // pay-as-you-go
const CANONICAL_TOPUPS = [59, 169, 249];
const CANONICAL = new Set([...CANONICAL_TIERS, ...CANONICAL_PAYG, ...CANONICAL_TOPUPS]);

// Known stale prices to call out by name with a louder message.
const STALE = {
  149: "old Starter (pre 2026-05-28) — current Starter is R39",
  299: "old Creator (pre 2026-05-28) — current Creator is R119 (also a valid PayG Cinematic price; verify context)",
  699: "old Pro (pre 2026-05-28) — current Pro is R349",
  79:  "drift — not in canonical set",
  199: "drift — not in canonical set",
  449: "drift — not in canonical set",
  999: "drift — not in canonical set",
};

// Best-fit replacement hints for `--fix-hint`.
const FIX_HINT = {
  149: 39,
  299: 119,
  699: 349,
  199: 119,
  449: 349,
  999: 899,
};

// ---------------------------------------------------------------------------
// Scan config
// ---------------------------------------------------------------------------
const INCLUDE_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs",
  ".md", ".mdx", ".html", ".json", ".css",
]);
const SKIP_DIRS = new Set([
  "node_modules", "dist", "build", ".git", ".next", ".vite",
  "coverage", "playwright-report", "test-results", "supabase/.branches",
]);
// File-level skip: don't lint our own source-of-truth files or generated
// artifacts that legitimately contain stale prices in historical context.
const SKIP_FILES = new Set([
  "scripts/pricing-audit.mjs",
  "scripts/pricing-check.mjs",
  "scripts/pricing-autopaste.mjs",
  "docs/pricing/spoke-diffs.md",
  "package-lock.json",
  "bun.lockb",
  "bun.lock",
  "yarn.lock",
  "pnpm-lock.yaml",
]);

const PRICE_RE = /\bR\s?(\d{1,5})(?!\d|\.)/g;

// ---------------------------------------------------------------------------
// Walk
// ---------------------------------------------------------------------------
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
// Scan
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const wantJson = args.includes("--json");
const fixHint = args.includes("--fix-hint");

const files = walk(ROOT).filter((f) => !SKIP_FILES.has(relative(ROOT, f)));
const findings = [];

for (const file of files) {
  const rel = relative(ROOT, file);
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  if (!text.includes("R")) continue;

  const lines = text.split("\n");
  lines.forEach((line, i) => {
    PRICE_RE.lastIndex = 0;
    let m;
    while ((m = PRICE_RE.exec(line)) !== null) {
      const price = Number(m[1]);
      // Heuristic: ignore tiny numbers (R0, R1) only when in non-pricing
      // contexts; allow R0 explicitly as a canonical free price.
      if (CANONICAL.has(price)) continue;
      // Skip obvious non-price matches: react/router, regex hex, etc.
      if (/\b(React|Route|Radius|Range|Result|Render|Read|Resonance|Resend|Row|Reach|Real)/.test(line.slice(Math.max(0, m.index - 4), m.index + 8))) continue;
      findings.push({
        file: rel,
        line: i + 1,
        col: m.index + 1,
        price,
        snippet: line.trim().slice(0, 140),
        reason: STALE[price] ?? "not in canonical pricing set",
        suggest: fixHint ? FIX_HINT[price] ?? null : undefined,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (wantJson) {
  console.log(JSON.stringify({
    canonical: { tiers: CANONICAL_TIERS, payg: CANONICAL_PAYG, topups: CANONICAL_TOPUPS },
    findingsCount: findings.length,
    findings,
  }, null, 2));
} else {
  if (!findings.length) {
    console.log(`✓ Pricing consistent — all R-tokens match canonical set.`);
    console.log(`  Tiers:  ${CANONICAL_TIERS.map(p => `R${p}`).join(", ")}`);
    console.log(`  PayG:   ${CANONICAL_PAYG.map(p => `R${p}`).join(", ")}`);
    console.log(`  Topups: ${CANONICAL_TOPUPS.map(p => `R${p}`).join(", ")}`);
  } else {
    console.log(`✗ ${findings.length} pricing mismatch(es) found:\n`);
    // Group by file
    const byFile = new Map();
    for (const f of findings) {
      if (!byFile.has(f.file)) byFile.set(f.file, []);
      byFile.get(f.file).push(f);
    }
    for (const [file, items] of byFile) {
      console.log(`  ${file}`);
      for (const it of items) {
        const fix = fixHint && it.suggest != null ? `  → suggest R${it.suggest}` : "";
        console.log(`    L${it.line}:${it.col}  R${it.price}  — ${it.reason}${fix}`);
        console.log(`      ${it.snippet}`);
      }
      console.log("");
    }
    console.log(`Run with --fix-hint for suggested replacements.`);
    console.log(`Update canonical set at the top of scripts/pricing-check.mjs if any of these are intentional.`);
  }
}

process.exit(findings.length ? 1 : 0);
