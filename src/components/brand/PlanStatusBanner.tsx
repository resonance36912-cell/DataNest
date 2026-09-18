/**
 * Compact status banner shown above the Sync Vision step workflow so the user
 * can see at a glance which Hub pack they're on and whether their entitlement
 * is currently granting or blocking access. Read-only — billing happens on the
 * Resonance Hub (reson8.life).
 */
import { useMemo } from "react";
import { Crown, Lock, AlertTriangle, CheckCircle2, Loader2, ExternalLink } from "lucide-react";
import { useEntitlement, hubCheckoutUrl, type Entitlement } from "@/lib/entitlement";
import { tierDisplayName, HUB_TIERS, type HubTier } from "@/lib/hubTiers";
import { useHasAnyCouponUnlock } from "@/lib/featureGates";
import { cn } from "@/lib/utils";

type Variant = "active" | "free" | "past_due" | "pending" | "cancelled" | "inactive";

function variantFor(e: Entitlement | undefined): Variant {
  if (!e) return "inactive";
  if (e.hasAccess && e.status === "active") return "active";
  if (e.status === "past_due") return "past_due";
  if (e.status === "pending") return "pending";
  if (e.status === "cancelled") return "cancelled";
  if (!e.tier || e.tier === "free") return "free";
  return "inactive";
}

const STYLES: Record<Variant, { ring: string; chip: string; icon: JSX.Element; label: string }> = {
  active: {
    ring: "border-emerald-500/30 bg-emerald-500/5",
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    icon: <CheckCircle2 className="h-4 w-4" />,
    label: "Active",
  },
  free: {
    ring: "border-amber-500/30 bg-amber-500/5",
    chip: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    icon: <Lock className="h-4 w-4" />,
    label: "Free tier",
  },
  past_due: {
    ring: "border-red-500/30 bg-red-500/5",
    chip: "bg-red-500/15 text-red-300 border-red-500/30",
    icon: <AlertTriangle className="h-4 w-4" />,
    label: "Past due",
  },
  pending: {
    ring: "border-sky-500/30 bg-sky-500/5",
    chip: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    label: "Pending activation",
  },
  cancelled: {
    ring: "border-muted bg-muted/20",
    chip: "bg-muted text-muted-foreground border-border",
    icon: <AlertTriangle className="h-4 w-4" />,
    label: "Cancelled",
  },
  inactive: {
    ring: "border-muted bg-muted/10",
    chip: "bg-muted text-muted-foreground border-border",
    icon: <Lock className="h-4 w-4" />,
    label: "Inactive",
  },
};

function formatRenewal(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function PlanStatusBanner({ className }: { className?: string }) {
  const { data: ent, isLoading } = useEntitlement();
  const couponUnlocked = useHasAnyCouponUnlock();
  const variant = variantFor(ent);
  // A locally-redeemed coupon (tier or per-feature) grants full access in the
  // app even if the Hub still reports the user as free — hide the upgrade
  // banner entirely so it doesn't nag a paid/unlocked user.
  const style = STYLES[variant];
  const tierName = tierDisplayName(ent?.tier ?? null);
  const isBeta = ent?._beta === true;
  const renewal = formatRenewal(ent?.currentPeriodEnd ?? null);
  const isPaidTier =
    ent?.tier && ent.tier !== "free" && ent.tier !== "starter" && ent.tier in HUB_TIERS;
  const meta = isPaidTier ? HUB_TIERS[ent!.tier as HubTier] : null;

  const reason = useMemo(() => {
    if (isBeta) {
      return "All Sync Vision tiers are unlocked for owner beta testing. Provider jobs still require your approval before they start.";
    }
    if (isLoading) return "Checking your Hub entitlement…";
    switch (variant) {
      case "active":
        return `Full access to Sync Vision is granted on your ${tierName} pack.`;
      case "free":
        return "Most generation steps are locked. Upgrade on the Hub to unlock the full pipeline.";
      case "past_due":
        return "Your last Hub payment failed — access is paused until billing is updated.";
      case "pending":
        return "We've received your Hub checkout — entitlement should activate within a minute.";
      case "cancelled":
        return "Your pack has ended. Buy a new pack on the Hub to restore access.";
      default:
        return "No active Hub entitlement found for Sync Vision.";
    }
  }, [variant, isLoading, isBeta, tierName]);

  if (variant === "free" && couponUnlocked) return null;

  const ctaHref =
    variant === "active"
      ? null
      : hubCheckoutUrl(variant === "free" ? "creator" : (ent?.tier ?? "creator"));
  const ctaLabel = variant === "past_due" ? "Update billing on Hub" : "View hub pricing";

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="plan-status-banner"
      className={cn(
        "flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between",
        style.ring,
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background/50 text-foreground">
          {isPaidTier ? <Crown className="h-4 w-4 text-amber-300" /> : style.icon}
        </div>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{tierName} pack</span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
                style.chip,
              )}
            >
              {style.icon}
              {isBeta ? "Free beta" : style.label}
            </span>
            {meta && !isBeta && (
              <span className="text-xs text-muted-foreground">{meta.priceZAR}</span>
            )}
            {renewal && variant === "active" && (
              <span className="text-xs text-muted-foreground">· Valid until {renewal}</span>
            )}
            {renewal && variant === "cancelled" && (
              <span className="text-xs text-muted-foreground">· Access until {renewal}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{reason}</p>
        </div>
      </div>
      {ctaHref && (
        <a
          href={ctaHref}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="plan-status-cta"
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 sm:self-auto"
        >
          {ctaLabel}
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
