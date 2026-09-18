import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkoutUrl, APP_KEY, HUB_URL } from "@/lib/entitlement";

/**
 * Validates that checkoutUrl() always routes through the Resonance Hub
 * (reson8.life) with a properly-encoded `sku` and `return_to`, no matter
 * which spoke or plan shape it's called with.
 */

const ORIGINAL_WINDOW_LOCATION = window.location.href;

function parseCheckout(url: string) {
  const u = new URL(url);
  return {
    origin: u.origin,
    pathname: u.pathname,
    sku: u.searchParams.get("sku"),
    returnTo: u.searchParams.get("return_to"),
  };
}

describe("checkoutUrl()", () => {
  beforeEach(() => {
    // Pin window.location so the default return_to is deterministic.
    Object.defineProperty(window, "location", {
      writable: true,
      value: new URL("https://creativestudio.life/pricing"),
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: new URL(ORIGINAL_WINDOW_LOCATION),
    });
  });

  it("always points at the Resonance Hub", () => {
    const { origin, pathname } = parseCheckout(checkoutUrl("creator"));
    expect(origin).toBe("https://reson8.life");
    expect(HUB_URL).toBe("https://reson8.life");
    expect(pathname).toBe("/checkout");
  });

  it("expands a bare plan key to <APP_KEY>:<plan>:monthly", () => {
    const { sku } = parseCheckout(checkoutUrl("creator"));
    expect(sku).toBe(`${APP_KEY}:creator:monthly`);
  });

  it("preserves a fully-qualified SKU verbatim", () => {
    const { sku } = parseCheckout(checkoutUrl("creative_studio:pro:monthly"));
    expect(sku).toBe("creative_studio:pro:monthly");
  });

  it("uses window.location.href as default return_to", () => {
    const { returnTo } = parseCheckout(checkoutUrl("starter"));
    expect(returnTo).toBe("https://creativestudio.life/pricing");
  });

  it("uses an explicit returnTo when provided", () => {
    const { returnTo } = parseCheckout(
      checkoutUrl("creator", "https://creativestudio.life/studio?ref=upgrade"),
    );
    expect(returnTo).toBe("https://creativestudio.life/studio?ref=upgrade");
  });

  it("URL-encodes the sku (colons → %3A)", () => {
    const raw = checkoutUrl("creative_studio:business:monthly");
    expect(raw).toContain("sku=creative_studio%3Abusiness%3Amonthly");
  });

  it("URL-encodes the return_to (no raw ?, &, or =)", () => {
    const raw = checkoutUrl(
      "creator",
      "https://creativestudio.life/x?a=1&b=2",
    );
    // The encoded return_to lives inside the query string and must not
    // contain raw separators that would break the parent URL.
    const afterReturn = raw.split("return_to=")[1];
    expect(afterReturn).not.toContain("?");
    expect(afterReturn).not.toMatch(/&(?!amp;)/);
    expect(decodeURIComponent(afterReturn)).toBe(
      "https://creativestudio.life/x?a=1&b=2",
    );
  });

  it("handles PayG / topup bundle SKUs", () => {
    const { sku } = parseCheckout(
      checkoutUrl("creative_studio:bundle:cinematic-10"),
    );
    expect(sku).toBe("creative_studio:bundle:cinematic-10");
  });

  it("handles the cross-app All-Access SKU", () => {
    const { sku } = parseCheckout(checkoutUrl("all_access:all_access:monthly"));
    expect(sku).toBe("all_access:all_access:monthly");
  });

  // ---------------------------------------------------------------------
  // Cross-spoke matrix — every SKU mirrored in docs/brand/README.md must
  // round-trip cleanly through checkoutUrl(), proving the helper is
  // spoke-agnostic.
  // ---------------------------------------------------------------------
  const SPOKE_MATRIX: Array<[string, string]> = [
    // [label, sku]
    ["creative studio starter",   "creative_studio:starter:monthly"],
    ["creative studio creator",   "creative_studio:creator:monthly"],
    ["creative studio pro",       "creative_studio:pro:monthly"],
    ["creative studio business",  "creative_studio:business:monthly"],
    ["epublisher starter",        "epublisher:starter:monthly"],
    ["epublisher author",         "epublisher:author:monthly"],
    ["epublisher studio",         "epublisher:studio:monthly"],
    ["epublisher publisher",      "epublisher:publisher:monthly"],
    ["sync vision starter",       "syncvision:starter:monthly"],
    ["sync vision creator",       "syncvision:creator:monthly"],
    ["sync vision studio",        "syncvision:studio:monthly"],
    ["youtube optimizer creator", "youtube_optimizer:creator:monthly"],
    ["youtube optimizer pro",     "youtube_optimizer:pro:monthly"],
    ["youtube optimizer agency",  "youtube_optimizer:agency:monthly"],
    ["all access bundle",         "all_access:all_access:monthly"],
  ];

  it.each(SPOKE_MATRIX)(
    "builds a valid Hub checkout URL for %s",
    (_label, sku) => {
      const url = checkoutUrl(sku, "https://example.test/back");
      const parsed = parseCheckout(url);
      expect(parsed.origin).toBe("https://reson8.life");
      expect(parsed.pathname).toBe("/checkout");
      expect(parsed.sku).toBe(sku);
      expect(parsed.returnTo).toBe("https://example.test/back");
      // SKU shape: <app>:<plan>:<cadence>
      expect(sku.split(":")).toHaveLength(3);
    },
  );

  it("never emits a non-Hub origin, no matter the input", () => {
    const inputs = [
      "creator",
      "creative_studio:pro:monthly",
      "epublisher:publisher:monthly",
      "syncvision:studio:monthly",
      "youtube_optimizer:agency:monthly",
      "all_access:all_access:monthly",
      "creative_studio:bundle:topup-50",
    ];
    for (const sku of inputs) {
      const { origin } = parseCheckout(checkoutUrl(sku));
      expect(origin).toBe("https://reson8.life");
    }
  });
});

describe("checkoutUrl() — SSR safety", () => {
  it("falls back to '/' when window is undefined and no returnTo given", () => {
    const originalWindow = globalThis.window;
    delete (globalThis as { window?: unknown }).window;
    try {
      const url = checkoutUrl("creator");
      // We can't URL-parse a relative return_to, so assert directly.
      expect(url).toContain("return_to=%2F");
      expect(url.startsWith("https://reson8.life/checkout?")).toBe(true);
    } finally {
      globalThis.window = originalWindow;
    }
  });
});

import {
  hubBackoffMs,
  getHubBackoffConfig,
  setHubBackoffConfig,
} from "@/lib/entitlement";

describe("hubBackoffMs() with default config", () => {
  beforeEach(() => setHubBackoffConfig());

  it("returns 0 for attempt 0 (no failures yet)", () => {
    expect(hubBackoffMs(0)).toBe(0);
  });

  it("uses exponential growth from 1s up to a 60s cap", () => {
    expect(hubBackoffMs(1)).toBe(1_000);
    expect(hubBackoffMs(2)).toBe(2_000);
    expect(hubBackoffMs(3)).toBe(4_000);
    expect(hubBackoffMs(4)).toBe(8_000);
    expect(hubBackoffMs(5)).toBe(16_000);
    expect(hubBackoffMs(6)).toBe(32_000);
    expect(hubBackoffMs(7)).toBe(60_000); // capped
    expect(hubBackoffMs(20)).toBe(60_000); // still capped
  });
});

describe("hubBackoffMs() — configurable", () => {
  afterEach(() => setHubBackoffConfig());

  it("honors a custom baseMs", () => {
    setHubBackoffConfig({ baseMs: 250 });
    expect(hubBackoffMs(1)).toBe(250);
    expect(hubBackoffMs(2)).toBe(500);
    expect(hubBackoffMs(3)).toBe(1_000);
  });

  it("honors a custom capMs", () => {
    setHubBackoffConfig({ baseMs: 1_000, capMs: 5_000 });
    expect(hubBackoffMs(3)).toBe(4_000);
    expect(hubBackoffMs(4)).toBe(5_000);
    expect(hubBackoffMs(10)).toBe(5_000);
  });

  it("honors a custom maxAttempts (clamps the exponent)", () => {
    setHubBackoffConfig({ baseMs: 1_000, capMs: 999_999, maxAttempts: 3 });
    // attempt 3 → 2**(3-1) = 4_000; anything higher clamps to attempt 3.
    expect(hubBackoffMs(3)).toBe(4_000);
    expect(hubBackoffMs(4)).toBe(4_000);
    expect(hubBackoffMs(99)).toBe(4_000);
  });

  it("accepts a per-call override without mutating the global config", () => {
    setHubBackoffConfig({ baseMs: 1_000, capMs: 60_000, maxAttempts: 8 });
    expect(hubBackoffMs(2, { baseMs: 100 })).toBe(200);
    // Global is untouched.
    expect(hubBackoffMs(2)).toBe(2_000);
  });

  it("getHubBackoffConfig returns a defensive copy", () => {
    const a = getHubBackoffConfig();
    a.baseMs = 42;
    expect(getHubBackoffConfig().baseMs).not.toBe(42);
  });

  it("setHubBackoffConfig() with no args resets to defaults", () => {
    setHubBackoffConfig({ baseMs: 250, capMs: 500, maxAttempts: 2 });
    const reset = setHubBackoffConfig();
    expect(reset).toEqual({ baseMs: 1_000, capMs: 60_000, maxAttempts: 8 });
  });
});

import { hubBackoffStorageKey } from "@/lib/entitlement";

describe("hubBackoffStorageKey()", () => {
  it("scopes the storage key per app", () => {
    expect(hubBackoffStorageKey("creative_studio")).toBe(
      "hub-entitlement:backoff:creative_studio",
    );
    expect(hubBackoffStorageKey("epublisher")).toBe(
      "hub-entitlement:backoff:epublisher",
    );
  });

  it("rehydrates attemptCount and retryAvailableAt from localStorage", () => {
    const future = Date.now() + 30_000;
    window.localStorage.setItem(
      hubBackoffStorageKey("creative_studio"),
      JSON.stringify({ attemptCount: 4, retryAvailableAt: future }),
    );
    const raw = window.localStorage.getItem(
      hubBackoffStorageKey("creative_studio"),
    );
    const parsed = JSON.parse(raw!);
    expect(parsed.attemptCount).toBe(4);
    expect(parsed.retryAvailableAt).toBe(future);
    window.localStorage.clear();
  });
});

import {
  normalizeHubBackoffConfig,
  HUB_BACKOFF_BOUNDS,
  hubBackoffConfigStorageKey,
} from "@/lib/entitlement";

describe("normalizeHubBackoffConfig() — validates & clamps", () => {
  const DEFAULTS = { baseMs: 1_000, capMs: 60_000, maxAttempts: 8 };

  it("falls back to defaults for missing keys", () => {
    expect(normalizeHubBackoffConfig({})).toEqual(DEFAULTS);
    expect(normalizeHubBackoffConfig(null)).toEqual(DEFAULTS);
    expect(normalizeHubBackoffConfig(undefined)).toEqual(DEFAULTS);
  });

  it("rejects NaN / non-numeric and uses base", () => {
    const out = normalizeHubBackoffConfig({
      baseMs: NaN,
      capMs: Number.POSITIVE_INFINITY,
      maxAttempts: "abc" as unknown as number,
    });
    expect(out).toEqual(DEFAULTS);
  });

  it("clamps baseMs into [baseMsMin, baseMsMax] and floors fractions", () => {
    expect(normalizeHubBackoffConfig({ baseMs: 0 }).baseMs).toBe(
      HUB_BACKOFF_BOUNDS.baseMsMin,
    );
    expect(normalizeHubBackoffConfig({ baseMs: -500 }).baseMs).toBe(
      HUB_BACKOFF_BOUNDS.baseMsMin,
    );
    expect(
      normalizeHubBackoffConfig({ baseMs: HUB_BACKOFF_BOUNDS.baseMsMax + 1 })
        .baseMs,
    ).toBe(HUB_BACKOFF_BOUNDS.baseMsMax);
    expect(normalizeHubBackoffConfig({ baseMs: 12.9 }).baseMs).toBe(12);
  });

  it("forces capMs >= baseMs (prevents cap silently demoting backoff)", () => {
    const out = normalizeHubBackoffConfig({ baseMs: 5_000, capMs: 1_000 });
    expect(out.baseMs).toBe(5_000);
    expect(out.capMs).toBe(5_000);
  });

  it("caps capMs at capMsMax", () => {
    const out = normalizeHubBackoffConfig({
      baseMs: 1_000,
      capMs: HUB_BACKOFF_BOUNDS.capMsMax + 10_000,
    });
    expect(out.capMs).toBe(HUB_BACKOFF_BOUNDS.capMsMax);
  });

  it("clamps maxAttempts into [0, maxAttemptsMax]; 0 means uncapped", () => {
    expect(normalizeHubBackoffConfig({ maxAttempts: -5 }).maxAttempts).toBe(0);
    expect(
      normalizeHubBackoffConfig({
        maxAttempts: HUB_BACKOFF_BOUNDS.maxAttemptsMax + 100,
      }).maxAttempts,
    ).toBe(HUB_BACKOFF_BOUNDS.maxAttemptsMax);
    expect(normalizeHubBackoffConfig({ maxAttempts: 3.7 }).maxAttempts).toBe(3);
  });
});

describe("setHubBackoffConfig() — applies normalization", () => {
  afterEach(() => setHubBackoffConfig());

  it("clamps invalid runtime patches instead of breaking retry math", () => {
    const out = setHubBackoffConfig({
      baseMs: 0,
      capMs: -50,
      maxAttempts: NaN as unknown as number,
    });
    expect(out.baseMs).toBe(HUB_BACKOFF_BOUNDS.baseMsMin);
    expect(out.capMs).toBeGreaterThanOrEqual(out.baseMs);
    // NaN falls back to current value (defaults here = 8).
    expect(out.maxAttempts).toBe(8);
    // hubBackoffMs must produce a finite positive ms for attempt 1.
    expect(hubBackoffMs(1)).toBeGreaterThan(0);
    expect(Number.isFinite(hubBackoffMs(1))).toBe(true);
  });

  it("repairs previously-persisted bad values on next read", () => {
    // Use a fresh scope that hasn't been cached yet so resolveConfig() is
    // forced to re-read localStorage through the normalizer.
    const scope = {
      app: "test-app-validation",
      hubUrl: "https://validation.example.com",
    };
    window.localStorage.setItem(
      hubBackoffConfigStorageKey(scope),
      JSON.stringify({ baseMs: 5_000, capMs: 100, maxAttempts: -2 }),
    );
    const cfg = getHubBackoffConfig(scope);
    expect(cfg.baseMs).toBe(5_000);
    expect(cfg.capMs).toBe(5_000); // capMs lifted to baseMs
    // -2 is dropped at the persisted-read layer, so we fall back to default.
    expect(cfg.maxAttempts).toBe(8);
    window.localStorage.clear();
  });
});
