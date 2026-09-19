// Build-time pricing + marketing copy check.
//
// 1. Ensures src/pages/Pricing.tsx PACKS array matches the once-off pack model
//    sold via The Resonance Hub (Free trial, Credit top-up, Project pack,
//    Studio pack).
// 2. Scans every user-facing marketing surface for forbidden
//    subscription/monthly-plan language. This app is a spoke of reson8.life
//    and MUST NOT present itself as having its own recurring subscription.
//
// Analytics/dashboard components (tabs, printable report, demo data) are
// intentionally excluded — they legitimately mention "monthly views" and
// "$/month" as YouTube revenue estimates, not as app pricing.
import { readFileSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const PRICING_PATH = join(ROOT, "src/pages/Pricing.tsx");
const PROMOTION_PATH = join(ROOT, "src/lib/promotion.ts");

// Source of truth: reson8.life/pricing → YouTube Optimizer packs.
// Prices are lower-bound "From R…" values; only names + ids are strict.
export const EXPECTED_PACKS = [
  { id: "free", name: "Free trial" },
  { id: "credits", name: "Credit top-up" },
  { id: "project", name: "Project pack" },
  { id: "studio", name: "Studio pack" },
];

// Language that must NOT appear on any user-facing marketing surface.
// Ordering doesn't matter — every match is reported.
export const FORBIDDEN_PHRASES = [
  /\bmonthly plan\b/i,
  /\bmonthly subscription\b/i,
  /\bsubscription plan\b/i,
  /\bapp subscription\b/i,
  /\bper month\b/i,
  /\bper-month\b/i,
  /\bcancel anytime\b/i,
  /\bsubscribe now\b/i,
  /\/mo\b/,
  /\/month\b/,
];

// Allow-list of exact substrings that would otherwise trip a forbidden regex
// but are legitimate governance copy (e.g. "No recurring app subscription
// required" explicitly disavows the model — that's the whole point).
const ALLOWED_EXCEPTIONS = [
  /no recurring app subscription/gi,
  /no recurring subscription/gi,
];

// Marketing surfaces scanned for forbidden language. Add new user-facing
// pages/components here as they're created.
export const MARKETING_FILES = [
  "index.html",
  "public/llms.txt",
  "src/pages/Index.tsx",
  "src/pages/Pricing.tsx",
  "src/pages/Features.tsx",
  "src/pages/About.tsx",
  "src/pages/Contact.tsx",
  "src/pages/Login.tsx",
  "src/pages/Privacy.tsx",
  "src/pages/Terms.tsx",
  "src/components/SiteHeader.tsx",
  "src/components/SiteFooter.tsx",
  "src/components/UpgradeButton.tsx",
  "src/components/LockedSection.tsx",
  "src/components/BrandLogo.tsx",
  "src/components/ChannelInput.tsx",
  "src/components/ModeBanner.tsx",
  "src/components/DataTransparencyCard.tsx",
  "src/components/SEO.tsx",
];

function parsePacks(src) {
  const packs = [];
  const blockRe = /\{\s*id:\s*"([^"]+)",[\s\S]*?name:\s*"([^"]+)",/g;
  let m;
  while ((m = blockRe.exec(src))) {
    packs.push({ id: m[1], name: m[2] });
  }
  return packs;
}

function stripAllowed(src) {
  let out = src;
  for (const re of ALLOWED_EXCEPTIONS) {
    // Replace with same-length whitespace so line/column offsets stay useful.
    out = out.replace(re, (match) => " ".repeat(match.length));
  }
  return out;
}

function findForbidden(src) {
  const cleaned = stripAllowed(src);
  const hits = [];
  for (const re of FORBIDDEN_PHRASES) {
    const globalRe = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m;
    while ((m = globalRe.exec(cleaned))) {
      const upto = cleaned.slice(0, m.index);
      const line = upto.split("\n").length;
      hits.push({ pattern: re, match: m[0], line });
    }
  }
  return hits;
}

export function runPricingCheck() {
  const errors = [];
  if (!existsSync(PRICING_PATH)) {
    return [`Missing ${relative(ROOT, PRICING_PATH)}`];
  }
  const src = readFileSync(PRICING_PATH, "utf8");
  const promotionSource = existsSync(PROMOTION_PATH) ? readFileSync(PROMOTION_PATH, "utf8") : "";
  const promotionActive = /FREE_PROMOTION_ACTIVE\s*=\s*true\s+as\s+const/.test(promotionSource);

  if (promotionActive) {
    if (!/FREE_PROMOTION_ACTIVE/.test(src)) {
      errors.push("Pricing.tsx must be gated by FREE_PROMOTION_ACTIVE while the promotion is enabled");
    }
    if (!/Free promotional access|free during our promotion|Free access/i.test(src)) {
      errors.push("Pricing.tsx must clearly present the free-access promotion");
    }
    if (/href=.*\/checkout|Buy pack|Buy credits/i.test(src)) {
      errors.push("Pricing.tsx exposes a purchase CTA while the free-access promotion is enabled");
    }
    return errors;
  }

  const actual = parsePacks(src);

  for (const exp of EXPECTED_PACKS) {
    const got = actual.find((t) => t.id === exp.id);
    if (!got) {
      errors.push(`Missing pack "${exp.id}" in Pricing.tsx`);
      continue;
    }
    if (got.name !== exp.name) {
      errors.push(
        `Pack "${exp.id}" name drift: got "${got.name}", expected "${exp.name}"`,
      );
    }
  }

  return errors;
}

export function runMarketingCopyCheck() {
  const errors = [];
  for (const rel of MARKETING_FILES) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) continue; // optional files (e.g. llms.txt) may be absent
    const src = readFileSync(abs, "utf8");
    for (const hit of findForbidden(src)) {
      errors.push(
        `${rel}:${hit.line} — forbidden phrase "${hit.match}" (matches ${hit.pattern}). ` +
          `Remove recurring subscription/monthly-plan wording from this app surface.`,
      );
    }
  }
  return errors;
}

export function runAllChecks() {
  return [...runPricingCheck(), ...runMarketingCopyCheck()];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = runAllChecks();
  if (errors.length) {
    console.error("\n✗ Pricing / marketing copy check failed:\n");
    for (const e of errors) console.error("  - " + e);
    console.error(
      "\nFix: align copy with reson8.life once-off packs (Free trial, Credit top-up, Project pack, Studio pack). No recurring subscription wording on marketing surfaces.\n",
    );
    process.exit(1);
  }
  console.log("✓ Pricing + marketing copy check passed (aligned with reson8.life).");
}
