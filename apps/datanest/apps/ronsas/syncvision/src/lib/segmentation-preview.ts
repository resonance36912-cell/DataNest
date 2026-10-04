/**
 * Client-side preview of segmentation boundaries — runs the same refine + snap
 * passes as the production `segmentAudio` flow, but without hitting the server
 * `segment-audio` endpoint. Lets the user visualize how their phrase-snap
 * settings will divide the track before paying for any AI calls.
 */

import { refineSegmentBoundaries, type WaveformPeakData } from "@/lib/waveform-peaks";
import { snapBoundariesToPhraseEnds } from "@/lib/phrase-snap";

export interface PreviewSegment {
  index: number;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
}

export interface PreviewOpts {
  window: number;
  gapThreshold: number;
  minLen: number;
  maxLen: number;
}

export interface PreviewResult {
  segments: PreviewSegment[];
  boundaries: number[]; // interior boundaries only (excludes 0 and duration)
  peakShifted: number;
  phraseShifted: number;
}

export function computeSegmentationPreview(
  durationSec: number,
  words: Array<{ start: number; end: number }>,
  peakData: WaveformPeakData | null,
  opts: PreviewOpts
): PreviewResult {
  if (durationSec <= 0) {
    return { segments: [], boundaries: [], peakShifted: 0, phraseShifted: 0 };
  }

  // Step 1: even buckets sized to maxLen.
  const count = Math.max(1, Math.ceil(durationSec / opts.maxLen));
  const bucket = durationSec / count;
  let segs: PreviewSegment[] = Array.from({ length: count }, (_, i) => {
    const start = i * bucket;
    const end = i === count - 1 ? durationSec : (i + 1) * bucket;
    return { index: i, start_sec: start, end_sec: end, duration_sec: end - start };
  });

  // Step 2: shift boundaries to silence/low-energy via peak data.
  let peakShifted = 0;
  if (peakData && segs.length > 1) {
    const before = segs.map((s) => s.end_sec);
    const refined = refineSegmentBoundaries(segs, peakData) as PreviewSegment[];
    peakShifted = refined.filter((s, i) => Math.abs(s.end_sec - before[i]) > 0.1).length;
    segs = refined;
  }

  // Step 3: phrase-snap to nearest natural phrase end.
  let phraseShifted = 0;
  if (segs.length > 1 && words.length > 0 && opts.window > 0) {
    const snapped = snapBoundariesToPhraseEnds(segs, words, {
      window: opts.window,
      gapThreshold: opts.gapThreshold,
      minLen: opts.minLen,
      maxLen: opts.maxLen,
    });
    phraseShifted = snapped.shifted;
    segs = snapped.segments as PreviewSegment[];
  }

  const boundaries = segs.slice(0, -1).map((s) => s.end_sec);
  return { segments: segs, boundaries, peakShifted, phraseShifted };
}
