import * as React from "react";
import { BrandButton } from "./BrandButton";
import { hubCheckoutUrl } from "@/lib/entitlement";
import { FREE_PROMOTION_ACTIVE } from "@/lib/promotion";

/**
 * <CheckoutButton />
 * Drops a "Buy pack" / "Upgrade" CTA in any spoke app. Sends the user to
 * the Hub checkout (reson8.life/checkout) with the SKU and a return URL
 * back to this app. The return URL carries a ?checkout=success marker so
 * the spoke can refresh entitlement when the user lands back. The Hub
 * handles PayFast, ITN, and entitlement provisioning — spokes never need
 * PayFast credentials.
 *
 * Usage:
 *   <CheckoutButton sku="sync_vision:creator:monthly">Upgrade to Creator</CheckoutButton>
 */
export function CheckoutButton({
  sku,
  returnTo,
  variant = "brand",
  size = "md",
  children = "Buy pack →",
  className,
}: {
  sku: string;
  returnTo?: string;
  variant?: "brand" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  children?: React.ReactNode;
  className?: string;
}) {
  const href = hubCheckoutUrl(sku, returnTo);
  return (
    <BrandButton variant={variant} size={size} className={className} asChild>
      <a href={href}>{FREE_PROMOTION_ACTIVE ? "Use free during promotion" : children}</a>
    </BrandButton>
  );
}
