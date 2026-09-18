/**
 * Builds the Scene Director payload sent to the generate-scene-image edge
 * function. Mirrors the fields edited in SceneDirectorPanel so director
 * choices actually influence the generated image prompt.
 *
 * When the user has NOT manually configured Performance & Camera fields,
 * we auto-fill cinematic, "professional music-video" defaults so the AI
 * generates the highest-quality output by default. Defaults are tuned per
 * shot role — A-Roll / performance closeups stay lip-sync-safe (eye-level,
 * locked-off / slow push-in, minimal head motion, mouth & face clear);
 * B-Roll opens up to more dynamic camera and performance choices.
 */
import type { Scene } from "@/contexts/ProjectContext";
import {
  LIP_SYNC_ROLES,
  SAFE_MOVEMENTS,
  SAFE_SHOT_SIZES,
  SAFE_CAMERA_HEIGHTS,
} from "@/lib/lip-sync-readiness";

export interface SceneDirectorPayload {
  shot_role?: string;
  performance_direction?: Record<string, any>;
  camera_direction?: Record<string, any>;
  lip_sync_safety?: Record<string, any>;
  framing_lock?: Record<string, any>;
  lighting_direction?: string;
  scene_location?: string;
  vfx_level?: string;
  auto_generated?: boolean;
}

const isPlainObject = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const cleanObj = (o: Record<string, any> | undefined) => {
  if (!o) return undefined;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
};

/* ---------- Auto-direction defaults (highest quality, music-video grade) ---------- */

function autoPerformance(shotRole: string, mood?: string): Record<string, any> {
  const lipSync = LIP_SYNC_ROLES.has(shotRole);
  const m = (mood || "").toLowerCase();

  // Mood-aware emotion seed
  const emotion =
    m.includes("aggress") || m.includes("dark") ? "intense" :
    m.includes("joy") || m.includes("upbeat") || m.includes("happy") ? "joyful" :
    m.includes("calm") || m.includes("chill") ? "calm" :
    m.includes("spirit") || m.includes("sacred") ? "spiritual" :
    m.includes("reflect") || m.includes("melanch") ? "reflective" :
    "focused";

  if (lipSync) {
    return {
      emotion,
      eyeLine: "direct_to_camera",
      posture: "still_confident",
      gestureStyle: "minimal",
      headMotion: "minimal",
      intensity: 4,
    };
  }

  // B-Roll / story / symbolic — more dynamic, no lip-sync constraints
  return {
    emotion,
    eyeLine: "slightly_off_camera",
    posture: "walking_slowly",
    gestureStyle: "open_palms",
    headMotion: "controlled_turns",
    intensity: 3,
  };
}

function autoCamera(shotRole: string): Record<string, any> {
  switch (shotRole) {
    case "A_ROLL_LIP_SYNC":
    case "PERFORMANCE_CLOSEUP":
      return {
        shotSize: "medium_closeup",
        lens: "50mm",
        cameraHeight: "eye_level",
        movement: "slow_push_in",
        depthOfField: "shallow",
      };
    case "WIDE_LOCATION_ESTABLISHER":
      return {
        shotSize: "wide",
        lens: "24mm",
        cameraHeight: "eye_level",
        movement: "slow_pull_back",
        depthOfField: "deep",
      };
    case "INSERT_DETAIL":
      return {
        shotSize: "extreme_closeup",
        lens: "85mm",
        cameraHeight: "eye_level",
        movement: "locked_off",
        depthOfField: "shallow",
      };
    case "CAMERA_TRANSITION":
      return {
        shotSize: "medium",
        lens: "35mm",
        cameraHeight: "eye_level",
        movement: "orbit_slow",
        depthOfField: "medium",
      };
    case "VFX_ACCENT":
      return {
        shotSize: "medium",
        lens: "anamorphic",
        cameraHeight: "low_angle",
        movement: "side_tracking",
        depthOfField: "shallow",
      };
    case "B_ROLL_SYMBOLIC":
      return {
        shotSize: "medium",
        lens: "35mm",
        cameraHeight: "low_angle",
        movement: "handheld_subtle",
        depthOfField: "shallow",
      };
    case "B_ROLL_STORY":
    default:
      return {
        shotSize: "medium",
        lens: "35mm",
        cameraHeight: "eye_level",
        movement: "side_tracking",
        depthOfField: "medium",
      };
  }
}

function autoLighting(mood?: string): string {
  const m = (mood || "").toLowerCase();
  if (m.includes("dark") || m.includes("aggress")) return "high_contrast";
  if (m.includes("warm") || m.includes("joy") || m.includes("hope")) return "golden_hour";
  if (m.includes("night") || m.includes("club") || m.includes("urban")) return "neon_practical";
  if (m.includes("spirit") || m.includes("sacred")) return "candle_lit";
  if (m.includes("calm") || m.includes("soft")) return "soft_key";
  return "soft_key";
}

function autoVfx(shotRole: string): string {
  if (shotRole === "VFX_ACCENT") return "moderate";
  if (shotRole === "CAMERA_TRANSITION" || shotRole === "B_ROLL_SYMBOLIC") return "subtle";
  return "subtle";
}

function autoSafety(shotRole: string): Record<string, any> {
  if (!LIP_SYNC_ROLES.has(shotRole)) return {};
  return {
    mouth_clear: true,
    face_clear: true,
    no_obstruction: true,
  };
}

/* ---------- Payload builder ---------- */

export function buildSceneDirectorPayload(scene: Scene): SceneDirectorPayload | undefined {
  const s = scene as any;
  const payload: SceneDirectorPayload = {};

  const isBroll = s.is_broll === true;
  const shotRole: string =
    (typeof s.shot_role === "string" && s.shot_role) ||
    (isBroll ? "B_ROLL_STORY" : "A_ROLL_LIP_SYNC");
  payload.shot_role = shotRole;

  // --- Performance: merge user values on top of cinematic defaults ---
  const userPerf = isPlainObject(s.performance_direction) ? cleanObj(s.performance_direction) : undefined;
  const defPerf = autoPerformance(shotRole, s.mood);
  const mergedPerf = { ...defPerf, ...(userPerf || {}) };
  payload.performance_direction = mergedPerf;

  // --- Camera: merge user values on top of cinematic defaults ---
  const userCam = isPlainObject(s.camera_direction) ? cleanObj(s.camera_direction) : undefined;
  const defCam = autoCamera(shotRole);
  const mergedCam = { ...defCam, ...(userCam || {}) };

  // --- LIP-SYNC SAFETY CLAMP ---
  // For A-Roll lip-sync shots, strip any unsafe shotSize / cameraHeight /
  // movement values (even if the user picked them) before the payload is
  // sent. This prevents the "face cropped out of frame" defect we observed
  // when the provider drifted the framing away from the mouth.
  if (LIP_SYNC_ROLES.has(shotRole)) {
    const clamped: string[] = [];
    if (mergedCam.shotSize && !SAFE_SHOT_SIZES.has(mergedCam.shotSize)) {
      clamped.push(`shotSize "${mergedCam.shotSize}" → "medium_closeup"`);
      mergedCam.shotSize = "medium_closeup";
    }
    if (mergedCam.cameraHeight && !SAFE_CAMERA_HEIGHTS.has(mergedCam.cameraHeight)) {
      clamped.push(`cameraHeight "${mergedCam.cameraHeight}" → "eye_level"`);
      mergedCam.cameraHeight = "eye_level";
    }
    if (mergedCam.movement && !SAFE_MOVEMENTS.has(mergedCam.movement)) {
      clamped.push(`movement "${mergedCam.movement}" → "slow_push_in"`);
      mergedCam.movement = "slow_push_in";
    }
    if (clamped.length) {
      console.info(
        `[scene-director-payload] lip-sync safety clamp applied (shot_role=${shotRole}):`,
        clamped.join("; "),
      );
    }
    payload.framing_lock = {
      face_in_frame: true,
      mouth_in_frame: true,
      head_room_pct: 8,
      face_height_pct_min: 35,
      face_height_pct_max: 55,
    };
  }
  payload.camera_direction = mergedCam;

  // --- Lip-sync safety: enforce safe defaults for A-Roll if user hasn't set ---
  const userSafety = isPlainObject(s.lip_sync_safety) ? cleanObj(s.lip_sync_safety) : undefined;
  const defSafety = autoSafety(shotRole);
  const mergedSafety = { ...defSafety, ...(userSafety || {}) };
  if (Object.keys(mergedSafety).length) payload.lip_sync_safety = mergedSafety;

  // --- Lighting / location / VFX ---
  payload.lighting_direction =
    (typeof s.lighting_direction === "string" && s.lighting_direction) || autoLighting(s.mood);

  if (typeof s.scene_location === "string" && s.scene_location) {
    payload.scene_location = s.scene_location;
  }

  payload.vfx_level =
    (typeof s.vfx_level === "string" && s.vfx_level) || autoVfx(shotRole);

  // Flag so the edge function / prompt builder knows defaults were filled
  payload.auto_generated = !userPerf || !userCam;

  return payload;
}
