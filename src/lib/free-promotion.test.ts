import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkoutUrl, tierMeets } from "@/lib/entitlement";
import { FREE_PROMOTION_ACTIVE } from "@/lib/promotion";

describe("free-promotion commercial guard", () => {
  it("keeps the promotion enabled and grants paid-tier capability checks", () => {
    expect(FREE_PROMOTION_ACTIVE).toBe(true);
    expect(tierMeets("free", "business")).toBe(true);
    expect(tierMeets(null, "pro")).toBe(true);
  });

  it("routes every former purchase path into the free app", () => {
    for (const plan of ["credits", "project", "studio", "business"]) {
      const url = checkoutUrl(plan, "https://example.test/back");
      expect(url).not.toContain("checkout");
      expect(url).not.toContain("reson8.life");
    }
  });

  it("does not expose legacy paid acquisition copy while promotion mode is active", () => {
    const indexSource = readFileSync(resolve(process.cwd(), "src/pages/Index.tsx"), "utf8");

    expect(indexSource).not.toContain("buy once-off credits or project packs");
    expect(indexSource).toContain("temporarily free");
  });
});
