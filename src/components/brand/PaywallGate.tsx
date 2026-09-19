import * as React from "react";
import type { Tier } from "@/lib/entitlement";

/**
 * Feature gates are non-blocking during the suite-wide Free Access Promotion.
 * Props are retained for compatibility with existing callers.
 */
export function PaywallGate({
  children,
}: {
  app?: string;
  minTier: Exclude<Tier, "free" | null>;
  upgradeSku: string;
  fallback?: React.ReactNode;
  loading?: React.ReactNode;
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
