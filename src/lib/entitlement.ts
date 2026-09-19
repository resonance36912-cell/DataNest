/**
 * Resonance Hub entitlement contract — see HUB_PAYMENTS_INTEGRATION.md.
 * All billing for Sync Vision lives in the Hub at https://reson8.life.
 * This app only READS the user's current tier; it never runs PayFast itself.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  OWNER_BETA_ACCESS,
  isOwnerBetaCode,
  isOwnerBetaEligible,
} from "@/lib/betaAccess";
import { FREE_PROMOTION_ACTIVE, FREE_PROMOTION_TIER } from "@/lib/promotion";

export type Tier = "free" | "starter" | "creator" | "pro" | "business" | "all_access" | null;

export type Entitlement = {
  app: string;
  userId: string;
  tier: Tier;
  status: "active" | "inactive" | "pending" | "past_due" | "cancelled";
  currentPeriodEnd: string | null;
  hasAccess: boolean;
  source: "bundle" | "direct" | "none";
  /** Where this entitlement record originated on the current client. */
  _source?: "cache" | "fresh" | "fallback";
  /** Timestamp (ms) when this record was fetched or read from cache. */
  _fetchedAt?: number;
  /** True when access was granted by the private owner beta programme. */
  _beta?: boolean;
};

export const APP_KEY = "sync_vision" as const;
export const HUB_URL = "https://reson8.life" as const;
export const ENTITLEMENT_QUERY_KEY = ["entitlement", APP_KEY] as const;

/** Query-param marker the Hub preserves when redirecting back after checkout. */
export const CHECKOUT_RETURN_PARAM = "checkout" as const;

const FALLBACK: Entitlement = {
  app: APP_KEY,
  userId: "",
  tier: "free",
  status: "inactive",
  currentPeriodEnd: null,
  hasAccess: false,
  source: "none",
  _source: "fallback",
  _fetchedAt: Date.now(),
};

/**
 * Short-lived cross-mount cache for Hub entitlement reads.
 * Survives component remounts and full page reloads within the same tab so
 * that admin/user workflows don't re-hit reson8.life on every navigation.
 * TTL kept intentionally small so post-checkout tier changes propagate quickly.
 */
export const ENTITLEMENT_CACHE_TTL_MS = 60_000;
const ENTITLEMENT_CACHE_KEY = "sv:entitlement:sync_vision";

type CacheEntry = { ts: number; uid: string; data: Entitlement };

function readCache(uid: string): Entitlement | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ENTITLEMENT_CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (entry.uid !== uid) return null;
    if (Date.now() - entry.ts > ENTITLEMENT_CACHE_TTL_MS) return null;
    return { ...entry.data, _source: "cache", _fetchedAt: entry.ts };
  } catch {
    return null;
  }
}

function writeCache(uid: string, data: Entitlement) {
  if (typeof sessionStorage === "undefined") return;
  try {
    const entry: CacheEntry = { ts: Date.now(), uid, data };
    sessionStorage.setItem(ENTITLEMENT_CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* quota / private mode — best effort only */
  }
}

export function clearEntitlementCache() {
  if (typeof sessionStorage === "undefined") return;
  try { sessionStorage.removeItem(ENTITLEMENT_CACHE_KEY); } catch { /* noop */ }
}

async function fetchLocalCouponTier(uid: string): Promise<Entitlement | null> {
  // A locally-redeemed `tier` coupon (e.g. ALLACCESS) should unlock the app
  // immediately, even if the Hub doesn't know about it. Pick the highest
  // active tier among the user's non-expired tier redemptions.
  try {
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from("coupon_redemptions")
      .select("code, tier, expires_at, created_at")
      .eq("user_id", uid)
      .eq("type", "tier")
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!data || data.length === 0) return null;
    let best: { code: string; tier: Tier; expires: string | null } | null = null;
    for (const row of data) {
      const t = (row.tier as Tier) ?? null;
      if (!t || t === "free") continue;
      if (!best || ORDER.indexOf(t) > ORDER.indexOf(best.tier)) {
        best = {
          code: String(row.code || ""),
          tier: t,
          expires: (row.expires_at as string | null) ?? null,
        };
      }
    }
    if (!best) return null;
    return {
      app: APP_KEY,
      userId: uid,
      tier: best.tier,
      status: "active",
      currentPeriodEnd: best.expires,
      hasAccess: true,
      source: "direct",
      _source: "fresh",
      _fetchedAt: Date.now(),
      _beta: isOwnerBetaCode(best.code),
    };
  } catch {
    return null;
  }
}

async function ensureOwnerBetaTier(email: string | null | undefined): Promise<void> {
  if (!isOwnerBetaEligible(email)) return;
  try {
    await supabase.functions.invoke("redeem-coupon", {
      body: { code: OWNER_BETA_ACCESS.code, validate: false },
    });
  } catch {
    // The entitlement read below remains authoritative and fails closed. A
    // transient coupon-service failure must not create a client-only bypass.
  }
}

async function fetchCookieEntitlement(): Promise<Entitlement> {
  try {
    const res = await fetch("/_rons/session", { credentials: "include", cache: "no-store", headers: { Accept: "application/json" } });
    if (!res.ok) return FALLBACK;
    const raw = await res.json() as Record<string, unknown>;
    if (!raw.authenticated) return FALLBACK;
    if (FREE_PROMOTION_ACTIVE) {
      return {
        app: APP_KEY,
        userId: String(raw.userId ?? raw.user_id ?? "promotion-user"),
        tier: FREE_PROMOTION_TIER,
        status: "active",
        currentPeriodEnd: null,
        hasAccess: true,
        source: "bundle",
        _source: "fresh",
        _fetchedAt: Date.now(),
      };
    }
    return {
      app: APP_KEY, userId: String(raw.userId ?? raw.user_id ?? ""),
      tier: (raw.tier as Tier) ?? "free", status: (raw.status as Entitlement["status"]) ?? "inactive",
      currentPeriodEnd: (raw.currentPeriodEnd ?? raw.current_period_end ?? null) as string | null,
      hasAccess: Boolean(raw.hasAccess ?? raw.has_access),
      source: raw.source === "all_access" ? "bundle" : raw.source === "direct" ? "direct" : "none",
      _source: "fresh", _fetchedAt: Date.now(),
    };
  } catch { return FALLBACK; }
}

async function fetchEntitlement(): Promise<Entitlement> {
  const isLocal = typeof window !== "undefined" && (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost");
  if (!isLocal) return fetchCookieEntitlement();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return FALLBACK;
  const uid = session.user.id;
  if (FREE_PROMOTION_ACTIVE) {
    return {
      app: APP_KEY,
      userId: uid,
      tier: FREE_PROMOTION_TIER,
      status: "active",
      currentPeriodEnd: null,
      hasAccess: true,
      source: "bundle",
      _source: "fresh",
      _fetchedAt: Date.now(),
    };
  }
  const cached = readCache(uid);
  if (cached) return cached;

  // Private owner beta: enroll through the same server-authoritative coupon
  // path used by normal grants. This writes a real coupon_redemptions row, so
  // Edge Functions see the same All-Access tier before spending provider funds.
  await ensureOwnerBetaTier(session.user.email);

  // Sovereign-local owner mode uses only the local entitlement/coupon store.
  // Public paid access is resolved above through the HttpOnly RONS spoke cookie.
  let hub: Entitlement = FALLBACK;

  // Local tier coupons override when they grant a higher tier than the baseline.
  const local = await fetchLocalCouponTier(uid);
  let merged: Entitlement = hub;
  if (local) {
    const hubRank = hub.tier ? ORDER.indexOf(hub.tier) : -1;
    const localRank = ORDER.indexOf(local.tier!);
    if (localRank > hubRank) merged = local;
  }
  writeCache(uid, merged);
  return { ...merged, _source: "fresh", _fetchedAt: Date.now() };
}

export function useEntitlement() {
  return useQuery<Entitlement>({
    queryKey: ENTITLEMENT_QUERY_KEY,
    queryFn: fetchEntitlement,
    staleTime: ENTITLEMENT_CACHE_TTL_MS,
    gcTime: 5 * 60_000,
    // Respect staleTime on remount so navigations within the TTL window
    // hit the cache instead of re-fetching the Hub.
    refetchOnMount: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

/**
 * Returns a callback that forces a fresh entitlement fetch (e.g. after the
 * user dismisses a paywall or completes checkout in a new tab).
 */
export function useRefreshEntitlement() {
  const qc = useQueryClient();
  return useCallback(async () => {
    clearEntitlementCache();
    await qc.invalidateQueries({ queryKey: ENTITLEMENT_QUERY_KEY, refetchType: "all" });
  }, [qc]);
}

const ORDER: Tier[] = ["free", "starter", "creator", "pro", "business", "all_access"];
export function tierMeets(have: Tier, need: Exclude<Tier, null | "free">): boolean {
  if (FREE_PROMOTION_ACTIVE) return true;
  if (!have) return false;
  return ORDER.indexOf(have) >= ORDER.indexOf(need);
}

/**
 * Append the standard `?checkout=success` marker so the spoke can detect a
 * return from Hub checkout and refresh entitlement.
 */
export function appendCheckoutReturnMarker(url: string, value: "success" | "cancelled" = "success"): string {
  try {
    const u = new URL(url);
    u.searchParams.set(CHECKOUT_RETURN_PARAM, value);
    return u.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}${CHECKOUT_RETURN_PARAM}=${value}`;
  }
}

/**
 * Build a Hub checkout URL that returns the user back to the current page.
 * Matches the canonical Hub format `?app=<app>&plan=<plan>` used on
 * reson8.life/pricing. Accepts either a raw SKU (`sync_vision:creator:monthly`)
 * or a bare plan string (`creator`, `all_access`).
 */
export function hubCheckoutUrl(skuOrPlan: string, returnTo?: string, couponCode?: string) {
  if (FREE_PROMOTION_ACTIVE) return "/";
  const base = returnTo ?? (typeof window !== "undefined" ? window.location.href : HUB_URL);
  const back = appendCheckoutReturnMarker(base, "success");
  const parts = skuOrPlan.split(":");
  const app = parts.length >= 2 ? parts[0] : APP_KEY;
  const plan = parts.length >= 2 ? parts[1] : skuOrPlan;
  // Pick up any session-stashed coupon if caller didn't pass one explicitly.
  let coupon = couponCode;
  if (!coupon && typeof sessionStorage !== "undefined") {
    try {
      const raw = sessionStorage.getItem("sv:coupon:pending-discount");
      if (raw) coupon = (JSON.parse(raw) as { code?: string })?.code;
    } catch { /* noop */ }
  }
  const couponQs = coupon ? `&coupon=${encodeURIComponent(coupon)}` : "";
  return `${HUB_URL}/checkout?app=${encodeURIComponent(app)}&plan=${encodeURIComponent(plan)}&return_to=${encodeURIComponent(back)}${couponQs}`;
}

/** SKU builder for Sync Vision tiers (Hub sells Creator, Pro, Business). */
export function syncVisionSku(tier: "creator" | "pro" | "business", billing: "monthly" | "annual" = "monthly") {
  return `${APP_KEY}:${tier}:${billing}`;
}
