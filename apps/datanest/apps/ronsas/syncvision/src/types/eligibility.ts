/**
 * Unified eligibility gate types.
 * Simplified — WAN 2.5 is the sole provider.
 */

export type GateStatus = "pass" | "review" | "block";

export type ProviderRoute = "wan_25" | "b_roll";

export type TimingSource = "native" | "distributed" | "fallback" | "repaired";
export type TimingStatus = "verified" | "draft" | "blocked";

export interface VisualSuitability {
  faceVisible: boolean;
  faceForward: boolean;
  motionStable: boolean;
  mouthRegionClear: boolean;
}

export interface SceneEligibility {
  sceneNumber: number;
  timingConfidence: GateStatus;
  audioOnsetConfidence: GateStatus;
  visualSuitability: GateStatus;
  providerRoute: ProviderRoute;
  reasonCodes: string[];
  manualOverrideAllowed: boolean;
}

export interface SceneTimingSummary {
  timingConfidence: GateStatus;
  verifiedWordCount: number;
  draftWordCount: number;
  blockedWordCount: number;
  totalWordCount: number;
}

export interface WordTimingMeta {
  timingSource: TimingSource;
  timingStatus: TimingStatus;
  confidence: number;
}
