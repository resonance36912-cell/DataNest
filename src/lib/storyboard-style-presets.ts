/**
 * Storyboard style presets — one-click looks that auto-configure pacing
 * (how often the storyboard cuts to B-roll / inserts) and shot types
 * (shot role, size, lens, movement, lighting, VFX) across every scene.
 *
 * Pacing is expressed as a repeating cadence pattern: scene N receives
 * pattern[N % pattern.length]. Timing (time_start/time_end) is never
 * touched — those come from the audio ground truth.
 */

export type StyleShotStep = {
  shot_role: string;
  is_broll: boolean;
  camera_direction: Record<string, string>;
  performance_direction?: Record<string, string | number>;
};

export type StoryboardStylePreset = {
  id: "cinematic" | "documentary" | "music_video";
  label: string;
  emoji: string;
  description: string;
  /** Human-readable pacing summary shown in the UI. */
  pacing: string;
  /** Theme hint pushed into the theme picker when applied. */
  theme: string;
  lighting_direction: string;
  vfx_level: string;
  /** Repeating shot cadence — index into this by scene position. */
  pattern: StyleShotStep[];
};

const AROLL_PERF = {
  emotion: "focused",
  eyeLine: "direct_to_camera",
  posture: "still_confident",
  gestureStyle: "minimal",
  headMotion: "subtle_nods",
  intensity: 3,
} as const;

export const STORYBOARD_STYLE_PRESETS: StoryboardStylePreset[] = [
  {
    id: "cinematic",
    label: "Cinematic",
    emoji: "🎬",
    description: "Slow, composed film language — wide establishers, long lenses, shallow depth.",
    pacing: "Slow cadence · 1 B-roll every 3 shots · establisher every 4th scene",
    theme: "dramatic",
    lighting_direction: "golden_hour",
    vfx_level: "subtle",
    pattern: [
      {
        shot_role: "WIDE_LOCATION_ESTABLISHER",
        is_broll: true,
        camera_direction: { shotSize: "wide", lens: "35mm", cameraHeight: "eye_level", movement: "slow_push_in", depthOfField: "deep" },
      },
      {
        shot_role: "A_ROLL_LIP_SYNC",
        is_broll: false,
        camera_direction: { shotSize: "medium_closeup", lens: "85mm", cameraHeight: "eye_level", movement: "slow_push_in", depthOfField: "shallow" },
        performance_direction: { ...AROLL_PERF, emotion: "reflective" },
      },
      {
        shot_role: "B_ROLL_SYMBOLIC",
        is_broll: true,
        camera_direction: { shotSize: "medium", lens: "50mm", cameraHeight: "low_angle", movement: "side_tracking", depthOfField: "shallow" },
      },
      {
        shot_role: "PERFORMANCE_CLOSEUP",
        is_broll: false,
        camera_direction: { shotSize: "closeup", lens: "85mm", cameraHeight: "eye_level", movement: "locked_off", depthOfField: "shallow" },
        performance_direction: { ...AROLL_PERF, emotion: "intense", intensity: 4 },
      },
    ],
  },
  {
    id: "documentary",
    label: "Documentary",
    emoji: "🎥",
    description: "Observational and grounded — natural light, handheld feel, real locations.",
    pacing: "Even cadence · alternating talent / observational inserts",
    theme: "historical",
    lighting_direction: "natural_daylight",
    vfx_level: "none",
    pattern: [
      {
        shot_role: "A_ROLL_LIP_SYNC",
        is_broll: false,
        camera_direction: { shotSize: "medium", lens: "35mm", cameraHeight: "eye_level", movement: "locked_off", depthOfField: "medium" },
        performance_direction: { ...AROLL_PERF, eyeLine: "slightly_off_camera", emotion: "calm" },
      },
      {
        shot_role: "INSERT_DETAIL",
        is_broll: true,
        camera_direction: { shotSize: "closeup", lens: "50mm", cameraHeight: "eye_level", movement: "handheld_subtle", depthOfField: "shallow" },
      },
      {
        shot_role: "B_ROLL_STORY",
        is_broll: true,
        camera_direction: { shotSize: "wide", lens: "24mm", cameraHeight: "eye_level", movement: "handheld_subtle", depthOfField: "deep" },
      },
    ],
  },
  {
    id: "music_video",
    label: "Music Video",
    emoji: "🎤",
    description: "High-energy performance cutting — punchy closeups, motion, stage light.",
    pacing: "Fast cadence · performance-led, 1 accent shot every 4th scene",
    theme: "dramatic",
    lighting_direction: "stage_spotlight",
    vfx_level: "moderate",
    pattern: [
      {
        shot_role: "A_ROLL_LIP_SYNC",
        is_broll: false,
        camera_direction: { shotSize: "medium_closeup", lens: "50mm", cameraHeight: "eye_level", movement: "slow_push_in", depthOfField: "shallow" },
        performance_direction: { ...AROLL_PERF, emotion: "intense", gestureStyle: "rap_hand_gestures", intensity: 4 },
      },
      {
        shot_role: "PERFORMANCE_CLOSEUP",
        is_broll: false,
        camera_direction: { shotSize: "closeup", lens: "85mm", cameraHeight: "eye_level", movement: "locked_off", depthOfField: "shallow" },
        performance_direction: { ...AROLL_PERF, emotion: "defiant", intensity: 5 },
      },
      {
        shot_role: "A_ROLL_LIP_SYNC",
        is_broll: false,
        camera_direction: { shotSize: "medium", lens: "35mm", cameraHeight: "low_angle", movement: "slow_pull_back", depthOfField: "medium" },
        performance_direction: { ...AROLL_PERF, emotion: "joyful", intensity: 4 },
      },
      {
        shot_role: "VFX_ACCENT",
        is_broll: true,
        camera_direction: { shotSize: "tracking_wide", lens: "24mm", cameraHeight: "low_angle", movement: "orbit_slow", depthOfField: "medium" },
      },
    ],
  },
];

export function getStylePreset(id: string): StoryboardStylePreset | undefined {
  return STORYBOARD_STYLE_PRESETS.find((p) => p.id === id);
}

/**
 * Build the per-scene patch for a style preset.
 * `index` is the scene's position in the storyboard (0-based).
 */
export function buildStylePatch(
  preset: StoryboardStylePreset,
  index: number,
  existing?: Record<string, any>
): Record<string, any> {
  const step = preset.pattern[index % preset.pattern.length];
  const patch: Record<string, any> = {
    shot_role: step.shot_role,
    is_broll: step.is_broll,
    isAroll: !step.is_broll,
    camera_direction: { ...(existing?.camera_direction ?? {}), ...step.camera_direction },
    lighting_direction: preset.lighting_direction,
    vfx_level: preset.vfx_level,
    style_preset: preset.id,
  };
  if (step.performance_direction) {
    patch.performance_direction = { ...(existing?.performance_direction ?? {}), ...step.performance_direction };
  } else {
    patch.performance_direction = {};
  }
  return patch;
}

/** Count how many scenes each shot role gets — used for the preview summary. */
export function summarizeStyle(preset: StoryboardStylePreset, sceneCount: number): { role: string; count: number }[] {
  const counts = new Map<string, number>();
  for (let i = 0; i < sceneCount; i++) {
    const role = preset.pattern[i % preset.pattern.length].shot_role;
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count);
}
