import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("free promotion invariants", () => {
  test("governed promotion policy is explicitly active", () => {
    const src = read("../../apps/hub/src/lib/promotion.ts");
    expect(src).toContain("export const FREE_PROMOTION_ACTIVE = true");
    expect(src).toContain("No payment is required during the promotion.");
  });

  test("all new PayFast launches fail closed before merchant setup", () => {
    const src = read("../../apps/hub/src/lib/checkout.functions.ts");
    const guard = src.indexOf("if (FREE_PROMOTION_ACTIVE)");
    const merchant = src.indexOf("const merchantId = process.env.PAYFAST_MERCHANT_ID");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(merchant).toBeGreaterThan(guard);
    expect(src).toContain(
      'throw new Error("Checkout is disabled during the Resonance free-access promotion.")',
    );
  });

  test("central entitlement server function grants promotion before subscription lookup", () => {
    const src = read("../../apps/hub/src/lib/entitlement.functions.ts");
    const guard = src.indexOf("if (FREE_PROMOTION_ACTIVE)");
    const lookup = src.indexOf("fetchSubscriptionRows(");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(lookup).toBeGreaterThan(guard);
    expect(src).toContain('source: "trial"');
    expect(src).toContain("features: deriveFeatures(data.app, FREE_PROMOTION_TIER)");
  });

  test("request-shaped tier gate grants promotion before subscription lookup", () => {
    const src = read("../../apps/hub/src/lib/requireTier-request.ts");
    const guard = src.indexOf("if (FREE_PROMOTION_ACTIVE)");
    const lookup = src.indexOf("fetchSubscriptionRows(");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(lookup).toBeGreaterThan(guard);
    expect(src).toContain('source: "trial"');
    expect(src).toContain("features: deriveFeatures(app, FREE_PROMOTION_TIER)");
  });

  test("public spoke entitlement endpoint grants promotion before subscription lookup", () => {
    const src = read("../../apps/hub/src/routes/api/public/entitlement.ts");
    const guard = src.indexOf("if (FREE_PROMOTION_ACTIVE)");
    const lookup = src.indexOf("fetchSubscriptionRows(");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(lookup).toBeGreaterThan(guard);
    expect(src).toContain('source: "trial"');
    expect(src).toContain("features: deriveFeatures(app, FREE_PROMOTION_TIER)");
  });

  test("pricing and checkout do not expose active payment launches", () => {
    const pricing = read("../../apps/hub/src/routes/pricing.tsx");
    const checkout = read("../../apps/hub/src/routes/checkout.tsx");
    expect(pricing).not.toContain("/checkout?");
    expect(pricing).toMatch(/free during promotion|Free promotional access/i);
    expect(checkout).toContain("No payment is required.");
    expect(checkout).toContain("no new purchase,");
    expect(checkout).not.toContain("createPayfastLaunch");
  });
});
