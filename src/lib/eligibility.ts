/**
 * Unified Eligibility Gate — WAN 2.5 only.
 *
 * Single source of truth for scene routing decisions.
 */

import type {
  GateStatus,
  ProviderRoute,
  SceneEligibility,
  SceneTimingSummary,
  VisualSuitability,
  WordTimingMeta,
} from "@/types/eligibility";

/**
 * Compute timing confidence for a scene based on its word timing metadata.
 */
export function computeTimingSummary(wordTimings: WordTimingMeta[]): SceneTimingSummary {
  let verified = 0;
  let draft = 0;
  let blocked = 0;

  for (const wt of wordTimings) {
    switch (wt.timingStatus) {
      case "verified": verified++; break;
      case "draft": draft++; break;
      case "blocked": blocked++; break;
    }
  }

  const total = wordTimings.length;
  let confidence: GateStatus;

  if (blocked > 0) {
    confidence = "block";
  } else if (draft > 0) {
    confidence = "review";
  } else if (verified > 0) {
    confidence = "pass";
  } else {
    confidence = "block";
  }

  return {
    timingConfidence: confidence,
    verifiedWordCount: verified,
    draftWordCount: draft,
    blockedWordCount: blocked,
    totalWordCount: total,
  };
}

/**
 * Compute visual suitability gate from scene visual metadata.
 */
export function computeVisualGate(visual: VisualSuitability): GateStatus {
  const { faceVisible, faceForward, motionStable, mouthRegionClear } = visual;

  if (faceVisible && faceForward && motionStable && mouthRegionClear) {
    return "pass";
  }
  if (!faceVisible || !mouthRegionClear) {
    return "block";
  }
  return "review";
}

/**
 * Determine the provider route for a scene.
 */
export function determineProviderRoute(
  timingConfidence: GateStatus,
  audioOnsetConfidence: GateStatus,
  visualSuitability: GateStatus,
): ProviderRoute {
  if (
    timingConfidence === "block" ||
    audioOnsetConfidence === "block" ||
    visualSuitability === "block"
  ) {
    return "b_roll";
  }

  return "wan_25";
}

/**
 * Full eligibility evaluation for a scene.
 */
export function evaluateSceneEligibility(params: {
  sceneNumber: number;
  wordTimings: WordTimingMeta[];
  audioOnsetConfidence: GateStatus;
  visual: VisualSuitability;
  isAroll: boolean;
}): SceneEligibility {
  const { sceneNumber, wordTimings, audioOnsetConfidence, visual, isAroll } = params;

  if (!isAroll) {
    return {
      sceneNumber,
      timingConfidence: "pass",
      audioOnsetConfidence: "pass",
      visualSuitability: "pass",
      providerRoute: "b_roll",
      reasonCodes: ["B_ROLL_SCENE"],
      manualOverrideAllowed: false,
    };
  }

  const timingSummary = computeTimingSummary(wordTimings);
  const visualGate = computeVisualGate(visual);
  const reasonCodes: string[] = [];

  if (timingSummary.timingConfidence === "block") reasonCodes.push("TIMING_BLOCKED");
  if (timingSummary.timingConfidence === "review") reasonCodes.push("TIMING_DRAFT");
  if (audioOnsetConfidence === "block") reasonCodes.push("NO_VOCAL_ONSET");
  if (audioOnsetConfidence === "review") reasonCodes.push("WEAK_VOCAL_ONSET");
  if (visualGate === "block") reasonCodes.push("VISUAL_BLOCKED");
  if (visualGate === "review") reasonCodes.push("VISUAL_REVIEW");

  const providerRoute = determineProviderRoute(
    timingSummary.timingConfidence,
    audioOnsetConfidence,
    visualGate,
  );

  if (providerRoute === "b_roll") reasonCodes.push("AUTO_ROUTED_B_ROLL");

  const manualOverrideAllowed =
    providerRoute !== "b_roll" ||
    (timingSummary.timingConfidence !== "block" && audioOnsetConfidence !== "block");

  return {
    sceneNumber,
    timingConfidence: timingSummary.timingConfidence,
    audioOnsetConfidence,
    visualSuitability: visualGate,
    providerRoute,
    reasonCodes,
    manualOverrideAllowed,
  };
}
