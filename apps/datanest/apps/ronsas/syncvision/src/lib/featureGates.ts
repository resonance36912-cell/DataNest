/**
 * Sync Vision feature → minimum tier matrix.
 * Centralizes every gated capability so paywall UI and runtime checks stay
 * in sync. Update this matrix in one place to re-tier the whole app.
 *
 * Tier order (low → high): free < starter < creator < pro < business < all_access
 */
import { useEffect, useState } from "react";
import { useEntitlement, type Tier, tierMeets, syncVisionSku } from "@/lib/entitlement";
import { useTierRequired, type TierRequiredError } from "@/lib/tierRequired";

/* ---------------------------------------------------------------- *
 * Local coupon-unlock overrides
 * ----------------------------------------------------------------
 * When a user redeems a coupon that grants access to a feature, the Hub's
 * entitlement record can take seconds to propagate. We persist a local
 * override per feature so the gate flips to `allowed` immediately and
 * survives a reload.
 * ---------------------------------------------------------------- */

const COUPON_UNLOCK_KEY = "sv:coupon:feature-unlocks";
const COUPON_UNLOCK_EVENT = "sv:coupon:feature-unlock";

function readUnlocks(): Record<string, number> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(COUPON_UNLOCK_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch { return {}; }
}

function writeUnlocks(map: Record<string, number>) {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(COUPON_UNLOCK_KEY, JSON.stringify(map)); } catch {/* noop */}
}

/** Mark a feature as unlocked by coupon for `ttlMs` (default: 24h). */
export function grantCouponUnlock(feature: GatedFeature, ttlMs = 24 * 60 * 60_000) {
  const map = readUnlocks();
  map[feature] = Date.now() + ttlMs;
  writeUnlocks(map);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(COUPON_UNLOCK_EVENT, { detail: { feature } }));
  }
}

function hasCouponUnlock(feature: GatedFeature): boolean {
  const map = readUnlocks();
  const exp = map[feature];
  if (!exp) return false;
  if (Date.now() > exp) {
    delete map[feature];
    writeUnlocks(map);
    return false;
  }
  return true;
}

/** Returns true if ANY gated feature currently has an active local coupon unlock. */
export function hasAnyCouponUnlock(): boolean {
  const map = readUnlocks();
  const now = Date.now();
  return Object.values(map).some((exp) => typeof exp === "number" && exp > now);
}

function useCouponUnlock(feature: GatedFeature): boolean {
  const [unlocked, setUnlocked] = useState(() => hasCouponUnlock(feature));
  useEffect(() => {
    const refresh = () => setUnlocked(hasCouponUnlock(feature));
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.feature === feature) refresh();
    };
    window.addEventListener(COUPON_UNLOCK_EVENT, onCustom);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(COUPON_UNLOCK_EVENT, onCustom);
      window.removeEventListener("storage", refresh);
    };
  }, [feature]);
  return unlocked;
}

/** Reactive variant of {@link hasAnyCouponUnlock} for components. */
export function useHasAnyCouponUnlock(): boolean {
  const [unlocked, setUnlocked] = useState(() => hasAnyCouponUnlock());
  useEffect(() => {
    const refresh = () => setUnlocked(hasAnyCouponUnlock());
    window.addEventListener(COUPON_UNLOCK_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(COUPON_UNLOCK_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return unlocked;
}

export type GatedFeature =
  | "ai_character_gen"   // /character: AI generate / generate from details / enhance
  | "storyboard_video"   // /storyboard: per-scene video generation (WAN 2.5, Runway, etc.)
  | "hd_render"          // /export: upgrade preview clips to HD
  | "assembly_merge";    // /export: final FFmpeg merge into a single MP4

type MinTier = Exclude<Tier, null | "free">;

export interface FeatureSpec {
  /** Minimum tier the user must hold (active or past_due) to use the feature. */
  minTier: MinTier;
  /** Short label shown in paywall fallbacks ("Requires creator"). */
  label: string;
  /** Hub SKU the upgrade CTA should send the user to. */
  sku: string;
}

export const FEATURE_GATES: Record<GatedFeature, FeatureSpec> = {
  ai_character_gen: {
    minTier: "creator",
    label: "AI Character Generation",
    sku: syncVisionSku("creator"),
  },
  storyboard_video: {
    minTier: "creator",
    label: "Scene Video Generation",
    sku: syncVisionSku("creator"),
  },
  hd_render: {
    minTier: "pro",
    label: "HD Rendering",
    sku: syncVisionSku("pro"),
  },
  assembly_merge: {
    minTier: "creator",
    label: "Final Video Merge",
    sku: syncVisionSku("creator"),
  },
};

export interface FeatureGateState {
  /** True once entitlement has loaded AND the user meets the required tier. */
  allowed: boolean;
  /** Entitlement still loading — UI should show a "checking access" state. */
  loading: boolean;
  /** True when entitlement fetch errored — treat as blocked. */
  error: boolean;
  /** The user's current tier (or "free" when nothing is set). */
  currentTier: Tier;
  /** The minimum tier required by this feature. */
  requiredTier: MinTier;
  /** Hub checkout SKU for the upgrade CTA. */
  sku: string;
  /** Human-friendly label for paywalls. */
  label: string;
  /**
   * Latest server-side denial recorded via `invokeGated` / `fetchGated`.
   * When present, the gate is forced to `allowed=false` regardless of the
   * cached Hub tier, so a mid-session revocation immediately propagates
   * to every gated UI.
   */
  serverDenied: TierRequiredError | null;
  /** Convenience for banners: "hub" (tier too low), "server" (edge denied), or null. */
  denialSource: "hub" | "server" | null;
}

/**
 * Resolves the user's entitlement against a single feature gate.
 *
 * Server-first: if a gated Edge Function has returned `HTTP 402 tier_required`
 * during this session, we honor that denial even when the Hub cache still
 * reports a paying tier — the server is authoritative for billing.
 *
 * Use in any component that needs inline gating (disabled buttons, lock chips,
 * conditional rendering, etc.). For full panel gating, prefer <PaywallGate />.
 */
export function useFeatureGate(feature: GatedFeature): FeatureGateState {
  const spec = FEATURE_GATES[feature];
  const { data, isLoading, error } = useEntitlement();
  const couponUnlocked = useCouponUnlock(feature);
  const serverDenied = useTierRequired(feature);
  const currentTier = (data?.tier ?? "free") as Tier;
  const hasAccess = data?.status === "active" || data?.status === "past_due";
  const tierAllowed = !isLoading && !error && hasAccess && tierMeets(currentTier, spec.minTier);
  const baseAllowed = tierAllowed || couponUnlocked;

  // Server denials are only cleared by a subsequent successful gated call
  // (see `invokeGated`) — NOT by a Hub-cache read that disagrees. The server
  // is authoritative for billing, and auto-clearing on the Hub cache would
  // create a retry loop for users the server has actually revoked.

  const allowed = baseAllowed && !serverDenied;
  const denialSource: "hub" | "server" | null = allowed
    ? null
    : serverDenied
      ? "server"
      : "hub";

  return {
    allowed,
    loading: isLoading && !couponUnlocked && !serverDenied,
    error: !!error && !couponUnlocked && !serverDenied,
    currentTier: (serverDenied?.current_tier ?? currentTier) as Tier,
    requiredTier: (serverDenied?.required_tier ?? spec.minTier) as MinTier,
    sku: spec.sku,
    label: spec.label,
    serverDenied,
    denialSource,
  };
}
