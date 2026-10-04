#!/usr/bin/env bun
/**
 * verify-pricing — certify the currently published pricing surface.
 *
 * During the governed free-access promotion the pricing route must not expose
 * checkout links or displayed ZAR prices. Outside promotion mode, displayed
 * plan prices must match SKU_CATALOG exactly.
 */
import { readFileSync } from "node:fs";
import { SKU_CATALOG } from "../src/lib/checkout.functions";
import { FREE_PROMOTION_ACTIVE } from "../src/lib/promotion";

const src = readFileSync("src/routes/pricing.tsx", "utf8");
const failures: string[] = [];

if (FREE_PROMOTION_ACTIVE) {
  if (/\/checkout\?app=/i.test(src)) {
    failures.push("pricing.tsx exposes checkout links while FREE_PROMOTION_ACTIVE is true.");
  }
  if (/\bzar\s*:/i.test(src) || /\bR\d[\d,]*(?:\.\d+)?\b/.test(src)) {
    failures.push("pricing.tsx exposes displayed ZAR plan prices while FREE_PROMOTION_ACTIVE is true.");
  }
  if (!src.includes("FREE_PROMOTION.description") || !src.includes("FREE_PROMOTION_ACTIVE")) {
    failures.push("pricing.tsx is not bound to the canonical free-promotion policy.");
  }
  if (!src.includes("Object.values(APP_REGISTRY)")) {
    failures.push("pricing.tsx is not rendering the canonical application registry.");
  }

  if (failures.length) {
    console.error("❌ verify-pricing failed:");
    for (const f of failures) console.error("  " + f);
    process.exit(1);
  }
  console.log("✓ verify-pricing: governed free-promotion surface exposes no checkout or plan pricing.");
  process.exit(0);
}

const planRegex =
  /\{[^{}]*?zar:\s*"(R[\d,]+)"[^{}]*?href:\s*"\/checkout\?app=([a-z_]+)&plan=([a-z_]+)"[^{}]*?\}/g;

let count = 0;
let match: RegExpExecArray | null;
while ((match = planRegex.exec(src))) {
  count++;
  const [, displayed, app, plan] = match;
  const sku = `${app}:${plan}:monthly`;
  const def = SKU_CATALOG[sku];
  if (!def) {
    failures.push(`pricing.tsx links to unknown SKU "${sku}" (displayed ${displayed})`);
    continue;
  }
  const expected = `R${(def.amountCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (displayed !== expected) {
    failures.push(
      `pricing.tsx ${sku}: displayed ${displayed} but SKU_CATALOG says ${expected} (${def.amountCents} cents)`,
    );
  }
}

if (count === 0) failures.push("verify-pricing matched 0 paid plans outside promotion mode.");

if (failures.length) {
  console.error("❌ verify-pricing failed:");
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log(`✓ verify-pricing: ${count} plan prices match SKU_CATALOG.`);