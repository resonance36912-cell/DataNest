import * as React from "react";
import { BrandButton } from "./BrandButton";
import { checkoutUrl } from "@/lib/entitlement";

/**
 * <CheckoutButton sku="creative_studio:bundle:payg-poster-pack">Buy pack</CheckoutButton>
 * Routes the user to Hub checkout at reson8.life with a return URL back to
 * this app. Spokes never handle payments — the Hub is the source of truth
 * for pricing, packs and credits.
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
  const href = checkoutUrl(sku, returnTo);
  return (
    <BrandButton variant={variant} size={size} className={className} asChild>
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    </BrandButton>
  );
}
