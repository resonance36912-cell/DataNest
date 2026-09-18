/**
 * Track Details — free-form metadata captured on the Upload step
 * (song title, artist, visual style, mood, aspect ratio, pasted lyrics)
 * that flows through into storyboard and scene-image prompt generation.
 *
 * Persisted on `projects.track_details` (jsonb). Kept in its own column so
 * it never collides with `prompt_filter_settings`, which drives an
 * unrelated lyric-filter feature.
 *
 * Every field is sanitised before it reaches prompt builders or the image
 * model. Malformed strings (control chars, absurd lengths, junk aspect
 * ratios) fall back to safe defaults instead of poisoning downstream
 * prompts or breaking the render.
 */

import {
  ALLOWED_ASPECT_RATIOS as SCHEMA_ALLOWED_ASPECT_RATIOS,
  DEFAULT_ASPECT_RATIO as SCHEMA_DEFAULT_ASPECT_RATIO,
  TRACK_DETAIL_LIMITS as SCHEMA_TRACK_DETAIL_LIMITS,
  aspectRatioSchema,
  visualStyleSchema,
  trackDetailsSchema,
  type TrackAspectRatio,
} from "./track-details-schema";

export type { TrackAspectRatio };

export interface TrackDetails {
  song_title: string;
  artist_name: string;
  visual_style: string;
  mood: string;
  aspect_ratio: TrackAspectRatio;
  pasted_lyrics: string;
}

/** Re-exports from the shared Zod schema — keep the public surface stable
 *  so existing callers (`src/lib/track-details.ts` consumers) don't need
 *  to know whether validation lives here or in the schema module. */
export const DEFAULT_ASPECT_RATIO = SCHEMA_DEFAULT_ASPECT_RATIO;
export const ALLOWED_ASPECT_RATIOS = SCHEMA_ALLOWED_ASPECT_RATIOS;
export const TRACK_DETAIL_LIMITS = SCHEMA_TRACK_DETAIL_LIMITS;

/** Coerce an arbitrary value into one of the supported aspect ratios,
 *  falling back to 16:9. Backed by the shared Zod schema so client and
 *  edge-function paths cannot drift. */
export function sanitizeAspectRatio(raw: unknown): TrackAspectRatio {
  return aspectRatioSchema.parse(raw);
}

/** Sanitise the free-text visual style. Backed by the shared Zod schema. */
export function sanitizeVisualStyle(raw: unknown): string {
  return visualStyleSchema.parse(raw);
}

export const DEFAULT_TRACK_DETAILS: TrackDetails = {
  song_title: "",
  artist_name: "",
  visual_style: "",
  mood: "",
  aspect_ratio: DEFAULT_ASPECT_RATIO,
  pasted_lyrics: "",
};

export function normaliseTrackDetails(raw: unknown): TrackDetails {
  const source = raw && typeof raw === "object" ? raw : {};
  const parsed = trackDetailsSchema.parse(source);
  return {
    song_title: parsed.song_title,
    artist_name: parsed.artist_name,
    visual_style: parsed.visual_style,
    mood: parsed.mood,
    aspect_ratio: parsed.aspect_ratio,
    pasted_lyrics: parsed.pasted_lyrics,
  };
}

/** True if any user-provided detail is set (mood alone doesn't count — it
 *  is also persisted on `projects.mood` and feeds `verification.mood`). */
export function hasMeaningfulTrackDetails(d: TrackDetails): boolean {
  return !!(
    d.song_title ||
    d.artist_name ||
    d.visual_style ||
    d.pasted_lyrics.trim()
  );
}

export interface TrackDetailIssues {
  aspect_ratio?: string;
  visual_style?: string;
}

/** True when no field would be silently rewritten by sanitisation. */
export function hasTrackDetailIssues(issues: TrackDetailIssues): boolean {
  return !!(issues.aspect_ratio || issues.visual_style);
}

/** Non-blocking notice describing a silent sanitisation/default so the
 *  UI can surface *what* changed vs the persisted raw value. */
export interface TrackDetailAdjustment {
  /** Machine tag for the transform applied. */
  kind: "defaulted" | "coerced" | "trimmed" | "stripped";
  /** Human sentence rendered in the summary. */
  message: string;
  /** Sanitised value the prompt will actually see. */
  applied: string;
}

export interface TrackDetailAdjustments {
  aspect_ratio?: TrackDetailAdjustment;
  visual_style?: TrackDetailAdjustment;
}

export function hasTrackDetailAdjustments(a: TrackDetailAdjustments): boolean {
  return !!(a.aspect_ratio || a.visual_style);
}

/**
 * Report which fields the sanitiser silently rewrote when hydrating a
 * persisted / user-provided payload. Complements
 * `validateTrackDetailInputs` (which flags *blocking* problems): this
 * function reports *non-blocking* transforms — coerced aliases, missing
 * values that fell back to defaults, and safe trims — so the storyboard
 * summary can show "visual_style was trimmed to 200 chars" etc. before
 * the user spends credits.
 */
export function describeTrackDetailAdjustments(raw: {
  aspect_ratio?: unknown;
  visual_style?: unknown;
}): TrackDetailAdjustments {
  const out: TrackDetailAdjustments = {};

  // ---- Aspect ratio ----
  const rawAspect = raw.aspect_ratio;
  const cleanedAspect = sanitizeAspectRatio(rawAspect);
  if (rawAspect === undefined || rawAspect === null || rawAspect === "") {
    out.aspect_ratio = {
      kind: "defaulted",
      applied: cleanedAspect,
      message: `Aspect ratio wasn't set — defaulted to ${cleanedAspect}.`,
    };
  } else if (typeof rawAspect !== "string") {
    out.aspect_ratio = {
      kind: "defaulted",
      applied: cleanedAspect,
      message: `Aspect ratio wasn't a valid string — defaulted to ${cleanedAspect}.`,
    };
  } else if (!ALLOWED_ASPECT_RATIOS.includes(rawAspect as TrackAspectRatio)) {
    // If it maps cleanly via an alias → coerced; if it fell back → defaulted.
    const norm = rawAspect.trim().toLowerCase().replace(/\s+/g, "");
    const coercible = new Set([
      "16:9","16x9","widescreen","landscape",
      "9:16","9x16","vertical","portrait",
      "1:1","1x1","square",
    ]);
    if (coercible.has(norm)) {
      out.aspect_ratio = {
        kind: "coerced",
        applied: cleanedAspect,
        message: `"${rawAspect}" was interpreted as ${cleanedAspect}.`,
      };
    } else {
      out.aspect_ratio = {
        kind: "defaulted",
        applied: cleanedAspect,
        message: `"${rawAspect}" isn't a supported aspect ratio — defaulted to ${cleanedAspect}.`,
      };
    }
  }

  // ---- Visual style ----
  const rawStyle = raw.visual_style;
  if (typeof rawStyle === "string" && rawStyle.length > 0) {
    const cleaned = sanitizeVisualStyle(rawStyle);
    // eslint-disable-next-line no-control-regex
    const hasControls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(rawStyle);
    const wasTrimmed = rawStyle.length > TRACK_DETAIL_LIMITS.visual_style;
    if (hasControls && cleaned) {
      out.visual_style = {
        kind: "stripped",
        applied: cleaned,
        message: "Control characters were removed from Visual style.",
      };
    } else if (wasTrimmed) {
      out.visual_style = {
        kind: "trimmed",
        applied: cleaned,
        message: `Visual style was trimmed to ${TRACK_DETAIL_LIMITS.visual_style} chars (was ${rawStyle.length}).`,
      };
    } else if (cleaned !== rawStyle.trim().replace(/\s+/g, " ")) {
      out.visual_style = {
        kind: "coerced",
        applied: cleaned,
        message: "Visual style whitespace was normalised.",
      };
    }
  }

  return out;
}

/**
 * Compare the raw persisted / editing value against what the sanitiser
 * would emit. Returns a human-readable message per invalid field so the
 * UI can (a) render inline validation, and (b) disable Generate until
 * the user fixes it — no silent coercion at generation time.
 *
 * Only aspect_ratio and visual_style are surfaced today because they
 * are the two fields threaded directly into prompt strings and the
 * image model. Other fields are cleaned but never blocking.
 */
export function validateTrackDetailInputs(raw: {
  aspect_ratio?: unknown;
  visual_style?: unknown;
}): TrackDetailIssues {
  const issues: TrackDetailIssues = {};

  // Aspect ratio — accept the whitelist directly; anything else is
  // either an alias we happily coerce (16x9, vertical, …) or garbage
  // we surface. We only flag when the *raw* value differs from the
  // sanitised one AND the raw value was actually provided.
  const rawAspect = raw.aspect_ratio;
  if (rawAspect !== undefined && rawAspect !== null && rawAspect !== "") {
    if (typeof rawAspect !== "string") {
      issues.aspect_ratio = "Aspect ratio must be text (16:9, 9:16, or 1:1).";
    } else if (!ALLOWED_ASPECT_RATIOS.includes(rawAspect as TrackAspectRatio)) {
      // Coercible aliases are OK — only complain if sanitizeAspectRatio
      // couldn't map to a real ratio and had to fall back.
      const norm = rawAspect.trim().toLowerCase().replace(/\s+/g, "");
      const coercible = new Set([
        "16:9","16x9","widescreen","landscape",
        "9:16","9x16","vertical","portrait",
        "1:1","1x1","square",
      ]);
      if (!coercible.has(norm)) {
        issues.aspect_ratio = `"${rawAspect}" is not a supported aspect ratio. Use 16:9, 9:16, or 1:1.`;
      }
    }
  }

  // Visual style — surface obvious problems: non-string, control chars,
  // over-length, or a value that collapses to empty after cleaning.
  const rawStyle = raw.visual_style;
  if (rawStyle !== undefined && rawStyle !== null && rawStyle !== "") {
    if (typeof rawStyle !== "string") {
      issues.visual_style = "Visual style must be text.";
    } else {
      // eslint-disable-next-line no-control-regex
      const hasControls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(rawStyle);
      const cleaned = sanitizeVisualStyle(rawStyle);
      if (rawStyle.trim() && !cleaned) {
        issues.visual_style = "Visual style contains only unsupported characters.";
      } else if (hasControls) {
        issues.visual_style = "Visual style contains control characters — please retype it.";
      } else if (rawStyle.length > TRACK_DETAIL_LIMITS.visual_style) {
        issues.visual_style = `Visual style is too long (${rawStyle.length}/${TRACK_DETAIL_LIMITS.visual_style} chars).`;
      }
    }
  }

  return issues;
}

/**
 * Parse the `{ error: "invalid_track_details", fieldErrors }` payload the
 * generate-storylines / generate-scene-image edge functions return when
 * strict Zod validation rejects `aspect_ratio` or `visual_style`. Returns
 * `null` when the response isn't that shape so callers can fall through
 * to their generic error handling.
 */
export function parseTrackDetailsRejection(payload: unknown): {
  message: string;
  fieldErrors: TrackDetailIssues;
} | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (p.error !== "invalid_track_details") return null;
  const fe = (p.fieldErrors && typeof p.fieldErrors === "object")
    ? p.fieldErrors as Record<string, unknown>
    : {};
  const fieldErrors: TrackDetailIssues = {};
  if (typeof fe.aspect_ratio === "string") fieldErrors.aspect_ratio = fe.aspect_ratio;
  if (typeof fe.visual_style === "string") fieldErrors.visual_style = fe.visual_style;
  const message = typeof p.message === "string" && p.message
    ? p.message
    : "Track Details were rejected by the server. Fix them and try again.";
  return { message, fieldErrors };
}
