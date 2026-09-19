import { describe, expect, it } from "vitest";
import { hubCheckoutUrl, tierMeets } from "@/lib/entitlement";
import { FREE_PROMOTION_ACTIVE } from "@/lib/promotion";

describe("free-promotion commercial guard", () => {
  it("keeps the promotion enabled and grants paid-tier capability checks", () => {
    expect(FREE_PROMOTION_ACTIVE).toBe(true);
    expect(tierMeets("free", "business")).toBe(true);
    expect(tierMeets(null, "creator")).toBe(true);
  });

  it("never constructs a Hub checkout URL", () => {
    for (const sku of [
      "sync_vision:creator:monthly",
      "sync_vision:pro:monthly",
      "sync_vision:business:monthly",
      "all_access:all_access:monthly",
    ]) {
      const url = hubCheckoutUrl(sku, "https://example.test/back");
      expect(url).toBe("/");
      expect(url).not.toContain("checkout");
      expect(url).not.toContain("reson8.life");
    }
  });
});
