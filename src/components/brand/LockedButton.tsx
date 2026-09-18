import * as React from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { hubCheckoutUrl } from "@/lib/entitlement";
import type { FeatureGateState, GatedFeature } from "@/lib/featureGates";
import { recordFeatureAttempt } from "@/lib/featureAttempts";

/**
 * Inline replacement for a gated action button: renders a locked button that
 * links to the Hub checkout for the feature's required tier. Use when keeping
 * the original button visible would be misleading (e.g. per-scene actions).
 *
 * Pass `feature` so a click is logged as an attempt — this powers the
 * in-workflow upgrade recommendations banner.
 */
export function LockedButton({
  gate,
  feature,
  size = "sm",
  className = "",
  children,
}: {
  gate: FeatureGateState;
  feature?: GatedFeature;
  size?: "sm" | "default" | "lg";
  className?: string;
  children?: React.ReactNode;
}) {
  const href = hubCheckoutUrl(gate.sku);
  const handleClick = () => {
    if (feature) recordFeatureAttempt(feature);
  };
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            asChild
            size={size}
            variant="outline"
            className={`w-full gap-2 border-white/15 text-white/80 hover:bg-white/[0.04] ${className}`}
          >
            <a href={href} target="_blank" rel="noopener noreferrer" onClick={handleClick}>
              <Lock className="h-3.5 w-3.5" />
              {children ?? `Unlock ${gate.label}`}
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs">
          Requires the <span className="font-semibold capitalize">{gate.requiredTier}</span> pack
          (or higher). You&apos;re currently on{" "}
          <span className="font-semibold capitalize">{gate.currentTier ?? "free"}</span>. Click to
          upgrade on Resonance Hub.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
