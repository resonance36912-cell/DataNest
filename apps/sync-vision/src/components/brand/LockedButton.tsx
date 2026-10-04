import * as React from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FeatureGateState, GatedFeature } from "@/lib/featureGates";

export function LockedButton({
  gate,
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
  return (
    <Button asChild size={size} variant="outline" className={`w-full gap-2 border-primary/30 ${className}`}>
      <a href="/login">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        {children ?? `Refresh free access to ${gate.label}`}
      </a>
    </Button>
  );
}
