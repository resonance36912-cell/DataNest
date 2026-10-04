/**
 * QaWarningTrendChart — small stacked area chart summarizing QA warning rates
 * (audio leaks, lip-sync failures, policy-stripped) over the recent window.
 *
 * Also renders compact "top offenders" tables aggregating totals per user_id
 * and per project_id so admins can spot problematic accounts at a glance.
 *
 * Pure presentational: consumes the already-decorated rows the parent panel
 * derives from render_jobs, so filters (search / limit) and this chart stay
 * in sync without extra queries.
 */
import { useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

export interface QaDecoratedRow {
  row: { user_id: string; project_id: string | null; created_at: string };
  leak: boolean;
  lipsyncFailure: boolean;
  audioStripped: boolean;
}

interface Props {
  decorated: QaDecoratedRow[];
  bucket?: "hour" | "day";
}

interface Bucket {
  key: string;
  label: string;
  total: number;
  leaks: number;
  lipsync_failures: number;
  stripped: number;
}

function bucketKey(iso: string, mode: "hour" | "day"): { key: string; label: string } {
  const d = new Date(iso);
  if (mode === "hour") {
    d.setMinutes(0, 0, 0);
    return {
      key: d.toISOString(),
      label: d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit" }),
    };
  }
  d.setHours(0, 0, 0, 0);
  return {
    key: d.toISOString(),
    label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  };
}

export function QaWarningTrendChart({ decorated, bucket }: Props) {
  const mode: "hour" | "day" = useMemo(() => {
    if (bucket) return bucket;
    if (decorated.length < 2) return "hour";
    const times = decorated.map((d) => new Date(d.row.created_at).getTime());
    const span = Math.max(...times) - Math.min(...times);
    return span > 48 * 3_600_000 ? "day" : "hour";
  }, [decorated, bucket]);

  const series = useMemo<Bucket[]>(() => {
    const map = new Map<string, Bucket>();
    for (const d of decorated) {
      const { key, label } = bucketKey(d.row.created_at, mode);
      let b = map.get(key);
      if (!b) {
        b = { key, label, total: 0, leaks: 0, lipsync_failures: 0, stripped: 0 };
        map.set(key, b);
      }
      b.total += 1;
      if (d.leak) b.leaks += 1;
      if (d.lipsyncFailure) b.lipsync_failures += 1;
      if (d.audioStripped) b.stripped += 1;
    }
    return Array.from(map.values()).sort((a, z) => a.key.localeCompare(z.key));
  }, [decorated, mode]);

  const totals = useMemo(() => ({
    total: decorated.length,
    leaks: decorated.filter((d) => d.leak).length,
    lipsync: decorated.filter((d) => d.lipsyncFailure).length,
    stripped: decorated.filter((d) => d.audioStripped).length,
  }), [decorated]);

  const warnRate = totals.total > 0
    ? Math.round(((totals.leaks + totals.lipsync) / totals.total) * 100)
    : 0;

  const perUser = useMemo(() => aggregateBy(decorated, (d) => d.row.user_id), [decorated]);
  const perProject = useMemo(
    () => aggregateBy(decorated.filter((d) => d.row.project_id), (d) => d.row.project_id as string),
    [decorated],
  );

  return (
    <div className="rounded-md border border-border/50 bg-card/30 p-3 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-xs font-medium">QA warning trend</div>
          <div className="text-[10px] text-muted-foreground">
            Grouped per {mode}. Warning rate:{" "}
            <span className={warnRate > 20 ? "text-destructive font-mono" : "text-foreground font-mono"}>
              {warnRate}%
            </span>{" "}
            ({totals.leaks + totals.lipsync}/{totals.total})
          </div>
        </div>
      </div>

      <div className="h-40 w-full">
        {series.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground">
            No jobs in window.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="qaLeaks" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="qaLip" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="qaStripped" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis allowDecimals={false} tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" width={30} />
              <Tooltip
                contentStyle={{
                  fontSize: 10,
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Area type="monotone" stackId="1" dataKey="leaks" name="Audio leaks" stroke="hsl(var(--destructive))" fill="url(#qaLeaks)" />
              <Area type="monotone" stackId="1" dataKey="lipsync_failures" name="Lip-sync failures" stroke="#f59e0b" fill="url(#qaLip)" />
              <Area type="monotone" stackId="1" dataKey="stripped" name="Stripped" stroke="#10b981" fill="url(#qaStripped)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <OffendersTable title="Top users by warnings" rows={perUser} />
        <OffendersTable title="Top projects by warnings" rows={perProject} />
      </div>
    </div>
  );
}

interface AggRow {
  key: string;
  total: number;
  leaks: number;
  lipsync: number;
  warnings: number;
}

function aggregateBy(decorated: QaDecoratedRow[], keyFn: (d: QaDecoratedRow) => string): AggRow[] {
  const map = new Map<string, AggRow>();
  for (const d of decorated) {
    const key = keyFn(d);
    if (!key) continue;
    let a = map.get(key);
    if (!a) { a = { key, total: 0, leaks: 0, lipsync: 0, warnings: 0 }; map.set(key, a); }
    a.total += 1;
    if (d.leak) a.leaks += 1;
    if (d.lipsyncFailure) a.lipsync += 1;
    a.warnings = a.leaks + a.lipsync;
  }
  return Array.from(map.values())
    .filter((a) => a.warnings > 0)
    .sort((a, z) => z.warnings - a.warnings || z.total - a.total)
    .slice(0, 5);
}

function OffendersTable({ title, rows }: { title: string; rows: AggRow[] }) {
  return (
    <div className="rounded border border-border/40 bg-background/40">
      <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground border-b border-border/40">
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="p-2 text-[10px] text-muted-foreground">No warnings in window.</div>
      ) : (
        <ul className="divide-y divide-border/30">
          {rows.map((r) => {
            const rate = r.total > 0 ? Math.round((r.warnings / r.total) * 100) : 0;
            return (
              <li key={r.key} className="flex items-center justify-between px-2 py-1 text-[10px]">
                <span className="font-mono truncate max-w-[160px]" title={r.key}>{r.key.slice(0, 8)}…</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-destructive">{r.warnings}</span>
                  <span className="text-muted-foreground">/ {r.total}</span>
                  <span className={`font-mono w-9 text-right ${rate > 40 ? "text-destructive" : "text-muted-foreground"}`}>{rate}%</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
