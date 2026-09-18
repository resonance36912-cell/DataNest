// Resonance brand voice: conscious, calm, confident. No hype words.
// This is a pre-generation pass that strips/swaps hype words from copy
// fields before they reach the poster model. Cheaper than an OCR post-pass
// and prevents the model from baking banned phrasing into pixels.

// Banned hype words → calm replacements. Case-insensitive, whole-word match.
const HYPE_REPLACEMENTS: Record<string, string> = {
  "amazing": "considered",
  "revolutionary": "refined",
  "game-changer": "shift",
  "game changer": "shift",
  "game-changing": "meaningful",
  "groundbreaking": "considered",
  "mind-blowing": "memorable",
  "mindblowing": "memorable",
  "epic": "deliberate",
  "insane": "uncommon",
  "crazy": "uncommon",
  "unbelievable": "rare",
  "best-in-class": "considered",
  "world-class": "considered",
  "world class": "considered",
  "next-level": "considered",
  "next level": "considered",
  "ultimate": "essential",
  "unleash": "release",
  "supercharge": "strengthen",
  "skyrocket": "lift",
  "disrupt": "reshape",
  "disruptive": "reshaping",
};

const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;
const escape = (s: string) => s.replace(ESCAPE_RE, "\\$&");

// Pre-compile a single pattern, longest-first so "game-changing" wins over "game".
const PATTERN = new RegExp(
  `\\b(${Object.keys(HYPE_REPLACEMENTS)
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join("|")})\\b`,
  "gi",
);

export interface VoiceGuardResult {
  text: string;
  flagged: string[];
}

/** Strip/swap hype words from a single string. Returns the cleaned text and
 *  the list of original tokens that were swapped (lowercased, deduped). */
export function cleanVoice(input: string | null | undefined): VoiceGuardResult {
  if (!input) return { text: input ?? "", flagged: [] };
  const flagged = new Set<string>();
  const text = input.replace(PATTERN, (match) => {
    const key = match.toLowerCase();
    flagged.add(key);
    const replacement = HYPE_REPLACEMENTS[key] ?? match;
    // Preserve simple capitalisation: Title → Title, UPPER → UPPER.
    if (match === match.toUpperCase()) return replacement.toUpperCase();
    if (match[0] === match[0]?.toUpperCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  });
  return { text, flagged: Array.from(flagged) };
}

/** Clean a bundle of brief fields at once. Returns the cleaned fields and a
 *  flat de-duplicated list of every hype word that was swapped. */
export function cleanBriefVoice(fields: {
  headline?: string;
  subheadline?: string;
  callToAction?: string;
  instructions?: string;
  keyPoints?: string[];
}): {
  headline: string;
  subheadline: string;
  callToAction: string;
  instructions: string;
  keyPoints: string[];
  flagged: string[];
} {
  const all = new Set<string>();
  const merge = (r: VoiceGuardResult) => {
    r.flagged.forEach((f) => all.add(f));
    return r.text;
  };
  return {
    headline: merge(cleanVoice(fields.headline)),
    subheadline: merge(cleanVoice(fields.subheadline)),
    callToAction: merge(cleanVoice(fields.callToAction)),
    instructions: merge(cleanVoice(fields.instructions)),
    keyPoints: (fields.keyPoints ?? []).map((kp) => merge(cleanVoice(kp))),
    flagged: Array.from(all),
  };
}
