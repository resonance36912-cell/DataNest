/**
 * Entitlement / locks status panel for the Storyboard step.
 * Shows which generation capabilities are disabled and the exact reason
 * derived from the Hub entitlement API response.
 */
import { useState } from "react";
import { Lock, Unlock, AlertTriangle, Loader2, ChevronDown, ChevronUp, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useEntitlement,
  useRefreshEntitlement,
  hubCheckoutUrl,
  tierMeets,
  type Entitlement,
} from "@/lib/entitlement";
import { FEATURE_GATES, type GatedFeature } from "@/lib/featureGates";
import { tierDisplayName } from "@/lib/hubTiers";
import { FREE_PROMOTION_ACTIVE } from "@/lib/promotion";

const STORYBOARD_FEATURES: GatedFeature[] = ["storyboard_video", "hd_render"];

type GateStatus =
  | { kind: "allowed"; reason: string }
  | { kind: "blocked"; reason: string }
  | { kind: "loading"; reason: string }
  | { kind: "error"; reason: string };

function resolveGate(
  feature: GatedFeature,
  ent: Entitlement | undefined,
  loading: boolean,
  error: unknown,
): GateStatus {
  const spec = FEATURE_GATES[feature];
  if (loading) return { kind: "loading", reason: "Checking entitlement with the Hub…" };
  if (error) return { kind: "error", reason: `Entitlement request failed: ${(error as Error)?.message || "network error"}` };
  if (!ent) return { kind: "error", reason: "No entitlement record returned by the Hub." };

  const tier = ent.tier ?? "free";
  const statusOk = ent.status === "active" || ent.status === "past_due";
  const meets = tierMeets(tier, spec.minTier);

  if (statusOk && meets) {
    return {
      kind: "allowed",
      reason: `Tier "${tierDisplayName(tier)}" meets minimum "${tierDisplayName(spec.minTier)}" (status: ${ent.status}).`,
    };
  }
  if (!statusOk) {
    return {
      kind: "blocked",
      reason: `Subscription status is "${ent.status}" — needs "active" or "past_due" on tier "${tierDisplayName(spec.minTier)}" or higher.`,
    };
  }
  return {
    kind: "blocked",
    reason: `Current tier "${tierDisplayName(tier)}" is below the required "${tierDisplayName(spec.minTier)}".`,
  };
}

export default function EntitlementLocksPanel() {
  const { data, isLoading, error, isFetching } = useEntitlement();
  const refresh = useRefreshEntitlement();
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const gates = STORYBOARD_FEATURES.map((f) => ({
    feature: f,
    spec: FEATURE_GATES[f],
    status: resolveGate(f, data, isLoading, error),
  }));

  const blockedCount = gates.filter((g) => g.status.kind === "blocked" || g.status.kind === "error").length;
  const allClear = blockedCount === 0 && !isLoading && !error;

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  };

  return (
    <div className="glass-card px-4 py-3 space-y-2">
      <div className="w-full flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left"
          aria-expanded={expanded}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />
          ) : allClear ? (
            <Unlock className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <Lock className="h-4 w-4 text-amber-400 shrink-0" />
          )}
          <h4 className="text-xs font-semibold text-foreground truncate">
            {FREE_PROMOTION_ACTIVE ? "Generation access" : "Generation locks"}
          </h4>
          {!isLoading && (
            <Badge
              variant="outline"
              className={`h-5 px-1.5 text-[10px] ${
                allClear
                  ? "border-emerald-500/40 text-emerald-300"
                  : "border-amber-500/40 text-amber-300"
              }`}
            >
              {allClear ? "all unlocked" : `${blockedCount} locked`}
            </Badge>
          )}
          {data && (
            <span className="text-[10px] text-muted-foreground truncate">
              Tier: {tierDisplayName(data.tier)} · {data.status}
            </span>
          )}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={handleRefresh}
            disabled={refreshing || isFetching}
            title="Re-check entitlement"
          >
            {refreshing || isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="h-7 w-7 flex items-center justify-center"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-2 pt-2 border-t border-border/40">
          {gates.map(({ feature, spec, status }) => {
            const blocked = status.kind === "blocked" || status.kind === "error";
              const row = (
                <div
                  className="flex items-start justify-between gap-3 p-2 rounded-md bg-background/40 border border-border/40"
                >
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    {status.kind === "allowed" && <Unlock className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />}
                    {status.kind === "blocked" && <Lock className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />}
                    {status.kind === "loading" && <Loader2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0 animate-spin" />}
                    {status.kind === "error" && <AlertTriangle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-foreground">{spec.label}</span>
                        <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase tracking-wide">
                          min: {tierDisplayName(spec.minTier)}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                        {status.reason}
                      </p>
                    </div>
                  </div>
                  {blocked && (
                    <Button
                      size="sm"
                      variant="outline"
                      asChild
                      className="h-7 text-[11px] gap-1 shrink-0"
                    >
                      <a href={hubCheckoutUrl(spec.sku)} target="_blank" rel="noreferrer">
                        Unlock <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                  )}
                </div>
              );

              return blocked ? (
                <TooltipProvider key={feature} delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>{row}</TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      <p className="leading-snug">{status.reason}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <div key={feature}>{row}</div>
              );
          })}

          {data && (
            <div className="pt-1 text-[10px] text-muted-foreground space-y-0.5 font-mono">
              <div>app: {data.app} · source: {data.source} · hasAccess: {String(data.hasAccess)}</div>
              {data.currentPeriodEnd && <div>period ends: {new Date(data.currentPeriodEnd).toLocaleString()}</div>}
              {data._source && <div>record from: {data._source}{data._fetchedAt ? ` @ ${new Date(data._fetchedAt).toLocaleTimeString()}` : ""}</div>}
            </div>
          )}
          {error && (
            <p className="text-[11px] text-destructive">
              Entitlement fetch error: {(error as Error)?.message || "unknown error"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
