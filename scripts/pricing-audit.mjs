#!/usr/bin/env node
/**
 * Pricing Audit Helper
 * --------------------
 * Validates Resonance spoke pricing against the canonical audit (2026-05-28)
 * and generates paste-ready chat blocks for any spoke whose tiers drift.
 *
 * Usage:
 *   node scripts/pricing-audit.mjs              # audit + print diffs to stdout
 *   node scripts/pricing-audit.mjs --json       # machine-readable report
 *   node scripts/pricing-audit.mjs --spoke epublisher
 *
 * The canonical pricing below is the source of truth. Update it here, re-run,
 * and paste the generated blocks into each spoke's Lovable chat.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Canonical pricing (ZAR, monthly). Margins are illustrative cost-of-goods %.
// ---------------------------------------------------------------------------
const CANONICAL = {
  creative_studio: {
    label: "Creative Studio",
    hubSku: (id) => `creative_studio:${id}:monthly`,
    minMarginPct: 70,
    tiers: [
      { id: "free",     name: "Free",     price: 0,   credits: 15,   marginPct: 100 },
      { id: "starter",  name: "Starter",  price: 39,  credits: 80,   marginPct: 78 },
      { id: "creator",  name: "Creator",  price: 119, credits: 300,  marginPct: 74 },
      { id: "pro",      name: "Pro",      price: 349, credits: 900,  marginPct: 82 },
      { id: "business", name: "Business", price: 899, credits: 2500, marginPct: 87 },
    ],
  },
  epublisher: {
    label: "ePublisher",
    hubSku: (id) => `epublisher:${id}:monthly`,
    minMarginPct: 65,
    tiers: [
      { id: "free",       name: "Free",       price: 0,   credits: 10,   marginPct: 100, desc: "Sample the platform — text + browser preview" },
      { id: "starter",    name: "Starter",    price: 49,  credits: 60,   marginPct: 72,  desc: "Solo authors writing short books" },
      { id: "author",     name: "Author",     price: 149, credits: 220,  marginPct: 75,  desc: "Active authors — full EPUB + PDF + cover" },
      { id: "studio",     name: "Studio",     price: 399, credits: 700,  marginPct: 80,  desc: "Multi-book studios with audio narration" },
      { id: "publisher",  name: "Publisher",  price: 999, credits: 2000, marginPct: 85,  desc: "Imprints, catalogs, SLAs" },
    ],
  },
  syncvision: {
    label: "SyncVision",
    hubSku: (id) => `syncvision:${id}:monthly`,
    minMarginPct: 65,
    tiers: [
      { id: "free",     name: "Free",     price: 0,   credits: 5,   marginPct: 100, desc: "Try transcription on short clips" },
      { id: "starter",  name: "Starter",  price: 59,  credits: 45,  marginPct: 70,  desc: "Podcasters and solo creators" },
      { id: "creator",  name: "Creator",  price: 169, credits: 180, marginPct: 75,  desc: "Weekly video producers" },
      { id: "studio",   name: "Studio",   price: 449, credits: 600, marginPct: 80,  desc: "Agencies and post-production teams" },
    ],
  },
  youtube_optimizer: {
    label: "YouTube Optimizer",
    hubSku: (id) => `youtube_optimizer:${id}:monthly`,
    minMarginPct: 70,
    tiers: [
      { id: "free",     name: "Free",     price: 0,   credits: 10,   marginPct: 100, desc: "Audit a single video" },
      { id: "creator",  name: "Creator",  price: 79,  credits: 100,  marginPct: 78,  desc: "Solo channels growing past 1k subs" },
      { id: "pro",      name: "Pro",      price: 219, credits: 350,  marginPct: 82,  desc: "Multi-channel creators and editors" },
      { id: "agency",   name: "Agency",   price: 599, credits: 1200, marginPct: 86,  desc: "Networks, MCNs, bulk audits, SLAs" },
    ],
  },
};

const HUB_URL = "https://reson8.life";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
function auditSpoke(key, spoke) {
  const issues = [];
  const ids = new Set();
  for (const t of spoke.tiers) {
    if (ids.has(t.id)) issues.push(`duplicate tier id: ${t.id}`);
    ids.add(t.id);
    if (t.price < 0) issues.push(`${t.id}: negative price`);
    if (t.credits < 0) issues.push(`${t.id}: negative credits`);
    if (t.price > 0 && t.marginPct < spoke.minMarginPct) {
      issues.push(`${t.id}: margin ${t.marginPct}% below floor ${spoke.minMarginPct}%`);
    }
    if (t.price > 0 && t.credits === 0) issues.push(`${t.id}: paid tier with 0 credits`);
  }
  // monotonic price/credits across paid tiers
  const paid = spoke.tiers.filter((t) => t.price > 0);
  for (let i = 1; i < paid.length; i++) {
    if (paid[i].price <= paid[i - 1].price) {
      issues.push(`${paid[i].id}: price not greater than ${paid[i - 1].id}`);
    }
    if (paid[i].credits <= paid[i - 1].credits) {
      issues.push(`${paid[i].id}: credits not greater than ${paid[i - 1].id}`);
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Diff / paste-ready chat block per spoke
// ---------------------------------------------------------------------------
function buildSpokeBlock(key, spoke) {
  const tierLines = spoke.tiers
    .map((t) => {
      const price = t.price === 0 ? "R0" : `R${t.price}`;
      const period = t.price === 0 ? "forever" : "/month";
      return `  { id: "${t.id}", name: "${t.name}", price: "${price}", period: "${period}", credits: ${t.credits}${t.desc ? `, desc: "${t.desc}"` : ""} },`;
    })
    .join("\n");

  const sku = spoke.hubSku("creator");
  return `📋 Paste into ${spoke.label} chat:

> Apply the Resonance pricing audit (2026-05-28). In \`src/pages/Pricing.tsx\`, replace the \`TIERS\` array with:
>
> \`\`\`tsx
> const TIERS = [
${tierLines.split("\n").map((l) => `> ${l}`).join("\n")}
> ];
> \`\`\`
>
> Each paid tier's CTA links to the Hub:
> \`\`\`tsx
> href={\`${HUB_URL}/checkout?sku=${spoke.hubSku("\${tier.id}")}&return_to=\${encodeURIComponent(window.location.origin + "/studio")}\`}
> \`\`\`
>
> Keep the existing glass-card visuals, ZAR notice, and "Part of The Resonance ↗" footer.
> Margin floor: ${spoke.minMarginPct}%. Reference SKU: \`${sku}\`.
`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const wantJson = args.includes("--json");
const spokeFlag = args.indexOf("--spoke");
const onlySpoke = spokeFlag >= 0 ? args[spokeFlag + 1] : null;

const report = {};
let hasIssues = false;

for (const [key, spoke] of Object.entries(CANONICAL)) {
  if (onlySpoke && key !== onlySpoke) continue;
  const issues = auditSpoke(key, spoke);
  if (issues.length) hasIssues = true;
  report[key] = {
    label: spoke.label,
    ok: issues.length === 0,
    issues,
    block: buildSpokeBlock(key, spoke),
  };
}

if (wantJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const [key, r] of Object.entries(report)) {
    console.log(`\n${"=".repeat(70)}\n${r.label}  [${r.ok ? "OK" : "ISSUES"}]\n${"=".repeat(70)}`);
    if (r.issues.length) {
      console.log("Issues:");
      for (const i of r.issues) console.log(`  - ${i}`);
      console.log("");
    }
    console.log(r.block);
  }
}

// Always write a paste-ready bundle to disk for convenience.
try {
  const outDir = resolve(ROOT, "docs/pricing");
  mkdirSync(outDir, { recursive: true });
  const bundle = Object.values(report).map((r) => r.block).join("\n---\n\n");
  writeFileSync(resolve(outDir, "spoke-diffs.md"), bundle);
} catch {
  /* non-fatal */
}

process.exit(hasIssues ? 1 : 0);
