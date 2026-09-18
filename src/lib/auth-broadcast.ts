/**
 * Cross-tab auth broadcast.
 *
 * Guarantees "single sign-out": when the user signs out from ANY surface
 * (user dashboard, admin dashboard, another tab), every other open tab tears
 * its session down too. Uses BroadcastChannel where available and falls back
 * to a `localStorage` ping (which fires `storage` in other tabs).
 */

const CHANNEL_NAME = "sv-auth";
const FALLBACK_KEY = "sv-auth-broadcast";

export type AuthBroadcastEvent = { type: "signout"; at: number };

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

export function broadcastSignOut(): void {
  const payload: AuthBroadcastEvent = { type: "signout", at: Date.now() };
  try {
    getChannel()?.postMessage(payload);
  } catch {
    /* ignore */
  }
  try {
    window.localStorage.setItem(FALLBACK_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/** Subscribe to sign-out events raised in other tabs. Returns an unsubscribe. */
export function onAuthBroadcast(handler: (e: AuthBroadcastEvent) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const ch = getChannel();
  const onMessage = (ev: MessageEvent) => {
    const data = ev.data as AuthBroadcastEvent | undefined;
    if (data?.type === "signout") handler(data);
  };
  ch?.addEventListener("message", onMessage);

  const onStorage = (ev: StorageEvent) => {
    if (ev.key !== FALLBACK_KEY || !ev.newValue) return;
    try {
      const data = JSON.parse(ev.newValue) as AuthBroadcastEvent;
      if (data?.type === "signout") handler(data);
    } catch {
      /* ignore */
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    ch?.removeEventListener("message", onMessage);
    window.removeEventListener("storage", onStorage);
  };
}

/* ---------------------------------------------------------------- */
/* Post-OAuth destination                                            */
/* ---------------------------------------------------------------- */

const RETURN_KEY = "sv-auth-return-to";

/** Only same-origin relative paths are ever stored/returned. */
function isSafePath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

export function rememberReturnPath(path: string): void {
  if (!isSafePath(path)) return;
  try {
    window.sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    /* ignore */
  }
}

export function consumeReturnPath(): string | null {
  try {
    const v = window.sessionStorage.getItem(RETURN_KEY);
    if (v) window.sessionStorage.removeItem(RETURN_KEY);
    return v && isSafePath(v) ? v : null;
  } catch {
    return null;
  }
}
