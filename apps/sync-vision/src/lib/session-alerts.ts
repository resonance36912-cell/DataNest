/**
 * Session alerts — local, per-device notifications for account-level auth
 * events that did NOT originate on this device:
 *
 *  - `signed_out_everywhere`: the account revoked all refresh tokens (a global
 *    sign-out from another device / admin surface) and this device's session
 *    stopped being honoured by the server.
 *  - `new_session`: the server reports a newer `last_sign_in_at` than the one
 *    baked into this device's session, i.e. someone signed in elsewhere.
 *
 * Stored in `localStorage` (device-scoped, no server table required) and
 * surfaced as toasts plus a card on /account.
 */

import { describeDevice } from "@/lib/security-audit-log";

const STORAGE_KEY = "sv-session-alerts";
const CHANGE_EVENT = "sv-session-alerts-change";
export const MAX_SESSION_ALERTS = 40;

export type SessionAlertType = "signed_out_everywhere" | "new_session";

export interface SessionAlert {
  id: string;
  type: SessionAlertType;
  at: number;
  email: string | null;
  /** Device string for the device that raised the alert (this one). */
  device: string;
  detail?: string;
  read: boolean;
}

export const SESSION_ALERT_LABELS: Record<SessionAlertType, string> = {
  signed_out_everywhere: "Signed out everywhere",
  new_session: "New sign-in on another device",
};

export const SESSION_ALERT_MESSAGES: Record<SessionAlertType, string> = {
  signed_out_everywhere:
    "Your account was signed out on all devices. You'll need to sign in again.",
  new_session:
    "A new session was created for your account on another device. If this wasn't you, sign out everywhere and review your linked identities.",
};

function read(): SessionAlert[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SessionAlert[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(entries: SessionAlert[]): SessionAlert[] {
  const trimmed = entries.slice(0, MAX_SESSION_ALERTS);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* ignore */
  }
  return trimmed;
}

export function loadSessionAlerts(): SessionAlert[] {
  return read().sort((a, b) => b.at - a.at);
}

export function unreadSessionAlertCount(): number {
  return read().filter((a) => !a.read).length;
}

export function recordSessionAlert(input: {
  type: SessionAlertType;
  email?: string | null;
  detail?: string;
}): SessionAlert {
  const entry: SessionAlert = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: input.type,
    at: Date.now(),
    email: input.email ?? null,
    device: describeDevice(typeof navigator !== "undefined" ? navigator.userAgent : undefined),
    detail: input.detail,
    read: false,
  };
  write([entry, ...read()]);
  return entry;
}

export function markSessionAlertsRead(): SessionAlert[] {
  return write(read().map((a) => ({ ...a, read: true })));
}

export function clearSessionAlerts(): SessionAlert[] {
  return write([]);
}

/** Subscribe to alert changes (this tab and other tabs). */
export function onSessionAlertsChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onLocal = () => handler();
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) handler();
  };
  window.addEventListener(CHANGE_EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onLocal);
    window.removeEventListener("storage", onStorage);
  };
}

/* ------------------------------------------------------------------ */
/* Detection state                                                     */
/* ------------------------------------------------------------------ */

const SEEN_SIGNIN_KEY = "sv-session-last-signin";

/** Remember the `last_sign_in_at` this device's own session was issued with. */
export function rememberSignInMarker(userId: string, lastSignInAt: string | null | undefined): void {
  if (!lastSignInAt) return;
  try {
    window.localStorage.setItem(SEEN_SIGNIN_KEY, JSON.stringify({ userId, lastSignInAt }));
  } catch {
    /* ignore */
  }
}

export function getSignInMarker(): { userId: string; lastSignInAt: string } | null {
  try {
    const raw = window.localStorage.getItem(SEEN_SIGNIN_KEY);
    return raw ? (JSON.parse(raw) as { userId: string; lastSignInAt: string }) : null;
  } catch {
    return null;
  }
}

export function clearSignInMarker(): void {
  try {
    window.localStorage.removeItem(SEEN_SIGNIN_KEY);
  } catch {
    /* ignore */
  }
}
