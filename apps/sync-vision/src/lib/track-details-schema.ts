/**
 * Shared Track Details Zod schemas — browser (Vite/React) copy.
 *
 * Kept in sync with `supabase/functions/_shared/track-details-schema.ts`
 * (Deno canonical copy). The block between the ▼▼▼ / ▲▲▲ markers must be
 * byte-for-byte identical in both files so client-side validation and
 * server-side validation reject / transform the exact same inputs.
 *
 * See the header comment on the canonical file for the full rationale.
 */

/* eslint-disable no-control-regex */
import { z } from "zod";

// ============================================================
// ▼▼▼ SHARED BLOCK — keep identical with server copy ▼▼▼
// ============================================================

export const ALLOWED_ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;
export type TrackAspectRatio = typeof ALLOWED_ASPECT_RATIOS[number];
export const DEFAULT_ASPECT_RATIO: TrackAspectRatio = "16:9";

export const TRACK_DETAIL_LIMITS = {
  song_title: 120,
  artist_name: 120,
  visual_style: 200,
  mood: 80,
  pasted_lyrics: 20_000,
} as const;

/** Aspect-ratio aliases we silently coerce into the canonical value. */
const ASPECT_ALIASES: Record<string, TrackAspectRatio> = {
  "16:9": "16:9", "16x9": "16:9", "widescreen": "16:9", "landscape": "16:9",
  "9:16": "9:16", "9x16": "9:16", "vertical": "9:16", "portrait": "9:16",
  "1:1": "1:1",   "1x1": "1:1",   "square": "1:1",
};

const CONTROL_CHARS_WITH_WS = /[\u0000-\u001F\u007F-\u009F]/g;
const CONTROL_CHARS_KEEP_NL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

function scrubShort(input: string, maxLen: number): string {
  return input
    .replace(CONTROL_CHARS_WITH_WS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen)
    .trimEnd();
}

function scrubLyrics(input: string, maxLen: number): string {
  return input.replace(CONTROL_CHARS_KEEP_NL, "").trim().slice(0, maxLen);
}

/** A short free-text field: coerces non-strings to "", strips control
 *  chars, collapses whitespace, and caps length. */
export function shortTextSchema(maxLen: number) {
  return z
    .unknown()
    .transform((v) => (typeof v === "string" ? scrubShort(v, maxLen) : ""));
}

/** Free-form visual style — same rules as shortTextSchema but exported
 *  as a named schema so tests + callers can reference it explicitly. */
export const visualStyleSchema = shortTextSchema(TRACK_DETAIL_LIMITS.visual_style);

/** Lyrics field — keeps newlines, strips other control chars. */
export const lyricsSchema = z
  .unknown()
  .transform((v) => (typeof v === "string" ? scrubLyrics(v, TRACK_DETAIL_LIMITS.pasted_lyrics) : ""));

/** Aspect ratio — accepts common aliases, defaults to 16:9. */
export const aspectRatioSchema = z
  .unknown()
  .transform((v): TrackAspectRatio => {
    if (typeof v !== "string") return DEFAULT_ASPECT_RATIO;
    const n = v.trim().toLowerCase().replace(/\s+/g, "");
    if (!n) return DEFAULT_ASPECT_RATIO;
    return ASPECT_ALIASES[n] ?? DEFAULT_ASPECT_RATIO;
  });

/** Full Track Details payload as persisted / passed to prompt builders. */
export const trackDetailsSchema = z.object({
  song_title: shortTextSchema(TRACK_DETAIL_LIMITS.song_title),
  artist_name: shortTextSchema(TRACK_DETAIL_LIMITS.artist_name),
  visual_style: visualStyleSchema,
  mood: shortTextSchema(TRACK_DETAIL_LIMITS.mood),
  aspect_ratio: aspectRatioSchema,
  pasted_lyrics: lyricsSchema,
}).catchall(z.unknown()); // ignore unknown extras rather than reject

export type TrackDetailsInput = z.input<typeof trackDetailsSchema>;
export type TrackDetailsParsed = z.output<typeof trackDetailsSchema>;

/** Subset of Track Details threaded into the generate-storylines request. */
export const generateStorylinesTrackFieldsSchema = z.object({
  song_title: shortTextSchema(TRACK_DETAIL_LIMITS.song_title).optional().default(""),
  artist_name: shortTextSchema(TRACK_DETAIL_LIMITS.artist_name).optional().default(""),
  visual_style: visualStyleSchema.optional().default(""),
  aspect_ratio: aspectRatioSchema.optional().default(DEFAULT_ASPECT_RATIO),
});

/** Subset of Track Details threaded into each scene-image request. */
export const generateSceneImageTrackFieldsSchema = z.object({
  aspect_ratio: aspectRatioSchema.optional().default(DEFAULT_ASPECT_RATIO),
  visual_style_override: visualStyleSchema.optional().default(""),
});

/* ----------- STRICT (rejecting) variants ----------- */
/** Server-side validation for the request body. Unlike the "coercing"
 *  schemas above, these REJECT unsupported aspect ratios and visual
 *  styles that contain control characters or exceed the length cap.
 *  Callers get a `{ error, fieldErrors }` payload the UI can display
 *  verbatim instead of the prompt-builder silently swapping the value. */
export const strictAspectRatioSchema = z
  .union([z.undefined(), z.null(), z.literal("")])
  .or(z.enum(ALLOWED_ASPECT_RATIOS));

const CONTROL_CHARS_TEST = /[\u0000-\u001F\u007F-\u009F]/;
export const strictVisualStyleSchema = z
  .union([z.undefined(), z.null(), z.literal("")])
  .or(
    z
      .string()
      .max(
        TRACK_DETAIL_LIMITS.visual_style,
        `Visual style must be ${TRACK_DETAIL_LIMITS.visual_style} characters or fewer.`,
      )
      .refine((v) => !CONTROL_CHARS_TEST.test(v), {
        message: "Visual style contains control characters — please retype it.",
      }),
  );

export const strictTrackFieldsSchema = z.object({
  aspect_ratio: strictAspectRatioSchema,
  visual_style: strictVisualStyleSchema,
  visual_style_override: strictVisualStyleSchema,
}).partial();

export type TrackFieldsValidationSuccess = { ok: true };
export type TrackFieldsValidationFailure = {
  ok: false;
  fieldErrors: { aspect_ratio?: string; visual_style?: string };
};
export type TrackFieldsValidationResult =
  | TrackFieldsValidationSuccess
  | TrackFieldsValidationFailure;

/** Runs the strict validators against whatever the request body threw
 *  at us and returns per-field messages ready for the UI. Field names
 *  are normalised so both edge functions can share the same helper —
 *  `visual_style_override` maps back to `visual_style` because that is
 *  the label the user sees in the Upload form. */
export function validateTrackFieldsStrict(body: unknown): TrackFieldsValidationResult {
  const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const parsed = strictTrackFieldsSchema.safeParse({
    aspect_ratio: source.aspect_ratio,
    visual_style: source.visual_style,
    visual_style_override: source.visual_style_override,
  });
  if (parsed.success) {
    const success: TrackFieldsValidationSuccess = { ok: true };
    return success;
  }

  const fieldErrors: { aspect_ratio?: string; visual_style?: string } = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (key === "aspect_ratio") {
      // z.enum message is noisy — use a friendly canonical string.
      fieldErrors.aspect_ratio =
        `Aspect ratio must be one of ${ALLOWED_ASPECT_RATIOS.join(", ")}.`;
    } else if (key === "visual_style" || key === "visual_style_override") {
      // Prefer the more specific "contains control characters" refine
      // message over the generic length message when both fire.
      if (!fieldErrors.visual_style || issue.message.includes("control")) {
        fieldErrors.visual_style = issue.message;
      }
    }
  }
  const failure: TrackFieldsValidationFailure = { ok: false, fieldErrors };
  return failure;
}

// ============================================================
// ▲▲▲ END SHARED BLOCK ▲▲▲
// ============================================================
