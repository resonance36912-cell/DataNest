/**
 * useRetryPrefsPersistence — Persist per-scene video-job UI state to
 * localStorage so refreshing the page keeps both:
 *   1) Retry context (provider/quality + failure reason) for failed jobs.
 *   2) Live progress UI for *running* jobs — progress %, real-progress
 *      sample, phase, and startedAt — so the bar reappears instantly on
 *      reload while the DB-driven rehydration (StoryboardStep) reconnects
 *      the polling loop in the background. Without this seed, the user
 *      sees an empty card for ~500ms after refresh and might re-click
 *      Generate Video.
 *
 * Live AbortControllers, pollEvents timelines, and reconcile-warning
 * banners are intentionally NOT persisted — they belong to an in-flight
 * polling session and would be misleading after a refresh that severed it.
 */
import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { VideoJobState } from "@/types/storyboard";

interface PersistedRetryEntry {
  lastProvider?: string;
  lastQuality?: string;
  status?: VideoJobState["status"];
  error?: string;
  timedOut?: boolean;
  timeoutSource?: VideoJobState["timeoutSource"];
  phase?: VideoJobState["phase"];
  phaseUpdatedAt?: string | null;
  // Live-progress projection (only meaningful for status === "running").
  progress?: number;
  realProgress?: number | null;
  startedAt?: number;
}

type PersistedMap = Record<number, PersistedRetryEntry>;

const STORAGE_PREFIX = "syncvision:retryPrefs:";
const MAX_BYTES = 32 * 1024; // safety cap; way more than needed for ~50 scenes
// Progress samples older than this are considered stale on hydration — the
// underlying job has almost certainly timed out or been finalized by webhook.
const RUNNING_TTL_MS = 30 * 60 * 1000; // 30 minutes

function storageKey(projectId: string | null | undefined): string | null {
  if (!projectId) return null;
  return `${STORAGE_PREFIX}${projectId}`;
}

function safeRead(key: string): PersistedMap {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as PersistedMap;
  } catch {
    return {};
  }
}

function safeWrite(key: string, value: PersistedMap) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > MAX_BYTES) return; // avoid bloating localStorage
    localStorage.setItem(key, serialized);
  } catch {
    /* quota / serialization errors are non-fatal */
  }
}

/** Equality check restricted to persisted fields, to avoid noisy writes. */
function entriesEqual(a: PersistedRetryEntry, b: PersistedRetryEntry): boolean {
  return (
    a.lastProvider === b.lastProvider &&
    a.lastQuality === b.lastQuality &&
    a.status === b.status &&
    a.error === b.error &&
    a.timedOut === b.timedOut &&
    a.timeoutSource === b.timeoutSource &&
    a.phase === b.phase &&
    a.phaseUpdatedAt === b.phaseUpdatedAt &&
    a.progress === b.progress &&
    a.realProgress === b.realProgress &&
    a.startedAt === b.startedAt
  );
}

function mapsEqual(a: PersistedMap, b: PersistedMap): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!(k in b)) return false;
    if (!entriesEqual(a[k as unknown as number], b[k as unknown as number])) return false;
  }
  return true;
}

export function useRetryPrefsPersistence(
  projectId: string | null | undefined,
  videoJobs: Record<number, VideoJobState>,
  setVideoJobs: Dispatch<SetStateAction<Record<number, VideoJobState>>>,
) {
  const hydratedFor = useRef<string | null>(null);
  const lastWritten = useRef<PersistedMap>({});

  // Hydrate on first mount per projectId. Seed videoJobs so both the Retry
  // UI AND a running progress bar resurface immediately, before the DB-
  // driven rehydration in StoryboardStep has a chance to reconnect polling.
  useEffect(() => {
    const key = storageKey(projectId);
    if (!key) return;
    if (hydratedFor.current === key) return;
    hydratedFor.current = key;

    const persisted = safeRead(key);
    lastWritten.current = persisted;
    const indices = Object.keys(persisted);
    if (indices.length === 0) return;

    const now = Date.now();
    setVideoJobs(prev => {
      const next = { ...prev };
      let changed = false;
      for (const k of indices) {
        const idx = Number(k);
        if (!Number.isFinite(idx)) continue;
        const entry = persisted[idx];
        const existing = next[idx];
        // Don't clobber an in-flight job — only seed if there's nothing,
        // or the existing entry is idle/done with no provider memory.
        if (existing && (existing.status === "running" || existing.status === "done")) continue;

        // For running entries, ensure they're not stale. A reload after the
        // tab sat idle for hours shouldn't show a frozen progress bar — let
        // the DB rehydration tell us the truth (likely done/failed/canceled).
        const isRunning = entry.status === "running";
        const startedAt = entry.startedAt;
        if (isRunning && startedAt && now - startedAt > RUNNING_TTL_MS) {
          continue;
        }

        next[idx] = {
          progress: existing?.progress ?? 0,
          ...existing,
          status: entry.status ?? existing?.status ?? "idle",
          error: entry.error ?? existing?.error,
          timedOut: entry.timedOut ?? existing?.timedOut,
          timeoutSource: entry.timeoutSource ?? existing?.timeoutSource,
          lastProvider: entry.lastProvider ?? existing?.lastProvider,
          lastQuality: entry.lastQuality ?? existing?.lastQuality,
          phase: entry.phase ?? existing?.phase,
          phaseUpdatedAt: entry.phaseUpdatedAt ?? existing?.phaseUpdatedAt,
          // Running-only fields. Skip when not running so a stale persisted
          // sample doesn't bleed into an idle scene's display.
          ...(isRunning
            ? {
                progress: entry.progress ?? 0,
                realProgress: entry.realProgress ?? null,
                startedAt: entry.startedAt ?? now,
              }
            : {}),
        };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [projectId, setVideoJobs]);

  // Persist on change. Only writes when the slim projection changes.
  useEffect(() => {
    const key = storageKey(projectId);
    if (!key) return;
    if (hydratedFor.current !== key) return; // wait for hydration first

    const slim: PersistedMap = {};
    for (const [k, job] of Object.entries(videoJobs)) {
      if (!job) continue;
      const isRunning = job.status === "running";
      // Persist scenes that carry useful context: running progress OR
      // retry context (provider memory / failure state).
      if (!isRunning && !job.lastProvider && !job.lastQuality && job.status !== "error" && !job.timedOut) continue;
      slim[Number(k)] = {
        lastProvider: job.lastProvider,
        lastQuality: job.lastQuality,
        status: job.status,
        error: job.error,
        timedOut: job.timedOut,
        timeoutSource: job.timeoutSource,
        phase: job.phase,
        phaseUpdatedAt: job.phaseUpdatedAt ?? null,
        ...(isRunning
          ? {
              progress: typeof job.progress === "number" ? job.progress : 0,
              realProgress: job.realProgress ?? null,
              startedAt: job.startedAt,
            }
          : {}),
      };
    }
    if (mapsEqual(slim, lastWritten.current)) return;
    lastWritten.current = slim;
    safeWrite(key, slim);
  }, [projectId, videoJobs]);
}
