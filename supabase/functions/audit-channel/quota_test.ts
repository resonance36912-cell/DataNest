import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateQuota,
  fetchTier,
  fetchUsedThisPeriod,
  HUB_ENTITLEMENT_URL,
  TIER_CAPS,
  type Tier,
} from "./quota.ts";

const SUPABASE_URL =
  Deno.env.get("VITE_SUPABASE_URL") ?? "https://example.supabase.co";
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? "anon";

// -------- helpers --------------------------------------------------------

function makeFetcher(
  routes: Array<{
    match: (url: string, init?: RequestInit) => boolean;
    respond: () => Response;
  }>,
): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    for (const r of routes) {
      if (r.match(url, init)) return Promise.resolve(r.respond());
    }
    throw new Error(`No mock route for ${url}`);
  }) as typeof fetch;
}

function countResponse(total: number): Response {
  return new Response("[]", {
    status: 206,
    headers: { "content-range": `0-0/${total}` },
  });
}

// -------- evaluateQuota: each tier blocks exactly at its cap --------------

Deno.test("evaluateQuota — every tier blocks at its monthly cap with correct used/limit", () => {
  const tiers: Tier[] = ["free", "starter", "pro", "business"];
  for (const tier of tiers) {
    const limit = TIER_CAPS[tier];

    // One below cap → allowed
    const ok = evaluateQuota(tier, limit - 1);
    assertEquals(ok.allowed, true, `${tier} should allow at ${limit - 1}`);
    assertEquals(ok.tier, tier);
    assertEquals(ok.limit, limit);

    // At cap → blocked
    const blocked = evaluateQuota(tier, limit);
    assertEquals(blocked.allowed, false, `${tier} should block at ${limit}`);
    if (blocked.allowed) return;
    assertEquals(blocked.tier, tier);
    assertEquals(blocked.limit, limit);
    assertEquals(blocked.used, limit);
    assertStringIncludes(blocked.error, `${tier} plan`);
    assertStringIncludes(blocked.error, `${limit}/${limit}`);
    assertStringIncludes(blocked.upgradeUrl, "reson8.life/checkout");

    // Over cap → still blocked, used reported faithfully
    const over = evaluateQuota(tier, limit + 7);
    assertEquals(over.allowed, false);
    if (!over.allowed) assertEquals(over.used, limit + 7);
  }
});

// -------- fetchTier: hub entitlement parsing -----------------------------

Deno.test("fetchTier — active paid tier is honored", async () => {
  const fetcher = makeFetcher([
    {
      match: (u) => u === HUB_ENTITLEMENT_URL,
      respond: () =>
        new Response(JSON.stringify({ tier: "pro", status: "active" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    },
  ]);
  assertEquals(await fetchTier("Bearer x", fetcher), "pro");
});

Deno.test("fetchTier — cancelled paid tier falls back to free", async () => {
  const fetcher = makeFetcher([
    {
      match: (u) => u === HUB_ENTITLEMENT_URL,
      respond: () =>
        new Response(JSON.stringify({ tier: "pro", status: "cancelled" }), {
          status: 200,
        }),
    },
  ]);
  assertEquals(await fetchTier("Bearer x", fetcher), "free");
});

Deno.test("fetchTier — non-200 falls back to free", async () => {
  const fetcher = makeFetcher([
    {
      match: (u) => u === HUB_ENTITLEMENT_URL,
      respond: () => new Response("nope", { status: 500 }),
    },
  ]);
  assertEquals(await fetchTier("Bearer x", fetcher), "free");
});

// -------- fetchUsedThisPeriod: 30-day rolling window count ---------------

Deno.test("fetchUsedThisPeriod — parses count and uses a ~30-day window", async () => {
  let calledUrl = "";
  const fetcher = makeFetcher([
    {
      match: (u) => u.includes("/rest/v1/audit_usage"),
      respond: () => countResponse(17),
    },
  ]);
  const wrapped: typeof fetch = ((input, init) => {
    calledUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    return fetcher(input, init);
  }) as typeof fetch;

  const used = await fetchUsedThisPeriod(
    {
      supabaseUrl: "https://x.supabase.co",
      serviceRoleKey: "svc",
      userId: "user-123",
    },
    wrapped,
  );
  assertEquals(used, 17);
  assertStringIncludes(calledUrl, "user_id=eq.user-123");
  assertStringIncludes(calledUrl, "created_at=gte.");

  // Window boundary should be within a couple seconds of "30 days ago"
  const sinceIso = decodeURIComponent(
    calledUrl.split("created_at=gte.")[1] ?? "",
  );
  const sinceMs = new Date(sinceIso).getTime();
  const expected = Date.now() - 30 * 24 * 60 * 60 * 1000;
  if (Math.abs(sinceMs - expected) > 5_000) {
    throw new Error(`Window drift too large: ${sinceMs} vs ${expected}`);
  }
});

Deno.test("fetchUsedThisPeriod — '*' total is treated as 0", async () => {
  const fetcher = makeFetcher([
    {
      match: (u) => u.includes("/rest/v1/audit_usage"),
      respond: () =>
        new Response("[]", {
          status: 206,
          headers: { "content-range": "*/*" },
        }),
    },
  ]);
  const used = await fetchUsedThisPeriod(
    { supabaseUrl: "https://x", serviceRoleKey: "svc", userId: "u" },
    fetcher,
  );
  assertEquals(used, 0);
});

// -------- end-to-end 401: live edge function rejects missing JWT ---------

Deno.test("audit-channel — returns 401 when called without a JWT", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/audit-channel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      // No Authorization header on purpose
    },
    body: JSON.stringify({ channelInput: "@youtube" }),
  });
  const body = await res.json().catch(() => ({}));
  assertEquals(res.status, 401, `expected 401, got ${res.status}`);
  assertStringIncludes(
    (body.error ?? "").toString().toLowerCase(),
    "sign in required",
  );
});
