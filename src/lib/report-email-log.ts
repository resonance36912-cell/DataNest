import type { ReportSummary } from "@/lib/report-email";

/**
 * Per-recipient delivery log for exported checklist report emails.
 * Stored on this device only.
 */

const STORAGE_KEY = "syncvision.report.email.log.v1";
export const MAX_LOG_ENTRIES = 100;

export type DeliveryStatus = "sent" | "failed";

export interface DeliveryLogEntry {
  id: string;
  at: string;
  email: string;
  status: DeliveryStatus;
  reason?: string;
  attempts: number;
  summary: ReportSummary;
}

export function loadDeliveryLog(): DeliveryLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is DeliveryLogEntry =>
        !!e && typeof e.email === "string" && typeof e.at === "string",
    );
  } catch {
    return [];
  }
}

function persist(list: DeliveryLogEntry[]): DeliveryLogEntry[] {
  const trimmed = list.slice(0, MAX_LOG_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* storage unavailable */
  }
  return trimmed;
}

export function appendDeliveryLog(
  entry: Omit<DeliveryLogEntry, "id" | "at" | "attempts"> & {
    at?: string;
    attempts?: number;
  },
): DeliveryLogEntry[] {
  const full: DeliveryLogEntry = {
    id: crypto.randomUUID(),
    at: entry.at ?? new Date().toISOString(),
    attempts: entry.attempts ?? 1,
    email: entry.email,
    status: entry.status,
    reason: entry.reason,
    summary: entry.summary,
  };
  return persist([full, ...loadDeliveryLog()]);
}

export function updateDeliveryLog(
  id: string,
  patch: Partial<Pick<DeliveryLogEntry, "status" | "reason" | "attempts" | "at">>,
): DeliveryLogEntry[] {
  return persist(
    loadDeliveryLog().map((e) => (e.id === id ? { ...e, ...patch } : e)),
  );
}

export function deleteDeliveryLogEntry(id: string): DeliveryLogEntry[] {
  return persist(loadDeliveryLog().filter((e) => e.id !== id));
}

export function clearDeliveryLog(): DeliveryLogEntry[] {
  return persist([]);
}
