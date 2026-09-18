/**
 * useVideoPreloader — prefetches scene videos so playback starts instantly.
 *
 * Strategy:
 * - Preloads the current scene + next N scenes.
 * - Uses fetch() to download videos into blob URLs for instant playback.
 * - Falls back to <link rel="preload"> when fetch fails (e.g. CORS).
 * - Deduplicates — won't fetch the same URL twice.
 * - Limits concurrent fetches to avoid network saturation.
 * - Exposes a blobUrl map so components can use cached blobs directly.
 * - Publishes progress for UI indicators via usePreloadProgress().
 */

import { useEffect, useSyncExternalStore } from "react";

interface PreloadOptions {
  /** Video URLs in scene order */
  urls: (string | null | undefined)[];
  /** Index of the currently active/visible scene */
  activeIndex: number;
  /** How many scenes ahead to preload (default 3) */
  lookahead?: number;
  /** Disable preloading entirely */
  disabled?: boolean;
}

// ── Progress tracking ───────────────────────────────────────────────
interface PreloadProgress {
  total: number;
  cached: number;
  inFlight: number;
}

let progressSnapshot: PreloadProgress = { total: 0, cached: 0, inFlight: 0 };
const progressListeners = new Set<() => void>();

function emitProgress() {
  for (const l of progressListeners) l();
}

function subscribe(listener: () => void) {
  progressListeners.add(listener);
  return () => { progressListeners.delete(listener); };
}

function getSnapshot() { return progressSnapshot; }

/** Recalculate progress from the tracked URL set */
let trackedUrls: string[] = [];

function recalcProgress() {
  const total = trackedUrls.length;
  let cached = 0;
  let inFlight = 0;
  for (const u of trackedUrls) {
    if (blobCache.has(u)) cached++;
    else if (inFlightFetches.has(u)) inFlight++;
  }
  const next: PreloadProgress = { total, cached, inFlight };
  if (next.total !== progressSnapshot.total || next.cached !== progressSnapshot.cached || next.inFlight !== progressSnapshot.inFlight) {
    progressSnapshot = next;
    emitProgress();
  }
}

/** React hook — subscribe to preload progress */
export function usePreloadProgress(): PreloadProgress {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ── Blob cache & fetch queue ────────────────────────────────────────
/** Global blob cache shared across hook instances — avoids duplicate fetches */
const blobCache = new Map<string, string>(); // original URL → blob URL
const inFlightFetches = new Set<string>();
/** Max concurrent video fetches to avoid network saturation */
const MAX_CONCURRENT = 3;
/** Queue for URLs waiting to be fetched — split into priority + background */
const priorityQueue: string[] = [];
const backgroundQueue: string[] = [];

function processQueue() {
  while (inFlightFetches.size < MAX_CONCURRENT) {
    // Priority queue drains first
    const url = priorityQueue.shift() ?? backgroundQueue.shift();
    if (!url) break;
    if (blobCache.has(url) || inFlightFetches.has(url)) continue;
    inFlightFetches.add(url);
    recalcProgress();

    fetch(url, { mode: "cors" })
      .then((r) => {
        if (!r.ok) throw new Error(`fetch ${r.status}`);
        return r.blob();
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        blobCache.set(url, blobUrl);
      })
      .catch(() => {
        if (!document.querySelector(`link[href="${CSS.escape(url)}"]`)) {
          const link = document.createElement("link");
          link.rel = "preload";
          link.as = "video";
          link.href = url;
          document.head.appendChild(link);
        }
        blobCache.set(url, url);
      })
      .finally(() => {
        inFlightFetches.delete(url);
        recalcProgress();
        processQueue();
      });
  }
}

/**
 * Eagerly prefetch a single video URL into the blob cache.
 * Call this from polling or generation callbacks for instant availability.
 */
export function prefetchVideoUrl(url: string, priority = false): void {
  if (!url || blobCache.has(url) || inFlightFetches.has(url)) return;
  const queue = priority ? priorityQueue : backgroundQueue;
  if (!queue.includes(url)) {
    queue.push(url);
  }
  processQueue();
}

/** Look up a cached blob URL for a given original URL */
export function getCachedBlobUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return blobCache.get(url) ?? null;
}

export function useVideoPreloader({
  urls,
  activeIndex,
  lookahead = 3,
  disabled = false,
}: PreloadOptions) {
  useEffect(() => {
    if (disabled) return;

    // Phase 1: Priority — active scene + next 2
    const priorityEnd = Math.min(activeIndex + lookahead, urls.length);
    for (let i = activeIndex; i < priorityEnd; i++) {
      const url = urls[i];
      if (url && !blobCache.has(url) && !inFlightFetches.has(url)) {
        prefetchVideoUrl(url, true);
      }
    }

    // Phase 2: Background — everything else (queued after priority drains)
    for (let i = 0; i < urls.length; i++) {
      if (i >= activeIndex && i < priorityEnd) continue;
      const url = urls[i];
      if (url && !blobCache.has(url) && !inFlightFetches.has(url)) {
        prefetchVideoUrl(url, false);
      }
    }

    // Update tracked URLs for progress reporting
    trackedUrls = urls.filter((u): u is string => !!u);
    recalcProgress();
  }, [urls, activeIndex, lookahead, disabled]);
}
