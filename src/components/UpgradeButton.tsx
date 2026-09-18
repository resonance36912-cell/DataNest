import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hubCheckoutUrl, syncVisionSku } from "@/lib/entitlement";

interface UpgradeButtonProps {
  tier?: "creator" | "pro" | "business";
  label?: string;
  variant?: "gradient" | "ghost";
  size?: "sm" | "default" | "lg";
  className?: string;
}

/**
 * All upgrade flows redirect to the Resonance Hub (reson8.life) which owns
 * billing for the entire ecosystem. This app never runs PayFast itself.
 */
export default function UpgradeButton({
  tier = "creator",
  label = "Upgrade on Resonance Hub",
  variant = "gradient",
  size = "default",
  className = "",
}: UpgradeButtonProps) {
  const href = hubCheckoutUrl(syncVisionSku(tier));

  if (variant === "ghost") {
    return (
      <Button asChild size={size} variant="outline" className={`gap-2 rounded-full border-white/15 ${className}`}>
        <a href={href} target="_blank" rel="noopener noreferrer">
          {label} <ArrowUpRight className="h-4 w-4" />
        </a>
      </Button>
    );
  }

  return (
    <Button
      asChild
      size={size}
      className={`gap-2 rounded-full text-white border-0 shadow-[0_0_40px_-5px_hsl(295_90%_60%/0.8)] hover:opacity-95 ${className}`}
      style={{ background: "var(--gradient-brand)" }}
    >
      <a href={href} target="_blank" rel="noopener noreferrer">
        {label} <ArrowUpRight className="h-4 w-4" />
      </a>
    </Button>
  );
}
