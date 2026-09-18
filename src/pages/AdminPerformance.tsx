import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isAdminUser } from "@/lib/adminEmails";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Home, Gauge, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type Audit = {
  id: string;
  run_at: string;
  url: string;
  strategy: string;
  performance_score: number | null;
  lcp_ms: number | null;
  cls: number | null;
  inp_ms: number | null;
  fcp_ms: number | null;
  ttfb_ms: number | null;
  speed_index_ms: number | null;
  tbt_ms: number | null;
  note: string | null;
};

const DEFAULT_URL = "https://creativestudio.life";

const METRICS: Array<{
  key: keyof Audit;
  label: string;
  unit: "ms" | "score" | "cls";
  // lower is better unless score
  goodIfLower: boolean;
  good: number;
  poor: number;
}> = [
  { key: "performance_score", label: "Perf score", unit: "score", goodIfLower: false, good: 90, poor: 50 },
  { key: "lcp_ms", label: "LCP", unit: "ms", goodIfLower: true, good: 2500, poor: 4000 },
  { key: "inp_ms", label: "INP", unit: "ms", goodIfLower: true, good: 200, poor: 500 },
  { key: "cls", label: "CLS", unit: "cls", goodIfLower: true, good: 0.1, poor: 0.25 },
  { key: "fcp_ms", label: "FCP", unit: "ms", goodIfLower: true, good: 1800, poor: 3000 },
  { key: "ttfb_ms", label: "TTFB", unit: "ms", goodIfLower: true, good: 800, poor: 1800 },
  { key: "tbt_ms", label: "TBT", unit: "ms", goodIfLower: true, good: 200, poor: 600 },
  { key: "speed_index_ms", label: "Speed Index", unit: "ms", goodIfLower: true, good: 3400, poor: 5800 },
];

const fmt = (v: number | null, unit: "ms" | "score" | "cls") => {
  if (v == null) return "—";
  if (unit === "ms") return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`;
  if (unit === "cls") return v.toFixed(3);
  return String(Math.round(v));
};

const ratingCls = (val: number | null, m: (typeof METRICS)[number]) => {
  if (val == null) return "text-muted-foreground";
  const ok = m.goodIfLower ? val <= m.good : val >= m.good;
  const bad = m.goodIfLower ? val >= m.poor : val <= m.poor;
  if (ok) return "text-primary";
  if (bad) return "text-destructive";
  return "text-accent-foreground";
};

const AdminPerformance = () => {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [url, setUrl] = useState(DEFAULT_URL);
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [note, setNote] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !(await isAdminUser(session.user.id))) {
        navigate("/admin", { replace: true });
        return;
      }
      setAuthorized(true);
      await load();
      setLoading(false);
    })();
  }, [navigate]);

  const load = async () => {
    const { data } = await supabase
      .from("performance_audits")
      .select("*")
      .order("run_at", { ascending: false })
      .limit(50);
    setAudits((data ?? []) as Audit[]);
  };

  const runAudit = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("performance-audit", {
        body: { url, strategy, note: note.trim() || null },
      });
      if (error) throw error;
      toast.success("Snapshot captured");
      setNote("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Audit failed");
    } finally {
      setRunning(false);
    }
  };

  // Filter to chosen url+strategy, oldest-first for charts.
  const filtered = useMemo(
    () => audits.filter((a) => a.url === url && a.strategy === strategy).slice().reverse(),
    [audits, url, strategy],
  );

  const latest = filtered[filtered.length - 1] ?? null;
  const previous = filtered[filtered.length - 2] ?? null;

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
              <Gauge className="w-5 h-5 text-primary" /> Performance
            </h1>
            <p className="text-xs text-muted-foreground">
              {latest
                ? `Latest snapshot ${formatDistanceToNow(new Date(latest.run_at), { addSuffix: true })} · ${latest.strategy}`
                : "No snapshots yet"}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link to="/admin/dashboard">
              <Button variant="ghost" size="sm"><Home className="w-4 h-4 mr-2" />Dashboard</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-8">
        <Card className="p-5 space-y-4">
          <h2 className="font-display text-lg">Run a snapshot</h2>
          <p className="text-sm text-muted-foreground">
            Capture Lighthouse metrics (via Google PageSpeed Insights) for your live site. Run one after every publish to see before/after trends.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_1fr_auto] gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground">URL</label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://creativestudio.life" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Strategy</label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as "mobile" | "desktop")}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="mobile">Mobile</option>
                <option value="desktop">Desktop</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Note (e.g. "after publish #42")</label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional label" />
            </div>
            <Button onClick={runAudit} disabled={running || !url}>
              {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {running ? "Running…" : "Run audit"}
            </Button>
          </div>
        </Card>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {METRICS.map((m) => {
            const cur = latest ? (latest[m.key] as number | null) : null;
            const prev = previous ? (previous[m.key] as number | null) : null;
            const delta = cur != null && prev != null ? cur - prev : null;
            const improved =
              delta == null ? null : m.goodIfLower ? delta < 0 : delta > 0;
            const DeltaIcon = improved == null ? Minus : improved ? TrendingUp : TrendingDown;
            const deltaCls =
              improved == null
                ? "text-muted-foreground"
                : improved
                  ? "text-primary"
                  : "text-destructive";
            return (
              <Card key={m.key as string} className="p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{m.label}</p>
                <p className={`text-2xl font-display font-semibold mt-1 ${ratingCls(cur, m)}`}>{fmt(cur, m.unit)}</p>
                <div className={`text-xs mt-2 flex items-center gap-1 ${deltaCls}`}>
                  <DeltaIcon className="w-3 h-3" />
                  {delta == null
                    ? "no prior snapshot"
                    : `${improved ? "improved" : "regressed"} by ${fmt(Math.abs(delta), m.unit)}`}
                </div>
              </Card>
            );
          })}
        </section>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg">Trend</h2>
            <p className="text-xs text-muted-foreground">{filtered.length} snapshots · {url} · {strategy}</p>
          </div>
          {filtered.length < 2 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Capture at least two snapshots to see a trend line.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TrendChart title="Performance score" dataKey="performance_score" data={filtered} color="hsl(var(--primary))" />
              <TrendChart title="LCP (ms)" dataKey="lcp_ms" data={filtered} color="hsl(var(--accent))" />
              <TrendChart title="INP (ms)" dataKey="inp_ms" data={filtered} color="hsl(var(--primary))" />
              <TrendChart title="CLS" dataKey="cls" data={filtered} color="hsl(var(--destructive))" />
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-lg mb-4">History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2">Run</th>
                  <th className="px-2 py-2">Strategy</th>
                  <th className="px-2 py-2">Score</th>
                  <th className="px-2 py-2">LCP</th>
                  <th className="px-2 py-2">INP</th>
                  <th className="px-2 py-2">CLS</th>
                  <th className="px-2 py-2">FCP</th>
                  <th className="px-2 py-2">TTFB</th>
                  <th className="px-2 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((a) => (
                  <tr key={a.id} className="border-b border-border/40">
                    <td className="px-2 py-2 whitespace-nowrap">{format(new Date(a.run_at), "MMM d, HH:mm")}</td>
                    <td className="px-2 py-2 capitalize">{a.strategy}</td>
                    <td className="px-2 py-2">{fmt(a.performance_score, "score")}</td>
                    <td className="px-2 py-2">{fmt(a.lcp_ms, "ms")}</td>
                    <td className="px-2 py-2">{fmt(a.inp_ms, "ms")}</td>
                    <td className="px-2 py-2">{fmt(a.cls, "cls")}</td>
                    <td className="px-2 py-2">{fmt(a.fcp_ms, "ms")}</td>
                    <td className="px-2 py-2">{fmt(a.ttfb_ms, "ms")}</td>
                    <td className="px-2 py-2 text-muted-foreground">{a.note ?? "—"}</td>
                  </tr>
                ))}
                {audits.length === 0 && (
                  <tr><td colSpan={9} className="px-2 py-6 text-center text-muted-foreground">No snapshots yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  );
};

const TrendChart = ({
  title,
  dataKey,
  data,
  color,
}: {
  title: string;
  dataKey: keyof Audit;
  data: Audit[];
  color: string;
}) => {
  const chartData = data.map((a) => ({
    t: format(new Date(a.run_at), "MMM d HH:mm"),
    v: a[dataKey] as number | null,
  }));
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{title}</p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="t" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                fontSize: 12,
              }}
            />
            <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default AdminPerformance;
