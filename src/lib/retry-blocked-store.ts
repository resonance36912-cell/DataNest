/**
 * Persistence for the last blocked retry (template lint issues).
 *
 * Primary store is sessionStorage (per-tab). A mirrored copy is kept in
 * localStorage with a TTL so the report also survives a *full page refresh*
 * in environments where sessionStorage is cleared (hard reload, restored tab,
 * privacy modes) — on load the mirror is re-hydrated back into sessionStorage.
 */
import type { LintReport } from "@/lib/report-email-template-lint";

export interface BlockedRetryRecord {
  email: string;
  report: LintReport;
  /** ISO timestamp of when the retry was blocked. */
  blockedAt: string;
}

const KEY = "syncvision.seo.lastBlockedRetry.v1";
/** Mirror survives hard refreshes; expires so it never becomes stale noise. */
const MIRROR_TTL_MS = 24 * 60 * 60 * 1000;

function safeSession(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function safeLocal(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function parse(raw: string | null): BlockedRetryRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as BlockedRetryRecord;
    if (!parsed || typeof parsed.email !== "string" || !parsed.report) return null;
    if (!Array.isArray(parsed.report.issues)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isFresh(record: BlockedRetryRecord): boolean {
  const t = Date.parse(record.blockedAt);
  if (Number.isNaN(t)) return true;
  return Date.now() - t < MIRROR_TTL_MS;
}

export function loadBlockedRetry(): BlockedRetryRecord | null {
  const fromSession = parse(safeSession()?.getItem(KEY) ?? null);
  if (fromSession) return fromSession;

  // Full page refresh fallback: restore from the localStorage mirror.
  const mirrored = parse(safeLocal()?.getItem(KEY) ?? null);
  if (!mirrored) return null;
  if (!isFresh(mirrored)) {
    clearBlockedRetry();
    return null;
  }
  try {
    safeSession()?.setItem(KEY, JSON.stringify(mirrored));
  } catch {
    /* ignore */
  }
  return mirrored;
}

export function saveBlockedRetry(
  record: Omit<BlockedRetryRecord, "blockedAt"> & { blockedAt?: string },
): BlockedRetryRecord {
  const next: BlockedRetryRecord = {
    email: record.email,
    report: record.report,
    blockedAt: record.blockedAt ?? new Date().toISOString(),
  };
  const serialized = JSON.stringify(next);
  try {
    safeSession()?.setItem(KEY, serialized);
  } catch {
    /* storage unavailable — keep in-memory only */
  }
  try {
    safeLocal()?.setItem(KEY, serialized);
  } catch {
    /* no-op */
  }
  return next;
}

export function clearBlockedRetry(): void {
  try {
    safeSession()?.removeItem(KEY);
  } catch {
    /* no-op */
  }
  try {
    safeLocal()?.removeItem(KEY);
  } catch {
    /* no-op */
  }
}
