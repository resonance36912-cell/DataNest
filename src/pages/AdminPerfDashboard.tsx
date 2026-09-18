import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isAdminUser } from "@/lib/adminEmails";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, RefreshCw, Home, Activity, AlertTriangle, Database, Save, Trash2 } from "lucide-react";
import { format, formatDistanceToNow, subHours } from "date-fns";
import { toast } from "sonner";
import {
  getAutosaveSamples,
  subscribeAutosave,
  summarize,
  clearAutosaveSamples,
  type AutosaveSample,
} from "@/lib/autosaveMetrics";

interface SlowRow {
  query: string;
  calls: number;
  total_ms: number;
  mean_ms: number;
  max_ms: number;
  rows_avg: number;
}

interface ErrorBucket {
  fn_or_route: string;
  count: number;
  last_at: string;
  sample: string;
}

const EMPTY: AutosaveSample[] = [];
const useAutosave = () =>
  useSyncExternalStore(
    (cb) => subscribeAutosave(cb),
    () => getAutosaveSamples(),
    () => EMPTY,
  );

const AdminPerfDashboard = () => {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [slow, setSlow] = useState<SlowRow[]>([]);
  const [slowError, setSlowError] = useState<string | null>(null);
  const [clientErrors, setClientErrors] = useState<ErrorBucket[]>([]);
  const [edgeErrors, setEdgeErrors] = useState<ErrorBucket[]>([]);
  const [errorTotals, setErrorTotals] = useState({ client: 0, edge: 0 });

  const samples = useAutosave();
  const stats = useMemo(() => summarize(samples), [samples]);

  // Only show the last 24h of autosave activity in the inline chart/table.
  const recent24h = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return samples.filter((s) => s.ts >= cutoff);
  }, [samples]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !(await isAdminUser(session.user.id))) {
        navigate("/admin", { replace: true });
        return;
      }
      setAuthorized(true);
      await refreshAll();
      setLoading(false);
    })();
  }, [navigate]);

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      const since = subHours(new Date(), 24).toISOString();

      const [slowRes, clientRes, edgeRes] = await Promise.all([
        supabase.functions.invoke("admin-perf-stats", { body: {} }),
        supabase
          .from("client_error_logs")
          .select("route, message, created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("edge_function_logs")
          .select("fn, message, level, created_at")
          .in("level", ["error", "warn"])
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      if (slowRes.error) {
        setSlowError(slowRes.error.message);
        setSlow([]);
      } else {
        const list = (slowRes.data?.slow ?? []) as SlowRow[];
        setSlow(list);
        setSlowError(list.length === 0 ? "No slow-query data captured yet." : null);
      }

      setClientErrors(bucketize(clientRes.data ?? [], "route"));
      setEdgeErrors(bucketize(edgeRes.data ?? [], "fn"));
      setErrorTotals({
        client: clientRes.data?.length ?? 0,
        edge: edgeRes.data?.length ?? 0,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  if (!authorized || loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 sticky top-0 z-10 bg-background/80 backdrop-blur">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-display font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" /> Performance dashboard
            </h1>
            <p className="text-xs text-muted-foreground">
              Slow queries, autosave latency, and error counts — last 24h.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={refreshAll} disabled={refreshing}>
              {refreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Refresh
            </Button>
            <Link to="/admin/dashboard">
              <Button variant="ghost" size="sm"><Home className="w-4 h-4 mr-2" />Dashboard</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-8">
        {/* Headline counters */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Counter icon={<Database className="w-4 h-4" />} label="Slow queries tracked" value={slow.length} tone="neutral" />
          <Counter icon={<Save className="w-4 h-4" />} label="Autosaves (24h)" value={recent24h.length} tone="neutral" />
          <Counter
            icon={<AlertTriangle className="w-4 h-4" />}
            label="Client errors (24h)"
            value={errorTotals.client}
            tone={errorTotals.client > 0 ? "bad" : "good"}
          />
          <Counter
            icon={<AlertTriangle className="w-4 h-4" />}
            label="Edge fn errors (24h)"
            value={errorTotals.edge}
            tone={errorTotals.edge > 0 ? "bad" : "good"}
          />
        </section>

        {/* Autosave latency */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-display text-lg flex items-center gap-2"><Save className="w-4 h-4 text-primary" /> Autosave latency</h2>
              <p className="text-xs text-muted-foreground">
                Measured client-side around each Studio autosave write.
                {stats.lastTs ? ` Last sample ${formatDistanceToNow(new Date(stats.lastTs), { addSuffix: true })}.` : " No samples yet — open a Studio project to populate."}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { clearAutosaveSamples(); toast.success("Cleared autosave samples"); }}
              disabled={samples.length === 0}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Clear
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Count" value={String(stats.count)} />
            <Stat label="p50" value={`${stats.p50}ms`} tone={stats.p50 > 250 ? "bad" : stats.p50 > 120 ? "warn" : "good"} />
            <Stat label="p95" value={`${stats.p95}ms`} tone={stats.p95 > 600 ? "bad" : stats.p95 > 300 ? "warn" : "good"} />
            <Stat label="Max" value={`${stats.max}ms`} tone={stats.max > 1000 ? "bad" : stats.max > 500 ? "warn" : "good"} />
            <Stat label="Failures" value={String(stats.failures)} tone={stats.failures > 0 ? "bad" : "good"} />
          </div>

          {recent24h.length > 0 && (
            <Sparkline samples={recent24h} />
          )}
        </Card>

        {/* Slow queries */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" /> Slowest queries
            </h2>
            <p className="text-xs text-muted-foreground">Top 20 by total execution time (pg_stat_statements)</p>
          </div>
          {slowError && slow.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{slowError}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2">Query</th>
                    <th className="px-2 py-2 text-right">Calls</th>
                    <th className="px-2 py-2 text-right">Mean</th>
                    <th className="px-2 py-2 text-right">Max</th>
                    <th className="px-2 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {slow.map((q, i) => (
                    <tr key={i} className="border-b border-border/40 align-top">
                      <td className="px-2 py-2 font-mono text-xs text-muted-foreground max-w-[640px]">
                        <span className="line-clamp-3 whitespace-pre-wrap break-words">{q.query}</span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{q.calls.toLocaleString()}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${q.mean_ms > 150 ? "text-destructive" : q.mean_ms > 50 ? "text-accent-foreground" : "text-foreground"}`}>{q.mean_ms.toFixed(1)}ms</td>
                      <td className="px-2 py-2 text-right tabular-nums">{q.max_ms.toFixed(0)}ms</td>
                      <td className="px-2 py-2 text-right tabular-nums">{(q.total_ms / 1000).toFixed(2)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Error breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ErrorPanel title="Client errors by route" buckets={clientErrors} emptyLabel="No client errors logged in the last 24h." />
          <ErrorPanel title="Edge function errors by fn" buckets={edgeErrors} emptyLabel="No edge function errors in the last 24h." />
        </div>
      </main>
    </div>
  );
};

const Counter = ({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "good" | "bad" | "neutral" }) => {
  const cls = tone === "bad" ? "text-destructive" : tone === "good" ? "text-primary" : "text-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className={`text-2xl font-display font-semibold mt-1 ${cls}`}>{value.toLocaleString()}</p>
    </Card>
  );
};

const Stat = ({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "warn" }) => {
  const cls = tone === "bad" ? "text-destructive" : tone === "warn" ? "text-accent-foreground" : tone === "good" ? "text-primary" : "text-foreground";
  return (
    <div className="rounded-md border border-border/60 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-lg font-display font-semibold ${cls}`}>{value}</p>
    </div>
  );
};

const Sparkline = ({ samples }: { samples: AutosaveSample[] }) => {
  const width = 600;
  const height = 60;
  const max = Math.max(50, ...samples.map((s) => s.ms));
  const step = samples.length > 1 ? width / (samples.length - 1) : 0;
  const points = samples.map((s, i) => `${(i * step).toFixed(1)},${(height - (s.ms / max) * height).toFixed(1)}`).join(" ");
  return (
    <div className="rounded-md border border-border/60 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Latency over time (ms)</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-16" preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" />
      </svg>
    </div>
  );
};

const ErrorPanel = ({ title, buckets, emptyLabel }: { title: string; buckets: ErrorBucket[]; emptyLabel: string }) => (
  <Card className="p-5">
    <h2 className="font-display text-lg mb-4 flex items-center gap-2">
      <AlertTriangle className="w-4 h-4 text-destructive" /> {title}
    </h2>
    {buckets.length === 0 ? (
      <p className="text-sm text-muted-foreground py-4 text-center">{emptyLabel}</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-2">Source</th>
              <th className="px-2 py-2 text-right">Count</th>
              <th className="px-2 py-2">Last</th>
              <th className="px-2 py-2">Sample</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.fn_or_route} className="border-b border-border/40 align-top">
                <td className="px-2 py-2 font-medium">{b.fn_or_route || "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums">{b.count}</td>
                <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">{format(new Date(b.last_at), "MMM d, HH:mm")}</td>
                <td className="px-2 py-2 text-xs text-muted-foreground max-w-[280px]">
                  <span className="line-clamp-2 break-words">{b.sample}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </Card>
);

const bucketize = (
  rows: Array<{ route?: string | null; fn?: string | null; message: string; created_at: string }>,
  key: "route" | "fn",
): ErrorBucket[] => {
  const map = new Map<string, ErrorBucket>();
  for (const r of rows) {
    const k = (r[key] ?? "(unknown)") || "(unknown)";
    const existing = map.get(k);
    if (existing) {
      existing.count += 1;
      if (r.created_at > existing.last_at) {
        existing.last_at = r.created_at;
        existing.sample = r.message;
      }
    } else {
      map.set(k, { fn_or_route: k, count: 1, last_at: r.created_at, sample: r.message });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 25);
};

export default AdminPerfDashboard;
