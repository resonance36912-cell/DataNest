/**
 * Character & wardrobe continuity lock — pulls authoritative descriptors
 * from the project's *reference scene* so every downstream scene receives
 * the same wardrobe + location language instead of re-describing the
 * character from scratch (which is how outfit / setting drift happens).
 *
 * Default behaviour: ON for A-Roll. Scenes may opt-out by setting
 *   scene.keep_consistent === false        (disable continuity entirely)
 *   scene.scene_location_override          (use a custom location)
 *   scene.attire_override                  (use a custom outfit)
 */
import type { Scene } from "@/contexts/ProjectContext";

export interface ContinuityLockInput {
  scene: Scene;
  referenceScene?: Scene | null;
  character?: {
    name?: string;
    description?: string;
    outfit?: string;
    vibe?: string;
    imageUrl?: string;
  } | null;
}

export interface ContinuityLock {
  /** True when this lock is being enforced for the scene. */
  enforced: boolean;
  /** Locked wardrobe descriptor (or empty). */
  wardrobe: string;
  /** Locked location descriptor (or empty). */
  location: string;
  /** Ready-to-inject prompt fragment, or empty string when not enforced. */
  promptFragment: string;
}

const norm = (v: unknown): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";

/**
 * Resolve and format the continuity lock for a scene.
 *
 * Resolution priority (first non-empty wins):
 *   wardrobe → scene.attire_override → character.outfit → referenceScene.attire_override
 *   location → scene.scene_location_override → referenceScene.scene_location → scene.scene_location
 */
export function buildContinuityLock(input: ContinuityLockInput): ContinuityLock {
  const { scene, referenceScene, character } = input;
  const s = scene as any;
  const ref = (referenceScene || {}) as any;

  const isBroll = s.is_broll === true || (s.shot_role || "").startsWith("B_ROLL");
  const keepConsistent = s.keep_consistent !== false; // default ON

  if (isBroll || !keepConsistent) {
    return { enforced: false, wardrobe: "", location: "", promptFragment: "" };
  }

  const wardrobe =
    norm(s.attire_override) ||
    norm(character?.outfit) ||
    norm(ref.attire_override) ||
    "";

  const location =
    norm(s.scene_location_override) ||
    norm(ref.scene_location) ||
    norm(s.scene_location) ||
    "";

  const bits: string[] = [];
  if (character?.name || character?.description) {
    bits.push(
      `CHARACTER IDENTITY LOCK: same face, skin tone, hair, hairstyle, and body type as the project reference — never re-imagined.`,
    );
  }
  if (wardrobe) {
    bits.push(`WARDROBE LOCK: ${wardrobe} — identical garment, jewelry, and accessories across scenes.`);
  }
  if (location && !norm(s.scene_location_override)) {
    bits.push(`LOCATION LOCK: ${location} — same environment family unless the scene explicitly overrides it.`);
  }

  const promptFragment = bits.length ? bits.join(" ") + " " : "";

  return {
    enforced: bits.length > 0,
    wardrobe,
    location,
    promptFragment,
  };
}
