import * as React from "react";
import { Lock, Sparkles, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FEATURE_GATES,
  type GatedFeature,
} from "@/lib/featureGates";
import {
  useAttemptedFeatures,
  clearAllFeatureAttempts,
  clearFeatureAttempt,
} from "@/lib/featureAttempts";
import {
  hubCheckoutUrl,
  syncVisionSku,
  tierMeets,
  useEntitlement,
  HUB_URL,
  type Tier,
} from "@/lib/entitlement";
import { useHasAnyCouponUnlock } from "@/lib/featureGates";
import { HUB_TIERS, tierDisplayName, type HubTier } from "@/lib/hubTiers";

type MinTier = HubTier;
const TIER_ORDER: MinTier[] = ["creator", "pro", "business", "all_access"];

/** Returns the highest minTier across the attempted features (the plan that
 *  unlocks every attempted feature in one step). */
function normalize(t: string): MinTier {
  // Legacy "starter" maps to Creator (Starter is not sold on the Hub).
  if (t === "starter") return "creator";
  return (TIER_ORDER as readonly string[]).includes(t) ? (t as MinTier) : "creator";
}

function highestRequiredTier(features: GatedFeature[]): MinTier | null {
  let best: MinTier | null = null;
  for (const f of features) {
    const t = normalize(FEATURE_GATES[f].minTier);
    if (!best || TIER_ORDER.indexOf(t) > TIER_ORDER.indexOf(best)) best = t;
  }
  return best;
}

/**
 * Shows an upgrade recommendation banner inside the step workflow whenever the
 * user has *attempted* a gated feature (clicked a LockedButton or landed on a
 * FeatureGate fallback) that their current plan does not unlock. The banner
 * surfaces the single cheapest tier that would unlock every attempted feature
 * and links to the Hub checkout for that SKU.
 */
export function UpgradeRecommendations() {
  const attempted = useAttemptedFeatures();
  const { data, isLoading } = useEntitlement();
  const couponUnlocked = useHasAnyCouponUnlock();
  const currentTier = (data?.tier ?? "free") as Tier;
  const hasAccess = data?.status === "active" || data?.status === "past_due";

  // Only show features the current plan still cannot unlock.
  const blocked = React.useMemo(
    () =>
      attempted.filter((f) => {
        const need = FEATURE_GATES[f].minTier as MinTier;
        const meets = hasAccess && tierMeets(currentTier, need);
        return !meets;
      }),
    [attempted, currentTier, hasAccess],
  );

  // Auto-prune attempts the user has since unlocked (e.g. after returning
  // from Hub checkout with a higher tier).
  React.useEffect(() => {
    if (!hasAccess) return;
    for (const f of attempted) {
      const need = FEATURE_GATES[f].minTier as MinTier;
      if (tierMeets(currentTier, need)) clearFeatureAttempt(f);
    }
  }, [attempted, currentTier, hasAccess]);

  if (isLoading || blocked.length === 0 || couponUnlocked) return null;

  const recommendedTier = highestRequiredTier(blocked);
  if (!recommendedTier) return null;

  const sku =
    recommendedTier === "all_access"
      ? "all_access:all_access:monthly"
      : syncVisionSku(recommendedTier);
  const href = hubCheckoutUrl(sku);
  const tierMeta = HUB_TIERS[recommendedTier];
  const tierLabel = tierMeta.name;
  const priceLabel = tierMeta.priceZAR;
  const currentLabel = tierDisplayName(currentTier);

  return (
    <div
      role="region"
      aria-label="Upgrade recommendation"
      className="mb-4 sm:mb-6 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-accent/5 to-transparent p-3 sm:p-4 shadow-[0_0_40px_-15px_hsl(var(--primary)/0.5)]"
    >
      <div className="flex items-start gap-3">
        <div className="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Lock className="h-3.5 w-3.5 text-primary sm:hidden" />
            <p className="text-xs sm:text-sm font-semibold text-foreground">
              Unlock {blocked.length === 1 ? "this step" : `${blocked.length} steps`} with{" "}
              <span className="text-primary">
                {recommendedTier === "all_access" ? "Resonance All-Access" : `Sync Vision ${tierLabel}`}
              </span>
            </p>
            {priceLabel && (
              <Badge
                variant="outline"
                className="text-[10px] font-mono uppercase tracking-wide border-primary/30 text-primary"
              >
                {priceLabel}
              </Badge>
            )}
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-wide border-white/15 text-muted-foreground"
            >
              You&apos;re on {currentLabel}
            </Badge>
          </div>

          <p className="mt-1 text-[11px] sm:text-xs text-muted-foreground">
            You tried to use{" "}
            {blocked
              .map((f) => FEATURE_GATES[f].label)
              .join(blocked.length === 2 ? " and " : ", ")}
            . Upgrading to{" "}
            <span className="font-medium text-foreground/90">{tierLabel}</span> unlocks{" "}
            {blocked.length === 1 ? "it" : "all of them"} in one go.
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {blocked.map((f) => (
              <Badge
                key={f}
                className="bg-primary/10 text-primary hover:bg-primary/15 border-primary/20 text-[10px] gap-1"
                variant="outline"
              >
                <Lock className="h-2.5 w-2.5" />
                {FEATURE_GATES[f].label}
              </Badge>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Button asChild size="sm" className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
              <a href={href} target="_blank" rel="noopener noreferrer">
                <Sparkles className="h-3.5 w-3.5" />
                Upgrade to {tierLabel}
              </a>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5 text-[11px]">
              <a href={`${HUB_URL}/pricing`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3" />
                View hub pricing
              </a>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFeatureAttempts}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Not now
            </Button>
          </div>
        </div>

        <button
          type="button"
          aria-label="Dismiss upgrade recommendation"
          onClick={clearAllFeatureAttempts}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
