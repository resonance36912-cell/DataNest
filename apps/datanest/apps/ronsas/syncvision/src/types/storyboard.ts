/** Shared types and constants for the Storyboard workflow */

export interface StepProps {
  onNext: () => void;
  onPrev: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export interface VideoJobState {
  /** Currently displayed (smoothed) progress 0–100. */
  progress: number;
  status: "idle" | "running" | "done" | "error" | "canceled";
  startedAt?: number;
  /** Surfaced failure message — shown next to the per-scene Retry button. */
  error?: string;
  /** Whether the failure was a client-side polling timeout (vs. provider error). */
  timedOut?: boolean;
  /**
   * Where the failure originated, surfaced to the user so they understand
   * whether to retry, switch provider, or check connectivity:
   *  - "polling":  client-side polling timeout exceeded.
   *  - "upstream": provider/inference reported a failure (env.status === "failed").
   *  - "network":  repeated network/transport errors talking to job-status.
   */
  timeoutSource?: TimeoutSource;
  /** Last quality + provider used, so a Retry button can replay the same job. */
  lastQuality?: string;
  lastProvider?: string;
  /**
   * Latest *real* progress reported by `job-status` (render_jobs.progress).
   * `null`/undefined → no DB sample yet, the bar is showing the simulated
   * baseline. UI uses this to render a "live" indicator distinct from the
   * fallback ticker.
   */
  realProgress?: number | null;
  /**
   * Set when the Tier-2 reconcile endpoint (e.g. `check-job-status`) has
   * failed several times in a row. Surfaces inline so users understand why
   * the job is taking longer than usual without blocking the UI.
   */
  reconcileWarning?: string;
  /**
   * Latest backend lifecycle phase from the job-status envelope
   * (queued | processing | succeeded | failed). Drives the per-scene
   * phase timeline UI.
   */
  phase?: "queued" | "processing" | "succeeded" | "failed";
  /** ISO timestamp from envelope.updatedAt — drives "last updated Xs ago". */
  phaseUpdatedAt?: string | null;
  /**
   * Append-only audit trail of the most recent polling attempts for this
   * scene's video job. Drives the expandable per-scene error timeline so
   * users can see when each tick happened, what the backend reported, and
   * the final failure reason. Capped at MAX_POLL_EVENTS most-recent entries.
   */
  pollEvents?: PollEvent[];
}

export type PollEventType =
  | "start"
  | "poll"           // job-status sample (running/processing)
  | "phase"          // backend phase changed
  | "reconcile_ok"
  | "reconcile_fail"
  | "warning"
  | "timeout"
  | "error"
  | "canceled"
  | "done";

export interface PollEvent {
  /** epoch ms — when the event was recorded client-side */
  ts: number;
  type: PollEventType;
  /** human-readable detail — required for error/warning, optional otherwise */
  message?: string;
  /** backend lifecycle phase at the time of the event, when known */
  phase?: VideoJobState["phase"];
  /** real progress reported by the backend (0–100), when known */
  progress?: number;
}

/** Hard cap on retained poll events per scene (most-recent kept). */
export const MAX_POLL_EVENTS = 50;


export interface VideoHistoryItem {
  id: string;
  url: string;
  provider: string;
  quality: string;
  createdAt: string;
  trackingId?: string;
}

export interface UpscaleJobState {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
  status: string;
  progress: number;
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_RETRIES = 3;
export const RETRY_DELAY = 10000;
/** Default cap on total polling time before we give up on a job. */
export const VIDEO_POLL_TIMEOUT = 10 * 60 * 1000; // 10 minutes max polling
export const VIDEO_DURATION = 10;

// ─── Timeout sources & per-provider thresholds ────────────────────────────────

export type TimeoutSource = "polling" | "upstream" | "network";

/**
 * Default polling-timeout (ms) per provider value used in VIDEO_PROVIDER_OPTIONS.
 * Heavier models (lipsync 2.0, sadtalker) get more headroom; fast models stay
 * short so a stuck job surfaces sooner.
 */
export const DEFAULT_PROVIDER_TIMEOUTS_MS: Record<string, number> = {
  "musetalk-local": 30 * 60 * 1000, // 30 min, local RTX 4060 queue/inference headroom
  "wan-25": 10 * 60 * 1000,   // 10 min
  "sync-3": 12 * 60 * 1000,   // 12 min
  "sync-v2": 15 * 60 * 1000,  // 15 min
  "sync-so": 15 * 60 * 1000,  // 15 min
};

/** Hard bounds for user overrides (sanity guard against accidental 0 or huge values). */
export const PROVIDER_TIMEOUT_MIN_MS = 60 * 1000;        // 1 min
export const PROVIDER_TIMEOUT_MAX_MS = 60 * 60 * 1000;   // 60 min

const TIMEOUT_OVERRIDE_KEY = "rsv:provider-timeouts:v1";

/** Read all per-provider timeout overrides from localStorage (browser only). */
export function loadProviderTimeoutOverrides(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TIMEOUT_OVERRIDE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      out[k] = Math.min(PROVIDER_TIMEOUT_MAX_MS, Math.max(PROVIDER_TIMEOUT_MIN_MS, v));
    }
    return out;
  } catch {
    return {};
  }
}

/** Persist a single provider override (or remove it when value is null). */
export function saveProviderTimeoutOverride(provider: string, ms: number | null): void {
  if (typeof window === "undefined") return;
  const current = loadProviderTimeoutOverrides();
  if (ms == null) delete current[provider];
  else current[provider] = Math.min(PROVIDER_TIMEOUT_MAX_MS, Math.max(PROVIDER_TIMEOUT_MIN_MS, ms));
  try {
    window.localStorage.setItem(TIMEOUT_OVERRIDE_KEY, JSON.stringify(current));
  } catch { /* quota — ignore */ }
}

/**
 * Resolve the polling timeout for a given provider, honoring user overrides
 * first, then per-provider defaults, falling back to the global cap.
 */
export function getProviderTimeoutMs(
  provider: string | undefined | null,
  overrides?: Record<string, number>,
): number {
  const ov = overrides ?? loadProviderTimeoutOverrides();
  if (provider && typeof ov[provider] === "number") return ov[provider];
  if (provider && typeof DEFAULT_PROVIDER_TIMEOUTS_MS[provider] === "number") {
    return DEFAULT_PROVIDER_TIMEOUTS_MS[provider];
  }
  return VIDEO_POLL_TIMEOUT;
}

/**
 * Heuristic classification of a failure message into a TimeoutSource. Used as
 * a fallback when the polling loop hasn't flagged the source explicitly (for
 * example, a failure routed through generic toast paths).
 */
export function classifyFailure(message: string | undefined | null): {
  timedOut: boolean;
  source: TimeoutSource;
} {
  const m = (message || "").toLowerCase();
  if (/timed out|timeout/.test(m)) return { timedOut: true, source: "polling" };
  if (/network|fetch failed|failed to fetch|enetunreach|econnreset|socket|cors/.test(m)) {
    return { timedOut: false, source: "network" };
  }
  return { timedOut: false, source: "upstream" };
}

/** Progressive polling backoff: fast early, slows down to reduce rate-limit pressure */
export const getProgressivePollInterval = (elapsedMs: number): number => {
  if (elapsedMs < 30_000) return 3000;   // First 30s: every 3s
  if (elapsedMs < 90_000) return 5000;   // 30s–90s: every 5s
  return 10_000;                          // After 90s: every 10s
};

/**
 * Stall-aware backoff: when the backend hasn't reported any progress movement
 * for a while, we widen the poll interval beyond the elapsed-time baseline so
 * we stop hammering the API on jobs that are clearly stuck in a long phase.
 * As soon as progress moves again the caller resets `msSinceProgress` to 0,
 * which snaps the cadence back to the responsive baseline.
 *
 *  - <15s no progress: trust the elapsed-time baseline (UI stays snappy).
 *  - 15s–45s stall:    floor at 6s.
 *  - 45s–2m stall:     floor at 12s.
 *  - >2m stall:        floor at 20s (rate-limit safe steady state).
 *
 * Returns the LARGER of the time-based and stall-based intervals so we never
 * accidentally poll faster than the global elapsed-time backoff allows.
 */
export const getStallAwarePollInterval = (
  elapsedMs: number,
  msSinceProgress: number,
): number => {
  const base = getProgressivePollInterval(elapsedMs);
  let stallFloor = 0;
  if (msSinceProgress >= 120_000) stallFloor = 20_000;
  else if (msSinceProgress >= 45_000) stallFloor = 12_000;
  else if (msSinceProgress >= 15_000) stallFloor = 6_000;
  return Math.max(base, stallFloor);
};

/**
 * Stall-aware reconcile cadence. Reconcile is the more expensive Tier-2
 * call (it round-trips to fal.ai), so we widen its cadence faster than the
 * cheap DB-first job-status poll.
 */
export const getStallAwareReconcileInterval = (msSinceProgress: number): number => {
  if (msSinceProgress >= 120_000) return 30_000;
  if (msSinceProgress >= 45_000) return 15_000;
  if (msSinceProgress >= 15_000) return 8_000;
  return 5_000;
};

/**
 * Exponential backoff multiplier for consecutive transient failures
 * (network errors, 5xx, transport blips). Doubles each failure, capped at 8x
 * (~30s with our base intervals). Resets to 1x as soon as a request succeeds.
 *
 *  failures=0 → 1x   (no change, baseline cadence)
 *  failures=1 → 2x
 *  failures=2 → 4x
 *  failures=3 → 8x
 *  failures≥4 → 8x   (cap — don't pile on)
 */
export const getFailureBackoffMultiplier = (failures: number): number => {
  if (failures <= 0) return 1;
  return Math.min(8, 2 ** failures);
};

/** Hard ceiling on any single computed poll interval (safety net). */
export const MAX_POLL_INTERVAL_MS = 60_000;

/**
 * Phase-aware widening. While the provider job is still in its queue (no
 * worker assigned yet), polling more than every ~8s is pure waste — the
 * backend literally has no new information for us. We floor the cadence
 * accordingly and let stall/exp-backoff stack on top.
 */
export const getPhaseAwarePollFloor = (
  phase: "queued" | "processing" | "succeeded" | "failed" | undefined,
): number => {
  if (phase === "queued") return 8_000;
  return 0;
};

export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));


/** Extract a human-readable error message from an unknown error value */
export const safeErrorMsg = (err: unknown): string => {
  if (!err) return "";
  if (typeof err === "string") {
    if (err.startsWith("{")) {
      try {
        const parsed = JSON.parse(err);
        if (parsed?.message) return parsed.message;
        if (parsed?.error) return parsed.error;
        if (parsed?.msg) return parsed.msg;
      } catch { /* not JSON, use as-is */ }
    }
    return err;
  }
  if (typeof err === "object" && err !== null) {
    if ("message" in err && typeof (err as any).message === "string") return (err as any).message;
    if ("msg" in err && typeof (err as any).msg === "string") return (err as any).msg;
    if ("error" in err && typeof (err as any).error === "string") return (err as any).error;
    try { return JSON.stringify(err); } catch { return "Unknown error"; }
  }
  return String(err);
};
