// In-app panel showing the user's entitlement transition history — when their
// tier changed, in which direction, and why. Reads from localStorage via
// listEntitlementEvents and subscribes to live updates so a mid-session
// upgrade appears here without a reload.
import { useEffect, useSyncExternalStore } from "react";
import { GlassCard, Eyebrow } from "@/components/brand/GlassCard";
import { BrandButton } from "@/components/brand/BrandButton";
import {
  clearEntitlementHistory,
  listEntitlementEvents,
  subscribeEntitlementHistory,
  TIER_LABEL,
  type EntitlementChangeKind,
  type EntitlementEvent,
} from "@/lib/entitlementHistory";
import type { Tier } from "@/lib/entitlement";

const KIND_BADGE: Record<EntitlementChangeKind, { label: string; cls: string }> = {
  upgrade: { label: "Upgrade", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30" },
  downgrade: { label: "Downgrade", cls: "bg-amber-500/15 text-amber-300 border-amber-400/30" },
  activated: { label: "Activated", cls: "bg-sky-500/15 text-sky-300 border-sky-400/30" },
  deactivated: { label: "Deactivated", cls: "bg-rose-500/15 text-rose-300 border-rose-400/30" },
  source_change: { label: "Source change", cls: "bg-violet-500/15 text-violet-300 border-violet-400/30" },
};

function tierName(t: Tier): string {
  if (!t) return "—";
  return TIER_LABEL[t] ?? t;
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function useEntitlementEvents(): EntitlementEvent[] {
  return useSyncExternalStore(
    subscribeEntitlementHistory,
    listEntitlementEvents,
    () => [],
  );
}

export function EntitlementHistoryPanel() {
  const events = useEntitlementEvents();

  // Cross-tab updates: localStorage events fire in other tabs, so trigger a
  // re-render here when the history key changes anywhere in this browser.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "entitlement-history:v1") {
        // useSyncExternalStore won't re-run on storage events from other tabs;
        // poke our own listener set to force a snapshot read.
        // Touching the key with a no-op write triggers our own listeners.
        // Simpler: just dispatch a custom event consumed by the store hook —
        // but the store reads localStorage directly on each getSnapshot call,
        // and React only re-renders when subscribe-fired. So fire a one-time
        // forced read via the subscribe path:
        window.dispatchEvent(new Event("entitlement-history:bump"));
      }
    }
    function onBump() {
      // Trigger our subscribe listeners by writing back the same value.
      try {
        const raw = window.localStorage.getItem("entitlement-history:v1");
        if (raw) window.localStorage.setItem("entitlement-history:v1", raw);
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("entitlement-history:bump", onBump);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("entitlement-history:bump", onBump);
    };
  }, []);

  return (
    <GlassCard className="w-full">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <Eyebrow>Account</Eyebrow>
          <h2 className="font-display text-2xl text-foreground mt-2">
            Entitlement history
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            Every change to your plan, status, and source — recorded locally
            so you can confirm an upgrade landed or trace when access shifted.
          </p>
        </div>
        {events.length > 0 && (
          <BrandButton
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.confirm("Clear your entitlement history? This cannot be undone.")) {
                clearEntitlementHistory();
              }
            }}
          >
            Clear
          </BrandButton>
        )}
      </div>

      {events.length === 0 ? (
        <div className="text-sm text-muted-foreground border border-dashed border-white/10 rounded-xl p-6 text-center">
          No entitlement changes recorded yet. Upgrades, downgrades, and status
          flips during this session will appear here.
        </div>
      ) : (
        <ol className="space-y-3" aria-label="Entitlement history">
          {events.map((evt) => {
            const badge = KIND_BADGE[evt.kind];
            return (
              <li
                key={evt.id}
                className="rounded-xl border border-white/10 bg-card/40 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center text-[11px] font-medium uppercase tracking-wide px-2 py-0.5 rounded border ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                    <time
                      dateTime={evt.at}
                      className="text-xs text-muted-foreground"
                    >
                      {formatWhen(evt.at)}
                    </time>
                  </div>
                  <p className="text-sm text-foreground mt-1.5">{evt.reason}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {tierName(evt.from.tier)} ({evt.from.status}) →{" "}
                    {tierName(evt.to.tier)} ({evt.to.status})
                    {evt.from.source !== evt.to.source && (
                      <>
                        {" · source "}
                        {evt.from.source ?? "none"} → {evt.to.source ?? "none"}
                      </>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </GlassCard>
  );
}
