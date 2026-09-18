// Mirrors the classifier used by supabase/functions/generate-storylines.
// Returned mode drives the color-coded performance tag timeline in the UI.

export type PerformanceMode = "singing" | "rapping" | "expressive";

const RAP_GENRE_RE = /(hip[- ]?hop|rap|trap|drill|grime)/i;

export interface PerformanceTag {
  mode: PerformanceMode;
  /** Short user-facing label, e.g. "Rapping". */
  label: string;
  /** Tailwind classes for a filled background swatch. */
  bgClass: string;
  /** Tailwind classes for a text-colored label. */
  textClass: string;
  /** Tailwind classes for a subtle border. */
  borderClass: string;
  /** Words-per-second used for the classification (for tooltip / debug). */
  wps: number;
  /** Raw word count inside the segment. */
  wordCount: number;
}

const STYLE: Record<PerformanceMode, Omit<PerformanceTag, "mode" | "wps" | "wordCount">> = {
  singing: {
    label: "Singing",
    bgClass: "bg-primary/70",
    textClass: "text-primary",
    borderClass: "border-primary/40",
  },
  rapping: {
    label: "Rapping",
    bgClass: "bg-accent/80",
    textClass: "text-accent",
    borderClass: "border-accent/40",
  },
  expressive: {
    label: "Expressive",
    bgClass: "bg-warning/70",
    textClass: "text-warning",
    borderClass: "border-warning/40",
  },
};

export function classifyPerformance(
  lyrics: string | null | undefined,
  durationSec: number,
  genre?: string | null
): PerformanceTag {
  const words = (lyrics || "").trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const safeDur = Math.max(0.1, durationSec);
  const wps = wordCount / safeDur;
  const isRapGenre = !!genre && RAP_GENRE_RE.test(genre);

  let mode: PerformanceMode;
  if (wordCount === 0 || wps < 0.6) mode = "expressive";
  else if (isRapGenre || wps >= 2.2) mode = "rapping";
  else mode = "singing";

  return { mode, ...STYLE[mode], wps, wordCount };
}

/**
 * Extract the textual content from a transcribed word regardless of payload shape.
 * Different transcription providers emit `{text}`, `{word}`, or `{value}` — we
 * accept all of them so performance-tag classification never silently degrades
 * to "expressive" because of a field-name mismatch.
 */
export function getWordText(w: unknown): string {
  if (!w || typeof w !== "object") return "";
  const o = w as Record<string, unknown>;
  const raw = o.text ?? o.word ?? o.value ?? o.token ?? "";
  return typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
}

export const PERFORMANCE_LEGEND: Array<{ mode: PerformanceMode } & Omit<PerformanceTag, "mode" | "wps" | "wordCount">> = [
  { mode: "singing", ...STYLE.singing },
  { mode: "rapping", ...STYLE.rapping },
  { mode: "expressive", ...STYLE.expressive },
];
