import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { parseTierRequired } from "@/lib/tierRequired";
import { reportTierRequired } from "@/lib/invokeGated";
import { useJobStatus } from "@/hooks/useJobStatus";
import { useSmoothedProgressDetailed } from "@/hooks/useSmoothedProgress";
import {
  scheduleBillingReminder,
  maybeReplayBillingReminder,
  clearBillingReminder,
} from "@/lib/billingReminder";
import { MASTER_QUALITY_PROFILE } from "@/lib/master-quality";

export interface MergeJobState {
  mergeJobId: string | null;
  phase: "idle" | "concat" | "audio" | "lipsync" | "normalize" | "done" | "error";
  progress: number;
  finalUrl: string | null;
  error: string | null;
  /** Normalized provider error code, e.g. "FAL_BILLING_EXHAUSTED". */
  errorCode: string | null;
  /** fal.ai request id (provider_task_id) for support / debugging. */
  providerTaskId?: string | null;
  /** Verbatim merge_error_log column — full provider payload as text. */
  mergeErrorLog?: string | null;
  /** Raw `output` jsonb returned by the provider, if any. */
  rawOutput?: unknown;
  /** ISO timestamp the render_jobs row was created. */
  createdAt?: string | null;
  /** ISO timestamp of the most recent DB update. */
  updatedAt?: string | null;
}

export interface RefreshHistoryEntry {
  /** Stable id so re-renders / async effectiveness updates can match this entry. */
  id: string;
  /** Epoch ms the attempt was initiated. */
  at: number;
  source: "manual" | "auto-stuck" | "auto-continuous";
  outcome: "success" | "error" | "cooldown";
  /** True/false once the post-attempt window has resolved; null until then. */
  effective: boolean | null;
  durationMs?: number;
  error?: string | null;
  /** Merge progress (%) captured at attempt start. */
  progressBefore?: number;
  /** Merge progress (%) captured after the effectiveness window resolved. */
  progressAfter?: number | null;
  /** Epoch ms of last detected job advance, captured at attempt start. */
  lastAdvanceBefore?: number;
  /** Epoch ms of last detected job advance, captured after the window. */
  lastAdvanceAfter?: number | null;
  /** Project BPM at attempt start. */
  bpmBefore?: number | null;
  /** Project BPM after the effectiveness window resolved. */
  bpmAfter?: number | null;
  /** Lyrics-detection confidence (0-1) captured at attempt start. Static during a merge. */
  confidenceLyrics?: number | null;
  /** BPM-detection confidence (0-1) captured at attempt start. Static during a merge. */
  confidenceBpm?: number | null;
}

interface PersistedRefreshState {
  attempts: number;
  consecutiveFailures: number;
  lastPollAt: number | null;
  lastPollSource: "envelope" | "wallclock" | null;
  history: RefreshHistoryEntry[];
}

const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return {
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${token}`,
  };
};

const mapDbPhase = (p?: string): MergeJobState["phase"] => {
  if (!p) return "idle";
  if (p === "done") return "done";
  if (p === "normalize_pending") return "normalize";
  if (p === "lipsync_pending") return "lipsync";
  if (p === "compose_pending" || p === "concat_pending") return "concat";
  if (p === "audio_pending") return "audio";
  if (p.endsWith("_failed")) return "error";
  return "concat";
};

export function useAssemblyMerge() {
  const { user } = useAuth();
  // Mirror of latest merge progress so async timeouts in runRefresh can read
  // the current value without re-creating the callback on every progress tick.
  const progressRef = useRef<number>(0);
  // Latest project BPM, updated by callers via `setProjectBpm`. Captured into
  // each refresh-history entry so the diagnostics tooltip can show the BPM
  // alongside progress (BPM is static during a merge, but exposing before/
  // after lets users notice unexpected drift if a project is re-analyzed).
  const projectBpmRef = useRef<number | null>(null);
  const setProjectBpm = useCallback((bpm: number | null | undefined) => {
    projectBpmRef.current = typeof bpm === "number" && Number.isFinite(bpm) ? bpm : null;
  }, []);
  // Latest detection-confidence scores (0-1) for the active project's analysis.
  // Captured into refresh-history entries so the tooltip can explain why a
  // refresh might be ineffective (e.g. low-confidence transcription/BPM often
  // means the provider is replaying stale word timings).
  const confidenceLyricsRef = useRef<number | null>(null);
  const confidenceBpmRef = useRef<number | null>(null);
  const setConfidenceScores = useCallback(
    (scores: { lyrics?: number | null; bpm?: number | null } | null | undefined) => {
      const norm = (v: unknown) =>
        typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null;
      confidenceLyricsRef.current = norm(scores?.lyrics);
      confidenceBpmRef.current = norm(scores?.bpm);
    },
    [],
  );
  // Configurable thresholds (0-1) that automatically decide whether a refresh
  // attempt should be marked effective. Persisted in localStorage so changes
  // survive reloads. The decision rule combines movement + min(confidence):
  //   effective  ← moved AND minConf ≥ effectiveAtLeast
  //   ineffective ← !moved OR minConf < ineffectiveBelow
  //   otherwise  ← falls back to the movement signal alone.
  const CONF_THRESHOLD_KEY = "assembly.refresh.confidenceThresholds";
  type ConfThresholds = { effectiveAtLeast: number; ineffectiveBelow: number };
  const DEFAULT_CONF_THRESHOLDS: ConfThresholds = { effectiveAtLeast: 0.8, ineffectiveBelow: 0.4 };
  const [confidenceThresholds, setConfidenceThresholdsState] = useState<ConfThresholds>(() => {
    try {
      const raw = localStorage.getItem(CONF_THRESHOLD_KEY);
      if (!raw) return DEFAULT_CONF_THRESHOLDS;
      const parsed = JSON.parse(raw);
      const eff = Number(parsed?.effectiveAtLeast);
      const ineff = Number(parsed?.ineffectiveBelow);
      return {
        effectiveAtLeast: Number.isFinite(eff) ? Math.max(0, Math.min(1, eff)) : DEFAULT_CONF_THRESHOLDS.effectiveAtLeast,
        ineffectiveBelow: Number.isFinite(ineff) ? Math.max(0, Math.min(1, ineff)) : DEFAULT_CONF_THRESHOLDS.ineffectiveBelow,
      };
    } catch {
      return DEFAULT_CONF_THRESHOLDS;
    }
  });
  const confidenceThresholdsRef = useRef(confidenceThresholds);
  useEffect(() => { confidenceThresholdsRef.current = confidenceThresholds; }, [confidenceThresholds]);
  const setConfidenceThresholds = useCallback((next: Partial<ConfThresholds>) => {
    setConfidenceThresholdsState((prev) => {
      const merged: ConfThresholds = {
        effectiveAtLeast: Math.max(0, Math.min(1, next.effectiveAtLeast ?? prev.effectiveAtLeast)),
        ineffectiveBelow: Math.max(0, Math.min(1, next.ineffectiveBelow ?? prev.ineffectiveBelow)),
      };
      // Keep `ineffectiveBelow ≤ effectiveAtLeast` so the rule stays sane.
      if (merged.ineffectiveBelow > merged.effectiveAtLeast) {
        merged.ineffectiveBelow = merged.effectiveAtLeast;
      }
      try { localStorage.setItem(CONF_THRESHOLD_KEY, JSON.stringify(merged)); } catch { /* ignore */ }
      return merged;
    });
  }, []);
  const [mergeState, setMergeState] = useState<MergeJobState>({
    mergeJobId: null,
    phase: "idle",
    progress: 0,
    finalUrl: null,
    error: null,
      errorCode: null,
  });
  useEffect(() => {
    progressRef.current = mergeState.progress ?? 0;
  }, [mergeState.progress]);
  const [terminalToastFired, setTerminalToastFired] = useState(false);

  // ── Unified poller: DB-only reads via job-status, with check-merge-status
  //    invoked at a slower cadence to advance worker phases.
  const { data: jobEnv, error: pollError, forceProviderPoll } = useJobStatus({
    kind: "merge",
    jobId: mergeState.mergeJobId,
    enabled: !!mergeState.mergeJobId && mergeState.phase !== "done" && mergeState.phase !== "error",
    pollMs: 2500,
    reconcileEndpoint: "check-merge-status",
    reconcileBody: mergeState.mergeJobId ? { merge_job_id: mergeState.mergeJobId } : undefined,
    reconcileEveryMs: 5000,
  });

  // ── Stuck detection: track last time progress/phase advanced. After 20s
  //    of no movement we expose `isStuck` so the UI can offer "Force refresh".
  const lastAdvanceRef = useRef<number>(Date.now());
  const [isStuck, setIsStuck] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Cooldown after a force-refresh: prevents users from spamming the
  // provider re-poll button (which triggers a real fal.ai API call) while
  // a merge job is mid-flight. 8s gives the reconciler time to come back
  // with new data before another manual poke is meaningful.
  const COOLDOWN_MS = 8_000;
  const cooldownUntilRef = useRef<number>(0);
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState(0);
  // Persisted per merge-job cooldown so a page refresh mid-cooldown doesn't
  // hand the user a free re-poll. Keyed by merge_job_id; values are absolute
  // epoch-ms timestamps. We also janitor-sweep stale keys (>1h past expiry)
  // on every mount so localStorage doesn't grow unbounded.
  const COOLDOWN_STORAGE_PREFIX = "merge.cooldownUntil.";
  const cooldownStorageKey = useCallback(
    (jobId: string) => `${COOLDOWN_STORAGE_PREFIX}${jobId}`,
    [],
  );
  const persistCooldown = useCallback((jobId: string | null, untilMs: number) => {
    if (!jobId) return;
    try {
      if (untilMs > Date.now()) {
        localStorage.setItem(cooldownStorageKey(jobId), String(untilMs));
      } else {
        localStorage.removeItem(cooldownStorageKey(jobId));
      }
    } catch { /* ignore quota/SSR */ }
  }, [cooldownStorageKey]);
  const readCooldown = useCallback((jobId: string): number => {
    try {
      const raw = localStorage.getItem(cooldownStorageKey(jobId));
      const n = raw ? Number(raw) : 0;
      return Number.isFinite(n) ? n : 0;
    } catch { return 0; }
  }, [cooldownStorageKey]);

  // Janitor: clear cooldown entries that have been expired for >1h.
  useEffect(() => {
    try {
      const cutoff = Date.now() - 60 * 60 * 1000;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(COOLDOWN_STORAGE_PREFIX)) continue;
        const v = Number(localStorage.getItem(key));
        if (!Number.isFinite(v) || v < cutoff) localStorage.removeItem(key);
      }
    } catch { /* ignore */ }
  }, []);
  // Timestamp (ms epoch) of the most recent successful provider/reconcile
  // poll — surfaced in the UI so users can see the bar is live.
  const [lastPollAt, setLastPollAt] = useState<number | null>(null);
  // Where the most recent `lastPollAt` value came from:
  //   - "envelope":  parsed from jobEnv.updatedAt (the DB row's updated_at)
  //   - "wallclock": fallback Date.now() — happens after a manual force
  //                  refresh, or when the envelope had no usable updatedAt.
  const [lastPollSource, setLastPollSource] =
    useState<"envelope" | "wallclock" | null>(null);
  const lastEnvSigRef = useRef<string>("");
  // Track the most recent project the user attempted to merge — used to
  // scope the persisted billing reminder so it only re-surfaces in the
  // matching project context.
  const lastProjectIdRef = useRef<string | null>(null);
  // Forward ref so the billing-reminder toast can call resetMerge without
  // a temporal-dead-zone problem (resetMerge is declared further below).
  const resetMergeRef = useRef<((opts?: { source?: "manual" | "auto" }) => void) | null>(null);

  // On mount, replay any unresolved billing reminder so users who closed
  // the tab between exhaustion and retry still get nudged.
  useEffect(() => {
    maybeReplayBillingReminder({
      onRetry: () => resetMergeRef.current?.({ source: "manual" }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick the visible countdown while a cooldown is active.
  useEffect(() => {
    if (cooldownRemainingMs <= 0) return;
    const id = setInterval(() => {
      const remaining = Math.max(0, cooldownUntilRef.current - Date.now());
      setCooldownRemainingMs(remaining);
      if (remaining <= 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [cooldownRemainingMs]);

  // Hydrate cooldown from localStorage whenever the active merge job changes
  // (initial mount with a resumed job, switching jobs, etc.). If the stored
  // expiry is still in the future, restore both the ref and the visible
  // remaining-ms state so the countdown picks up where it left off.
  useEffect(() => {
    const jobId = mergeState.mergeJobId;
    if (!jobId) {
      cooldownUntilRef.current = 0;
      setCooldownRemainingMs(0);
      return;
    }
    const stored = readCooldown(jobId);
    const remaining = stored - Date.now();
    if (remaining > 0) {
      cooldownUntilRef.current = stored;
      setCooldownRemainingMs(remaining);
    } else {
      cooldownUntilRef.current = 0;
      setCooldownRemainingMs(0);
      if (stored) persistCooldown(jobId, 0); // sweep stale value
    }
  }, [mergeState.mergeJobId, readCooldown, persistCooldown]);

  // Opt-in: when the job sits without movement for >20s, automatically
  // trigger a Force refresh (respecting the cooldown). Persisted per-browser.
  const AUTO_REFRESH_KEY = "merge.autoRefreshOnStuck";
  const [autoRefreshOnStuck, setAutoRefreshOnStuckState] = useState<boolean>(() => {
    try { return localStorage.getItem(AUTO_REFRESH_KEY) === "1"; } catch { return false; }
  });
  const setAutoRefreshOnStuck = useCallback((v: boolean) => {
    setAutoRefreshOnStuckState(v);
    try { localStorage.setItem(AUTO_REFRESH_KEY, v ? "1" : "0"); } catch { /* ignore */ }
  }, []);

  // Opt-in: continuously auto-poll the provider during the merge workflow
  // (not just when stuck). Each tick respects the same cooldown gate inside
  // runRefresh, so we naturally re-attempt every COOLDOWN_MS until the job
  // reaches a terminal phase. Persisted per-browser.
  const AUTO_REFRESH_CONTINUOUS_KEY = "merge.autoRefreshContinuous";
  const [autoRefreshContinuous, setAutoRefreshContinuousState] = useState<boolean>(() => {
    try { return localStorage.getItem(AUTO_REFRESH_CONTINUOUS_KEY) === "1"; } catch { return false; }
  });
  const setAutoRefreshContinuous = useCallback((v: boolean) => {
    setAutoRefreshContinuousState(v);
    try { localStorage.setItem(AUTO_REFRESH_CONTINUOUS_KEY, v ? "1" : "0"); } catch { /* ignore */ }
  }, []);

  // Track refresh attempts and consecutive ineffective polls so we can warn
  // the user when the provider keeps returning no new data.
  const [refreshAttempts, setRefreshAttempts] = useState(0);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  // Per-merge-job refresh history — every Force-refresh attempt (manual +
  // auto) is appended so the diagnostics panel can show a complete timeline
  // even after the user navigates away and reloads the page. Capped at
  // REFRESH_HISTORY_LIMIT entries (oldest dropped) and persisted alongside
  // the running counters under `merge.refreshState.<jobId>` in localStorage.
  const REFRESH_HISTORY_LIMIT = 50;
  const REFRESH_STATE_PREFIX = "merge.refreshState.";
  const [refreshHistory, setRefreshHistory] = useState<RefreshHistoryEntry[]>([]);
  const refreshStateStorageKey = useCallback(
    (jobId: string) => `${REFRESH_STATE_PREFIX}${jobId}`,
    [],
  );
  const persistRefreshState = useCallback(
    (jobId: string | null, snapshot: PersistedRefreshState) => {
      if (!jobId) return;
      try {
        localStorage.setItem(
          refreshStateStorageKey(jobId),
          JSON.stringify(snapshot),
        );
      } catch { /* ignore quota/SSR */ }
    },
    [refreshStateStorageKey],
  );
  const readRefreshState = useCallback(
    (jobId: string): PersistedRefreshState | null => {
      try {
        const raw = localStorage.getItem(refreshStateStorageKey(jobId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PersistedRefreshState;
        if (!parsed || typeof parsed !== "object") return null;
        return {
          attempts: Number(parsed.attempts) || 0,
          consecutiveFailures: Number(parsed.consecutiveFailures) || 0,
          lastPollAt: parsed.lastPollAt ?? null,
          lastPollSource: parsed.lastPollSource ?? null,
          history: Array.isArray(parsed.history)
            ? parsed.history.slice(-REFRESH_HISTORY_LIMIT)
            : [],
        };
      } catch { return null; }
    },
    [refreshStateStorageKey],
  );
  // Janitor: drop persisted refresh-state for jobs older than 7 days so
  // localStorage doesn't grow unbounded across many merges.
  useEffect(() => {
    try {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(REFRESH_STATE_PREFIX)) continue;
        try {
          const parsed = JSON.parse(localStorage.getItem(key) || "{}");
          const newest = Array.isArray(parsed?.history) && parsed.history.length
            ? parsed.history[parsed.history.length - 1]?.at
            : parsed?.lastPollAt;
          if (typeof newest === "number" && newest < cutoff) {
            localStorage.removeItem(key);
          }
        } catch {
          localStorage.removeItem(key);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Hydrate persisted refresh counters/history when the active merge job
  // changes (initial mount, resume from another tab, etc.). Clearing the
  // job resets the in-memory state without touching storage so the user can
  // still inspect the previous job's history if it's recalled later.
  const hydratedJobIdRef = useRef<string | null>(null);
  useEffect(() => {
    const jobId = mergeState.mergeJobId;
    if (!jobId) {
      hydratedJobIdRef.current = null;
      setRefreshAttempts(0);
      setConsecutiveFailures(0);
      setRefreshHistory([]);
      return;
    }
    if (hydratedJobIdRef.current === jobId) return;
    hydratedJobIdRef.current = jobId;
    const stored = readRefreshState(jobId);
    if (!stored) {
      setRefreshAttempts(0);
      setConsecutiveFailures(0);
      setRefreshHistory([]);
      return;
    }
    setRefreshAttempts(stored.attempts);
    setConsecutiveFailures(stored.consecutiveFailures);
    setRefreshHistory(stored.history);
    if (stored.lastPollAt) setLastPollAt(stored.lastPollAt);
    if (stored.lastPollSource) setLastPollSource(stored.lastPollSource);
  }, [mergeState.mergeJobId, readRefreshState]);

  // Persist the per-job snapshot whenever any tracked field changes. Skipped
  // when there's no active job or before hydration has run.
  useEffect(() => {
    const jobId = mergeState.mergeJobId;
    if (!jobId || hydratedJobIdRef.current !== jobId) return;
    persistRefreshState(jobId, {
      attempts: refreshAttempts,
      consecutiveFailures,
      lastPollAt,
      lastPollSource,
      history: refreshHistory,
    });
  }, [
    mergeState.mergeJobId,
    refreshAttempts,
    consecutiveFailures,
    lastPollAt,
    lastPollSource,
    refreshHistory,
    persistRefreshState,
  ]);

  // Append a new refresh-history entry, capping the rolling window so
  // localStorage stays small and the UI stays scannable.
  const appendRefreshHistory = useCallback((entry: RefreshHistoryEntry) => {
    setRefreshHistory((prev) => {
      const next = [...prev, entry];
      if (next.length > REFRESH_HISTORY_LIMIT) {
        next.splice(0, next.length - REFRESH_HISTORY_LIMIT);
      }
      return next;
    });
  }, []);
  const patchRefreshHistory = useCallback(
    (id: string, patch: Partial<RefreshHistoryEntry>) => {
      setRefreshHistory((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      );
    },
    [],
  );

  // Track Retry-merge presses (full reset+restart) and who triggered the most
  // recent one — surfaced in the UI so users can see whether the auto-recovery
  // flow took over or they themselves initiated it.
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [lastRetrySource, setLastRetrySource] =
    useState<"manual" | "auto" | null>(null);
  const [lastRetryAt, setLastRetryAt] = useState<number | null>(null);
  // True from the moment a Retry merge press fires until the merge state has
  // been cleared back to idle (or a short failsafe window elapses). Used by
  // the UI to disable the Retry button so users can't queue concurrent
  // resets against the same merge job.
  const [retryPending, setRetryPending] = useState(false);
  const retryPendingRef = useRef(false);
  const retryPendingTimerRef = useRef<number | null>(null);
  const autoRecoveryFiredRef = useRef(false);
  const failureWarnFiredRef = useRef(false);
  const FAILURE_WARN_THRESHOLD = 3;
  // After this many consecutive ineffective refreshes we stop firing auto
  // Force-refreshes for this merge job so the user isn't trapped in a loop
  // pinging an unresponsive provider. The UI surfaces a clear retry/cancel
  // CTA and a "Resume" affordance keyed off `resumeAutoRefresh`.
  const AUTO_REFRESH_SUSPEND_THRESHOLD = 4;
  // After this many consecutive ineffective refreshes, the auto-recovery flow
  // resets the merge job (only when the user has opted in to auto-refresh).
  const AUTO_RECOVERY_THRESHOLD = 5;
  const EFFECT_WINDOW_MS = 6_000;
  const autoRefreshSuspended = consecutiveFailures >= AUTO_REFRESH_SUSPEND_THRESHOLD;
  const autoSuspendToastFiredRef = useRef(false);
  useEffect(() => {
    if (!autoRefreshSuspended) {
      autoSuspendToastFiredRef.current = false;
      return;
    }
    if (autoSuspendToastFiredRef.current) return;
    if (!(autoRefreshOnStuck || autoRefreshContinuous)) return;
    autoSuspendToastFiredRef.current = true;
    toast.warning("Auto Force refresh paused", {
      description: `${consecutiveFailures} refreshes returned no movement. Retry or cancel the merge to continue.`,
      duration: 10_000,
    });
  }, [autoRefreshSuspended, autoRefreshOnStuck, autoRefreshContinuous, consecutiveFailures]);
  const resumeAutoRefresh = useCallback(() => {
    setConsecutiveFailures(0);
    failureWarnFiredRef.current = false;
    autoSuspendToastFiredRef.current = false;
  }, []);

  // Best-effort fire-and-forget logger for admin debugging. Records every
  // Force-refresh attempt (manual + auto) and a follow-up effectiveness event
  // into audit_events via the log-merge-refresh edge function. Failures are
  // swallowed — logging must never break the user-facing refresh flow.
  const logRefresh = useCallback(
    async (entry: {
      source: "manual" | "auto-stuck" | "auto-continuous";
      outcome: "success" | "error" | "cooldown" | "effective" | "ineffective";
      attempt?: number;
      durationMs?: number;
      effective?: boolean;
      error?: string | null;
    }) => {
      const jobId = mergeState.mergeJobId;
      if (!jobId) return;
      try {
        const headers = await getAuthHeaders();
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/log-merge-refresh`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              merge_job_id: jobId,
              source: entry.source,
              outcome: entry.outcome,
              attempt: entry.attempt ?? null,
              duration_ms: entry.durationMs ?? null,
              effective: entry.effective ?? null,
              error: entry.error ?? null,
              ui_phase: mergeState.phase,
              ui_progress: Math.round(mergeState.progress ?? 0),
            }),
          },
        );
      } catch {
        /* swallow — logging is best-effort */
      }
    },
    [mergeState.mergeJobId, mergeState.phase, mergeState.progress],
  );

  const runRefresh = useCallback(async (opts?: {
    silent?: boolean;
    source?: "manual" | "auto-stuck" | "auto-continuous";
  }) => {
    const source = opts?.source ?? "manual";
    if (refreshing) return;
    const remaining = cooldownUntilRef.current - Date.now();
    if (remaining > 0) {
      void logRefresh({ source, outcome: "cooldown" });
      if (!opts?.silent) {
        const secs = Math.ceil(remaining / 1000);
        const readyAt = new Date(cooldownUntilRef.current).toLocaleTimeString();
        toast.info(`Cooldown active — ${secs}s remaining before the next refresh.`, {
          description: `Provider was just polled. Try again at ${readyAt}.`,
          duration: Math.min(8_000, Math.max(2_500, remaining)),
        });
      }
      return;
    }
    setRefreshing(true);
    const attemptStartedAt = Date.now();
    const advanceBefore = lastAdvanceRef.current;
    const progressBefore = Math.round(progressRef.current ?? 0);
    const bpmBefore = projectBpmRef.current;
    const confidenceLyrics = confidenceLyricsRef.current;
    const confidenceBpm = confidenceBpmRef.current;
    const attemptNumber = refreshAttempts + 1;
    const historyEntryId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${attemptStartedAt}-${Math.random().toString(36).slice(2, 8)}`;
    setRefreshAttempts((n) => n + 1);
    try {
      await forceProviderPoll();
      setLastPollAt(Date.now());
      setLastPollSource("wallclock");
      const until = Date.now() + COOLDOWN_MS;
      cooldownUntilRef.current = until;
      setCooldownRemainingMs(COOLDOWN_MS);
      persistCooldown(mergeState.mergeJobId, until);
      if (!opts?.silent) toast.info("Refreshed merge status from provider.");
      const successDuration = Date.now() - attemptStartedAt;
      appendRefreshHistory({
        id: historyEntryId,
        at: attemptStartedAt,
        source,
        outcome: "success",
        effective: null,
        durationMs: successDuration,
        progressBefore,
        progressAfter: null,
        lastAdvanceBefore: advanceBefore,
        lastAdvanceAfter: null,
        bpmBefore,
        bpmAfter: null,
        confidenceLyrics,
        confidenceBpm,
      });
      void logRefresh({
        source,
        outcome: "success",
        attempt: attemptNumber,
        durationMs: successDuration,
      });

      // Check whether this poll actually moved the job within EFFECT_WINDOW_MS.
      // If not, count it as an ineffective refresh and warn at threshold.
      window.setTimeout(() => {
        const moved = lastAdvanceRef.current > advanceBefore
          || lastAdvanceRef.current > attemptStartedAt;
        const progressAfter = Math.round(progressRef.current ?? 0);
        const lastAdvanceAfter = lastAdvanceRef.current;
        const bpmAfter = projectBpmRef.current;
        // Apply configurable confidence thresholds:
        //  - low confidence in either signal forces ineffective
        //  - movement + high confidence guarantees effective
        //  - otherwise fall back to movement-only signal
        const { effectiveAtLeast, ineffectiveBelow } = confidenceThresholdsRef.current;
        const lyrConf = confidenceLyricsRef.current;
        const bpmConf = confidenceBpmRef.current;
        const minConf = (typeof lyrConf === "number" && typeof bpmConf === "number")
          ? Math.min(lyrConf, bpmConf)
          : (typeof lyrConf === "number" ? lyrConf : (typeof bpmConf === "number" ? bpmConf : null));
        let effective = moved;
        if (minConf !== null && minConf < ineffectiveBelow) effective = false;
        else if (moved && minConf !== null && minConf >= effectiveAtLeast) effective = true;
        patchRefreshHistory(historyEntryId, { effective, progressAfter, lastAdvanceAfter, bpmAfter });
        void logRefresh({
          source,
          outcome: effective ? "effective" : "ineffective",
          attempt: attemptNumber,
          effective,
        });
        setConsecutiveFailures((prev) => {
          const next = effective ? 0 : prev + 1;
          if (!effective && next >= FAILURE_WARN_THRESHOLD && !failureWarnFiredRef.current) {
            failureWarnFiredRef.current = true;
            toast.warning(
              `${next} refreshes returned no new data — the provider may be unresponsive.`,
              { description: "Consider waiting longer or cancelling and retrying the merge.", duration: 10_000 }
            );
          }
          if (effective) failureWarnFiredRef.current = false;
          return next;
        });
      }, EFFECT_WINDOW_MS);
    } catch (e) {
      setConsecutiveFailures((n) => n + 1);
      const errMsg = e instanceof Error ? e.message : String(e);
      const errDuration = Date.now() - attemptStartedAt;
      appendRefreshHistory({
        id: historyEntryId,
        at: attemptStartedAt,
        source,
        outcome: "error",
        effective: false,
        durationMs: errDuration,
        error: errMsg,
        progressBefore,
        progressAfter: progressBefore,
        lastAdvanceBefore: advanceBefore,
        lastAdvanceAfter: advanceBefore,
        bpmBefore,
        bpmAfter: bpmBefore,
        confidenceLyrics,
        confidenceBpm,
      });
      void logRefresh({
        source,
        outcome: "error",
        attempt: attemptNumber,
        durationMs: errDuration,
        error: errMsg,
      });
      if (!opts?.silent) toast.error("Refresh failed — try again in a moment.");
    } finally {
      setRefreshing(false);
    }
  }, [forceProviderPoll, refreshing, mergeState.mergeJobId, persistCooldown, refreshAttempts, logRefresh, appendRefreshHistory, patchRefreshHistory]);

  const forceRefresh = useCallback(() => runRefresh(), [runRefresh]);

  // Stuck detector: while processing, flip isStuck=true after 20s without
  // movement. Resets whenever the projection effect bumps lastAdvanceRef.
  const STUCK_MS = 20_000;
  const isProcessing = !!mergeState.mergeJobId
    && mergeState.phase !== "idle"
    && mergeState.phase !== "done"
    && mergeState.phase !== "error";
  useEffect(() => {
    if (!isProcessing) {
      setIsStuck(false);
      return;
    }
    const id = setInterval(() => {
      const idleMs = Date.now() - lastAdvanceRef.current;
      if (idleMs >= STUCK_MS) setIsStuck(true);
    }, 2_000);
    return () => clearInterval(id);
  }, [isProcessing]);

  // Auto-trigger force refresh when stuck (opt-in). The cooldown gate inside
  // runRefresh means we naturally re-attempt every COOLDOWN_MS while stuck.
  useEffect(() => {
    if (!autoRefreshOnStuck || !isStuck || !isProcessing) return;
    if (autoRefreshSuspended) return;
    if (cooldownRemainingMs > 0 || refreshing) return;
    void runRefresh({ silent: true, source: "auto-stuck" });
  }, [autoRefreshOnStuck, autoRefreshSuspended, isStuck, isProcessing, cooldownRemainingMs, refreshing, runRefresh]);

  // Continuous auto-refresh: while opted-in and the job is processing, fire a
  // silent refresh whenever the cooldown clears. Independent of `isStuck` —
  // intended for users who want zero-touch polling for the duration of the
  // merge. The cooldown gate inside runRefresh enforces the cadence.
  useEffect(() => {
    if (!autoRefreshContinuous || !isProcessing) return;
    if (autoRefreshSuspended) return;
    if (cooldownRemainingMs > 0 || refreshing) return;
    void runRefresh({ silent: true, source: "auto-continuous" });
  }, [autoRefreshContinuous, autoRefreshSuspended, isProcessing, cooldownRemainingMs, refreshing, runRefresh]);

  // Project poller envelope into local merge state, fire terminal toasts once.
  useEffect(() => {
    if (!jobEnv || !mergeState.mergeJobId) return;

    const phase = mapDbPhase(jobEnv.phase);
    const progress = jobEnv.progress ?? 0;
    const finalUrl = jobEnv.output?.finalUrl || (jobEnv as any).final_url || null;

    // Stamp last successful poll. Prefer DB updatedAt; fall back to wall clock.
    const sig = `${jobEnv.status}|${jobEnv.phase}|${progress}|${jobEnv.updatedAt ?? ""}`;
    if (sig !== lastEnvSigRef.current) {
      lastEnvSigRef.current = sig;
      const envelopeTs = jobEnv.updatedAt ? Date.parse(jobEnv.updatedAt) : NaN;
      const hasEnvelopeTs = Number.isFinite(envelopeTs);
      setLastPollAt(hasEnvelopeTs ? envelopeTs : Date.now());
      setLastPollSource(hasEnvelopeTs ? "envelope" : "wallclock");
      // Real movement → reset the stuck timer.
      lastAdvanceRef.current = Date.now();
      setIsStuck(false);
    }

    setMergeState((s) => ({
      ...s,
      phase: jobEnv.status === "succeeded" ? "done" : jobEnv.status === "failed" ? "error" : phase,
      progress,
      finalUrl: finalUrl || s.finalUrl,
      error: jobEnv.status === "failed" ? (jobEnv.error || s.error || "Merge failed") : s.error,
      errorCode: jobEnv.status === "failed" ? (jobEnv.code || s.errorCode || null) : s.errorCode,
      providerTaskId: (jobEnv as any).providerTaskId ?? s.providerTaskId ?? null,
      mergeErrorLog: (jobEnv as any).mergeErrorLog ?? s.mergeErrorLog ?? null,
      rawOutput: (jobEnv as any).rawOutput ?? s.rawOutput,
      createdAt: (jobEnv as any).createdAt ?? s.createdAt ?? null,
      updatedAt: (jobEnv as any).updatedAt ?? s.updatedAt ?? null,
    }));

    if (terminalToastFired) return;

    if (jobEnv.status === "succeeded") {
      setTerminalToastFired(true);
      const billing = jobEnv.code === "FAL_BILLING_EXHAUSTED";
      if (billing) {
        toast.success("Merge done — vocal sync skipped", {
          description: "fal.ai balance exhausted. Top up to enable vocal sync next time.",
          duration: 12000,
          action: {
            label: "Top up",
            onClick: () => window.open("https://fal.ai/dashboard/billing", "_blank"),
          },
        });
        scheduleBillingReminder({
          projectId: lastProjectIdRef.current,
          onRetry: () => resetMergeRef.current?.({ source: "manual" }),
        });
      } else {
        toast.success("Assembly merged! Final video ready.");
        clearBillingReminder();
      }
    } else if (jobEnv.status === "failed") {
      setTerminalToastFired(true);
      const billing = jobEnv.code === "FAL_BILLING_EXHAUSTED";
      if (billing) {
        toast.error("fal.ai balance exhausted — top up to continue merging.", {
          description: jobEnv.error,
          duration: 12000,
          action: {
            label: "Top up",
            onClick: () => window.open("https://fal.ai/dashboard/billing", "_blank"),
          },
        });
        scheduleBillingReminder({
          projectId: lastProjectIdRef.current,
          onRetry: () => resetMergeRef.current?.({ source: "manual" }),
        });
      } else {
        toast.error(`Merge failed: ${jobEnv.error || "Unknown error"}`);
      }
    }
  }, [jobEnv, mergeState.mergeJobId, terminalToastFired]);

  // Surface transport-level polling errors (rare; usually network).
  useEffect(() => {
    if (pollError) console.warn("[useAssemblyMerge] poll error:", pollError);
  }, [pollError]);

  const startMerge = useCallback(
    async (
      projectId: string,
      videoUrls: string[],
      audioUrl: string,
      options?: {
        resolution?: string;
        fps?: number;
        sceneDurations?: number[];
        sceneBleeds?: Array<{ leadBleedSec: number; tailBleedSec: number }>;
        /**
         * Authoritative per-scene trim. When provided, overrides bleed math:
         *   start_offset = startSec
         *   end_offset   = startSec + durationSec - (tailCutSec || 0)
         * Use this when the client knows the source clip's exact length and
         * needs to guarantee no tail bleed leaks into the next scene's slot.
         */
        sceneTrims?: Array<{ startSec: number; durationSec: number; tailCutSec?: number; sourceDurationSec?: number } | null>;

        sceneNumbers?: number[];
        /** Skip the FPS/resolution preflight gate (user override). */
        skipPreflight?: boolean;
      }
    ) => {
      if (!user) {
        toast.error("Please sign in to merge.");
        return;
      }
      if (videoUrls.length < 2) {
        toast.error("Need at least 2 scene videos to merge.");
        return;
      }

      setTerminalToastFired(false);
      setRefreshAttempts(0);
      setConsecutiveFailures(0);
      setRefreshHistory([]);
      failureWarnFiredRef.current = false;
      autoRecoveryFiredRef.current = false;
      lastAdvanceRef.current = Date.now();
      lastProjectIdRef.current = projectId;
      // Fresh attempt — clear any stale top-up reminder from a prior failure.
      clearBillingReminder();
      setMergeState({
        mergeJobId: null,
        phase: "normalize",
        progress: 3,
        finalUrl: null,
        error: null,
      errorCode: null,
      });

      // --- Preflight gate (FPS/resolution/aspect) ---
      // Probe each clip's intrinsic dimensions and block when mismatches
      // exceed thresholds the auto-normalize pass can't safely recover from
      // (e.g. non-16:9 aspect — letterbox can't undo bad framing). The user
      // can override via options.skipPreflight after reading the fix steps.
      if (!options?.skipPreflight) {
        try {
          const { runAssemblyPreflight } = await import("@/lib/assembly-preflight");
          const verdict = await runAssemblyPreflight(videoUrls, options?.sceneNumbers);
          if (verdict.blocked) {
            const fixLines = verdict.fixes
              .map((f, i) => `${i + 1}. ${f.title} — ${f.detail}`)
              .join("\n");
            console.warn("[useAssemblyMerge] preflight blocked merge:", verdict);
            toast.error(verdict.summary, {
              duration: 16000,
              description: fixLines || "Re-render affected scenes at 1920×1080 @ 30fps and retry.",
            });
            setMergeState({
              mergeJobId: null,
              phase: "error",
              progress: 0,
              finalUrl: null,
              error: verdict.summary,
              errorCode: "PREFLIGHT_BLOCKED",
            });
            return;
          }
        } catch (err) {
          // Preflight is best-effort — don't hard-fail merge if probing crashed.
          console.warn("[useAssemblyMerge] preflight probe threw, continuing:", err);
        }
      }



      // --- Auto-normalize pass ---
      // Before handing off to merge-assembly, run each scene clip through the
      // normalize-scene-video edge function so every input is 1920x1080 @ 30fps
      // with -14 LUFS audio. The edge function returns `fallback: true` with
      // the original URL on any non-billing failure, so this never hard-breaks.
      toast.info(`Normalizing ${videoUrls.length} scene clips (1920×1080 @ 30fps)…`);
      let normalizedUrls = videoUrls;
      try {
        const { normalizeSceneVideo } = await import("@/lib/scene-postprocess");
        const results = await Promise.all(
          videoUrls.map((url, i) =>
            normalizeSceneVideo({
              videoUrl: url,
              durationSec: options?.sceneDurations?.[i],
              sceneNumber: i + 1,
              projectId,
            }).catch((err) => {
              console.warn(`[useAssemblyMerge] normalize scene ${i + 1} threw:`, err);
              return { videoUrl: url, normalized: false, fallback: true } as const;
            })
          )
        );
        normalizedUrls = results.map((r, i) => r.videoUrl || videoUrls[i]);
        const normalizedCount = results.filter((r) => r.normalized).length;
        const fallbackCount = results.length - normalizedCount;
        if (fallbackCount > 0) {
          toast.warning(
            `${normalizedCount}/${results.length} clips normalized; ${fallbackCount} kept original (fallback).`
          );
        } else {
          toast.success(`All ${normalizedCount} clips normalized.`);
        }
      } catch (err) {
        console.warn("[useAssemblyMerge] normalize pass failed, using originals:", err);
      }

      setMergeState((s) => ({ ...s, phase: "concat", progress: 5 }));

      try {
        const headers = await getAuthHeaders();
        const body: Record<string, unknown> = {
          project_id: projectId,
          video_urls: normalizedUrls,
          audio_url: audioUrl,
          target_fps: options?.fps ?? MASTER_QUALITY_PROFILE.assembly.fps,
          resolution: options?.resolution ?? MASTER_QUALITY_PROFILE.assembly.resolution,
        };
        if (options?.sceneDurations) body.scene_durations = options.sceneDurations;
        if (options?.sceneNumbers) body.scene_numbers = options.sceneNumbers;
        if (options?.sceneBleeds) body.scene_bleeds = options.sceneBleeds;
        if (options?.sceneTrims) body.scene_trims = options.sceneTrims;


        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/merge-assembly`,
          { method: "POST", headers, body: JSON.stringify(body) }
        );


        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({ error: "Unknown error" }));
          if (resp.status === 402) {
            const tier = await parseTierRequired(errData, "merge-assembly");
            if (tier) {
              await reportTierRequired(tier);
              setMergeState({
                mergeJobId: null,
                phase: "error",
                progress: 0,
                finalUrl: null,
                error: tier.message,
                errorCode: "TIER_REQUIRED",
              });
              return;
            }
          }
          if (resp.status === 402 || errData.code === "FAL_BILLING_EXHAUSTED") {
            const msg = "fal.ai balance exhausted — top up to continue merging.";
            toast.error(msg, {
              description: "Click to open the fal.ai billing dashboard.",
              duration: 12000,
              action: {
                label: "Top up",
                onClick: () => window.open("https://fal.ai/dashboard/billing", "_blank"),
              },
            });
            setMergeState({
              mergeJobId: null,
              phase: "error",
              progress: 0,
              finalUrl: null,
              error: msg,
              errorCode: "FAL_BILLING_EXHAUSTED",
            });
            scheduleBillingReminder({
              projectId,
              onRetry: () => resetMergeRef.current?.({ source: "manual" }),
            });
            return;
          }
          throw new Error(errData.error || `HTTP ${resp.status}`);
        }

        const data = await resp.json();
        const mergeJobId = data.merge_job_id;

        // Surface server-side trim clamping so the user knows their inputs were adjusted.
        if (Array.isArray(data.trim_warnings) && data.trim_warnings.length > 0) {
          const lines = data.trim_warnings
            .slice(0, 4)
            .map((w: { sceneNumber: number; reason: string }) => `Scene ${w.sceneNumber}: ${w.reason}`)
            .join("\n");
          toast.warning(`Adjusted ${data.trim_warnings.length} scene trim(s) to fit source clips`, {
            description: lines,
            duration: 10000,
          });
        }

        setMergeState((s) => ({
          ...s,
          mergeJobId,
          phase: "concat",
          progress: 10,
        }));

        toast.info(`Stitching ${videoUrls.length} scenes together...`);
      } catch (err) {
        console.error("startMerge error:", err);
        setMergeState({
          mergeJobId: null,
          phase: "error",
          progress: 0,
          finalUrl: null,
          error: err instanceof Error ? err.message : "Failed to start merge",
          errorCode: null,
        });
        toast.error(
          `Merge failed: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    },
    [user]
  );

  const resetMerge = useCallback(
    (opts?: { source?: "manual" | "auto" }) => {
      // Guard against rapid double-clicks and concurrent auto+manual resets
      // for the same merge job. The pending flag is cleared either when the
      // merge state actually transitions back to idle (see effect below) or
      // by a 2s failsafe timer.
      if (retryPendingRef.current) {
        if (opts?.source !== "auto") {
          toast.info("Retry already in progress…");
        }
        return;
      }
      retryPendingRef.current = true;
      setRetryPending(true);
      if (retryPendingTimerRef.current) {
        window.clearTimeout(retryPendingTimerRef.current);
      }
      retryPendingTimerRef.current = window.setTimeout(() => {
        retryPendingRef.current = false;
        setRetryPending(false);
        retryPendingTimerRef.current = null;
      }, 2_000);

      const source = opts?.source ?? "manual";
      setRetryAttempts((n) => n + 1);
      setLastRetrySource(source);
      setLastRetryAt(Date.now());
      setConsecutiveFailures(0);
      failureWarnFiredRef.current = false;
      autoRecoveryFiredRef.current = false;
      setTerminalToastFired(false);
      // The user (or auto-recovery) acknowledged the failure — drop any
      // pending top-up reminder so it doesn't fire after they've already
      // initiated a retry.
      clearBillingReminder();
      setMergeState({
        mergeJobId: null,
        phase: "idle",
        progress: 0,
        finalUrl: null,
        error: null,
        errorCode: null,
      });
      if (source === "auto") {
        toast.info("Auto-recovery reset the merge — click Retry merge to start a new attempt.", {
          duration: 8_000,
        });
      }
    },
    []
  );

  // ── Cancel an in-flight merge ────────────────────────────────────────────
  // Hits the cancel-merge edge function which (a) PUTs fal.ai's queue cancel
  // endpoint best-effort and (b) marks the render_jobs row terminal. We then
  // flip local state to a terminal `error` phase with code `CANCELED`, which
  // immediately stops the unified poller (it gates on phase ∉ done|error).
  const [canceling, setCanceling] = useState(false);
  const cancelMerge = useCallback(async () => {
    const jobId = mergeState.mergeJobId;
    if (!jobId) {
      toast.info("No active merge to cancel.");
      return;
    }
    if (mergeState.phase === "done" || mergeState.phase === "error") {
      toast.info("Merge already finished.");
      return;
    }
    if (canceling) return;
    setCanceling(true);
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-merge`,
        { method: "POST", headers, body: JSON.stringify({ merge_job_id: jobId }) },
      );
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(errData.error || `HTTP ${resp.status}`);
      }
      // Stop the smoother + poller immediately by flipping to terminal error.
      setMergeState((s) => ({
        ...s,
        phase: "error",
        error: "Merge canceled by user",
        errorCode: "CANCELED",
      }));
      clearBillingReminder();
      toast.success("Merge canceled — provider polling stopped.");
    } catch (err) {
      console.error("cancelMerge error:", err);
      toast.error(`Cancel failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setCanceling(false);
    }
  }, [mergeState.mergeJobId, mergeState.phase, canceling]);

  // Keep the forward-ref in sync so the billing-reminder toast (declared
  // above resetMerge) can call the latest reset implementation.
  useEffect(() => {
    resetMergeRef.current = resetMerge;
  }, [resetMerge]);

  // Clear the retry-pending guard once the merge state has actually flipped
  // back to idle (mergeJobId cleared). Belt-and-braces alongside the 2s
  // failsafe in resetMerge.
  useEffect(() => {
    if (!retryPendingRef.current) return;
    if (mergeState.mergeJobId === null && mergeState.phase === "idle") {
      retryPendingRef.current = false;
      setRetryPending(false);
      if (retryPendingTimerRef.current) {
        window.clearTimeout(retryPendingTimerRef.current);
        retryPendingTimerRef.current = null;
      }
    }
  }, [mergeState.mergeJobId, mergeState.phase]);

  // Auto-recovery: if the user opted into auto-refresh and we've still seen
  // 5+ ineffective polls in a row while processing, give up on refreshing
  // and reset the merge so they can retry from a clean slate. Fires once per
  // job to avoid loops.
  useEffect(() => {
    if (!autoRefreshOnStuck || !isProcessing) return;
    if (consecutiveFailures < AUTO_RECOVERY_THRESHOLD) return;
    if (autoRecoveryFiredRef.current) return;
    autoRecoveryFiredRef.current = true;
    resetMerge({ source: "auto" });
  }, [autoRefreshOnStuck, isProcessing, consecutiveFailures, resetMerge]);

  // Smoothed display progress for the merge/audio/lipsync (vocal-sync) bar.
  // Same simulated+real strategy as per-scene video generation:
  //   - simulated baseline always trends up so users see motion between rare
  //     real samples from the worker.
  //   - real values from `mergeState.progress` cap and accelerate the bar.
  //   - on terminal "done" we snap to 100; on "error" we freeze in place.
  // Merge typically takes 30-90s, so we use a faster baseline (tau=60).
  const { value: displayedProgress, source: progressSource, lastRealAt: progressLastRealAt } = useSmoothedProgressDetailed({
    active: isProcessing,
    real: mergeState.progress,
    forceComplete: mergeState.phase === "done",
    tau: 60,
    ceiling: 93,
  });

  return {
    mergeState,
    /** Smoothed 0-100 value to render in the merge progress bar. */
    displayedProgress,
    /** Whether the bar is currently driven by real DB updates or a simulated baseline. */
    progressSource,
    /** Epoch ms of the most recent real backend sample, or null. */
    progressLastRealAt,
    startMerge,
    resetMerge,
    /** Cancel the active merge job (best-effort fal cancel + DB terminal). */
    cancelMerge,
    /** True while a cancel request is in flight; disables the cancel button. */
    canceling,
    forceRefresh,
    isStuck,
    refreshing,
    cooldownRemainingMs,
    lastPollAt,
    /** Where lastPollAt came from: "envelope" (DB updatedAt) or "wallclock" (manual refresh / fallback). */
    lastPollSource,
    autoRefreshOnStuck,
    setAutoRefreshOnStuck,
    autoRefreshContinuous,
    setAutoRefreshContinuous,
    refreshAttempts,
    consecutiveFailures,
    retryAttempts,
    lastRetrySource,
    lastRetryAt,
    retryPending,
    /** True when auto Force-refresh has been paused after repeated ineffective polls. */
    autoRefreshSuspended,
    /** Clear the ineffective-poll counter so auto Force-refresh can resume. */
    resumeAutoRefresh,
    /** Persisted-per-job rolling history of refresh attempts (oldest first). */
    refreshHistory,
    /** Push the current project BPM into the hook so refresh entries can capture it. */
    setProjectBpm,
    /** Push the current analysis confidence scores (0-1) into the hook so refresh entries can capture them. */
    setConfidenceScores,
    /** Configurable thresholds (0-1) used to auto-mark refresh effectiveness. Persisted in localStorage. */
    confidenceThresholds,
    /** Update one or both thresholds; clamps to [0,1] and keeps ineffectiveBelow ≤ effectiveAtLeast. */
    setConfidenceThresholds,
  };
}
