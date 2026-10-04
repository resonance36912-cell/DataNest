import * as React from "react";
import { PaywallGate } from "./PaywallGate";
import { FEATURE_GATES, useFeatureGate, type GatedFeature } from "@/lib/featureGates";
import { recordFeatureAttempt } from "@/lib/featureAttempts";
import { FREE_PROMOTION_ACTIVE } from "@/lib/promotion";

/**
 * Thin convenience wrapper around <PaywallGate /> that reads the minimum tier,
 * SKU, and feature label from the central FEATURE_GATES matrix so every
 * blocked surface renders the same canonical paywall card.
 *
 * Also records an "attempt" the first time a user lands on a blocked surface,
 * so the in-workflow recommendations banner can suggest the right upgrade.
 *
 *   <FeatureGate feature="hd_render">
 *     <HdRenderSection ... />
 *   </FeatureGate>
 */
export function FeatureGate({
  feature,
  children,
  fallback,
  loading,
  reason,
}: {
  feature: GatedFeature;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  loading?: React.ReactNode;
  reason?: string;
}) {
  const spec = FEATURE_GATES[feature];
  const { allowed, loading: gateLoading, error } = useFeatureGate(feature);

  React.useEffect(() => {
    if (!FREE_PROMOTION_ACTIVE && !gateLoading && !error && !allowed) recordFeatureAttempt(feature);
  }, [feature, gateLoading, error, allowed]);

  if (FREE_PROMOTION_ACTIVE) return <>{children}</>;

  return (
    <PaywallGate
      minTier={spec.minTier}
      upgradeSku={spec.sku}
      featureLabel={spec.label}
      reason={reason}
      fallback={fallback}
      loading={loading}
    >
      {children}
    </PaywallGate>
  );
}
