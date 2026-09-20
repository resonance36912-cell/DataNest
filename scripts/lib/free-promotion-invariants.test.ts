import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("free promotion invariants", () => {
  test("governed promotion policy is explicitly active", () => {
    const src = read("src/lib/commercial-policy.ts");
    expect(src).toContain("export const FREE_PROMOTION_ACTIVE = true");
    expect(src).toContain('export const FREE_PROMOTION_STARTED_ON = "2026-09-20"');
  });

  test("all new PayFast launches fail closed before merchant setup", () => {
    const src = read("src/lib/checkout.functions.ts");
    const guard = src.indexOf("if (FREE_PROMOTION_ACTIVE)");
    const merchant = src.indexOf("const merchantId = process.env.PAYFAST_MERCHANT_ID");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(merchant).toBeGreaterThan(guard);
    expect(src).toContain("throw new Error(FREE_PROMOTION_MESSAGE)");
  });

  test("central entitlement server function grants promotion before subscription lookup", () => {
    const src = read("src/lib/entitlement.functions.ts");
    const guard = src.indexOf("if (FREE_PROMOTION_ACTIVE)");
    const lookup = src.indexOf('.from("subscriptions")');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(lookup).toBeGreaterThan(guard);
    expect(src).toContain('source: "promotion"');
    expect(src).toContain("features: promotionFeatures(data.app)");
  });

  test("request-shaped tier gate grants promotion before subscription lookup", () => {
    const src = read("src/lib/requireTier-request.ts");
    const guard = src.indexOf("if (FREE_PROMOTION_ACTIVE)");
    const lookup = src.indexOf('.from("subscriptions")');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(lookup).toBeGreaterThan(guard);
    expect(src).toContain('source: "promotion"');
    expect(src).toContain("features: promotionFeatures(app)");
  });

  test("public spoke entitlement endpoint grants promotion before subscription lookup", () => {
    const src = read("src/routes/api/public/entitlement.ts");
    const guard = src.indexOf("if (FREE_PROMOTION_ACTIVE)");
    const lookup = src.indexOf('.from("subscriptions")');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(lookup).toBeGreaterThan(guard);
    expect(src).toContain('source: "promotion"');
    expect(src).toContain("features: promotionFeatures(app)");
  });

  test("pricing and checkout do not expose active payment launches", () => {
    const pricing = read("src/routes/pricing.tsx");
    const checkout = read("src/routes/checkout.tsx");
    expect(pricing).not.toContain("/checkout?");
    expect(pricing).toMatch(/free during promotion|Free promotional access/i);
    expect(checkout).toContain("No payment is required right now.");
    expect(checkout).not.toContain("createPayfastLaunch");
  });
});
