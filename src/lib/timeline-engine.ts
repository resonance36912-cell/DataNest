/**
 * Timeline Engine — snap calculations, gap detection, ripple helpers, marker logic.
 * Pure functions for testable, predictable timeline operations.
 */

export interface TimelineClip {
  id: string | number;
  startSec: number;
  endSec: number;
  durationSec: number;
  trackIndex?: number;
  locked?: boolean;
}

export interface TimelineMarker {
  id: string;
  timeSec: number;
  title: string;
  color: string;
  note?: string;
}

export interface SnapResult {
  snappedTime: number;
  snapType: "clip-start" | "clip-end" | "playhead" | "marker" | "boundary" | null;
  snapSourceId?: string | number;
}

export interface GapInfo {
  startSec: number;
  endSec: number;
  durationSec: number;
  afterClipIndex: number;
}

// ─── SNAP LOGIC ───

const DEFAULT_SNAP_THRESHOLD_PX = 8;

/** Convert pixel distance to time distance based on zoom */
export function pxToTimeDelta(px: number, pxPerSec: number): number {
  return px / Math.max(pxPerSec, 1);
}

/** Find the nearest snap point for a given time */
export function findSnapPoint(
  timeSec: number,
  clips: TimelineClip[],
  markers: TimelineMarker[],
  playheadSec: number,
  pxPerSec: number,
  thresholdPx: number = DEFAULT_SNAP_THRESHOLD_PX,
  excludeClipId?: string | number
): SnapResult {
  const threshold = pxToTimeDelta(thresholdPx, pxPerSec);
  let bestDist = Infinity;
  let best: SnapResult = { snappedTime: timeSec, snapType: null };

  // Snap to clip edges
  for (const clip of clips) {
    if (clip.id === excludeClipId) continue;
    const dStart = Math.abs(timeSec - clip.startSec);
    if (dStart < threshold && dStart < bestDist) {
      bestDist = dStart;
      best = { snappedTime: clip.startSec, snapType: "clip-start", snapSourceId: clip.id };
    }
    const dEnd = Math.abs(timeSec - clip.endSec);
    if (dEnd < threshold && dEnd < bestDist) {
      bestDist = dEnd;
      best = { snappedTime: clip.endSec, snapType: "clip-end", snapSourceId: clip.id };
    }
  }

  // Snap to playhead
  const dPlayhead = Math.abs(timeSec - playheadSec);
  if (dPlayhead < threshold && dPlayhead < bestDist) {
    bestDist = dPlayhead;
    best = { snappedTime: playheadSec, snapType: "playhead" };
  }

  // Snap to markers
  for (const marker of markers) {
    const dMarker = Math.abs(timeSec - marker.timeSec);
    if (dMarker < threshold && dMarker < bestDist) {
      bestDist = dMarker;
      best = { snappedTime: marker.timeSec, snapType: "marker", snapSourceId: marker.id };
    }
  }

  // Snap to timeline boundaries (0)
  if (timeSec < threshold && timeSec < bestDist) {
    best = { snappedTime: 0, snapType: "boundary" };
  }

  return best;
}

// ─── GAP DETECTION ───

/** Detect gaps between sequential clips (sorted by startSec) */
export function detectGaps(clips: TimelineClip[], minGapSec: number = 0.01): GapInfo[] {
  if (clips.length < 2) return [];
  const sorted = [...clips].sort((a, b) => a.startSec - b.startSec);
  const gaps: GapInfo[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = sorted[i].endSec;
    const gapEnd = sorted[i + 1].startSec;
    const gapDur = gapEnd - gapStart;
    if (gapDur >= minGapSec) {
      gaps.push({ startSec: gapStart, endSec: gapEnd, durationSec: gapDur, afterClipIndex: i });
    }
  }
  return gaps;
}

// ─── RIPPLE EDITING ───

/** Remove a clip and shift all subsequent clips left to close the gap */
export function rippleDelete(clips: TimelineClip[], deleteIndex: number): TimelineClip[] {
  if (deleteIndex < 0 || deleteIndex >= clips.length) return clips;
  const sorted = [...clips].sort((a, b) => a.startSec - b.startSec);
  const removed = sorted[deleteIndex];
  const gap = removed.durationSec;
  return sorted
    .filter((_, i) => i !== deleteIndex)
    .map((clip, i) => {
      if (i >= deleteIndex) {
        return { ...clip, startSec: clip.startSec - gap, endSec: clip.endSec - gap };
      }
      return clip;
    });
}

/** Close a specific gap by shifting all clips after the gap left */
export function closeGap(clips: TimelineClip[], gapInfo: GapInfo): TimelineClip[] {
  const sorted = [...clips].sort((a, b) => a.startSec - b.startSec);
  const shift = gapInfo.durationSec;
  return sorted.map((clip, i) => {
    if (i > gapInfo.afterClipIndex) {
      return { ...clip, startSec: clip.startSec - shift, endSec: clip.endSec - shift };
    }
    return clip;
  });
}

/** Close all gaps — ripple everything tight */
export function closeAllGaps(clips: TimelineClip[]): TimelineClip[] {
  const sorted = [...clips].sort((a, b) => a.startSec - b.startSec);
  let cursor = 0;
  return sorted.map(clip => {
    const result = { ...clip, startSec: cursor, endSec: cursor + clip.durationSec };
    cursor += clip.durationSec;
    return result;
  });
}

// ─── SPLIT ───

/** Split a clip at a given time, producing two clips */
export function splitClipAtTime(
  clip: TimelineClip,
  splitTimeSec: number
): [TimelineClip, TimelineClip] | null {
  if (splitTimeSec <= clip.startSec || splitTimeSec >= clip.endSec) return null;
  const leftDuration = splitTimeSec - clip.startSec;
  const rightDuration = clip.endSec - splitTimeSec;
  return [
    { ...clip, endSec: splitTimeSec, durationSec: leftDuration, id: `${clip.id}-L` },
    { ...clip, startSec: splitTimeSec, durationSec: rightDuration, id: `${clip.id}-R` },
  ];
}

// ─── TRIM ───

/** Trim clip start to a given time */
export function trimClipStart(clip: TimelineClip, newStartSec: number, minDuration: number = 0.1): TimelineClip {
  const clamped = Math.max(0, Math.min(newStartSec, clip.endSec - minDuration));
  return { ...clip, startSec: clamped, durationSec: clip.endSec - clamped };
}

/** Trim clip end to a given time */
export function trimClipEnd(clip: TimelineClip, newEndSec: number, minDuration: number = 0.1): TimelineClip {
  const clamped = Math.max(clip.startSec + minDuration, newEndSec);
  return { ...clip, endSec: clamped, durationSec: clamped - clip.startSec };
}

// ─── ZOOM ───

export const ZOOM_LEVELS = [10, 20, 40, 60, 80, 100, 150, 200, 300, 500] as const;
export const DEFAULT_ZOOM = 80; // px per second

/** Clamp zoom level to valid range */
export function clampZoom(pxPerSec: number): number {
  return Math.max(ZOOM_LEVELS[0], Math.min(ZOOM_LEVELS[ZOOM_LEVELS.length - 1], pxPerSec));
}

/** Calculate zoom to fit the entire timeline in the given container width */
export function zoomToFit(timelineDurationSec: number, containerWidthPx: number, padding: number = 40): number {
  if (timelineDurationSec <= 0) return DEFAULT_ZOOM;
  return clampZoom((containerWidthPx - padding) / timelineDurationSec);
}

// ─── TIMECODE ───

/** Format seconds as MM:SS.ms timecode */
export function formatTimecode(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const whole = Math.floor(secs);
  const ms = Math.round((secs - whole) * 100);
  return `${mins.toString().padStart(2, "0")}:${whole.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

// ─── FRAME HELPERS ───

const FPS = 30;
const FRAME_DURATION = 1 / FPS;

/** Nudge time by N frames */
export function nudgeFrames(timeSec: number, frames: number): number {
  return Math.max(0, timeSec + frames * FRAME_DURATION);
}

/** Snap time to nearest frame boundary */
export function snapToFrame(timeSec: number): number {
  return Math.round(timeSec * FPS) / FPS;
}

// ─── MARKERS ───

/** Create a new marker at the given time */
export function createMarker(timeSec: number, title?: string, color?: string): TimelineMarker {
  return {
    id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timeSec: snapToFrame(timeSec),
    title: title || `Marker at ${formatTimecode(timeSec)}`,
    color: color || "#f59e0b",
  };
}

/** Find the next/previous marker relative to the playhead */
export function findAdjacentMarker(
  markers: TimelineMarker[],
  currentTimeSec: number,
  direction: "next" | "prev"
): TimelineMarker | null {
  const sorted = [...markers].sort((a, b) => a.timeSec - b.timeSec);
  if (direction === "next") {
    return sorted.find(m => m.timeSec > currentTimeSec + 0.01) || null;
  } else {
    return [...sorted].reverse().find(m => m.timeSec < currentTimeSec - 0.01) || null;
  }
}

/** Find the next/previous cut point (clip edge) */
export function findAdjacentCut(
  clips: TimelineClip[],
  currentTimeSec: number,
  direction: "next" | "prev"
): number | null {
  const edges = clips.flatMap(c => [c.startSec, c.endSec]).sort((a, b) => a - b);
  const unique = [...new Set(edges)];
  if (direction === "next") {
    return unique.find(t => t > currentTimeSec + 0.01) ?? null;
  } else {
    return [...unique].reverse().find(t => t < currentTimeSec - 0.01) ?? null;
  }
}
