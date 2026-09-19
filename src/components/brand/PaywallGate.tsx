import * as React from "react";
import { useEntitlement, tierMeets, type Tier } from "@/lib/entitlement";
import { CheckoutButton } from "./CheckoutButton";
import { FREE_PROMOTION_ACTIVE } from "@/lib/promotion";

/**
 * <PaywallGate app="creative_studio" minTier="creator" upgradeSku="creative_studio:bundle:payg-poster-pack">
 *   <Premium />
 * </PaywallGate>
 * Gates a feature until the user has enough Hub access. CTA sends them to
 * buy a project pack or credits on The Resonance Hub — no app subscription.
 */
export function PaywallGate({
  app = "creative_studio",
  minTier,
  upgradeSku,
  fallback,
  loading,
  children,
}: {
  app?: string;
  minTier: Exclude<Tier, "free" | null>;
  upgradeSku: string;
  fallback?: React.ReactNode;
  loading?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { entitlement, isLoading, error } = useEntitlement(app);

  if (FREE_PROMOTION_ACTIVE) return <>{children}</>;
  if (isLoading) return <>{loading ?? null}</>;
  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive-foreground">
        Couldn&apos;t check your Hub access. {error.message}
      </div>
    );
  }

  const tier = (entitlement?.tier ?? "free") as Tier;
  if (entitlement?.hasAccess && tierMeets(tier, minTier)) {
    return <>{children}</>;
  }


  return (
    <>
      {fallback ?? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
          <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground mb-2">
            Requires {minTier} access
          </p>
          <h3 className="font-display text-xl font-bold mb-2">Unlock this feature</h3>
          <p className="text-muted-foreground text-sm mb-5">
            Buy a project pack or credits through The Resonance Hub to unlock it here.
          </p>
          <CheckoutButton sku={upgradeSku}>Buy pack →</CheckoutButton>
        </div>
      )}
    </>
  );
}
