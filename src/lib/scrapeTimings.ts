// Tiny helper extracted from ScrapeTimingReport so the heavy report component
// can be lazy-loaded without forcing the eager import to pull it in.
export interface ScrapeTiming {
  url: string;
  at: number;
  fastPassMs: number | null;
  deepPassMs: number | null;
  emergencyPassMs: number | null;
  totalMs: number;
  fastPassOk: boolean;
  deepPassOk: boolean;
  deepPassSkipped: boolean;
  emergencyRan: boolean;
  emergencyOk: boolean;
  clientElapsedMs: number;
  reachedTimeoutLabel: boolean;
  cached: boolean;
  timedOut: boolean;
}

export const SCRAPE_TIMINGS_KEY = "studio:scrape-timings";
export const SCRAPE_TIMINGS_MAX = 10;
// Mirrors PipelineProgress SCRAPE_SUBSTAGES last entry (70000ms) and the
// SCRAPE_CLIENT_TIMEOUT_MS guard in Studio.tsx.
export const SCRAPE_TIMEOUT_LABEL_AT_MS = 70_000;

export function recordScrapeTiming(
  entry: Omit<ScrapeTiming, "reachedTimeoutLabel"> & { reachedTimeoutLabel?: boolean },
) {
  const reachedTimeoutLabel =
    entry.reachedTimeoutLabel ?? entry.clientElapsedMs >= SCRAPE_TIMEOUT_LABEL_AT_MS;
  const full: ScrapeTiming = { ...entry, reachedTimeoutLabel };
  try {
    const prev: ScrapeTiming[] = JSON.parse(localStorage.getItem(SCRAPE_TIMINGS_KEY) ?? "[]");
    const next = [full, ...prev].slice(0, SCRAPE_TIMINGS_MAX);
    localStorage.setItem(SCRAPE_TIMINGS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("studio:scrape-timing", { detail: full }));
  } catch {
    /* ignore */
  }
}
