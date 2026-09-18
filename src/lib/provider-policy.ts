/**
 * Provider Policy — WAN 2.5 only.
 *
 * Defines constraints and routing rules for generation providers.
 */

import type { ProviderRoute, GateStatus } from "@/types/eligibility";

export interface ProviderLimits {
  maxConcurrentGenerations: number;
  maxRetryOnFailure: number;
}

export const DEFAULT_PROVIDER_LIMITS: ProviderLimits = {
  maxConcurrentGenerations: 8,
  maxRetryOnFailure: 3,
};

export interface ProviderCapability {
  route: ProviderRoute;
  label: string;
  description: string;
  requiresTiming: boolean;
  requiresAudioOnset: boolean;
  requiresVisual: boolean;
  isManualOnly: boolean;
}

export const PROVIDER_CAPABILITIES: Record<ProviderRoute, ProviderCapability> = {
  wan_25: {
    route: "wan_25",
    label: "WAN 2.5",
    description: "Primary video generation with native audio support",
    requiresTiming: true,
    requiresAudioOnset: true,
    requiresVisual: true,
    isManualOnly: false,
  },
  b_roll: {
    route: "b_roll",
    label: "Cinematic B-Roll",
    description: "Automatic fail-safe for scenes that don't pass eligibility",
    requiresTiming: false,
    requiresAudioOnset: false,
    requiresVisual: false,
    isManualOnly: false,
  },
};

/**
 * Check whether a scene can be submitted to a given provider based on current gate statuses.
 */
export function canSubmitToProvider(
  route: ProviderRoute,
  timing: GateStatus,
  audioOnset: GateStatus,
  visual: GateStatus
): { allowed: boolean; reason?: string } {
  const cap = PROVIDER_CAPABILITIES[route];

  if (cap.requiresTiming && timing === "block") {
    return { allowed: false, reason: "Timing is blocked" };
  }
  if (cap.requiresAudioOnset && audioOnset === "block") {
    return { allowed: false, reason: "No vocal onset detected" };
  }
  if (cap.requiresVisual && visual === "block") {
    return { allowed: false, reason: "Visual suitability blocked" };
  }

  if (timing === "review" || audioOnset === "review" || visual === "review") {
    return { allowed: true, reason: "Scene requires manual review before submission" };
  }

  return { allowed: true };
}
