// Persistent log of entitlement transitions for the current user/browser.
// Records every change to tier, active status, or source so the in-app
// "Entitlement history" panel can show exactly when and why access shifted.
import type { Entitlement, Tier, EntitlementSource } from "./entitlement";

export const TIER_RANK: Record<Exclude<Tier, null>, number> = {
  free: 0,
  starter: 1,
  creator: 2,
  pro: 3,
  business: 4,
  all_access: 5,
};

export const TIER_LABEL: Record<Exclude<Tier, null>, string> = {
  free: "Free",
  starter: "Starter",
  creator: "Creator",
  pro: "Pro",
  business: "Business",
  all_access: "All Access",
};

export type EntitlementChangeKind =
  | "upgrade"
  | "downgrade"
  | "activated"
  | "deactivated"
  | "source_change";

export type EntitlementEvent = {
  id: string;
  at: string; // ISO timestamp
  kind: EntitlementChangeKind;
  reason: string; // human-readable
  from: { tier: Tier; status: string; active: boolean; source: EntitlementSource | null };
  to: { tier: Tier; status: string; active: boolean; source: EntitlementSource | null };
};

const STORAGE_KEY = "entitlement-history:v1";
const MAX_EVENTS = 100;
const listeners = new Set<() => void>();

function readAll(): EntitlementEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EntitlementEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(events: EntitlementEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    /* ignore quota / disabled storage */
  }
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* noop */
    }
  });
}

export function listEntitlementEvents(): EntitlementEvent[] {
  // Newest first for display.
  return readAll().slice().reverse();
}

export function clearEntitlementHistory(): void {
  writeAll([]);
}

export function subscribeEntitlementHistory(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function snap(e: Entitlement | null) {
  return {
    tier: (e?.tier ?? null) as Tier,
    status: e?.status ?? "unknown",
    active: !!e?.hasAccess,
    source: (e?.source ?? null) as EntitlementSource | null,
  };
}

function classify(
  from: ReturnType<typeof snap>,
  to: ReturnType<typeof snap>,
): { kind: EntitlementChangeKind; reason: string } | null {
  const fromRank = from.tier ? TIER_RANK[from.tier] ?? 0 : 0;
  const toRank = to.tier ? TIER_RANK[to.tier] ?? 0 : 0;

  if (toRank > fromRank) {
    return {
      kind: "upgrade",
      reason: `Tier upgraded ${TIER_LABEL[from.tier ?? "free"]} → ${TIER_LABEL[to.tier ?? "free"]}`,
    };
  }
  if (toRank < fromRank) {
    return {
      kind: "downgrade",
      reason: `Tier downgraded ${TIER_LABEL[from.tier ?? "free"]} → ${TIER_LABEL[to.tier ?? "free"]}`,
    };
  }
  if (to.active && !from.active) {
    return { kind: "activated", reason: `Status changed ${from.status} → ${to.status}` };
  }
  if (!to.active && from.active) {
    return { kind: "deactivated", reason: `Status changed ${from.status} → ${to.status}` };
  }
  if (to.source !== from.source) {
    return {
      kind: "source_change",
      reason: `Entitlement source changed ${from.source ?? "none"} → ${to.source ?? "none"}`,
    };
  }
  return null;
}

/**
 * Record a transition between two entitlement snapshots. No-ops when nothing
 * meaningful changed. Returns the event written, or null when skipped.
 */
export function recordEntitlementTransition(
  prev: Entitlement | null,
  next: Entitlement | null,
): EntitlementEvent | null {
  // Skip the initial "null → first observation" event — that's just session
  // boot, not a real change in the user's entitlement.
  if (!prev) return null;
  const from = snap(prev);
  const to = snap(next);
  const verdict = classify(from, to);
  if (!verdict) return null;
  const event: EntitlementEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    kind: verdict.kind,
    reason: verdict.reason,
    from,
    to,
  };
  const all = readAll();
  all.push(event);
  writeAll(all);
  return event;
}
