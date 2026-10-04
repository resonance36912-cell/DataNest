#!/usr/bin/env node
/**
 * CI Pricing Guard — strict, build-failing pricing check for Resonance spokes.
 * ---------------------------------------------------------------------------
 * Drop this file into any spoke (ePublisher, Creative Studio, Sync Vision,
 * YouTube Optimizer, Career Compass, Podcast). It exits non-zero if it finds:
 *
 *   1. Stale pricing tokens from the pre-2026-05-28 ladder (R149 / R299 / R699)
 *      anywhere in shipped source.
 *   2. ZAR prices that don't appear in this spoke's canonical tier ladder.
 *   3. Local PayFast wiring (any spoke must delegate to the Hub).
 *   4. Hard-coded checkout URLs that bypass `checkoutUrl()` from
 *      `src/lib/entitlement.ts`.
 *
 * Per-spoke tuning lives in CANONICAL_BY_APP below. The active spoke is read
 * from `APP_KEY` in `src/lib/entitlement.ts`; override with `--app=<key>`.
 *
 * Usage:
 *   node scripts/ci-pricing-guard.mjs                 # strict, exit 1 on any finding
 *   node scripts/ci-pricing-guard.mjs --json
 *   node scripts/ci-pricing-guard.mjs --app=epublisher
 *   node scripts/ci-pricing-guard.mjs --scope=src     # default; "all" includes docs
 *
 * Wire into CI:
 *   package.json → "scripts": { "ci:pricing": "node scripts/ci-pricing-guard.mjs" }
 *   GitHub Actions: see .github/workflows/pricing-guard.yml
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, relative, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PROMOTION_PATH = join(ROOT, "src/lib/promotion.ts");
const PROMOTION_SOURCE = existsSync(PROMOTION_PATH) ? readFileSync(PROMOTION_PATH, "utf8") : "";
const FREE_PROMOTION_ACTIVE = /FREE_PROMOTION_ACTIVE\s*=\s*true\s+as\s+const/.test(PROMOTION_SOURCE);

// ---------------------------------------------------------------------------
// Canonical ZAR ladders per spoke (audit 2026-05-28). Mirrors
// docs/brand/README.md § SKU catalog. Keep in lockstep with the Hub.
// ---------------------------------------------------------------------------
const CANONICAL_BY_APP = {
  creative_studio: {
    tiers:   [0, 39, 119, 349, 899],
    payg:    [15, 65, 119, 179, 299, 549],
    topups:  [59, 169, 249],
    bundle:  [549], // all_access
  },
  epublisher:        { tiers: [0, 49, 149, 399, 999], bundle: [549] },
  sync_vision:       { tiers: [0, 59, 169, 449],      bundle: [549] },
  youtube_optimizer: { tiers: [0, 79, 219, 599],      bundle: [549] },
  career_compass:    { tiers: [0, 39, 119, 349],      bundle: [549] },
  podcast:           { tiers: [0, 49, 149, 399],      bundle: [549] },
};

// Always-stale tokens — pre-rework Creative Studio prices. These must NEVER
// ship in any spoke that claims canonical alignment.
const HARD_STALE = {
  149: "pre-2026-05-28 Starter — Creative Studio Starter is now R39 (other spokes use their own ladders)",
  299: "pre-2026-05-28 Creator — Creative Studio Creator is now R119",
  699: "pre-2026-05-28 Pro — Creative Studio Pro is now R349",
};

// Patterns that indicate local PayFast wiring (forbidden in spokes).
const FORBIDDEN_PATTERNS = [
  { re: /payfast\.co\.za/gi,            label: "PayFast direct URL (use Hub checkout)" },
  { re: /process\.payfast/gi,           label: "PayFast process endpoint" },
  { re: /PAYFAST_(MERCHANT|PASSPHRASE|ITN)/g, label: "PayFast secret reference" },
  { re: /\/api\/payfast/g,              label: "Local PayFast API route" },
];

// Hard-coded checkout URLs that bypass checkoutUrl().
const HARDCODED_CHECKOUT = /reson8\.life\/checkout\?[^"'`\s]+/g;

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const value = (name, fallback) => {
  const f = flag(name);
  if (!f) return fallback;
  const eq = f.indexOf("=");
  return eq === -1 ? true : f.slice(eq + 1);
};

const JSON_OUT = !!flag("json");
const SCOPE = value("scope", "src"); // "src" or "all"
let APP = value("app", null);

// Auto-detect APP from src/lib/entitlement.ts if not provided.
if (!APP) {
  const entPath = join(ROOT, "src/lib/entitlement.ts");
  if (existsSync(entPath)) {
    const txt = readFileSync(entPath, "utf8");
    const m = txt.match(/APP_KEY\s*=\s*["']([a-z_]+)["']/);
    if (m) APP = m[1];
  }
  APP ??= "creative_studio";
}

const CANON = CANONICAL_BY_APP[APP];
if (!CANON) {
  console.error(`[ci-pricing-guard] Unknown app "${APP}". Known: ${Object.keys(CANONICAL_BY_APP).join(", ")}`);
  process.exit(2);
}
const ALLOWED = new Set([
  ...(CANON.tiers ?? []),
  ...(CANON.payg ?? []),
  ...(CANON.topups ?? []),
  ...(CANON.bundle ?? []),
]);

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------
const INCLUDE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".html", ".css", ".json"]);
const SKIP_DIRS = new Set([
  "node_modules", "dist", "build", ".git", ".next", ".turbo", ".cache",
  "coverage", "playwright-report", "test-results", "public/videos",
]);
const SKIP_FILES = new Set([
  "package-lock.json", "bun.lockb", "yarn.lock", "pnpm-lock.yaml",
  "scripts/ci-pricing-guard.mjs", // self
  "scripts/pricing-check.mjs",
  "scripts/pricing-audit.mjs",
  "scripts/pricing-preview.mjs",
  "scripts/pricing-autopaste.mjs",
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full);
    if (SKIP_DIRS.has(name) || SKIP_FILES.has(rel)) continue;
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else if (INCLUDE_EXT.has(extname(name))) out.push(full);
  }
  return out;
}

const SCAN_ROOTS =
  SCOPE === "all"
    ? [ROOT]
    : ["src", "supabase/functions", "index.html"]
        .map((p) => join(ROOT, p))
        .filter((p) => existsSync(p));

const files = SCAN_ROOTS.flatMap((p) =>
  statSync(p).isDirectory() ? walk(p) : [p],
);

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------
const findings = []; // { file, line, kind, message, snippet }
const PRICE_RE = /\bR\s?(\d{1,4})\b/g;

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    const rel = relative(ROOT, file);

    // 1. Paid-mode only: stale + non-canonical ZAR prices.
    // During the free promotion there is deliberately no active customer price ladder.
    if (!FREE_PROMOTION_ACTIVE) {
      for (const m of line.matchAll(PRICE_RE)) {
        const n = Number(m[1]);
        if (HARD_STALE[n]) {
          findings.push({
            file: rel, line: lineNo, kind: "stale-price",
            message: `R${n} — ${HARD_STALE[n]}`,
            snippet: line.trim(),
          });
        } else if (!ALLOWED.has(n)) {
          findings.push({
            file: rel, line: lineNo, kind: "non-canonical-price",
            message: `R${n} is not in the canonical ${APP} ladder (${[...ALLOWED].sort((a,b)=>a-b).map(v=>"R"+v).join(", ")})`,
            snippet: line.trim(),
          });
        }
      }
    }

    // 2. Forbidden local PayFast wiring
    for (const { re, label } of FORBIDDEN_PATTERNS) {
      if (re.test(line)) {
        findings.push({
          file: rel, line: lineNo, kind: "forbidden-payfast",
          message: label,
          snippet: line.trim(),
        });
        re.lastIndex = 0;
      }
    }

    // 3. Hard-coded Hub checkout URLs (must go through checkoutUrl())
    if (HARDCODED_CHECKOUT.test(line) && !rel.endsWith("src/lib/entitlement.ts")) {
      findings.push({
        file: rel, line: lineNo, kind: "hardcoded-checkout",
        message: "Hard-coded reson8.life/checkout URL — use checkoutUrl(sku) from src/lib/entitlement.ts",
        snippet: line.trim(),
      });
      HARDCODED_CHECKOUT.lastIndex = 0;
    }
  });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (JSON_OUT) {
  console.log(JSON.stringify({ app: APP, scope: SCOPE, allowed: [...ALLOWED], findings }, null, 2));
  process.exit(findings.length ? 1 : 0);
}

const RED = "\x1b[31m", YEL = "\x1b[33m", GRN = "\x1b[32m", DIM = "\x1b[2m", RST = "\x1b[0m";

console.log(`${DIM}ci-pricing-guard${RST}  app=${APP}  scope=${SCOPE}  files=${files.length}  mode=${FREE_PROMOTION_ACTIVE ? "FREE_PROMOTION" : "PAID"}`);
if (!FREE_PROMOTION_ACTIVE) {
  console.log(`${DIM}canonical ZAR:${RST} ${[...ALLOWED].sort((a,b)=>a-b).map(v=>"R"+v).join(", ")}\n`);
} else {
  console.log(`${DIM}canonical ZAR:${RST} paused while promotion costing is measured\n`);
}

if (findings.length === 0) {
  console.log(`${GRN}✓ commercial guard passed — no forbidden payment wiring${FREE_PROMOTION_ACTIVE ? " during the free promotion" : " or price drift"}.${RST}`);
  process.exit(0);
}

const grouped = findings.reduce((acc, f) => ((acc[f.kind] ??= []).push(f), acc), {});
for (const [kind, items] of Object.entries(grouped)) {
  console.log(`${RED}✗ ${kind} (${items.length})${RST}`);
  for (const f of items) {
    console.log(`  ${YEL}${f.file}:${f.line}${RST}  ${f.message}`);
    console.log(`    ${DIM}${f.snippet.slice(0, 140)}${RST}`);
  }
  console.log();
}

console.log(`${RED}✗ pricing guard failed — ${findings.length} finding(s). Fix before merging.${RST}`);
process.exit(1);
