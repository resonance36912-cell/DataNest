#!/usr/bin/env bun
/**
 * verify-pricing — assert the public commercial surface matches the governed
 * commercial mode.
 *
 * During the costing-validation promotion the pricing page must expose no
 * checkout links or live ZAR prices. Outside promotion mode, displayed pass
 * prices must match SKU_CATALOG.
 */
import { readFileSync } from "node:fs";
import { SKU_CATALOG } from "../src/lib/checkout.functions";
import { FREE_PROMOTION_ACTIVE } from "../src/lib/commercial-policy";

const src = readFileSync("src/routes/pricing.tsx", "utf8");
const failures: string[] = [];

if (FREE_PROMOTION_ACTIVE) {
  if (/\/checkout\?/.test(src)) {
    failures.push("pricing.tsx exposes /checkout links while FREE_PROMOTION_ACTIVE is true.");
  }
  if (/zar:\s*"R[\d,]+"/.test(src)) {
    failures.push("pricing.tsx exposes live ZAR plan prices while FREE_PROMOTION_ACTIVE is true.");
  }
  if (!/Free Promotion|free during promotion|Free promotional access/i.test(src)) {
    failures.push("pricing.tsx does not clearly disclose the active free promotion.");
  }

  if (failures.length) {
    console.error("❌ verify-pricing failed:");
    for (const f of failures) console.error("  " + f);
    process.exit(1);
  }

  console.log(
    "✓ verify-pricing: free-promotion surface has no live checkout links or displayed plan prices.",
  );
  process.exit(0);
}

const planRegex =
  /\{[^{}]*?zar:\s*"(R[\d,]+)"[^{}]*?href:\s*"\/checkout\?app=([a-z_]+)&plan=([a-z_]+)"[^{}]*?\}/g;

let count = 0;
let m: RegExpExecArray | null;
while ((m = planRegex.exec(src))) {
  count++;
  const [, displayed, app, plan] = m;
  const sku = `${app}:${plan}:monthly`;
  const def = SKU_CATALOG[sku];
  if (!def) {
    failures.push(`pricing.tsx links to unknown SKU "${sku}" (displayed ${displayed})`);
    continue;
  }
  const expected = `R${(def.amountCents / 100).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  })}`;
  if (displayed !== expected) {
    failures.push(
      `pricing.tsx ${sku}: displayed ${displayed} but SKU_CATALOG says ${expected} (${def.amountCents} cents)`,
    );
  }
}

if (count === 0) {
  failures.push("verify-pricing matched 0 plans while promotion mode is disabled.");
}

if (failures.length) {
  console.error("❌ verify-pricing failed:");
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log(`✓ verify-pricing: ${count} plan prices match SKU_CATALOG.`);
