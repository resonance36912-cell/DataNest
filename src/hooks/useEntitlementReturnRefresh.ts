import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CHECKOUT_RETURN_PARAM,
  ENTITLEMENT_QUERY_KEY,
  type Entitlement,
} from "@/lib/entitlement";

const POLL_INTERVALS_MS = [0, 1500, 3000, 5000, 8000]; // up to ~17.5s, covers Hub webhook lag

/**
 * Detects a return from Hub checkout (?checkout=success|cancelled), strips the
 * marker from the URL, and polls the entitlement query until the user's tier
 * leaves "free" or we time out. Mount once high in the tree.
 *
 * Returns { refreshing } so callers (PaywallGate, etc.) can show a "verifying
 * subscription…" state instead of flashing the paywall before the Hub webhook
 * has provisioned the entitlement.
 */
export function useEntitlementReturnRefresh() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const marker = url.searchParams.get(CHECKOUT_RETURN_PARAM);
    if (!marker) return;
    handled.current = true;

    // Strip the marker so refreshes don't re-trigger the flow
    url.searchParams.delete(CHECKOUT_RETURN_PARAM);
    window.history.replaceState({}, "", url.toString());

    if (marker === "cancelled") {
      toast.message("Checkout cancelled — no changes to your pack.");
      return;
    }

    setRefreshing(true);
    let cancelled = false;
    const toastId = toast.loading("Activating your pack…");

    (async () => {
      for (let i = 0; i < POLL_INTERVALS_MS.length; i++) {
        if (cancelled) return;
        if (POLL_INTERVALS_MS[i] > 0) {
          await new Promise((r) => setTimeout(r, POLL_INTERVALS_MS[i]));
          if (cancelled) return;
        }
        await qc.invalidateQueries({ queryKey: ENTITLEMENT_QUERY_KEY, refetchType: "all" });
        const next = qc.getQueryData<Entitlement>(ENTITLEMENT_QUERY_KEY);
        const upgraded =
          !!next && next.tier && next.tier !== "free" &&
          (next.status === "active" || next.status === "past_due");
        if (upgraded) {
          toast.success(`Pack active: ${next.tier} ✨`, { id: toastId });
          setRefreshing(false);
          return;
        }
      }
      if (!cancelled) {
        toast.warning(
          "Pack not visible yet — this can take a moment. Refresh in a few seconds.",
          { id: toastId },
        );
        setRefreshing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [qc]);

  return { refreshing };
}
