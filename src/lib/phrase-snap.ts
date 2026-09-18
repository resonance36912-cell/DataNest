/**
 * Phrase-aware boundary snapping.
 *
 * After server-side segmentation returns ~10s boundaries, this utility nudges
 * each interior boundary toward the nearest natural phrase end (a word followed
 * by a silence gap >= `gapThreshold`) within a ±`window` budget — while keeping
 * every resulting segment within [`minLen`, `maxLen`]. The goal: maximize WAN
 * 2.5 slot utilization (target 10s) without slicing through a vocal phrase, so
 * each generated clip stays perfectly synced to the uploaded audio.
 */

export interface TimedWordLike {
  start: number;
  end: number;
}

export interface SegmentBoundary {
  index: number;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
}

export interface PhraseSnapOptions {
  /** Max seconds a boundary may shift left or right (default 2.0). */
  window?: number;
  /** Min silence gap between words that qualifies as a phrase end (default 0.3). */
  gapThreshold?: number;
  /** Hard min segment length after snapping (default 8). */
  minLen?: number;
  /** Hard max segment length after snapping (default 10). */
  maxLen?: number;
}

/**
 * Returns refined boundaries with adjacent segments rebalanced so each lands
 * inside [minLen, maxLen] whenever possible.
 */
export function snapBoundariesToPhraseEnds(
  segments: SegmentBoundary[],
  words: TimedWordLike[],
  opts: PhraseSnapOptions = {}
): { segments: SegmentBoundary[]; shifted: number } {
  const window = opts.window ?? 2.0;
  const gapThreshold = opts.gapThreshold ?? 0.3;
  const minLen = opts.minLen ?? 8;
  const maxLen = opts.maxLen ?? 10;

  if (segments.length < 2 || words.length === 0) {
    return { segments, shifted: 0 };
  }

  // Pre-compute phrase-end timestamps: word.end where gap to next word >= threshold.
  const sorted = [...words].sort((a, b) => a.start - b.start);
  const phraseEnds: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const w = sorted[i];
    const next = sorted[i + 1];
    if (!next || next.start - w.end >= gapThreshold) {
      phraseEnds.push(w.end);
    }
  }
  if (phraseEnds.length === 0) {
    return { segments, shifted: 0 };
  }

  const result = segments.map((s) => ({ ...s }));
  let shifted = 0;

  for (let i = 0; i < result.length - 1; i++) {
    const curr = result[i];
    const next = result[i + 1];
    const boundary = curr.end_sec;

    // Find best phrase-end candidate within window that keeps both segments in bounds.
    let best: number | null = null;
    let bestDist = Infinity;
    for (const pe of phraseEnds) {
      const delta = pe - boundary;
      if (Math.abs(delta) > window) continue;
      const newCurrLen = pe - curr.start_sec;
      const newNextLen = next.end_sec - pe;
      if (newCurrLen < minLen || newCurrLen > maxLen) continue;
      if (newNextLen < minLen * 0.5) continue; // allow tail to be short, but not microscopic
      if (Math.abs(delta) < bestDist) {
        bestDist = Math.abs(delta);
        best = pe;
      }
    }

    if (best != null && Math.abs(best - boundary) > 0.05) {
      curr.end_sec = best;
      curr.duration_sec = curr.end_sec - curr.start_sec;
      next.start_sec = best;
      next.duration_sec = next.end_sec - next.start_sec;
      shifted++;
    }
  }

  return { segments: result, shifted };
}
