import { Button } from "@/components/ui/button";
import { Sparkles, ExternalLink } from "lucide-react";
import { APP_START_URL, checkoutUrl, HUB_PRICING_URL } from "@/lib/entitlement";
import { FREE_PROMOTION_ACTIVE } from "@/lib/promotion";

interface UpgradeButtonProps {
  /**
   * Pack identifier passed to the hub checkout. Defaults to "credits"
   * (once-off credit top-up). Use "free" to route into the app's start flow.
   */
  plan?: "free" | "credits" | "project" | "studio" | "bundle";
  /**
   * When true, the button links to the hub pricing page instead of a
   * direct checkout — use this when the user hasn't picked a pack yet.
   */
  browse?: boolean;
  label?: string;
  className?: string;
  size?: "sm" | "default" | "lg";
}

/**
 * Hub-owned checkout. This app never sells its own recurring subscription;
 * every paid action opens The Resonance Hub for once-off pack purchase.
 */
const UpgradeButton = ({
  plan = "credits",
  browse = false,
  label,
  className,
  size = "default",
}: UpgradeButtonProps) => {
  const href = FREE_PROMOTION_ACTIVE ? APP_START_URL : browse ? HUB_PRICING_URL : checkoutUrl(plan);
  const external = !FREE_PROMOTION_ACTIVE && plan !== "free";
  const defaultLabel = FREE_PROMOTION_ACTIVE
    ? "Use free during promotion"
    :
    plan === "free"
      ? "Start free"
      : browse
        ? "View hub pricing"
        : plan === "project" || plan === "studio" || plan === "bundle"
          ? "Buy pack"
          : "Buy credits";

  return (
    <Button asChild size={size} className={className}>
      <a
        href={href}
        rel="noopener"
        {...(external ? { target: "_blank" } : {})}
      >
        <Sparkles className="h-4 w-4 mr-1.5" />
        {FREE_PROMOTION_ACTIVE ? defaultLabel : (label ?? defaultLabel)}
        {external && <ExternalLink className="h-3.5 w-3.5 ml-1" />}
      </a>
    </Button>
  );
};

export default UpgradeButton;
