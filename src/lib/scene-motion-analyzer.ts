/**
 * Client-side "idle scene" detector for generated videos.
 *
 * Samples N frames from a video via <video>+<canvas>, computes per-region
 * mean absolute pixel difference between consecutive frames, and flags
 * scenes where nothing meaningfully moves — the common failure mode for
 * A-Roll generations that return a still portrait.
 *
 * Regions (normalized 0-1, top-left origin):
 *   - overall : whole frame
 *   - head    : top 55% (head + shoulders in a portrait/closeup)
 *   - mouth   : center vertical band, 45%-72% down (mouth zone in closeup)
 *   - hands   : bottom 30% (typical gesture zone)
 *
 * Scores are normalized to 0..100. Thresholds are conservative — they only
 * flag clearly idle clips so we don't cry wolf on quiet performance takes.
 */

export interface SceneMotionReport {
  frames: number;
  durationSec: number;
  scores: {
    overall: number;
    head: number;
    mouth: number;
    hands: number;
  };
  /** True when overall motion is below the idle threshold. */
  isIdle: boolean;
  /** True when the mouth region is essentially frozen (lip-sync target failure). */
  mouthFrozen: boolean;
  /** True when the head region shows no motion at all. */
  headFrozen: boolean;
  /** Fraction of sampled frames that appear to contain burned-in caption text (0..1). */
  captionScore: number;
  /** True when captions were detected in >30% of sampled frames. */
  hasBurnedInCaptions: boolean;
  /** Ordered, human-readable suggestions naming Scene Director fields to change. */
  suggestions: string[];
  /** Per-frame thumbnails + detected caption band, present only when hasBurnedInCaptions is true. */
  captionFrames?: CaptionFrame[];
}

export interface CaptionFrame {
  /** Timestamp of the sampled frame (seconds). */
  t: number;
  /** JPEG data URL of the down-scaled frame. */
  dataUrl: string;
  /** True when this frame independently tripped the caption heuristic. */
  hasCaption: boolean;
  /** Normalized 0..1 bounds of the detected text band, if any. */
  band?: { y1: number; y2: number };
}



const IDLE_OVERALL_THRESHOLD = 1.2;   // < ~1.2/100 mean abs diff = idle
const FROZEN_MOUTH_THRESHOLD = 0.9;
const FROZEN_HEAD_THRESHOLD = 0.8;

interface Region {
  key: keyof SceneMotionReport["scores"];
  x1: number; y1: number; x2: number; y2: number;
}

const REGIONS: Region[] = [
  { key: "overall", x1: 0.00, y1: 0.00, x2: 1.00, y2: 1.00 },
  { key: "head",    x1: 0.10, y1: 0.00, x2: 0.90, y2: 0.55 },
  { key: "mouth",   x1: 0.30, y1: 0.45, x2: 0.70, y2: 0.72 },
  { key: "hands",   x1: 0.00, y1: 0.70, x2: 1.00, y2: 1.00 },
];

function meanAbsDiffRegion(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  w: number,
  h: number,
  r: Region,
): number {
  const x1 = Math.max(0, Math.floor(r.x1 * w));
  const y1 = Math.max(0, Math.floor(r.y1 * h));
  const x2 = Math.min(w, Math.ceil(r.x2 * w));
  const y2 = Math.min(h, Math.ceil(r.y2 * h));
  let sum = 0;
  let count = 0;
  // Sample every 2nd pixel row/col for speed — plenty for motion detection.
  for (let y = y1; y < y2; y += 2) {
    for (let x = x1; x < x2; x += 2) {
      const i = (y * w + x) * 4;
      // Compare luminance channel only.
      const la = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
      const lb = 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
      sum += Math.abs(la - lb);
      count++;
    }
  }
  // Normalize to 0..100 (max luminance diff is 255).
  return count ? (sum / count) * (100 / 255) : 0;
}

/** Tunable caption-detection thresholds. Higher sensitivity → lower cutoffs. */
export interface CaptionDetectorOptions {
  /** Luminance edge threshold per pixel pair (default 55, range 20-120). Lower = more sensitive. */
  edgeThreshold?: number;
  /** Fraction of a row that must be edge-pixels to count as text-like (default 0.18). */
  rowEdgeRatio?: number;
  /** Consecutive text-like rows required (default 4). */
  requiredRows?: number;
  /** Fraction of sampled frames that must trip the band to flag the clip (default 0.30). */
  frameTriggerRatio?: number;
}

/** Preset defaults exposed to the UI slider (1=lenient .. 5=aggressive). */
export const CAPTION_SENSITIVITY_PRESETS: Record<number, Required<CaptionDetectorOptions>> = {
  1: { edgeThreshold: 85, rowEdgeRatio: 0.28, requiredRows: 6, frameTriggerRatio: 0.5 },
  2: { edgeThreshold: 70, rowEdgeRatio: 0.22, requiredRows: 5, frameTriggerRatio: 0.4 },
  3: { edgeThreshold: 55, rowEdgeRatio: 0.18, requiredRows: 4, frameTriggerRatio: 0.3 }, // current default
  4: { edgeThreshold: 42, rowEdgeRatio: 0.14, requiredRows: 3, frameTriggerRatio: 0.22 },
  5: { edgeThreshold: 30, rowEdgeRatio: 0.10, requiredRows: 2, frameTriggerRatio: 0.15 },
};

export async function analyzeSceneMotion(
  videoUrl: string,
  opts: {
    frames?: number;
    maxWidth?: number;
    timeoutMs?: number;
    captionDetector?: CaptionDetectorOptions;
  } = {},
): Promise<SceneMotionReport> {
  const frameCount = Math.max(4, opts.frames ?? 8);
  const maxWidth = opts.maxWidth ?? 240;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const cap = { ...CAPTION_SENSITIVITY_PRESETS[3], ...(opts.captionDetector ?? {}) };


  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = videoUrl;

  await new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error("video-load-timeout")), timeoutMs);
    video.onloadedmetadata = () => { window.clearTimeout(t); resolve(); };
    video.onerror = () => { window.clearTimeout(t); reject(new Error("video-load-error")); };
  });

  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  if (!duration) throw new Error("video-duration-unknown");

  const srcW = video.videoWidth || 640;
  const srcH = video.videoHeight || 360;
  const scale = Math.min(1, maxWidth / srcW);
  const w = Math.max(64, Math.round(srcW * scale));
  const h = Math.max(64, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas-2d-unavailable");

  const seekTo = (t: number) =>
    new Promise<void>((resolve, reject) => {
      const to = window.setTimeout(() => reject(new Error("seek-timeout")), 5000);
      const onSeeked = () => { window.clearTimeout(to); video.removeEventListener("seeked", onSeeked); resolve(); };
      video.addEventListener("seeked", onSeeked);
      video.currentTime = Math.min(duration - 0.05, Math.max(0, t));
    });

  const totals = { overall: 0, head: 0, mouth: 0, hands: 0 };
  let prev: Uint8ClampedArray | null = null;
  let diffs = 0;
  let framesWithCaptions = 0;
  const perFrame: Array<{ t: number; hasCaption: boolean; band?: { y1: number; y2: number } }> = [];

  for (let i = 0; i < frameCount; i++) {
    const t = (i / (frameCount - 1)) * (duration - 0.05);
    await seekTo(t);
    ctx.drawImage(video, 0, 0, w, h);
    const frame = ctx.getImageData(0, 0, w, h).data;
    if (prev) {
      for (const r of REGIONS) totals[r.key] += meanAbsDiffRegion(prev, frame, w, h, r);
      diffs++;
    }
    const band = detectCaptionBand(frame, w, h, cap);
    const hasCap = !!band;
    if (hasCap) framesWithCaptions++;
    perFrame.push({ t, hasCaption: hasCap, band: band ?? undefined });
    prev = new Uint8ClampedArray(frame);
  }

  const scores = {
    overall: diffs ? totals.overall / diffs : 0,
    head:    diffs ? totals.head    / diffs : 0,
    mouth:   diffs ? totals.mouth   / diffs : 0,
    hands:   diffs ? totals.hands   / diffs : 0,
  };

  const isIdle = scores.overall < IDLE_OVERALL_THRESHOLD;
  const mouthFrozen = scores.mouth < FROZEN_MOUTH_THRESHOLD;
  const headFrozen = scores.head < FROZEN_HEAD_THRESHOLD;
  const captionScore = frameCount ? framesWithCaptions / frameCount : 0;
  const hasBurnedInCaptions = captionScore >= cap.frameTriggerRatio;

  const suggestions: string[] = [];
  if (hasBurnedInCaptions) {
    suggestions.push(
      "Burned-in captions/subtitles detected — apply the \"Fix Overlaid Captions\" preset (adds negative prompts for text/subtitles and tightens to a lip-sync-safe closeup).",
    );
  }
  if (mouthFrozen) {
    suggestions.push(
      "Mouth region is frozen — set Performance → Emotion to 'intense' or 'defiant' and raise Intensity to 4+, and confirm Shot Role is A_ROLL_LIP_SYNC or PERFORMANCE_CLOSEUP.",
    );
  }
  if (headFrozen) {
    suggestions.push("Head is static — set Performance → Head Motion to 'subtle_nods'.");
  }
  if (scores.hands < 0.6) {
    suggestions.push("No gesture visible — set Performance → Gesture to 'rap_hand_gestures' or 'chest_tap'.");
  }
  if (isIdle && scores.overall < 0.6) {
    suggestions.push("Whole frame is static — set Camera → Movement to 'slow_push_in' to add motion without breaking lip-sync.");
  }
  if (isIdle && suggestions.length === 0) {
    suggestions.push("Scene reads as idle — try raising Performance Intensity and setting Camera Movement to 'slow_push_in'.");
  }

  /* Re-render thumbnails only when we need to show them — keeps the fast
   * path (motion-only) allocation-free and avoids leaving big data URLs in
   * memory for scenes with no caption issue. */
  let captionFrames: CaptionFrame[] | undefined;
  if (hasBurnedInCaptions) {
    const thumbW = Math.min(160, w);
    const thumbH = Math.max(64, Math.round(h * (thumbW / w)));
    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = thumbW;
    thumbCanvas.height = thumbH;
    const thumbCtx = thumbCanvas.getContext("2d");
    captionFrames = [];
    if (thumbCtx) {
      for (const p of perFrame) {
        await seekTo(p.t);
        thumbCtx.drawImage(video, 0, 0, thumbW, thumbH);
        captionFrames.push({
          t: p.t,
          hasCaption: p.hasCaption,
          band: p.band,
          dataUrl: thumbCanvas.toDataURL("image/jpeg", 0.7),
        });
      }
    }
  }

  return {
    frames: frameCount,
    durationSec: duration,
    scores,
    isIdle,
    mouthFrozen,
    headFrozen,
    captionScore,
    hasBurnedInCaptions,
    suggestions,
    captionFrames,
  };
}


/**
 * Heuristic burned-in caption detector. Scans the bottom third of the frame
 * for horizontal bands with many high-contrast luminance edges — the
 * fingerprint of on-screen text/subtitles regardless of font or language.
 * No OCR, no deps. Returns the normalized band bounds when a text-like band
 * is present, or null otherwise.
 */
function detectCaptionBand(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  opts: Required<Pick<CaptionDetectorOptions, "edgeThreshold" | "rowEdgeRatio" | "requiredRows">>,
): { y1: number; y2: number } | null {
  const yStart = Math.floor(h * 0.66);
  const yEnd = h - 2;
  const { edgeThreshold, rowEdgeRatio, requiredRows } = opts;

  let consecutive = 0;
  let bestRun = 0;
  let bestEnd = -1;
  const rowW = w - 2;

  for (let y = yStart; y < yEnd; y++) {
    let edges = 0;
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const iL = (y * w + (x - 1)) * 4;
      const l1 = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      const l0 = 0.299 * pixels[iL] + 0.587 * pixels[iL + 1] + 0.114 * pixels[iL + 2];
      if (Math.abs(l1 - l0) > edgeThreshold) edges++;
    }
    if (edges / rowW > rowEdgeRatio) {
      consecutive++;
      if (consecutive > bestRun) {
        bestRun = consecutive;
        bestEnd = y;
      }
    } else {
      consecutive = 0;
    }
  }
  if (bestRun < requiredRows || bestEnd < 0) return null;
  const y2 = bestEnd + 1;
  const y1 = y2 - bestRun;
  return { y1: y1 / h, y2: y2 / h };
}
