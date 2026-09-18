/**
 * Shared Scene Director preset patches — extracted from SceneDirectorPanel
 * so post-generation analysis (SceneIdleAnalysis) can auto-apply the same
 * overrides that the manual quick-preset button would apply.
 */

export const FIX_OVERLAID_CAPTIONS_PATCH = {
  shot_role: "A_ROLL_LIP_SYNC",
  suppress_text_overlays: true,
  negative_prompt_additions: [
    "no burned-in captions",
    "no text overlays",
    "no subtitles",
    "no lyrics on screen",
    "no watermarks",
  ],
  performance_direction: {
    headMotion: "subtle_nods",
    gestureStyle: "rap_hand_gestures",
  },
  camera_direction: {
    shotSize: "closeup",
    lens: "85mm",
    cameraHeight: "eye_level",
    movement: "slow_push_in",
    depthOfField: "shallow",
  },
} as const;

/** localStorage key for the "auto-apply Fix Overlaid Captions" toggle. */
export const AUTO_FIX_CAPTIONS_KEY = "sceneAnalysis.autoFixCaptions";

/** Whether auto-fix is currently enabled (defaults to true). */
export function isAutoFixCaptionsEnabled(): boolean {
  try {
    const v = localStorage.getItem(AUTO_FIX_CAPTIONS_KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function setAutoFixCaptionsEnabled(on: boolean) {
  try {
    localStorage.setItem(AUTO_FIX_CAPTIONS_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** localStorage key for caption-detector sensitivity (1..5, default 3). */
export const CAPTION_SENSITIVITY_KEY = "sceneAnalysis.captionSensitivity";

export function getCaptionSensitivity(): number {
  try {
    const v = localStorage.getItem(CAPTION_SENSITIVITY_KEY);
    const n = v ? Number(v) : 3;
    return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n) : 3;
  } catch {
    return 3;
  }
}

export function setCaptionSensitivity(level: number) {
  const clamped = Math.max(1, Math.min(5, Math.round(level)));
  try {
    localStorage.setItem(CAPTION_SENSITIVITY_KEY, String(clamped));
  } catch {
    /* ignore */
  }
}
