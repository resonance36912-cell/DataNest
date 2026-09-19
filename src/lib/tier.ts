// Free vs Premium tier helpers — single source of truth for client-side gating.
// Free  = Lovable AI free models only (poster, social copy). No quotas.
// Premium = Cinematic video, premium poster model, voiceover + jingles.
// Billing flows through the Hub at reson8.life (see entitlement.ts).

import { useMemo } from "react";
import { useEntitlement, tierMeets, type Tier } from "./entitlement";
import { useToast } from "@/hooks/use-toast";
import { checkoutUrl } from "./entitlement";
import { FREE_PROMOTION_ACTIVE } from "./promotion";

export const PREMIUM_SKU = "creative_studio:premium:monthly";

/** Feature flags gated to premium users. Mirrored on the server in _shared/tier.ts. */
export const PREMIUM_FEATURES = {
  posterPremiumModel: true,
  cinematicVideo: true,
  voiceover: true,
  jingle: true,
} as const;

export type PremiumFeature = keyof typeof PREMIUM_FEATURES;

export const PREMIUM_FEATURE_LABELS: Record<PremiumFeature, string> = {
  posterPremiumModel: "Premium poster model",
  cinematicVideo: "Cinematic video (Kling 2.1)",
  voiceover: "AI voiceover",
  jingle: "Custom jingles",
};

/** Any paid tier (starter and above) counts as Premium for this app. */
export function useTier() {
  const { entitlement, isLoading } = useEntitlement();
  return useMemo(() => {
    const tier = (entitlement?.tier ?? "free") as Tier;
    const isPremium =
      FREE_PROMOTION_ACTIVE || (!!entitlement?.hasAccess && tierMeets(tier, "starter"));
    return { tier, isPremium, isLoading: FREE_PROMOTION_ACTIVE ? false : isLoading };
  }, [entitlement, isLoading]);
}

/**
 * Imperative gate for click handlers on premium-only buttons. Returns true
 * when the user can proceed; false after showing an upgrade toast.
 *
 *   const guard = usePremiumGate();
 *   const onClick = () => { if (!guard("cinematicVideo")) return; doIt(); };
 */
export function usePremiumGate() {
  const { isPremium, isLoading } = useTier();
  const { toast } = useToast();
  return (feature: PremiumFeature): boolean => {
    if (isLoading) return false;
    if (isPremium) return true;
    toast({
      title: `${PREMIUM_FEATURE_LABELS[feature]} is a Premium feature`,
      description: "Upgrade to unlock — your free tier covers posters and copy.",
      action: undefined,
    });
    // Soft-redirect after the toast renders so the user sees context.
    setTimeout(() => {
      window.open(checkoutUrl(PREMIUM_SKU), "_blank", "noopener,noreferrer");
    }, 600);
    return false;
  };
}
