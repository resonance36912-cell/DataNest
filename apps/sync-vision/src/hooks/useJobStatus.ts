/**
 * useJobStatus — Unified client hook for polling a single long-running job.
 *
 * Calls the `job-status` edge function (DB-only, fast). Optionally also pings
 * a slower "reconcile" endpoint (e.g. `check-merge-status`) at a coarser
 * cadence to drive provider-side phase progression — used only for jobs whose
 * legacy worker advances state on each poll.
 *
 * - Default poll: 2500ms, backs off to 8000ms after 30s.
 * - Pauses while the tab is hidden.
 * - Auto-stops on terminal status (`succeeded` / `failed`).
 *
 * Wire-level fetch + reconcile are delegated to `lib/jobStatusClient` so
 * `useVideoPolling` (which manages many concurrent per-scene loops) can share
 * the exact same primitives without instantiating N React hooks.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchJobStatus,
  triggerReconcile,
  isTerminalStatus,
  type JobKind,
  type JobStatus,
  type JobSegment,
  type JobStatusEnvelope,
} from "@/lib/jobStatusClient";

export type { JobKind, JobStatus, JobSegment, JobStatusEnvelope };

interface Options {
  kind: JobKind;
  jobId: string | null | undefined;
  enabled?: boolean;
  includeResults?: boolean;
  /** Also call this slower endpoint every `reconcileEveryMs` to drive worker progression */
  reconcileEndpoint?: string;
  reconcileBody?: Record<string, unknown>;
  reconcileEveryMs?: number;
  pollMs?: number;
  onTerminal?: (env: JobStatusEnvelope) => void;
}

const DEFAULT_POLL_MS = 2500;
const BACKOFF_AFTER_MS = 30_000;
const BACKOFF_POLL_MS = 8_000;

export function useJobStatus(opts: Options) {
  const {
    kind, jobId, enabled = true, includeResults = false,
    reconcileEndpoint, reconcileBody, reconcileEveryMs = 7500,
    pollMs = DEFAULT_POLL_MS, onTerminal,
  } = opts;

  const [data, setData] = useState<JobStatusEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef<number>(0);
  const lastReconcile = useRef<number>(0);
  const mounted = useRef(true);
  const onTerminalRef = useRef(onTerminal);
  onTerminalRef.current = onTerminal;

  const stop = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  const fetchOnce = useCallback(async (): Promise<JobStatusEnvelope | null> => {
    if (!jobId) return null;
    const r = await fetchJobStatus(kind, jobId, includeResults);
    if (r.ok && r.envelope) return r.envelope;
    if (r.error) throw new Error(r.error);
    return null;
  }, [kind, jobId, includeResults]);

  const reconcile = useCallback(async () => {
    if (!reconcileEndpoint) return;
    await triggerReconcile(reconcileEndpoint, reconcileBody || {});
  }, [reconcileEndpoint, reconcileBody]);

  const forceProviderPoll = useCallback(async () => {
    await reconcile();
    try {
      const env = await fetchOnce();
      if (env && mounted.current) setData(env);
      return env;
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Refresh failed");
      return null;
    }
  }, [reconcile, fetchOnce]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stop(); };
  }, [stop]);

  useEffect(() => {
    stop();
    setError(null);
    if (!enabled || !jobId) return;
    startedAt.current = Date.now();
    lastReconcile.current = 0;

    const tick = async () => {
      if (!mounted.current) return;
      if (typeof document !== "undefined" && document.hidden) {
        timer.current = setTimeout(tick, 1500);
        return;
      }

      try {
        if (reconcileEndpoint && Date.now() - lastReconcile.current >= reconcileEveryMs) {
          lastReconcile.current = Date.now();
          reconcile();
        }

        const env = await fetchOnce();
        if (!mounted.current || !env) return;
        setData(env);

        if (isTerminalStatus(env.status)) {
          stop();
          onTerminalRef.current?.(env);
          return;
        }
      } catch (e) {
        if (!mounted.current) return;
        setError(e instanceof Error ? e.message : "Polling error");
      }

      const elapsed = Date.now() - startedAt.current;
      const interval = elapsed > BACKOFF_AFTER_MS ? BACKOFF_POLL_MS : pollMs;
      timer.current = setTimeout(tick, interval);
    };

    tick();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, jobId, enabled, includeResults, reconcileEndpoint, reconcileEveryMs, pollMs]);

  return {
    data,
    status: (data?.status || "idle") as JobStatus,
    progress: data?.progress ?? 0,
    error: error || data?.error || null,
    isTerminal: isTerminalStatus(data?.status),
    forceProviderPoll,
    stop,
  };
}
