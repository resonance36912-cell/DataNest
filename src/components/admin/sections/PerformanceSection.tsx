import { useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { AdminSection } from "../AdminSection";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type Status = "ok" | "error" | "timeout";

interface PerfEvent {
  id: string;
  step: string;
  action: string;
  provider: string | null;
  duration_ms: number;
  status: Status;
  error_code: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

interface StepStat {
  step: string;
  count: number;
  errors: number;
  p50: number;
  p95: number;
  errorRate: number;
}

const WINDOWS: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d":  7  * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

function computeStats(events: PerfEvent[]): StepStat[] {
  const byStep = new Map<string, PerfEvent[]>();
  events.forEach((e) => {
    const arr = byStep.get(e.step) ?? [];
    arr.push(e);
    byStep.set(e.step, arr);
  });
  return Array.from(byStep.entries()).map(([step, evs]) => {
    const durs = evs.map((e) => e.duration_ms).sort((a, b) => a - b);
    const errors = evs.filter((e) => e.status !== "ok").length;
    return {
      step,
      count: evs.length,
      errors,
      p50: percentile(durs, 0.5),
      p95: percentile(durs, 0.95),
      errorRate: evs.length ? errors / evs.length : 0,
    };
  }).sort((a, b) => b.p95 - a.p95);
}

function suggestionsFor(stat: StepStat): string[] {
  const out: string[] = [];
  if (stat.p95 > 30_000) out.push(`p95 ${(stat.p95 / 1000).toFixed(1)}s — investigate slow provider or batch size`);
  if (stat.errorRate > 0.05) out.push(`error rate ${(stat.errorRate * 100).toFixed(1)}% — instability detected`);
  if (stat.count === 0) out.push("no events in window — instrumentation may be missing");
  return out;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

export function PerformanceSection() {
  const [events, setEvents] = useState<PerfEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [window, setWindowKey] = useState<keyof typeof WINDOWS>("24h");
  const [recent, setRecent] = useState<PerfEvent[]>([]);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - WINDOWS[window]).toISOString();
    const { data, error } = await supabase
      .from("perf_events")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) {
      toast.error("Failed to load perf events", { description: error.message });
    } else {
      setEvents((data ?? []) as PerfEvent[]);
      setRecent(((data ?? []) as PerfEvent[]).slice(0, 25));
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [window]);

  // Realtime: stream new events into the recent list and the rolling stats set
  useEffect(() => {
    const channel = supabase
      .channel("perf_events_admin")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "perf_events" },
        (payload) => {
          const ev = payload.new as PerfEvent;
          setEvents((prev) => [ev, ...prev].slice(0, 5000));
          setRecent((prev) => [ev, ...prev].slice(0, 25));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const stats = useMemo(() => computeStats(events), [events]);
  const totalEvents = events.length;
  const totalErrors = events.filter((e) => e.status !== "ok").length;
  const overallErrorRate = totalEvents ? totalErrors / totalEvents : 0;

  return (
    <AdminSection
      icon={Activity}
      title="Performance Telemetry"
      description="Step timings, error rates, and live event stream from real users."
      action={
        <div className="flex items-center gap-2">
          <Select value={window} onValueChange={(v) => setWindowKey(v as keyof typeof WINDOWS)}>
            <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      }
    >
      {/* Totals */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border bg-card/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Events</div>
          <div className="text-lg font-semibold">{totalEvents.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-border bg-card/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Errors</div>
          <div className="text-lg font-semibold">{totalErrors.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-border bg-card/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Error rate</div>
          <div className="text-lg font-semibold">{(overallErrorRate * 100).toFixed(2)}%</div>
        </div>
      </div>

      {/* Per-step table */}
      <div className="mb-4 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Step</th>
              <th className="px-3 py-2 text-right">Count</th>
              <th className="px-3 py-2 text-right">p50</th>
              <th className="px-3 py-2 text-right">p95</th>
              <th className="px-3 py-2 text-right">Errors</th>
              <th className="px-3 py-2 text-left">Suggestions</th>
            </tr>
          </thead>
          <tbody>
            {stats.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                {loading ? "Loading…" : "No events in this window yet."}
              </td></tr>
            ) : stats.map((s) => {
              const tips = suggestionsFor(s);
              return (
                <tr key={s.step} className="border-t border-border">
                  <td className="px-3 py-2 capitalize font-medium">{s.step}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMs(s.p50)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMs(s.p95)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className={s.errors ? "text-rose-400" : ""}>{s.errors}</span>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground">
                    {tips.length ? tips.join(" · ") : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Live stream */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live event stream</h3>
        </div>
        <div className="space-y-1">
          {recent.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              Waiting for events…
            </div>
          ) : recent.map((ev) => (
            <div key={ev.id} className="flex items-center gap-2 rounded border border-border bg-card/30 px-3 py-1.5 text-[11px]">
              <Badge variant="outline" className="capitalize">{ev.step}</Badge>
              <span className="text-muted-foreground">{ev.action}</span>
              {ev.provider && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{ev.provider}</span>}
              <span className="ml-auto tabular-nums">{fmtMs(ev.duration_ms)}</span>
              <Badge
                variant="outline"
                className={
                  ev.status === "ok"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                }
              >
                {ev.status}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </AdminSection>
  );
}
