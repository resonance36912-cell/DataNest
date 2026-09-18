import type { Scene } from "@/contexts/ProjectContext";

const INSTRUMENTAL_MARKERS = new Set(["", "(instrumental)", "(silence)", "instrumental"]);
const UNDEFINED_GARBAGE_RE = /\bundefined\b/i;

export interface LyricsHealth {
  total: number;
  empty: number;
  garbage: number;
  instrumental: number;
  populated: number;
  /** Empty + garbage scenes that should have lyrics. Instrumentals don't count. */
  missing: number;
  /** missing / total (0 when total = 0). */
  missingRatio: number;
  /**
   * True when the storyboard is "unhealthy enough" to warrant re-segmentation:
   * any garbage marker, OR > 30% of scenes are missing lyrics.
   */
  needsResync: boolean;
}

/**
 * Analyze a storyboard's per-scene lyric_segment field to detect the
 * pre-fix payload-shape bug ("undefined" garbage) or simply empty buckets
 * that should have transcribed lyrics.
 *
 * This is the single source of truth for both the validation banner UI and
 * the auto-resync effect — keeping the rules in one place ensures the
 * "needs resync" judgement is identical in both code paths.
 */
export function analyzeLyricsHealth(scenes: Scene[]): LyricsHealth {
  let empty = 0;
  let garbage = 0;
  let instrumental = 0;
  let populated = 0;

  for (const s of scenes) {
    const raw = (s.lyric_segment ?? "").toString().trim();
    if (!raw) { empty++; continue; }
    if (UNDEFINED_GARBAGE_RE.test(raw)) { garbage++; continue; }
    if (INSTRUMENTAL_MARKERS.has(raw.toLowerCase())) { instrumental++; continue; }
    populated++;
  }

  const total = scenes.length;
  const missing = empty + garbage;
  const missingRatio = total > 0 ? missing / total : 0;
  const needsResync = total > 0 && (garbage > 0 || missingRatio > 0.3);

  return { total, empty, garbage, instrumental, populated, missing, missingRatio, needsResync };
}

export type ResyncReason = "empty" | "garbage" | "instrumental" | "ok";

export interface DiffToken {
  text: string;
  kind: "same" | "added" | "removed";
}

export interface ScenePreviewRow {
  scene_number: number;
  current: string;
  predicted: string;
  reason: ResyncReason;
  willUpdate: boolean;
  /** Whether the predicted lyrics differ from the current text (case-insensitive). */
  changed: boolean;
  /** Token-level diff of current → predicted, suitable for inline rendering. */
  currentDiff: DiffToken[];
  predictedDiff: DiffToken[];
}

export interface ResyncPreview {
  rows: ScenePreviewRow[];
  willUpdateCount: number;
  unchangedCount: number;
  instrumentalCount: number;
  /** True when transcript words were supplied so predicted lyrics are real. */
  hasPredictions: boolean;
}

export interface TranscriptWordLike {
  start: number;
  end: number;
  text?: string;
  word?: string;
  value?: string;
  token?: string;
}

function getWordText(w: TranscriptWordLike): string {
  return (w.word ?? w.text ?? w.value ?? w.token ?? "").toString().trim();
}

function parseTimeToSec(t: string | undefined): number {
  if (!t) return 0;
  const parts = t.split(":").map((p) => parseFloat(p));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

/**
 * Bucket transcript words into a scene's [start, end] window using
 * midpoint-based assignment — mirrors `useAnalysisEngine.segmentAudio`.
 */
function bucketWordsForScene(
  words: TranscriptWordLike[],
  startSec: number,
  endSec: number,
): string {
  const out: string[] = [];
  for (const w of words) {
    const mid = (w.start + w.end) / 2;
    if (mid >= startSec && mid < endSec) {
      const t = getWordText(w);
      if (t) out.push(t);
    }
  }
  return out.join(" ").trim();
}

/**
 * Tiny LCS-based token diff. Splits on whitespace, classifies each token as
 * same/added/removed so the UI can render an inline before/after view.
 */
function diffTokens(oldText: string, newText: string): { oldDiff: DiffToken[]; newDiff: DiffToken[] } {
  const a = oldText ? oldText.split(/\s+/).filter(Boolean) : [];
  const b = newText ? newText.split(/\s+/).filter(Boolean) : [];
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i].toLowerCase() === b[j].toLowerCase()
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const oldDiff: DiffToken[] = [];
  const newDiff: DiffToken[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i].toLowerCase() === b[j].toLowerCase()) {
      oldDiff.push({ text: a[i], kind: "same" });
      newDiff.push({ text: b[j], kind: "same" });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      oldDiff.push({ text: a[i], kind: "removed" });
      i++;
    } else {
      newDiff.push({ text: b[j], kind: "added" });
      j++;
    }
  }
  while (i < m) oldDiff.push({ text: a[i++], kind: "removed" });
  while (j < n) newDiff.push({ text: b[j++], kind: "added" });
  return { oldDiff, newDiff };
}

/**
 * Build a per-scene preview describing which scenes would be re-bucketed if
 * the user re-ran segmentation. When `words` is supplied, also computes the
 * predicted new lyrics per scene (by bucketing transcript words into each
 * scene's time window) plus a token-level diff of old vs new.
 */
export function previewResync(scenes: Scene[], words: TranscriptWordLike[] = []): ResyncPreview {
  const hasPredictions = words.length > 0;
  const rows: ScenePreviewRow[] = scenes.map((s) => {
    const raw = (s.lyric_segment ?? "").toString().trim();
    let reason: ResyncReason = "ok";
    if (!raw) reason = "empty";
    else if (UNDEFINED_GARBAGE_RE.test(raw)) reason = "garbage";
    else if (INSTRUMENTAL_MARKERS.has(raw.toLowerCase())) reason = "instrumental";

    const startSec = parseTimeToSec(s.time_start);
    const endSec = parseTimeToSec(s.time_end);
    const predicted = hasPredictions && endSec > startSec
      ? bucketWordsForScene(words, startSec, endSec)
      : "";

    // Garbage text isn't meaningful to diff against — treat it as empty for diffing.
    const cleanCurrent = UNDEFINED_GARBAGE_RE.test(raw) ? "" : raw;
    const { oldDiff, newDiff } = diffTokens(cleanCurrent, predicted);
    const changed = cleanCurrent.toLowerCase() !== predicted.toLowerCase();

    return {
      scene_number: s.scene_number,
      current: raw,
      predicted,
      reason,
      willUpdate: reason === "empty" || reason === "garbage",
      changed,
      currentDiff: oldDiff,
      predictedDiff: newDiff,
    };
  });

  return {
    rows,
    willUpdateCount: rows.filter((r) => r.willUpdate).length,
    unchangedCount: rows.filter((r) => r.reason === "ok").length,
    instrumentalCount: rows.filter((r) => r.reason === "instrumental").length,
    hasPredictions,
  };
}

export const AUTO_RESYNC_STORAGE_KEY = "storyboard.autoResyncLyrics";

export function loadAutoResyncPreference(): boolean {
  try {
    const raw = localStorage.getItem(AUTO_RESYNC_STORAGE_KEY);
    // Default ON — silent self-healing is the desired behaviour for the
    // common case of an existing project segmented before the payload-shape fix.
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

export function saveAutoResyncPreference(value: boolean): void {
  try {
    localStorage.setItem(AUTO_RESYNC_STORAGE_KEY, String(value));
  } catch {
    /* ignore quota / privacy-mode errors — preference will just reset next load. */
  }
}
