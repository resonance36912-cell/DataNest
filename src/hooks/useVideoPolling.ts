/**
 * useVideoPolling — Per-scene video job polling.
 *
 * Two-tier pattern, sharing primitives with `useJobStatus` via
 * `lib/jobStatusClient`:
 *  - Tier 1 (DB-first):   `fetchJobStatus("render", jobId)` — cheap, drives
 *    UI status + adopts real `progress` when available.
 *  - Tier 2 (reconcile):  `triggerReconcile("check-job-status", …)` at a
 *    slower 5s cadence to advance fal.ai phase state and let webhooks persist
 *    `output_url` into render_jobs. Preserves the snappy ~1–2 min loop for
 *    short scene jobs.
 *
 * Falls back to pure provider polling when no `jobId` (render_jobs.id) is
 * known yet. Keeps simulated progress ticker as a smooth UX baseline; real
 * DB progress (when reported) overrides it via Math.max.
 *
 * Unlike `useJobStatus`, this hook manages many concurrent per-scene loops,
 * so it cannot spawn N React hooks — it shares the same wire primitives via
 * the imperative client instead.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Scene } from "@/contexts/ProjectContext";
import {
  type VideoJobState,
  type PollEvent,
  type PollEventType,
  type TimeoutSource,
  MAX_POLL_EVENTS,
  // VIDEO_POLL_TIMEOUT is the global fallback used inside getProviderTimeoutMs.
  getProviderTimeoutMs,
  getStallAwarePollInterval,
  getStallAwareReconcileInterval,
  getFailureBackoffMultiplier,
  getPhaseAwarePollFloor,
  MAX_POLL_INTERVAL_MS,
  safeErrorMsg,
  classifyFailure,
} from "@/types/storyboard";

import { prefetchVideoUrl } from "@/hooks/useVideoPreloader";
import { fetchJobStatus, triggerReconcile } from "@/lib/jobStatusClient";
import { smoothProgress } from "@/lib/progressSmoothing";
import { parseTierRequired } from "@/lib/tierRequired";
import { reportTierRequired } from "@/lib/invokeGated";

interface UseVideoPollingParams {
  setScenes: React.Dispatch<React.SetStateAction<Scene[]>>;
  persistSceneVideoUrl?: (sceneNumber: number, videoUrl: string, quality: string) => void;
  getSceneSnapshot?: (index: number) => Scene | undefined;
}

const RECONCILE_WARN_AFTER = 3; // consecutive reconcile failures before we warn the user

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return {
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${token}`,
  };
}


export function useVideoPolling({ setScenes, persistSceneVideoUrl, getSceneSnapshot }: UseVideoPollingParams) {
  const [videoJobs, setVideoJobs] = useState<Record<number, VideoJobState>>({});
  const mountedRef = useRef(true);

  const pollTimers = useRef<Record<number, NodeJS.Timeout>>({});
  const videoProgressTimers = useRef<Record<number, NodeJS.Timeout>>({});
  // Per-scene AbortController used to cancel in-flight reconcile/job-status
  // fetches the moment the user cancels — without this, a tick that's already
  // mid-await can resolve and overwrite the "canceled" UI state with an error
  // toast or even reschedule itself.
  const abortControllers = useRef<Record<number, AbortController>>({});
  // Hard cancel flag checked after every await. setState is batched, so a
  // status snapshot may be stale by the time the next tick checks it.
  const canceledFlags = useRef<Record<number, boolean>>({});
  // Latest real progress reported by the backend per scene. The progress
  // ticker reads from this ref every second and eases the displayed value
  // toward it (see `smoothProgress`) — that's how we avoid jumpy bars when
  // DB progress lands as 0 → 70 → 100 with seconds between samples.
  const realProgressRefs = useRef<Record<number, number>>({});
  // Last tick timestamp per scene so smoothing speed is dt-aware (handles
  // the 1.5s "tab hidden" pause without a sudden jump on resume).
  const lastTickAt = useRef<Record<number, number>>({});
  // Consecutive reconcile failures per scene. After RECONCILE_WARN_AFTER
  // misses we surface a non-blocking inline warning + one-shot toast so
  // the user understands why the job is taking longer than usual.
  const reconcileFailStreak = useRef<Record<number, number>>({});
  const reconcileToastShown = useRef<Record<number, boolean>>({});
  // Per-scene reference to the current poll `tick` closure. Used by the
  // visibility/focus reconnect path to fire an immediate poll without
  // waiting up to the next scheduled interval (which can be 15s+ under the
  // stall-aware cadence, or stuck on the 1.5s hidden-tab loop).
  const tickRefs = useRef<Record<number, () => void>>({});
  // Reverse lookup: render_jobs.id → sceneIndex. Lets the realtime channel
  // (subscribed at the project/user level, not per-scene) route an incoming
  // postgres_changes event to the correct polling tick without re-scanning
  // every videoJob entry. Populated in startPolling and torn down at cancel /
  // markDone / markFailed cleanup, so we never nudge a stale scene slot.
  const jobIdToIndex = useRef<Record<string, number>>({});

  // Identity captured when polling starts: { sceneNumber, trackingId }.
  // Used at markDone to verify the returned video belongs to the scene that
  // originally launched the job — protects against cross-scene contamination
  // if the storyboard was re-ordered, a scene was deleted, or a stale poll
  // resolves into a slot now occupied by a different scene.
  const jobIdentity = useRef<Record<number, { sceneNumber?: number; trackingId?: string; timeStart?: string; timeEnd?: string }>>({});

  const isCanceled = useCallback((index: number) => !!canceledFlags.current[index], []);

  /**
   * Append a polling event to the per-scene timeline. Capped at MAX_POLL_EVENTS
   * (oldest dropped) so long-running jobs can't bloat React state. Same-type
   * "poll" entries within 1s are coalesced — we only care about meaningful
   * transitions or the most recent sample, not every redundant tick.
   */
  const appendEvent = useCallback((index: number, evt: Omit<PollEvent, "ts"> & { ts?: number }) => {
    if (!mountedRef.current) return;
    const stamped: PollEvent = { ts: evt.ts ?? Date.now(), ...evt };
    setVideoJobs(prev => {
      const job = prev[index];
      if (!job) return prev;
      const events = job.pollEvents ? [...job.pollEvents] : [];
      const last = events[events.length - 1];
      // Coalesce rapid duplicate "poll" samples that didn't move the needle.
      if (
        last &&
        last.type === "poll" &&
        stamped.type === "poll" &&
        stamped.ts - last.ts < 1000 &&
        last.progress === stamped.progress &&
        last.phase === stamped.phase
      ) {
        return prev;
      }
      events.push(stamped);
      while (events.length > MAX_POLL_EVENTS) events.shift();
      return { ...prev, [index]: { ...job, pollEvents: events } };
    });
  }, []);

  // Track mounted state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      Object.values(pollTimers.current).forEach(t => { clearTimeout(t); clearInterval(t); });
      Object.values(videoProgressTimers.current).forEach(t => clearInterval(t));
      Object.values(abortControllers.current).forEach(c => { try { c.abort(); } catch {} });
      pollTimers.current = {};
      videoProgressTimers.current = {};
      abortControllers.current = {};
      tickRefs.current = {};
    };
  }, []);

  /**
   * Reconnect-fallback: when the tab regains focus / visibility, immediately
   * fire the next poll tick for every running scene instead of waiting on the
   * currently scheduled timer. The provider job itself is untouched — we only
   * reschedule the *client* polling loop so progress and completion surface
   * promptly after the user returns. Idempotent: safe to call repeatedly.
   */
  const reconnectActiveJobs = useCallback(() => {
    if (!mountedRef.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    Object.keys(tickRefs.current).forEach(key => {
      const idx = Number(key);
      if (canceledFlags.current[idx]) return;
      const tick = tickRefs.current[idx];
      if (!tick) return;
      if (pollTimers.current[idx]) { clearTimeout(pollTimers.current[idx]); delete pollTimers.current[idx]; }
      // Schedule on next macrotask so React state writes from tick land cleanly.
      pollTimers.current[idx] = setTimeout(() => { try { tick(); } catch {} }, 0);
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") reconnectActiveJobs();
    };
    const onFocus = () => reconnectActiveJobs();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [reconnectActiveJobs]);

  // --- Video Progress Ticker (simulated baseline) ---
  const startVideoProgress = useCallback((index: number, attempt?: { quality?: string; provider?: string }) => {
    if (videoProgressTimers.current[index]) clearInterval(videoProgressTimers.current[index]);
    // Reset cancel flag & spin up a fresh abort controller for this attempt.
    canceledFlags.current[index] = false;
    if (abortControllers.current[index]) { try { abortControllers.current[index].abort(); } catch {} }
    abortControllers.current[index] = new AbortController();
    // Fresh attempt → reset both the smoothing input (real DB sample cache)
    // and the dt clock so the first tick doesn't compute a giant catch-up.
    realProgressRefs.current[index] = 0;
    lastTickAt.current[index] = Date.now();
    // Fresh attempt → reset reconcile-failure tracking too.
    reconcileFailStreak.current[index] = 0;
    reconcileToastShown.current[index] = false;
    setVideoJobs(prev => ({
      ...prev,
      [index]: {
        progress: 0,
        status: "running",
        startedAt: Date.now(),
        // Clear any prior error/canceled remnants from a previous attempt.
        error: undefined,
        timedOut: undefined,
        // No real DB sample yet → bar starts on the simulated baseline.
        realProgress: null,
        reconcileWarning: undefined,
        // Fresh attempt → start a new event timeline.
        pollEvents: [{ ts: Date.now(), type: "start" as PollEventType, message: `Started ${attempt?.provider ?? prev[index]?.lastProvider ?? "video"} job` }],
        lastQuality: attempt?.quality ?? prev[index]?.lastQuality,
        lastProvider: attempt?.provider ?? prev[index]?.lastProvider,
      },
    }));
    const timer = setInterval(() => {
      if (!mountedRef.current) { clearInterval(videoProgressTimers.current[index]); return; }
      setVideoJobs(prev => {
        const job = prev[index];
        if (!job || job.status !== "running") { clearInterval(videoProgressTimers.current[index]); return prev; }
        const now = Date.now();
        const dtMs = Math.max(250, Math.min(5000, now - (lastTickAt.current[index] || now)));
        lastTickAt.current[index] = now;
        // Real-only progress: the bar reflects exclusively the latest DB/provider
        // sample. No simulated baseline — that previously drifted up to ~95% and
        // made stuck jobs look "almost done" when they were actually still queued.
        const next = smoothProgress({
          current: job.progress || 0,
          simulated: 0,
          real: realProgressRefs.current[index],
          dtMs,
        });
        if (next === job.progress) return prev;
        return { ...prev, [index]: { ...job, progress: next } };
      });
    }, 1000);
    videoProgressTimers.current[index] = timer;
  }, []);


  /**
   * Finalize the per-scene progress bar.
   *  - "done"     → snap to 100% so the bar never lingers at 99% after the
   *                 webhook/poll declares success.
   *  - "error" / "canceled" → kill the smoother *immediately*, freeze the
   *                 currently displayed value (don't snap forward), and
   *                 clear smoothing inputs so any late realProgress write
   *                 can't be picked up if the bar were ever re-armed.
   * The timer is always cleared first so subsequent setState calls can't
   * be undone by a queued tick.
   */
  const stopVideoProgress = useCallback((index: number, status: "done" | "error" | "canceled") => {
    if (videoProgressTimers.current[index]) { clearInterval(videoProgressTimers.current[index]); delete videoProgressTimers.current[index]; }
    // Always wipe smoothing inputs — guarantees no stale real/dt sample can
    // resurrect the bar if a future code path restarts the ticker for this scene.
    realProgressRefs.current[index] = 0;
    delete lastTickAt.current[index];
    if (!mountedRef.current) return;
    setVideoJobs(prev => {
      const job = prev[index];
      if (!job) return prev;
      // Once a scene has reached a terminal state, ignore re-entrant calls
      // (e.g. a late polling response that also tries to mark error) so we
      // don't oscillate the displayed status.
      if ((job.status === "done" || job.status === "error" || job.status === "canceled") && job.status !== status) {
        return prev;
      }
      const nextProgress =
        status === "done"
          ? 100
          // Freeze the bar where it is for fail/cancel — no forward jump.
          : (job.progress ?? 0);
      return { ...prev, [index]: { ...job, progress: nextProgress, status } };
    });
  }, []);

  // --- Cancel ---
  // Stops EVERY async surface for this scene's job:
  //  - clears the poll setTimeout (no further ticks scheduled)
  //  - aborts any in-flight job-status / reconcile fetch
  //  - flips canceledFlags so post-await tick branches bail out before
  //    mutating state, persisting URLs, or rescheduling
  //  - stops the simulated progress ticker
  //  - best-effort marks the render_jobs row as cancelled so reload/other
  //    tabs don't see the job as still "processing"
  const cancelVideoJob = useCallback((index: number) => {
    canceledFlags.current[index] = true;
    if (pollTimers.current[index]) { clearTimeout(pollTimers.current[index]); delete pollTimers.current[index]; }
    delete tickRefs.current[index];
    // Drop any realtime route for this scene's job so we don't nudge a slot
    // that's been canceled.
    for (const [jid, idx] of Object.entries(jobIdToIndex.current)) {
      if (idx === index) delete jobIdToIndex.current[jid];
    }

    if (abortControllers.current[index]) {
      try { abortControllers.current[index].abort(); } catch {}
      delete abortControllers.current[index];
    }
    appendEvent(index, { type: "canceled", message: "Canceled by user" });
    stopVideoProgress(index, "canceled");
    if (!mountedRef.current) return;

    // Capture jobId BEFORE we strip it off the scene, so we can persist the
    // cancellation to the DB.
      let jobIdToCancel: string | undefined;
    setScenes(prev => prev.map((s, i) => {
      if (i !== index) return s;
      jobIdToCancel = s.videoJobId;
        return { ...s, generatingVideo: false, videoRequestId: undefined, videoJobId: undefined, videoStatusUrl: undefined, videoResponseUrl: undefined };
    }));

    if (jobIdToCancel) {
      // R5B: best-effort cancellation of a queued/running localhost MuseTalk job.
      // The sovereign network guard routes this only to 127.0.0.1:7863.
      void authHeaders()
        .then((headers) => fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-video-job`, {
          method: "POST",
          headers,
          body: JSON.stringify({ job_id: jobIdToCancel }),
        }))
        .catch((err) => console.warn("[useVideoPolling] local cancel failed:", err));
      // Best-effort; don't block UI. RLS scopes update to the owning user.
      supabase
        .from("render_jobs")
        .update({ status: "cancelled", error: "Canceled by user" } as any)
        .eq("id", jobIdToCancel)
        .in("status", ["queued", "processing", "submitted"])
        .then(() => {}, (err) => console.warn("[useVideoPolling] cancel persist failed:", err));
    }

    toast.info(`Video generation canceled for scene ${index + 1}.`);
  }, [setScenes, stopVideoProgress, appendEvent]);

  // --- Polling (DB-first via job-status, reconcile via check-job-status) ---
  const startPolling = useCallback((index: number, requestId: string, statusUrl?: string, responseUrl?: string, jobId?: string, provider?: string) => {
    if (!jobId && !statusUrl) {
      if (mountedRef.current) {
        setScenes(prev => { const u = [...prev]; u[index] = { ...u[index], generatingVideo: false }; return u; });
        stopVideoProgress(index, "error");
        toast.error("Missing job identifier. Please start a new video generation job.");
      }
      return;
    }

    if (pollTimers.current[index]) clearTimeout(pollTimers.current[index]);
    // Ensure a fresh AbortController exists for this attempt — startVideoProgress
    // creates one when called via submitVideoJob, but startPolling can also be
    // invoked from rehydration paths where the ticker hasn't run yet.
    if (!abortControllers.current[index]) {
      abortControllers.current[index] = new AbortController();
      canceledFlags.current[index] = false;
    }
    // Capture scene identity at job start so markDone can verify the result
    // attaches to the same scene that launched the job.
    try {
      const snap = getSceneSnapshot?.(index) as any;
      if (snap) {
        jobIdentity.current[index] = {
          sceneNumber: snap.scene_number,
          trackingId: snap.trackingId || snap.tracking_id,
          timeStart: snap.time_start,
          timeEnd: snap.time_end,
        };
      }
    } catch {}
    const controller = abortControllers.current[index];
    const signal = controller.signal;
    const pollStartTime = Date.now();
    let lastReconcileAt = 0;
    // Track when real backend progress last advanced. Used to widen poll +
    // reconcile cadences when a job is clearly stuck in a long phase, then
    // snap back to fast cadence the moment progress moves again.
    let lastProgressAt = Date.now();
    // Per-attempt count of network/transport failures from the cheap
    // job-status endpoint. Used by markFailed's source classification when
    // the polling timeout finally fires after a streak of network errors.
    let networkFailStreak = 0;
    // Consecutive transient failures (network/5xx) across ANY of the polling
    // surfaces this tick. Drives the exponential-backoff multiplier so we
    // stop hammering an endpoint that's clearly degraded, then snap back to
    // the baseline cadence the instant a request succeeds.
    let consecutiveFailures = 0;
    // Latest backend lifecycle phase. Polled jobs that are still "queued"
    // at the provider have nothing new to report — we widen the poll floor
    // accordingly via getPhaseAwarePollFloor.
    let currentPhase: VideoJobState["phase"] | undefined;
    // Resolve the polling cap from per-provider config (with user overrides)
    // so heavier models get longer to finish before we cut the loop.
    const pollTimeoutMs = getProviderTimeoutMs(provider);
    const retryKey = `poll_retry_${index}`;


    const cleanupPoll = (idx: number) => {
      if (pollTimers.current[idx]) { clearTimeout(pollTimers.current[idx]); delete pollTimers.current[idx]; }
      delete tickRefs.current[idx];
      // Drop realtime route — see cancelVideoJob for rationale.
      for (const [jid, mapped] of Object.entries(jobIdToIndex.current)) {
        if (mapped === idx) delete jobIdToIndex.current[jid];
      }
    };

    const isAborted = () => signal.aborted || isCanceled(index);
    const markFailed = (idx: number, error?: unknown, sourceOverride?: TimeoutSource) => {
      if (!mountedRef.current || isAborted()) return;
      cleanupPoll(idx);
      // Abort any in-flight job-status / reconcile fetch and trip the
      // canceled flag so post-await branches in this poll loop bail out
      // before re-writing progress or status.
      canceledFlags.current[idx] = true;
      if (abortControllers.current[idx]) {
        try { abortControllers.current[idx].abort(); } catch {}
        delete abortControllers.current[idx];
      }
      const message = safeErrorMsg(error) || `Video generation failed for scene ${idx + 1}.`;
      // Resolve the source — explicit caller wins, otherwise infer from msg.
      // A lingering network-failure streak biases ambiguous timeouts toward
      // "network" so users know to check connectivity first.
      let { timedOut, source } = classifyFailure(message);
      if (sourceOverride) source = sourceOverride;
      if (!sourceOverride && timedOut && networkFailStreak >= 3) source = "network";
      setScenes(prev => prev.map((s, i) => i === idx ? { ...s, generatingVideo: false, videoRequestId: undefined, videoJobId: undefined, videoStatusUrl: undefined, videoResponseUrl: undefined } : s));
      setVideoJobs(prev => {
        const job = prev[idx] || { progress: 0, status: "error" as const };
        const events = job.pollEvents ? [...job.pollEvents] : [];
        events.push({
          ts: Date.now(),
          type: timedOut ? "timeout" : "error",
          message: `[${source}] ${message}`,
        });
        while (events.length > MAX_POLL_EVENTS) events.shift();
        return {
          ...prev,
          [idx]: { ...job, status: "error", error: message, timedOut, timeoutSource: source, pollEvents: events },
        };
      });
      // stopVideoProgress runs LAST so it sees the freshly-written "error"
      // status and freezes the bar where it is (no forward snap).
      stopVideoProgress(idx, "error");
      toast.error(message);
    };
    const markDone = (idx: number, videoUrl: string) => {
      if (!mountedRef.current || isAborted()) return;
      // Identity validation: ensure the scene currently at idx is the same
      // one that launched this polling job. If it changed (re-order, delete,
      // stale poll bleeding into a new slot), reject the video and surface
      // a clear error instead of attaching it to the wrong scene.
      const expected = jobIdentity.current[idx];
      const currentSnap = getSceneSnapshot?.(idx) as any;
      if (expected && currentSnap) {
        const currentTracking = currentSnap.trackingId || currentSnap.tracking_id;
        const currentSceneNum = currentSnap.scene_number;
        const trackingMismatch = expected.trackingId && currentTracking && expected.trackingId !== currentTracking;
        const sceneNumMismatch = expected.sceneNumber != null && currentSceneNum != null && expected.sceneNumber !== currentSceneNum;
        // Boundary drift: if the scene's time window changed since submit, the
        // audio slice the job rendered against no longer matches the scene's
        // current lyrics — attaching would produce a lip-sync/lyric mismatch.
        const startDrift = expected.timeStart && currentSnap.time_start && expected.timeStart !== currentSnap.time_start;
        const endDrift = expected.timeEnd && currentSnap.time_end && expected.timeEnd !== currentSnap.time_end;
        const boundaryDrift = !!(startDrift || endDrift);
        if (trackingMismatch || sceneNumMismatch || boundaryDrift) {
          const reason = boundaryDrift
            ? `boundary drift (was ${expected.timeStart}–${expected.timeEnd}, now ${currentSnap.time_start}–${currentSnap.time_end})`
            : `identity mismatch (expected ${expected.trackingId || expected.sceneNumber}, found ${currentTracking || currentSceneNum})`;
          console.warn(`[video-validation] Discarding scene ${idx + 1} video — ${reason}`);
          appendEvent(idx, { type: "error", message: `Video discarded — ${reason}` });
          cleanupPoll(idx);
          delete jobIdentity.current[idx];
          stopVideoProgress(idx, "error");
          toast.error(`Video discarded for scene ${idx + 1}: ${reason}. Please regenerate.`);
          return;
        }
      }
      cleanupPoll(idx);
      delete jobIdentity.current[idx];
      // Abort any straggling job-status fetch — the job is done, additional
      // polling responses must not bump progress back below 100% or flip
      // status away from "done".
      const alreadyDone = canceledFlags.current[idx];
      canceledFlags.current[idx] = true;
      if (abortControllers.current[idx]) {
        try { abortControllers.current[idx].abort(); } catch {}
        delete abortControllers.current[idx];
      }
      prefetchVideoUrl(videoUrl);
      let sceneSnapshot: Scene | undefined = getSceneSnapshot?.(idx);
      setScenes(prev => prev.map((s, i) => {
        if (i !== idx) return s;
        sceneSnapshot = sceneSnapshot || s;
        return { ...s, videoUrl, generatingVideo: false, videoRequestId: undefined, videoJobId: undefined, videoStatusUrl: undefined, videoResponseUrl: undefined };
      }));
      appendEvent(idx, { type: "done", message: "Video ready", progress: 100 });
      stopVideoProgress(idx, "done");
      if (sceneSnapshot?.scene_number) {
        persistSceneVideoUrl?.(sceneSnapshot.scene_number, videoUrl, sceneSnapshot.videoQuality || "hd");
      }
      if (!alreadyDone) toast.success(`Scene ${idx + 1} video ready!`);

      // Post-render mux: WAN 2.5 frequently returns video with missing or
      // mismatched audio. Force the uploaded per-scene audio onto the clip
      // using fal ffmpeg-api/compose, then swap the URL in-place. Fire and
      // forget — failure leaves the original video intact.
      if (provider === "wan-25" && sceneSnapshot) {
        const audioUrl = (sceneSnapshot as any).segmentAudioUrl || (sceneSnapshot as any).segment_audio_url;
        if (audioUrl) {
          const sceneNumber = (sceneSnapshot as any).scene_number;
          const projectId = (sceneSnapshot as any).project_id;
          const startSec = (sceneSnapshot as any).time_start;
          const endSec = (sceneSnapshot as any).time_end;
          let durationSec: number | undefined;
          try {
            const toSec = (t: string) => {
              const [m, s] = String(t || "0:0").split(":").map(Number);
              return (m || 0) * 60 + (s || 0);
            };
            const d = toSec(endSec) - toSec(startSec);
            if (d > 0 && d <= 30) durationSec = d;
          } catch {}
          (async () => {
            try {
              const headers = await authHeaders();
              const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mux-scene-audio`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                  video_url: videoUrl,
                  audio_url: audioUrl,
                  duration_sec: durationSec,
                  scene_number: sceneNumber,
                  project_id: projectId,
                }),
              });
              if (!resp.ok) {
                if (resp.status === 402) {
                  const errBody = await resp.clone().json().catch(() => null);
                  const tier = await parseTierRequired(errBody, "mux-scene-audio");
                  if (tier) await reportTierRequired(tier);
                }
                console.warn(`[mux-scene-audio] scene ${idx + 1} failed (${resp.status})`);
                return;
              }
              const data = await resp.json();
              const muxedUrl: string | undefined = data?.video_url;
              if (!muxedUrl || !mountedRef.current) return;
              prefetchVideoUrl(muxedUrl);
              setScenes(prev => prev.map((s, i) => i === idx ? { ...s, videoUrl: muxedUrl } : s));
              // Persist the muxed URL so reloads and merge use the audio-correct version.
              if (sceneNumber != null && projectId) {
                try {
                  await supabase
                    .from("scenes")
                    .update({ video_url: muxedUrl } as any)
                    .eq("project_id", projectId)
                    .eq("scene_number", sceneNumber);
                } catch (e) {
                  console.warn("[mux-scene-audio] DB persist failed:", e);
                }
              }
            } catch (e) {
              console.warn("[mux-scene-audio] network error:", e);
            }
          })();
        }
      }
    };


    const reconcile = async () => {
      if (!statusUrl || isAborted()) return;
      const ok = await triggerReconcile("check-job-status", {
        request_id: requestId,
        status_url: statusUrl,
        response_url: responseUrl,
        job_id: jobId,
      }, signal);
      if (isAborted() || !mountedRef.current) return;

      if (ok) {
        // Recovery: clear any prior warning state once reconcile succeeds.
        if (reconcileFailStreak.current[index]) {
          reconcileFailStreak.current[index] = 0;
          appendEvent(index, { type: "reconcile_ok", message: "Provider check recovered" });
          setVideoJobs(prev => {
            const job = prev[index];
            if (!job?.reconcileWarning) return prev;
            return { ...prev, [index]: { ...job, reconcileWarning: undefined } };
          });
        } else {
          appendEvent(index, { type: "reconcile_ok" });
        }
        return;
      }

      const streak = (reconcileFailStreak.current[index] || 0) + 1;
      reconcileFailStreak.current[index] = streak;
      appendEvent(index, {
        type: "reconcile_fail",
        message: `Reconcile attempt failed (streak ${streak})`,
      });
      if (streak >= RECONCILE_WARN_AFTER) {
        const msg = `Provider check is slow to respond (${streak} retries). Generation is still running — this may just take longer than usual.`;
        setVideoJobs(prev => {
          const job = prev[index];
          if (!job || job.reconcileWarning === msg) return prev;
          return { ...prev, [index]: { ...job, reconcileWarning: msg } };
        });
        appendEvent(index, { type: "warning", message: msg });
        // One-shot non-blocking toast per scene attempt so it doesn't spam.
        if (!reconcileToastShown.current[index]) {
          reconcileToastShown.current[index] = true;
          toast.warning(`Scene ${index + 1}: provider is slow`, {
            description: "We're still polling — your job hasn't failed.",
            duration: 6000,
          });
        }
      }
    };

    const readJobStatus = async (): Promise<{ ok: boolean; terminal: boolean }> => {
      if (!jobId) return { ok: false, terminal: false };
      const r = await fetchJobStatus("render", jobId, false, signal);
      if (!mountedRef.current || isAborted()) return { ok: true, terminal: true };
      if (!r.ok) {
        if (r.notFound) { markFailed(index, "Job not found.", "upstream"); return { ok: false, terminal: true }; }
        // Treat as transport failure — bumps both the network streak (for
        // failure classification) and the exponential-backoff counter (so
        // the next tick is pushed out instead of hammering a degraded API).
        networkFailStreak += 1;
        consecutiveFailures += 1;
        return { ok: false, terminal: false };
      }
      // Successful job-status read → reset transient-failure counters.
      networkFailStreak = 0;
      consecutiveFailures = 0;

      const env = r.envelope!;
      const realProg = typeof env.progress === "number" ? env.progress : null;
      if (realProg != null) {
        // Feed the smoothing input only — do NOT write to videoJobs.progress
        // here. The 1s ticker eases the displayed value toward this number,
        // which avoids the bar teleporting forward when DB progress jumps
        // from e.g. 0 → 70 between samples.
        const prevReal = realProgressRefs.current[index] ?? 0;
        if (realProg > prevReal) {
          realProgressRefs.current[index] = realProg;
          // Progress moved → reset stall clock so cadence snaps back to fast.
          lastProgressAt = Date.now();
        }
      }
      // Surface the lifecycle phase + last-updated timestamp on every tick so
      // the per-scene phase timeline can render queued → processing → done/fail
      // transitions and a relative "updated Xs ago" indicator.
      const envPhase: VideoJobState["phase"] | undefined =
        env.status === "queued" || env.status === "processing" ||
        env.status === "succeeded" || env.status === "failed"
          ? env.status
          : undefined;
      // Cache the phase so the tick scheduler can widen the floor while queued.
      if (envPhase !== undefined) currentPhase = envPhase;
      const envUpdatedAt = env.updatedAt ?? null;

      // Capture prior phase BEFORE mutating state, so we can record a
      // dedicated "phase" event when the lifecycle transitions.
      let prevPhase: VideoJobState["phase"] | undefined;
      if (mountedRef.current && (envPhase !== undefined || envUpdatedAt !== null || realProg != null)) {
        setVideoJobs(prev => {
          const job = prev[index];
          if (!job) return prev;
          prevPhase = job.phase;
          const nextRealProg = realProg != null ? realProg : job.realProgress;
          const nextPhase = envPhase ?? job.phase;
          const nextUpdatedAt = envUpdatedAt ?? job.phaseUpdatedAt;
          if (
            job.realProgress === nextRealProg &&
            job.phase === nextPhase &&
            job.phaseUpdatedAt === nextUpdatedAt
          ) return prev;
          return {
            ...prev,
            [index]: {
              ...job,
              realProgress: nextRealProg,
              phase: nextPhase,
              phaseUpdatedAt: nextUpdatedAt,
            },
          };
        });
      }
      // Always log the poll sample (coalesced inside appendEvent for spam).
      appendEvent(index, {
        type: "poll",
        phase: envPhase,
        progress: realProg ?? undefined,
      });
      if (envPhase && envPhase !== prevPhase) {
        appendEvent(index, {
          type: "phase",
          phase: envPhase,
          message: `Phase → ${envPhase}`,
        });
      }
      if (env.status === "succeeded") {
        const url = env.output?.videoUrl || (env.raw as any)?.videoUrl;
        if (url) { markDone(index, url); return { ok: true, terminal: true }; }
        return { ok: true, terminal: false };
      }
      if (env.status === "failed") {
        markFailed(index, env.error || "Generation failed", "upstream");
        return { ok: true, terminal: true };
      }
      // Server-side cancellation reflected via raw status.
      const rawStatus = String((env.raw as any)?.status || "").toLowerCase();
      if (rawStatus === "cancelled" || rawStatus === "canceled") {
        cleanupPoll(index);
        if (mountedRef.current && !isAborted()) {
          canceledFlags.current[index] = true;
          appendEvent(index, { type: "canceled", message: "Canceled by provider" });
          stopVideoProgress(index, "canceled");
          setScenes(prev => prev.map((s, i) => i === index ? { ...s, generatingVideo: false, videoRequestId: undefined, videoJobId: undefined, videoStatusUrl: undefined, videoResponseUrl: undefined } : s));
        }
        return { ok: true, terminal: true };
      }
      return { ok: true, terminal: false };
    };

    const readProviderFallback = async (): Promise<{ terminal: boolean }> => {
      if (!statusUrl) return { terminal: false };
      try {
        const headers = await authHeaders();
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-job-status`, {
          method: "POST",
          headers,
          body: JSON.stringify({ request_id: requestId, status_url: statusUrl, response_url: responseUrl, job_id: jobId }),
          signal,
        });
        if (!mountedRef.current || isAborted()) return { terminal: true };
        if (!resp.ok) {
          const retryCount = (window as any)[retryKey] || 0;
          if ((resp.status === 502 || resp.status === 503) && retryCount < 2) {
            (window as any)[retryKey] = retryCount + 1;
            // Transient gateway error → bump backoff so we don't retry instantly.
            consecutiveFailures += 1;
            return { terminal: false };
          }
          (window as any)[retryKey] = 0;
          const err = await resp.json().catch(() => ({}));
          // Provider-fallback HTTP failures point at the reconcile transport,
          // not the upstream model — classify accordingly.
          markFailed(index, err.error || `Video polling failed (${resp.status}). Start a new video job.`, "network");
          return { terminal: true };
        }
        (window as any)[retryKey] = 0;
        // Healthy response → reset backoff counter.
        consecutiveFailures = 0;
        const data = await resp.json();

        const normalizedStatus = String(data.status || "").toUpperCase();
        if (data.videoUrl) { markDone(index, data.videoUrl); return { terminal: true }; }
        if (["CANCELED", "CANCELLED"].includes(normalizedStatus)) {
          cleanupPoll(index);
          if (mountedRef.current && !isAborted()) {
            canceledFlags.current[index] = true;
            stopVideoProgress(index, "canceled");
            setScenes(prev => prev.map((s, i) => i === index ? { ...s, generatingVideo: false, videoRequestId: undefined, videoJobId: undefined, videoStatusUrl: undefined, videoResponseUrl: undefined } : s));
          }
          return { terminal: true };
        }
        if (["COMPLETED", "FAILED", "ERROR"].includes(normalizedStatus) || data.error) {
          if (data.retryable === false) markFailed(index, `Non-retryable error: ${safeErrorMsg(data.error) || "Generation rejected"}. Check your inputs.`, "upstream");
          else markFailed(index, safeErrorMsg(data.error) || "Generation failed", "upstream");
          return { terminal: true };
        }
        return { terminal: false };
      } catch (e) {
        if ((e as any)?.name === "AbortError") return { terminal: true };
        // Transport exceptions (DNS, offline, fetch failed) → bias the next
        // timeout classification toward "network" and back off the cadence.
        networkFailStreak += 1;
        consecutiveFailures += 1;
        return { terminal: false };

      }
    };

    const tick = async () => {
      if (!mountedRef.current || isAborted()) return;
      if (typeof document !== "undefined" && document.hidden) {
        pollTimers.current[index] = setTimeout(tick, 1500);
        return;
      }
      const elapsed = Date.now() - pollStartTime;
      if (elapsed > pollTimeoutMs) {
        const minutes = Math.round(pollTimeoutMs / 60000);
        markFailed(
          index,
          `Video generation timed out for scene ${index + 1} after ${minutes}m (${provider || "default"}). Please retry.`,
          networkFailStreak >= 3 ? "network" : "polling",
        );
        return;
      }

      const msSinceProgress = Date.now() - lastProgressAt;
      const reconcileEvery = getStallAwareReconcileInterval(msSinceProgress);
      if (statusUrl && Date.now() - lastReconcileAt >= reconcileEvery) {
        lastReconcileAt = Date.now();
        reconcile();
      }

      try {
        if (jobId) {
          const r = await readJobStatus();
          if (r.terminal || isAborted()) return;
          if (!r.ok && statusUrl) {
            const p = await readProviderFallback();
            if (p.terminal || isAborted()) return;
          }
        } else {
          const p = await readProviderFallback();
          if (p.terminal || isAborted()) return;
        }
      } catch {/* tolerate transient errors */}

      if (!mountedRef.current || isAborted()) return;
      // Compose the next interval from three signals, then cap it:
      //   1. Stall/elapsed-aware baseline (existing).
      //   2. Phase-aware floor — "queued" jobs have no client-actionable
      //      updates, so don't poll faster than getPhaseAwarePollFloor.
      //   3. Exponential backoff on consecutive transient failures.
      // The instant a request succeeds, consecutiveFailures resets to 0 and
      // the multiplier snaps back to 1x — same UX as before in the happy path.
      const baseline = getStallAwarePollInterval(
        Date.now() - pollStartTime,
        Date.now() - lastProgressAt,
      );
      const phaseFloor = getPhaseAwarePollFloor(currentPhase);
      const multiplier = getFailureBackoffMultiplier(consecutiveFailures);
      const interval = Math.min(
        MAX_POLL_INTERVAL_MS,
        Math.max(baseline, phaseFloor) * multiplier,
      );
      pollTimers.current[index] = setTimeout(tick, interval);
    };


    // Expose the latest tick closure so the visibility/focus reconnect path
    // can fire it immediately on tab return without restarting the job.
    tickRefs.current[index] = () => { void tick(); };
    // Register the jobId→sceneIndex mapping so realtime postgres_changes
    // events on render_jobs can route straight to this scene's tick.
    if (jobId) jobIdToIndex.current[jobId] = index;
    reconcile();
    pollTimers.current[index] = setTimeout(tick, 1000);
  }, [setScenes, stopVideoProgress, isCanceled, appendEvent, persistSceneVideoUrl, getSceneSnapshot]);

  /**
   * Realtime nudge — called by the project-level render_jobs subscription
   * when a job row is INSERTed/UPDATEd. We don't trust the realtime payload
   * directly (RLS-stripped columns, missing webhook-derived fields) — instead
   * we fire the existing tick which re-reads via the cheap job-status
   * endpoint and applies the same state-machine rules as a regular poll.
   *
   * Terminal events also flow through cleanly: markDone / markFailed run
   * inside the tick exactly as they would under pure polling.
   */
  const nudgeJob = useCallback((jobId: string) => {
    const idx = jobIdToIndex.current[jobId];
    if (idx === undefined) return;
    if (canceledFlags.current[idx]) return;
    const tick = tickRefs.current[idx];
    if (!tick) return;
    if (pollTimers.current[idx]) { clearTimeout(pollTimers.current[idx]); delete pollTimers.current[idx]; }
    pollTimers.current[idx] = setTimeout(() => { try { tick(); } catch {} }, 0);
  }, []);


  return {
    videoJobs, setVideoJobs,
    pollTimers, videoProgressTimers,
    startVideoProgress, stopVideoProgress,
    cancelVideoJob, startPolling,
    reconnectActiveJobs,
    nudgeJob,
    mountedRef,

  };
}
