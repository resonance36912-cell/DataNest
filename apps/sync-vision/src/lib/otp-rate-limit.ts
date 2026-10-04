/**
 * Client-side rate limiting for the passwordless email OTP fallback.
 * Persists per-email send history so cooldowns survive reloads and
 * navigation between /login and /account.
 *
 * Note: this is a UX guard. The auth server enforces the real limits.
 */

const KEY = "rsv:otp-sends:v1";
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const MAX_SENDS_PER_WINDOW = 5;
/** Escalating cooldown (seconds) by attempt index within the window. */
const COOLDOWN_LADDER = [45, 60, 90, 150, 300];

type Store = Record<string, number[]>;

const normalize = (email: string) => email.trim().toLowerCase();

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Store) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable — limits degrade to in-memory only */
  }
}

function recent(email: string, store: Store): number[] {
  const now = Date.now();
  return (store[normalize(email)] ?? []).filter((t) => now - t < WINDOW_MS);
}

export type OtpLimitState = {
  /** Seconds until another code may be requested (0 = allowed now). */
  cooldownSeconds: number;
  /** Sends already used in the rolling window. */
  used: number;
  remaining: number;
  /** True when the hourly cap is reached. */
  blocked: boolean;
};

export function getOtpLimitState(email: string): OtpLimitState {
  const store = read();
  const times = recent(email, store);
  const used = times.length;
  const last = times[times.length - 1];
  const now = Date.now();

  if (used >= MAX_SENDS_PER_WINDOW) {
    const oldest = times[0];
    return {
      cooldownSeconds: Math.max(0, Math.ceil((oldest + WINDOW_MS - now) / 1000)),
      used,
      remaining: 0,
      blocked: true,
    };
  }

  const step = COOLDOWN_LADDER[Math.min(used, COOLDOWN_LADDER.length) - 1] ?? 0;
  const cooldownSeconds = last ? Math.max(0, Math.ceil((last + step * 1000 - now) / 1000)) : 0;

  return { cooldownSeconds, used, remaining: MAX_SENDS_PER_WINDOW - used, blocked: false };
}

/** Records a successful send request and returns the new state. */
export function recordOtpSend(email: string): OtpLimitState {
  const store = read();
  const key = normalize(email);
  store[key] = [...recent(email, store), Date.now()];
  write(store);
  return getOtpLimitState(email);
}

/** Clears history for an address (call after a successful verification). */
export function clearOtpSends(email: string) {
  const store = read();
  delete store[normalize(email)];
  write(store);
}

export function formatCooldown(seconds: number): string {
  if (seconds <= 0) return "";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/* ------------------------------------------------------------------ *
 * Verification lockout persistence
 * Keeps the exact "wait until" timestamp (and failure count) per email
 * so a page refresh can't shortcut an active lockout.
 * ------------------------------------------------------------------ */

const LOCKOUT_KEY = "rsv:otp-verify-lockout:v1";

export type OtpVerifyLockout = { until: number; failures: number };
type LockoutStore = Record<string, OtpVerifyLockout>;

function readLockouts(): LockoutStore {
  try {
    const raw = localStorage.getItem(LOCKOUT_KEY);
    const parsed = raw ? (JSON.parse(raw) as LockoutStore) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLockouts(store: LockoutStore) {
  try {
    localStorage.setItem(LOCKOUT_KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable — lockout degrades to in-memory only */
  }
}

/** Returns the stored lockout for an address, pruning expired entries. */
export function getOtpVerifyLockout(email: string): OtpVerifyLockout | null {
  if (!email.trim()) return null;
  const store = readLockouts();
  const key = normalize(email);
  const entry = store[key];
  if (!entry || typeof entry.until !== "number") return null;
  if (Date.now() >= entry.until) {
    // Keep the failure count so escalation survives, drop the stale window.
    if (entry.failures > 0) {
      store[key] = { until: 0, failures: entry.failures };
      writeLockouts(store);
      return { until: 0, failures: entry.failures };
    }
    delete store[key];
    writeLockouts(store);
    return null;
  }
  return entry;
}

export function saveOtpVerifyLockout(email: string, lockout: OtpVerifyLockout) {
  if (!email.trim()) return;
  const store = readLockouts();
  store[normalize(email)] = lockout;
  writeLockouts(store);
}

export function clearOtpVerifyLockout(email: string) {
  if (!email.trim()) return;
  const store = readLockouts();
  delete store[normalize(email)];
  writeLockouts(store);
}
