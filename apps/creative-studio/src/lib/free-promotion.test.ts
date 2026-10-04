import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FREE_PROMOTION_ACTIVE } from "@/lib/promotion";

describe("free-promotion public commerce guard", () => {
  it("keeps Creative Studio in free promotion mode", () => {
    expect(FREE_PROMOTION_ACTIVE).toBe(true);
  });

  it("ships no paid pricing branch or checkout helper on the pricing page", () => {
    const source = readFileSync(resolve(process.cwd(), "src/pages/Pricing.tsx"), "utf8");
    expect(source).not.toMatch(/R\s?\d/);
    expect(source).not.toContain("checkoutUrl");
    expect(source).not.toContain("projectPacks");
    expect(source).not.toContain("creditPacks");
    expect(source).toContain("Open Creative Studio free");
  });

  it("keeps crawlable metadata aligned to the promotion", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    expect(html).not.toContain("ZAR-first pricing");
    expect(html).not.toContain("official pricing, updates, checkout");
    expect(html).toContain("Free during the current promotion");
  });
});
