/**
 * Coupon redemption client — talks to the `redeem-coupon` edge function,
 * which proxies to the Hub (reson8.life). Hub is the source of truth.
 *
 * Three coupon types are supported:
 *  - "discount" → stash code in sessionStorage; appended to Hub checkout URL
 *  - "credits"  → invalidate user_credits query so balance reflects the top-up
 *  - "tier"     → clear entitlement cache + refetch so unlocked tier shows
 */
import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  clearEntitlementCache,
  ENTITLEMENT_QUERY_KEY,
} from "@/lib/entitlement";

export type CouponType = "discount" | "credits" | "tier";

export interface CouponResult {
  ok: boolean;
  type: CouponType | null;
  message: string;
  code: string;
  discount?: { kind: "percent" | "amount"; value: number; currency?: string };
  credits?: number;
  tier?: string;
  expires_at?: string;
}

const PENDING_DISCOUNT_KEY = "sv:coupon:pending-discount";
const PENDING_DISCOUNT_TTL_MS = 30 * 60_000; // 30 min

type PendingDiscount = { code: string; ts: number; label?: string };

export function setPendingDiscountCode(code: string, label?: string) {
  if (typeof sessionStorage === "undefined") return;
  try {
    const entry: PendingDiscount = { code: code.toUpperCase(), ts: Date.now(), label };
    sessionStorage.setItem(PENDING_DISCOUNT_KEY, JSON.stringify(entry));
  } catch {/* noop */}
}

export function getPendingDiscount(): PendingDiscount | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_DISCOUNT_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as PendingDiscount;
    if (Date.now() - entry.ts > PENDING_DISCOUNT_TTL_MS) {
      sessionStorage.removeItem(PENDING_DISCOUNT_KEY);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

export function clearPendingDiscountCode() {
  if (typeof sessionStorage === "undefined") return;
  try { sessionStorage.removeItem(PENDING_DISCOUNT_KEY); } catch {/* noop */}
}

async function callRedeem(code: string, validate: boolean): Promise<CouponResult> {
  const { data, error } = await supabase.functions.invoke("redeem-coupon", {
    body: { code, validate },
  });
  if (error) {
    let message = error.message ?? "Network error";
    const context = (error as { context?: unknown }).context;
    try {
      if (context instanceof Response) {
        const payload = await context.clone().json() as { message?: string; error?: string };
        message = payload.message || payload.error || message;
      }
    } catch {
      // Keep the transport message when the response has no JSON body.
    }
    return { ok: false, type: null, message, code };
  }
  return data as CouponResult;
}

/** Dry-run validation for live previews while user types. */
export function useValidateCoupon() {
  return useMutation<CouponResult, Error, string>({
    mutationFn: async (code: string) => callRedeem(code, true),
  });
}

/**
 * Actual redemption. On success, performs the type-specific side-effect:
 *  - discount → stores pending discount in sessionStorage
 *  - credits  → invalidates user_credits query
 *  - tier     → busts entitlement cache + invalidates entitlement query
 */
export function useRedeemCoupon() {
  const qc = useQueryClient();
  const mutate = useMutation<CouponResult, Error, string>({
    mutationFn: async (code: string) => callRedeem(code, false),
    onSuccess: async (result) => {
      if (!result.ok || !result.type) return;
      if (result.type === "discount") {
        setPendingDiscountCode(result.code, formatDiscountLabel(result));
      } else if (result.type === "credits") {
        await qc.invalidateQueries({ queryKey: ["user_credits"] });
      } else if (result.type === "tier") {
        clearEntitlementCache();
        await qc.invalidateQueries({ queryKey: ENTITLEMENT_QUERY_KEY, refetchType: "all" });
      }
    },
  });
  return mutate;
}

export function formatDiscountLabel(r: CouponResult): string {
  if (r.type === "discount" && r.discount) {
    return r.discount.kind === "percent"
      ? `${r.discount.value}% off`
      : `${r.discount.currency ?? ""}${r.discount.value} off`.trim();
  }
  if (r.type === "credits" && r.credits) return `+${r.credits} credits`;
  if (r.type === "tier" && r.tier) {
    return r.expires_at
      ? `Unlocks ${r.tier} until ${new Date(r.expires_at).toLocaleDateString()}`
      : `Unlocks ${r.tier}`;
  }
  return r.message;
}

/** Convenience hook for clearing a pending discount (e.g. user removes it). */
export function useClearPendingDiscount() {
  return useCallback(() => clearPendingDiscountCode(), []);
}
