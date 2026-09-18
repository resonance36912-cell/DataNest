import { useEffect, useState } from "react";
import { Radio, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SyncRow {
  scope: string;
  last_synced_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
}

const LABELS: Record<string, string> = {
  perf: "Telemetry",
  suggestions: "Suggestions",
  broadcasts: "Hub broadcasts",
};

function ago(iso: string | null) {
  if (!iso) return "never";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Compact strip showing the live connection state to the Resonance Hub:
 * one row per sync scope (telemetry, suggestions, broadcasts) with the
 * last successful sync timestamp and most recent error if any.
 */
export function HubStatusStrip() {
  const [rows, setRows] = useState<SyncRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("rop_sync_state")
        .select("scope,last_synced_at,last_attempt_at,last_error");
      if (!cancelled) {
        setRows((data ?? []) as SyncRow[]);
        setLoading(false);
      }
    }
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const scopes = ["perf", "suggestions", "broadcasts"] as const;
  const byScope = new Map(rows.map((r) => [r.scope, r]));
  const anyError = rows.some((r) => r.last_error);
  const anySync = rows.some((r) => r.last_synced_at);

  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex items-center gap-2 text-xs">
        <Radio className={`h-3.5 w-3.5 ${anySync ? "text-primary" : "text-muted-foreground"}`} />
        <span className="font-medium">Resonance Hub</span>
        {loading ? (
          <span className="text-muted-foreground">checking…</span>
        ) : anyError ? (
          <span className="inline-flex items-center gap-1 text-destructive">
            <AlertCircle className="h-3 w-3" /> Hub unreachable — events queue locally
          </span>
        ) : anySync ? (
          <span className="inline-flex items-center gap-1 text-emerald-500">
            <CheckCircle2 className="h-3 w-3" /> Connected
          </span>
        ) : (
          <span className="text-muted-foreground">
            Not yet configured — set HUB_APP_ID, HUB_SIGNING_KEY, HUB_BASE_URL secrets
          </span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-1 gap-1.5 text-[11px] sm:grid-cols-3">
        {scopes.map((s) => {
          const r = byScope.get(s);
          return (
            <div
              key={s}
              className="flex items-center justify-between rounded border border-border/40 bg-muted/20 px-2 py-1"
            >
              <span className="font-medium text-muted-foreground">{LABELS[s]}</span>
              <span
                className={r?.last_error ? "text-destructive" : "text-foreground"}
                title={r?.last_error ?? undefined}
              >
                {r?.last_error ? "error" : ago(r?.last_synced_at ?? null)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
