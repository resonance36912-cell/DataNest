import { Lock, ArrowUpRight, Sparkles, ExternalLink, Home } from "lucide-react";
import { hubCheckoutUrl, HUB_URL, type Tier } from "@/lib/entitlement";
import { HUB_TIERS, tierDisplayName, type HubTier } from "@/lib/hubTiers";
import { BrandButton } from "./BrandButton";
import { CouponRedeemField } from "./CouponRedeemField";

/**
 * <PaywallPrompt /> — the single, canonical "this feature is locked" card.
 * Tier names + prices come from `HUB_TIERS` (Hub source of truth), so the
 * copy here always matches reson8.life/pricing exactly.
 */
export function PaywallPrompt({
  featureLabel,
  requiredTier,
  currentTier,
  sku,
  reason,
  compact = false,
}: {
  featureLabel: string;
  requiredTier: Exclude<Tier, null | "free">;
  currentTier: Tier;
  sku: string;
  /** Optional one-sentence "why is this paid?" explanation. */
  reason?: string;
  /** Render a tighter card (used inside narrow side panels). */
  compact?: boolean;
}) {
  // Normalize to a Hub-sold tier. Legacy "starter" gates fall back to Creator
  // (Starter isn't sold on the Hub).
  const hubTierKey: HubTier =
    requiredTier === "starter" ? "creator" : (requiredTier as HubTier);
  const tierMeta = HUB_TIERS[hubTierKey];
  const tierName = tierMeta.name;
  const currentName = tierDisplayName(currentTier);
  const blurb = reason ?? tierMeta.tagline;
  const checkoutHref = hubCheckoutUrl(sku);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent text-center ${
        compact ? "p-5" : "p-7"
      }`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-48 rounded-full opacity-40 blur-3xl"
        style={{ background: "var(--gradient-brand, radial-gradient(circle, hsl(295 90% 60% / 0.6), transparent 70%))" }}
      />

      <div className="relative">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.04]">
          <Lock className="h-5 w-5 text-white/80" />
        </div>

        <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/55">
          Requires Sync Vision {tierName}
        </p>
        <h3 className={`mt-1 font-bold ${compact ? "text-lg" : "text-xl"}`}>
          {featureLabel} is locked
        </h3>
        <p className={`mx-auto mt-2 max-w-md text-white/65 ${compact ? "text-xs" : "text-sm"}`}>
          {blurb}
        </p>

        {/* tier comparison + price chip */}
        <div className="mx-auto mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-white/70">
            <span className="text-white/55">You&apos;re on {currentName}</span>
            <ArrowUpRight className="h-3 w-3 text-white/40" />
            <span className="font-semibold text-white">{tierName}</span>
          </span>
          {tierMeta.priceZAR && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.05] px-3 py-1.5 font-mono text-white">
              {tierMeta.priceZAR}
            </span>
          )}
        </div>

        <div className="mx-auto mt-5 max-w-xs">
          <CouponRedeemField variant="checkout" />
        </div>

        <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <BrandButton asChild variant="brand" size="md">
            <a href={checkoutHref}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              Upgrade to {tierName}
            </a>
          </BrandButton>
        </div>

        {/* Prominent hub CTAs */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <a
            href={`${HUB_URL}/pricing`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/[0.08] hover:text-white transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            View hub pricing
          </a>
          <a
            href={HUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/[0.08] hover:text-white transition-colors"
          >
            <Home className="h-3 w-3" />
            Back to hub
          </a>
        </div>

        <p className="mt-4 text-[10px] uppercase tracking-[0.2em] text-white/35">
          Billing managed by Resonance Hub
        </p>
      </div>
    </div>
  );
}
