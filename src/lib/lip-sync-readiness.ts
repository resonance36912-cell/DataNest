/**
 * Lip-sync readiness evaluation — shared between Scene Director panel,
 * the compact Scene Card badges, and the pre-flight submit gate so users
 * can confirm A-Roll lip-sync readiness at a glance and we block bad
 * scenes BEFORE they're sent to the video provider.
 */

export interface LipSyncReadiness {
  /** Effective shot role (falls back to A-Roll/B-Roll defaults). */
  shotRole: string;
  /** True when this scene needs lip-sync (A_ROLL_LIP_SYNC or PERFORMANCE_CLOSEUP). */
  isARoll: boolean;
  /** Short cinematography label e.g. "A-Roll · Closeup · Eye level · 50mm". */
  shotLabel: string;
  /** Camera movement label or undefined. */
  movementLabel?: string;
  /** Human-readable warnings — empty means lip-sync ready. */
  warnings: string[];
  /** True when no A-Roll warnings (or scene is B-Roll). */
  ready: boolean;
}

export const LIP_SYNC_ROLES = new Set(["A_ROLL_LIP_SYNC", "PERFORMANCE_CLOSEUP"]);
/** Camera movements that keep the mouth steady enough for downstream lip-sync. */
export const SAFE_MOVEMENTS = new Set(["locked_off", "slow_push_in", "slow_pull_back"]);
/** Shot sizes that keep the face large enough in frame for lip-sync. */
export const SAFE_SHOT_SIZES = new Set(["extreme_closeup", "closeup", "medium_closeup"]);
/** Camera heights that keep the mouth front-facing. */
export const SAFE_CAMERA_HEIGHTS = new Set(["eye_level"]);
/** Head motions that stay within lip-sync tolerance. */
export const SAFE_HEAD_MOTIONS = new Set(["minimal", "subtle_nods"]);

const titleize = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function evaluateLipSyncReadiness(scene: any): LipSyncReadiness {
  const isBroll = scene?.is_broll === true;
  const shotRole: string =
    scene?.shot_role || (isBroll ? "B_ROLL_STORY" : "A_ROLL_LIP_SYNC");
  const perf = scene?.performance_direction || {};
  const cam = scene?.camera_direction || {};
  const safety = scene?.lip_sync_safety || {};

  const isARoll = LIP_SYNC_ROLES.has(shotRole);

  /* Build short cinematography label */
  const rolePart = isARoll ? "A-Roll" : "B-Roll";
  const parts = [rolePart];
  if (cam.shotSize) parts.push(titleize(cam.shotSize));
  if (cam.cameraHeight) parts.push(titleize(cam.cameraHeight));
  if (cam.lens) parts.push(cam.lens);
  const shotLabel = parts.join(" · ");
  const movementLabel = cam.movement ? titleize(cam.movement) : undefined;

  /* Safety evaluation — only meaningful for A-Roll */
  const mouthClear = safety.mouth_clear !== false;
  const faceClear = safety.face_clear !== false;
  const noObstruction = safety.no_obstruction !== false;
  const headMotion: string | undefined = perf.headMotion;
  const minimalHead = !headMotion || SAFE_HEAD_MOTIONS.has(headMotion);
  const movement: string | undefined = cam.movement;
  const safeMovement = !movement || SAFE_MOVEMENTS.has(movement);
  const height: string | undefined = cam.cameraHeight;
  const safeAngle = !height || SAFE_CAMERA_HEIGHTS.has(height);
  const shotSize: string | undefined = cam.shotSize;
  const safeShotSize = !shotSize || SAFE_SHOT_SIZES.has(shotSize);

  const warnings: string[] = [];
  if (isARoll) {
    if (!mouthClear) warnings.push("Mouth not marked clear");
    if (!faceClear) warnings.push("Face not marked clear");
    if (!minimalHead) warnings.push(`Head motion "${headMotion}" may break lip-sync`);
    if (!noObstruction) warnings.push("Obstructions over face");
    if (!safeMovement) warnings.push(`Camera movement "${movement}" may cause mouth drift`);
    if (!safeAngle) warnings.push(`Angle "${height}" reduces lip-sync accuracy`);
    if (!safeShotSize) warnings.push(`Shot size "${shotSize}" may crop the face out of frame`);
  }

  return {
    shotRole,
    isARoll,
    shotLabel,
    movementLabel,
    warnings,
    ready: !isARoll || warnings.length === 0,
  };
}

/**
 * Pre-flight gate used right before submitting a scene for video generation.
 * Returns `{ ok: true }` when the scene is safe to send; `{ ok: false, reason }`
 * otherwise. B-Roll scenes always pass.
 */
export function assertLipSyncReady(
  scene: any,
): { ok: true } | { ok: false; reason: string; warnings: string[] } {
  const r = evaluateLipSyncReadiness(scene);
  if (r.ready) return { ok: true };
  return {
    ok: false,
    reason: `Lip-sync readiness check failed: ${r.warnings.join("; ")}`,
    warnings: r.warnings,
  };
}
