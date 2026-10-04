/**
 * In-memory LRU cache for video-frame thumbnails, keyed by
 * (videoUrl, startSec, keptSec, sourceDurationSec). Hits avoid the cost of
 * mounting a hidden <video>, decoding, seeking, and JPEG-encoding three
 * frames every time a trim panel re-renders or is reopened.
 *
 * Entries are data URLs (~5-15kB each). Cap at MAX_ENTRIES so we don't
 * leak memory across long sessions or huge projects.
 */

export type ThumbFrame = { url: string | null; error: boolean };
export type ThumbTriplet = [ThumbFrame, ThumbFrame, ThumbFrame];

const MAX_ENTRIES = 240; // 80 scenes × 3 trim variants ≈ usable headroom
const cache = new Map<string, ThumbTriplet>();

/** Round to 2 decimals so micro-changes from float math don't break cache hits. */
function r(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function thumbCacheKey(
  videoUrl: string,
  startSec: number,
  keptSec: number,
  sourceDurationSec?: number | null
): string {
  const src = typeof sourceDurationSec === "number" && sourceDurationSec > 0 ? r(sourceDurationSec) : "u";
  return `${videoUrl}|s=${r(startSec)}|k=${r(keptSec)}|d=${src}`;
}

export function getCachedThumbs(key: string): ThumbTriplet | null {
  const hit = cache.get(key);
  if (!hit) return null;
  // Re-insert to mark as recently used (Map preserves insertion order).
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

export function setCachedThumbs(key: string, frames: ThumbTriplet): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, frames);
  // Evict oldest entries past cap.
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

/** Test/debug helper — not used in app code. */
export function _clearThumbCache(): void {
  cache.clear();
}
