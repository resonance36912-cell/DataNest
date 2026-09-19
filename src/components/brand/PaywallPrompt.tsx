import { Sparkles } from "lucide-react";
import type { Tier } from "@/lib/entitlement";
import { FREE_PROMOTION } from "@/lib/promotion";

export function PaywallPrompt({
  featureLabel,
}: {
  featureLabel: string;
  requiredTier: Exclude<Tier, null | "free">;
  currentTier: Tier;
  sku: string;
  reason?: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/5 p-6 text-center">
      <Sparkles className="mx-auto h-6 w-6 text-primary" />
      <p className="mt-3 text-xs font-mono uppercase tracking-[0.22em] text-primary">{FREE_PROMOTION.shortLabel}</p>
      <h3 className="mt-2 text-lg font-bold">{featureLabel} is included</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Full feature access is included during the promotion. Sign in so usage can be measured for future costing.
      </p>
    </div>
  );
}
