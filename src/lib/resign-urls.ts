/**
 * Detects expired Supabase Storage signed URLs and re-signs them.
 * Signed URLs contain a `token` query param with a JWT whose `exp` claim
 * tells us when it expires.
 */

import { supabase } from "@/integrations/supabase/client";

const BUCKET = "media-uploads";
const SIGNED_URL_TTL = 7200; // 2 hours

/** Check if a URL is a Supabase storage signed URL */
function isStorageSignedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname.includes("/storage/") && u.searchParams.has("token");
  } catch {
    return false;
  }
}

/** Extract the storage object path from a signed URL */
function extractStoragePath(url: string): string | null {
  try {
    const u = new URL(url);
    // Path pattern: /storage/v1/object/sign/<bucket>/<path>
    const match = u.pathname.match(/\/storage\/v1\/object\/sign\/[^/]+\/(.+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/** Check if a signed URL's JWT token is expired (or expires within 5 min) */
function isExpired(url: string): boolean {
  try {
    const token = new URL(url).searchParams.get("token");
    if (!token) return true;
    const parts = token.split(".");
    if (parts.length < 2) return true;
    const payload = JSON.parse(atob(parts[1]));
    const exp = payload.exp;
    if (!exp) return true;
    // Consider expired if within 5 minutes of expiry
    return Date.now() / 1000 > exp - 300;
  } catch {
    return true; // If we can't parse, treat as expired
  }
}

/**
 * Re-sign a single URL if it's an expired Supabase storage signed URL.
 * Returns the original URL if it's not a storage URL or still valid.
 */
export async function resignUrlIfExpired(url: string | null | undefined): Promise<string | undefined> {
  if (!url) return undefined;
  if (!isStorageSignedUrl(url)) return url;
  if (!isExpired(url)) return url;

  const path = extractStoragePath(url);
  if (!path) return url;

  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);

  return data?.signedUrl || url;
}

/**
 * Batch re-sign multiple URLs. Returns a map of original → new URL.
 * Only re-signs expired ones; others pass through unchanged.
 */
export async function resignUrlsBatch(
  urls: (string | null | undefined)[]
): Promise<(string | undefined)[]> {
  // Identify which need re-signing
  const needsResign: { index: number; path: string }[] = [];
  const results: (string | undefined)[] = urls.map((u) => u || undefined);

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (!url || !isStorageSignedUrl(url) || !isExpired(url)) continue;
    const path = extractStoragePath(url);
    if (path) needsResign.push({ index: i, path });
  }

  if (needsResign.length === 0) return results;

  // Supabase supports batch signing
  const paths = needsResign.map((r) => r.path);
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL);

  if (data) {
    for (let i = 0; i < data.length; i++) {
      if (data[i].signedUrl) {
        results[needsResign[i].index] = data[i].signedUrl;
      }
    }
  }

  return results;
}
