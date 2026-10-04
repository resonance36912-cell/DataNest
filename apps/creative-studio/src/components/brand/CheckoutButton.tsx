import * as React from "react";
import { BrandButton } from "./BrandButton";

export function CheckoutButton({
  variant = "brand",
  size = "md",
  className,
}: {
  sku: string;
  returnTo?: string;
  variant?: "brand" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <BrandButton variant={variant} size={size} className={className} asChild>
      <a href="/studio">Use free during promotion</a>
    </BrandButton>
  );
}
