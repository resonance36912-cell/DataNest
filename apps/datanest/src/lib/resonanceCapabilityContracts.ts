export const RESONANCE_SHARED_CAPABILITIES = {
  identity: ["authentication","session","role","account-linking"],
  entitlement: ["plan","access","upgrade","renewal","module-entitlement"],
  evidence: ["release-evidence","audit-evidence","traceability","attestation"],
  security: ["secret-scanning","policy-enforcement","provider-sovereignty","security-invariants"],
  telemetry: ["product-events","conversion-events","errors","performance","usage"],
  content: ["brand","seo","metadata","legal-disclosures"],
  storage: ["asset-storage","artifact-retention","backup","recovery"],
  ai: ["provider-abstraction","policy","model-routing","cost-observation","safety"],
} as const;

export type ResonanceSharedCapability = keyof typeof RESONANCE_SHARED_CAPABILITIES;
export type ResonanceSharedFunction = typeof RESONANCE_SHARED_CAPABILITIES[ResonanceSharedCapability][number];

export const hasResonanceSharedFunction = (
  capability: ResonanceSharedCapability,
  fn: string,
): fn is ResonanceSharedFunction =>
  (RESONANCE_SHARED_CAPABILITIES[capability] as readonly string[]).includes(fn);
