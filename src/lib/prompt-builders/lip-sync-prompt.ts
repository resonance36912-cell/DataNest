/**
 * Lip-sync prompt builders — shared across image-gen and video-gen so the
 * model receives the same deterministic articulation instructions and the
 * same anti-artifact negative prompt every time.
 *
 * Defects this module exists to prevent (observed in the sample renders):
 *  - Mouth completely closed while vocals are playing
 *  - Face cropped out of frame on an A-Roll lip-sync shot
 *  - 6-finger / malformed hand artifacts
 *  - Glistening "glycerin sweat" skin
 *  - Wardrobe / location drift across scenes
 */

/**
 * Negative-prompt base used for every A-Roll lip-sync render.
 * Keep terms comma-separated; providers concatenate this verbatim.
 */
export const NEGATIVE_PROMPT_BASE = [
  // Lip-sync killers
  "closed mouth during vocals",
  "frozen mouth",
  "static lips",
  "lips never moving",
  "mouth out of frame",
  "face out of frame",
  "face cropped",
  "head cropped",
  // Hand / anatomy artifacts
  "extra fingers",
  "six fingers",
  "seven fingers",
  "malformed hand",
  "distorted hand",
  "deformed fingers",
  "fused fingers",
  // Skin & rendering artifacts
  "oily skin",
  "glycerin sweat",
  "waxy skin",
  "plastic skin",
  "blurry mouth",
  "blurry face",
  // Composition artifacts
  "warped face",
  "morphing face",
  "duplicate face",
  // Generic
  "captions",
  "on-screen text",
  "watermark",
  "logo",
].join(", ");

/**
 * Build the per-scene articulation block that forces visible mouth movement
 * synced to the lyric. Pass the *clean* lyric (adlibs stripped, sanitized).
 *
 * Returns an empty string for B-Roll / instrumental scenes — those should
 * keep their mouth closed.
 */
export function buildArticulationBlock(opts: {
  lyric: string;
  durationSec: number;
  isARoll: boolean;
  performVerb?: "raps" | "sings";
}): string {
  const { lyric, durationSec, isARoll } = opts;
  const verb = opts.performVerb || "sings";
  if (!isARoll) return "";
  const cleanLyric = (lyric || "").trim();
  if (!cleanLyric) return "";
  const dur = Math.max(1, Math.round(durationSec));

  return [
    `LIP-SYNC PERFORMANCE: subject actively ${verb === "raps" ? "rapping" : "mouthing"} the lyric`,
    `"${cleanLyric}" continuously throughout the entire ${dur}s clip.`,
    "Visible jaw movement on every syllable.",
    "Teeth and tongue visible on plosives and open vowels.",
    "Lips never closed for more than 0.4 seconds while vocals are present.",
    "Mouth and full face remain inside the frame at all times —",
    "if the camera moves, it tracks the face, never away from it.",
  ].join(" ");
}

/**
 * Build the face-lock / framing-lock block injected for A-Roll lip-sync.
 * Independent of the articulation block so B-Roll can borrow the
 * framing-lock language for hero shots when desired.
 */
export function buildFaceFramingLock(opts: {
  isARoll: boolean;
  shotSize?: string;
}): string {
  if (!opts.isARoll) return "";
  return [
    "FRAMING LOCK:",
    "head and shoulders visible,",
    "face occupies 35–55% of frame height,",
    "8% head-room at top,",
    "eyes on the upper-third line,",
    "front-facing or very slight 3/4 angle (never profile),",
    "camera never pans below the chin or above the hairline.",
  ].join(" ");
}
