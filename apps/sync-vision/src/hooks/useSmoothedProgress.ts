import { useEffect, useRef, useState } from "react";
import { smoothProgress, simulatedBaseline } from "@/lib/progressSmoothing";

/**
 * useSmoothedProgress — drop-in smoother that reuses the *exact* curve and
 * easing logic powering per-scene video generation, so upload/transcription/
 * merge/vocal-sync bars all feel identical:
 *   target = max(currentDisplayed, simulatedBaseline(elapsed), realProgress)
 *   each tick eases displayed → target so big real-world jumps don't teleport.
 *
 *  - `active`         — true while the job is running. Flipping false freezes
 *                       the smoother immediately (no further updates).
 *  - `real`           — latest real progress reported by backend (0-100), or
 *                       null/undefined when no real sample has landed yet.
 *  - `forceComplete`  — when true, snap the displayed value to 100 once and
 *                       stop smoothing. Used for terminal "done" transitions.
 *  - `tau`/`ceiling`  — shape of the simulated baseline. Defaults match the
 *                       video-generation curve (`1 - exp(-t/120)`, capped 95).
 *
 * Returns a 0-100 displayed value safe to feed straight into a progress bar.
 */
export interface UseSmoothedProgressOpts {
  active: boolean;
  real?: number | null;
  forceComplete?: boolean;
  tau?: number;
  ceiling?: number;
  /** Tick interval in ms. Lower = snappier, higher = cheaper. */
  intervalMs?: number;
}

/**
 * Indicates which signal is currently driving the progress value, so consumers
 * can render a small trust-building badge ("Live update" vs "Estimating…").
 *
 *  - `idle`      — bar isn't running yet (or finished + reset).
 *  - `simulated` — value is being driven by the time-based baseline because
 *                  no recent real sample has overtaken it.
 *  - `real`      — most recent real DB/webhook sample is at or above the
 *                  simulated baseline; the bar is tracking ground truth.
 *  - `complete`  — terminal snap to 100 (success).
 */
export type ProgressSource = "idle" | "simulated" | "real" | "complete";

export interface SmoothedProgressDetailed {
  /** 0-100 displayed value. */
  value: number;
  /** Which signal is currently dominant. */
  source: ProgressSource;
  /** Epoch ms of the most recent real sample, or null if none have landed. */
  lastRealAt: number | null;
}

function useSmoothedProgressInternal(opts: UseSmoothedProgressOpts): SmoothedProgressDetailed {
  const { active, real, forceComplete, tau = 120, ceiling = 95, intervalMs = 500 } = opts;
  const [displayed, setDisplayed] = useState(0);
  const [source, setSource] = useState<ProgressSource>("idle");
  const [lastRealAt, setLastRealAt] = useState<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const lastTickAtRef = useRef<number | null>(null);
  const realRef = useRef<number | null>(null);
  const lastRealAtRef = useRef<number | null>(null);

  // Track the latest real value via a ref so the interval doesn't restart
  // every time the backend posts a new sample.
  useEffect(() => {
    if (typeof real === "number" && Number.isFinite(real)) {
      const next = Math.max(realRef.current ?? 0, real);
      // Only mark as a fresh real sample if it actually moved the needle.
      if (next !== realRef.current) {
        realRef.current = next;
        lastRealAtRef.current = Date.now();
        setLastRealAt(lastRealAtRef.current);
      }
    }
  }, [real]);

  // Reset internal clocks when activation flips on; freeze when it flips off.
  useEffect(() => {
    if (active) {
      startedAtRef.current = Date.now();
      lastTickAtRef.current = Date.now();
      // Fresh run → wipe any prior real sample (a previous attempt's 90%
      // shouldn't bias the new bar).
      realRef.current = null;
      lastRealAtRef.current = null;
      setLastRealAt(null);
      setDisplayed(0);
      setSource("simulated");
    } else {
      startedAtRef.current = null;
      lastTickAtRef.current = null;
      setSource((curr) => (curr === "complete" ? "complete" : "idle"));
    }
  }, [active]);

  // Terminal snap. We still bail out of the ticker via the `active` reset
  // effect, but consumers can fire `forceComplete` independently of `active`
  // for cases where they want to display 100 briefly before tearing down.
  useEffect(() => {
    if (forceComplete) {
      setDisplayed(100);
      setSource("complete");
    }
  }, [forceComplete]);

  useEffect(() => {
    if (!active || forceComplete) return;
    const id = setInterval(() => {
      const now = Date.now();
      const startedAt = startedAtRef.current ?? now;
      const dtMs = Math.max(100, Math.min(5000, now - (lastTickAtRef.current ?? now)));
      lastTickAtRef.current = now;
      const elapsed = (now - startedAt) / 1000;
      const sim = simulatedBaseline(elapsed, ceiling, tau);
      setDisplayed((curr) =>
        smoothProgress({
          current: curr,
          simulated: sim,
          real: realRef.current,
          dtMs,
        }),
      );
      // Source: real wins whenever we have a sample at/above the simulated
      // baseline (i.e. the backend has caught up to or surpassed our guess).
      const realVal = realRef.current;
      setSource(typeof realVal === "number" && realVal >= sim ? "real" : "simulated");
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, forceComplete, intervalMs, ceiling, tau]);

  return { value: displayed, source, lastRealAt };
}

/**
 * Backwards-compatible wrapper that returns just the displayed value.
 * Use `useSmoothedProgressDetailed` when you also want the source badge.
 */
export function useSmoothedProgress(opts: UseSmoothedProgressOpts): number {
  return useSmoothedProgressInternal(opts).value;
}

/**
 * Detailed variant: returns the displayed value alongside the active source
 * (`real` vs `simulated`) so the UI can show a trust hint next to the bar.
 */
export function useSmoothedProgressDetailed(
  opts: UseSmoothedProgressOpts,
): SmoothedProgressDetailed {
  return useSmoothedProgressInternal(opts);
}
