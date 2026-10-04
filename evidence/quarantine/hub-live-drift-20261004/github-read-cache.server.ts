/**
 * Short-lived cache for server-side GitHub GET requests.
 *
 * Prevents concurrent duplicate reads and smooths refresh bursts while
 * keeping dashboard data effectively real-time.
 */
const TTL_MS = 15_000;
const MAX_ENTRIES = 256;

type Entry<T> = {
  value: T;
  expiresAt: number;
};

const cache = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function prune(now: number) {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }

  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (typeof oldest !== "string") break;
    cache.delete(oldest);
  }
}

export async function cachedGithubJson<T>(
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  prune(now);

  const hit = cache.get(key);

  if (hit && hit.expiresAt > now) {
    cache.delete(key);
    cache.set(key, hit);
    return hit.value as T;
  }

  const pending = inflight.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  const request = loader().then((value) => {
    cache.set(key, {
      value,
      expiresAt: Date.now() + TTL_MS,
    });

    prune(Date.now());

    return value;
  });

  inflight.set(key, request);

  try {
    return await request;
  } finally {
    inflight.delete(key);
  }
}