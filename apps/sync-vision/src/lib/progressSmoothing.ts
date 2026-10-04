/**
 * Progress smoothing for long-running async jobs (video generation, merge,
 * upscale, lipsync, etc.).
 *
 * Two signals feed every job's progress bar:
 *   - simulated baseline — `1 - exp(-elapsed/120)` curve that always trends up
 *     so the user sees motion even when the provider doesn't report progress.
 *   - real DB progress   — sparse, jumpy values from `render_jobs.progress`
 *     (often 0 → 70 → 100 with seconds between samples).
 *
 * Naively taking `Math.max(simulated, real)` causes two problems:
 *   1. Jumps: real progress lands at 70 while simulated is at 25 → bar
 *      teleports forward, which feels broken.
 *   2. Stalls: real progress is 0 for a long time then suddenly 95 → bar
 *      sits at the simulated cap (95) and snaps to 100 only at done.
 *
 * `smoothProgress` maintains monotonic motion by easing the displayed value
 * toward a target (the max of simulated baseline, last real DB sample, and
 * current displayed). Easing speed is proportional to the remaining gap with
 * a small floor so big jumps catch up within a few seconds and small drifts
 * still nudge forward visibly.
 */

export interface SmoothProgressInput {
  /** Currently displayed value (0-100). */
  current: number;
  /** Simulated baseline driven by elapsed time. */
  simulated: number;
  /** Latest real progress reported by the backend, or null/undefined. */
  real?: number | null;
  /** Tick interval in ms; controls catch-up speed. Default 1000. */
  dtMs?: number;
  /** Hard upper bound until terminal (defaults to 99 — let `markDone` set 100). */
  cap?: number;
}

export function smoothProgress({
  current,
  simulated,
  real,
  dtMs = 1000,
  cap = 99,
}: SmoothProgressInput): number {
  const safeCurrent = Number.isFinite(current) ? Math.max(0, current) : 0;
  const safeSim = Number.isFinite(simulated) ? Math.max(0, simulated) : 0;
  const safeReal = typeof real === "number" && Number.isFinite(real) ? Math.max(0, real) : 0;

  // Target is the highest credible value, but never above cap (so we can't
  // race past 100 before the terminal handler fires).
  const rawTarget = Math.max(safeCurrent, safeSim, safeReal);
  const target = Math.min(cap, rawTarget);

  if (target <= safeCurrent) return safeCurrent; // strictly monotonic

  const gap = target - safeCurrent;
  // Per-second easing rate: 25% of the remaining gap, bounded so big jumps
  // catch up in ~3-4 ticks while small gaps still move at ≥0.6%/s.
  const ratePerSec = Math.max(0.6, Math.min(gap * 0.25, 8));
  const step = ratePerSec * (dtMs / 1000);
  const next = safeCurrent + Math.min(step, gap);
  // Round to one decimal to avoid noisy re-renders.
  return Math.round(next * 10) / 10;
}

/**
 * Computes the simulated baseline from elapsed time. Mirrors the curve used
 * by `useVideoPolling` so callers can share the same shape.
 */
export function simulatedBaseline(elapsedSec: number, ceiling = 95, tau = 120): number {
  if (elapsedSec <= 0) return 0;
  return Math.min(ceiling, ceiling * (1 - Math.exp(-elapsedSec / tau)));
}
