import * as React from "react";
import { useEntitlement, type Tier, tierMeets } from "@/lib/entitlement";
import { useEntitlementReturnRefresh } from "@/hooks/useEntitlementReturnRefresh";
import { PaywallPrompt } from "./PaywallPrompt";
import { FREE_PROMOTION_ACTIVE } from "@/lib/promotion";


/**
 * <PaywallGate />
 * Gates a feature behind a minimum tier on the user's entitlement for this app.
 * If the user doesn't meet `minTier`, renders the fallback CTA pointing at the
 * Hub checkout for `upgradeSku`.
 *
 *   <PaywallGate minTier="creator" upgradeSku="sync_vision:creator:monthly">
 *     <AiVideoGenerationPanel />
 *   </PaywallGate>
 */
export function PaywallGate({
  minTier,
  upgradeSku,
  featureLabel = "This feature",
  reason,
  fallback,
  loading,
  children,
}: {
  minTier: Exclude<Tier, null | "free">;
  upgradeSku: string;
  /** Human label shown in the paywall ("HD Rendering", "Final Video Merge"…) */
  featureLabel?: string;
  /** Optional one-sentence explanation of why the feature is paid. */
  reason?: string;
  fallback?: React.ReactNode;
  loading?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { data, isLoading, error } = useEntitlement();
  const { refreshing } = useEntitlementReturnRefresh();

  if (FREE_PROMOTION_ACTIVE) return <>{children}</>;

  // Hold the gate while we're verifying a fresh post-checkout entitlement,
  // so the paywall doesn't flash before the Hub webhook lands.
  if (isLoading || refreshing) {
    return (
      <>
        {loading ?? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/60">
            {refreshing ? "Verifying your access…" : "Checking access…"}
          </div>
        )}
      </>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
        Couldn&apos;t check your access. Please try again later.
      </div>
    );
  }

  const tier = (data?.tier ?? "free") as Tier;
  const hasAccess = data?.status === "active" || data?.status === "past_due";
  if (hasAccess && tierMeets(tier, minTier)) {
    return <>{children}</>;
  }

  return (
    <>
      {fallback ?? (
        <PaywallPrompt
          featureLabel={featureLabel}
          requiredTier={minTier}
          currentTier={tier}
          sku={upgradeSku}
          reason={reason}
        />
      )}
    </>
  );
}
