/**
 * Classify audio segments as A-Roll (vocal-driven) vs B-Roll (instrumental /
 * sparse-vocal). A segment becomes B-Roll when either:
 *   - the largest stretch with no transcribed words ≥ minGapSec, or
 *   - lyric density is below minDensityWps words/sec.
 *
 * Inputs are intentionally minimal so this works against any transcript that
 * carries word-level timings (start/end seconds).
 */

export interface BrollSegmentInput {
  index: number;
  start_sec: number;
  end_sec: number;
}

export interface BrollWordInput {
  start: number;
  end: number;
  text?: string;
}

export type BrollReason =
  | "vocal"
  | "instrumental_gap"
  | "low_vocal_density"
  | "instrumental_gap+low_density";

export interface SegmentClassification {
  index: number;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
  word_count: number;
  words_per_sec: number;
  largest_gap_sec: number;
  is_broll: boolean;
  reason: BrollReason;
}

export interface ClassifyOptions {
  /** Minimum silent stretch (no words) to flag instrumental B-Roll. */
  minGapSec?: number;
  /** Word density below which a segment is flagged sparse-vocal B-Roll. */
  minDensityWps?: number;
}

export function classifySegmentsForBroll(
  segments: BrollSegmentInput[],
  words: BrollWordInput[] | undefined,
  opts: ClassifyOptions = {},
): SegmentClassification[] {
  const minGap = opts.minGapSec ?? 4;
  const minDensity = opts.minDensityWps ?? 0.5;
  const sortedWords = (words ?? [])
    .filter(w => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start)
    .slice()
    .sort((a, b) => a.start - b.start);

  return segments.map(seg => {
    const duration = Math.max(0.001, seg.end_sec - seg.start_sec);
    // Words whose midpoint falls inside the segment.
    const inSeg = sortedWords.filter(w => {
      const mid = (w.start + w.end) / 2;
      return mid >= seg.start_sec && mid < seg.end_sec;
    });
    const wps = inSeg.length / duration;

    // Largest silent gap inside [start, end] using word boundaries.
    let cursor = seg.start_sec;
    let largestGap = 0;
    for (const w of inSeg) {
      const gap = Math.max(0, w.start - cursor);
      if (gap > largestGap) largestGap = gap;
      cursor = Math.max(cursor, w.end);
    }
    const trailing = Math.max(0, seg.end_sec - cursor);
    if (trailing > largestGap) largestGap = trailing;
    if (inSeg.length === 0) largestGap = duration;

    const gapHit = largestGap >= minGap;
    const densityHit = wps < minDensity;
    const isBroll = gapHit || densityHit;
    const reason: BrollReason = !isBroll
      ? "vocal"
      : gapHit && densityHit
      ? "instrumental_gap+low_density"
      : gapHit
      ? "instrumental_gap"
      : "low_vocal_density";

    return {
      index: seg.index,
      start_sec: seg.start_sec,
      end_sec: seg.end_sec,
      duration_sec: duration,
      word_count: inSeg.length,
      words_per_sec: Number(wps.toFixed(3)),
      largest_gap_sec: Number(largestGap.toFixed(2)),
      is_broll: isBroll,
      reason,
    };
  });
}

export interface BrollPlanSummary {
  total: number;
  broll_count: number;
  aroll_count: number;
  broll_seconds: number;
  aroll_seconds: number;
  coverage_seconds: number;
}

export function summarizeBrollPlan(rows: SegmentClassification[]): BrollPlanSummary {
  const total = rows.length;
  let brollSec = 0;
  let arollSec = 0;
  let brollCount = 0;
  for (const r of rows) {
    if (r.is_broll) { brollCount += 1; brollSec += r.duration_sec; }
    else arollSec += r.duration_sec;
  }
  return {
    total,
    broll_count: brollCount,
    aroll_count: total - brollCount,
    broll_seconds: Number(brollSec.toFixed(2)),
    aroll_seconds: Number(arollSec.toFixed(2)),
    coverage_seconds: Number((brollSec + arollSec).toFixed(2)),
  };
}
