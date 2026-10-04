import { useCallback, useEffect, useRef, useState, type MouseEventHandler, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw, ShieldCheck, Home, Activity, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

type State = "CLOSED" | "OPEN" | "HALF_OPEN";

interface BreakerSnapshot {
  key: string;
  state: State;
  failures: number;
  openedAt: number;
  currentCooldownMs: number;
}

interface OutcomeLatency {
  count: number;
  p50: number;
  p95: number;
  avg: number;
}

interface RequestMetrics {
  total: number;
  byOutcome: { isolate_hit: number; db_hit: number; miss: number; error: number };
  hitRate: number;
  isolateHitRate: number;
  overall: OutcomeLatency;
  byOutcomeLatency: Record<string, OutcomeLatency>;
  isolateCacheSize: number;
  isolateCacheCapacity: number;
  sampleWindow: number;
  sampleWindowMax: number;
  isolateUptimeMs: number;
}

interface FunctionResult {
  functionName: string;
  ok: boolean;
  error?: string;
  sampledAt?: string;
  breakers?: BreakerSnapshot[];
  metrics?: RequestMetrics;
}

const FUNCTIONS = [
  "extract-source-brief",
  "optimize-source-images",
  "generate-cinematic-video",
] as const;

interface MetricSample {
  at: number;
  hitRate: number;
  p50: number;
  p95: number;
}
const HISTORY_MAX = 30;

async function pollBreakers(fn: string): Promise<FunctionResult> {
  try {
    const { data, error } = await supabase.functions.invoke(fn, {
      body: { op: "__breaker_status__" },
    });
    if (error) {
      return { functionName: fn, ok: false, error: error.message ?? "invoke failed" };
    }
    if (!data || data.success !== true) {
      return { functionName: fn, ok: false, error: data?.error ?? "unexpected response" };
    }
    return {
      functionName: fn,
      ok: true,
      sampledAt: data.sampledAt,
      breakers: data.breakers ?? [],
      metrics: data.metrics,
    };
  } catch (err) {
    return { functionName: fn, ok: false, error: (err as Error).message };
  }
}

function StateBadge({ state }: { state: State }) {
  const tone =
    state === "CLOSED"
      ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30"
      : state === "HALF_OPEN"
        ? "bg-amber-500/10 text-amber-400 ring-amber-500/30"
        : "bg-destructive/10 text-destructive ring-destructive/30";
  const Icon = state === "CLOSED" ? CheckCircle2 : state === "HALF_OPEN" ? Clock : AlertTriangle;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${tone}`}>
      <Icon className="w-3 h-3" />
      {state.replace("_", " ")}
    </span>
  );
}

function cooldownRemaining(b: BreakerSnapshot, now: number) {
  if (b.state !== "OPEN") return 0;
  return Math.max(0, b.openedAt + b.currentCooldownMs - now);
}

function formatUptime(ms: number) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function Sparkline({
  series,
  height = 36,
  width = 160,
  yMax,
  yMin = 0,
  timestamps,
  valueSuffix = "",
  valueFormat,
}: {
  series: { values: number[]; color: string; label: string }[];
  height?: number;
  width?: number;
  yMax?: number;
  yMin?: number;
  /** Newest-last timestamps (ms epoch) aligned to the longest series. */
  timestamps?: number[];
  valueSuffix?: string;
  valueFormat?: (v: number) => string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const allValues = series.flatMap((s) => s.values);
  if (allValues.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-[10px] text-muted-foreground/70 rounded ring-1 ring-border/40 bg-background/40"
        style={{ height, width }}
      >
        collecting…
      </div>
    );
  }
  const computedMax = yMax ?? Math.max(...allValues, 1);
  const computedMin = yMin;
  const range = Math.max(1, computedMax - computedMin);
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const maxLen = Math.max(...series.map((s) => s.values.length));
  const xStep = maxLen > 1 ? w / (maxLen - 1) : w;

  const xForIdx = (i: number) => pad + i * xStep;
  const yForVal = (v: number) => pad + h - ((v - computedMin) / range) * h;
  const fmt = valueFormat ?? ((v: number) => `${Math.round(v)}${valueSuffix}`);

  const onMove: MouseEventHandler<SVGSVGElement> = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - pad;
    if (xStep <= 0) return;
    const idx = Math.max(0, Math.min(maxLen - 1, Math.round(x / xStep)));
    setHoverIdx(idx);
  };

  // Tooltip values per series at hovered index (right-aligned offset rules).
  const hoverInfo = hoverIdx === null
    ? null
    : series
        .map((s) => {
          const offset = maxLen - s.values.length;
          const localIdx = hoverIdx - offset;
          if (localIdx < 0 || localIdx >= s.values.length) return null;
          return { label: s.label, color: s.color, value: s.values[localIdx] };
        })
        .filter((v): v is { label: string; color: string; value: number } => v !== null);

  const hoverTimestamp = hoverIdx !== null && timestamps && timestamps[hoverIdx] !== undefined
    ? timestamps[hoverIdx]
    : null;
  const ageSec = hoverTimestamp ? Math.max(0, Math.round((Date.now() - hoverTimestamp) / 1000)) : null;
  // Anchor tooltip so it stays inside the chart; default left, flip right past midpoint.
  const tooltipX = hoverIdx !== null ? xForIdx(hoverIdx) : 0;
  const tooltipOnLeft = tooltipX > width / 2;

  return (
    <div className="relative" style={{ width, height }}>
      <svg
        width={width}
        height={height}
        className="block"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {series.map((s) => {
          if (s.values.length < 2) return null;
          // Right-align: newest sample on the right edge.
          const offset = maxLen - s.values.length;
          const d = s.values
            .map((v, i) => {
              const x = xForIdx(offset + i);
              const y = yForVal(v);
              return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ");
          return (
            <path
              key={s.label}
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
        {hoverIdx !== null && hoverInfo && hoverInfo.length > 0 && (
          <>
            <line
              x1={tooltipX}
              x2={tooltipX}
              y1={pad}
              y2={pad + h}
              stroke="currentColor"
              strokeOpacity={0.3}
              strokeWidth={1}
              strokeDasharray="2,2"
            />
            {hoverInfo.map((p) => (
              <circle
                key={p.label}
                cx={tooltipX}
                cy={yForVal(p.value)}
                r={2.5}
                fill={p.color}
                stroke="hsl(var(--background))"
                strokeWidth={1}
              />
            ))}
          </>
        )}
      </svg>
      {hoverIdx !== null && hoverInfo && hoverInfo.length > 0 && (
        <div
          className="pointer-events-none absolute z-10 rounded-md bg-popover text-popover-foreground ring-1 ring-border px-2 py-1.5 text-[10px] tabular-nums shadow-lg whitespace-nowrap"
          style={{
            top: 2,
            left: tooltipOnLeft ? undefined : Math.min(tooltipX + 6, width - 4),
            right: tooltipOnLeft ? Math.max(4, width - tooltipX + 6) : undefined,
          }}
        >
          {ageSec !== null && (
            <div className="text-muted-foreground mb-0.5">{ageSec}s ago</div>
          )}
          {hoverInfo.map((p) => (
            <div key={p.label} className="flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
              <span className="text-muted-foreground">{p.label}</span>
              <span className="text-foreground ml-auto">{fmt(p.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-destructive/40 bg-destructive/10 text-destructive">
      <AlertTriangle className="w-3 h-3" />
      {label}
    </span>
  );
}

function MetricsPanel({
  m,
  history,
  thresholds,
}: {
  m: RequestMetrics;
  history: MetricSample[];
  thresholds: AlertThresholds;
}) {
  const outcomes: { key: keyof RequestMetrics["byOutcome"]; label: string; tone: string }[] = [
    { key: "isolate_hit", label: "Isolate hit", tone: "text-emerald-400" },
    { key: "db_hit", label: "DB hit", tone: "text-sky-400" },
    { key: "miss", label: "Miss (scrape)", tone: "text-amber-400" },
    { key: "error", label: "Error", tone: "text-destructive" },
  ];
  const hitSeries = history.map((s) => s.hitRate * 100);
  const p50Series = history.map((s) => s.p50);
  const p95Series = history.map((s) => s.p95);
  // Visual color tokens — keep direct hex so SVG strokes don't depend on Tailwind JIT.
  const C = { hit: "#34d399", p50: "#60a5fa", p95: "#f472b6" };
  const alerts = evaluateAlerts(m, thresholds);
  const eligible = m.total >= thresholds.minSamples;
  return (
    <div className="px-5 py-4 border-b border-border bg-muted/20 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Requests" value={m.total.toLocaleString()} sub={`window ${m.sampleWindow}/${m.sampleWindowMax}`} />
        <Stat
          label="Cache hit-rate"
          value={pct(m.hitRate)}
          sub={`isolate ${pct(m.isolateHitRate)}`}
          badge={alerts.hitRateBreached ? <AlertBadge label={`< ${thresholds.hitRateMinPct}%`} /> : null}
        />
        <Stat
          label="Latency p50 / p95"
          value={`${m.overall.p50} / ${m.overall.p95} ms`}
          sub={`avg ${m.overall.avg} ms`}
          badge={alerts.p95Breached ? <AlertBadge label={`p95 ≥ ${thresholds.p95MaxMs}ms`} /> : null}
        />
        <Stat
          label="Isolate cache"
          value={`${m.isolateCacheSize}/${m.isolateCacheCapacity}`}
          sub={`up ${formatUptime(m.isolateUptimeMs)}`}
        />
      </div>
      {!eligible && (
        <p className="text-[10px] text-muted-foreground">
          Alerts inactive — needs ≥ {thresholds.minSamples} requests in this isolate (currently {m.total}).
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg bg-card ring-1 ring-border px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Hit-rate trend</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              now {pct(m.hitRate)} · {history.length}/{HISTORY_MAX}
            </span>
          </div>
          <Sparkline
            series={[{ values: hitSeries, color: C.hit, label: "hit-rate" }]}
            yMin={0}
            yMax={100}
            width={280}
            height={40}
            timestamps={history.map((s) => s.at)}
            valueFormat={(v) => `${v.toFixed(1)}%`}
          />
        </div>
        <div className="rounded-lg bg-card ring-1 ring-border px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Latency trend (ms)</span>
            <span className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-2">
              <span style={{ color: C.p50 }}>p50 {m.overall.p50}</span>
              <span style={{ color: C.p95 }}>p95 {m.overall.p95}</span>
            </span>
          </div>
          <Sparkline
            series={[
              { values: p50Series, color: C.p50, label: "p50" },
              { values: p95Series, color: C.p95, label: "p95" },
            ]}
            width={280}
            height={40}
            timestamps={history.map((s) => s.at)}
            valueSuffix="ms"
          />
        </div>
      </div>
      <div className="overflow-x-auto">

        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1.5 pr-3 font-medium">Outcome</th>
              <th className="py-1.5 px-3 font-medium">Count</th>
              <th className="py-1.5 px-3 font-medium">Share</th>
              <th className="py-1.5 px-3 font-medium">p50</th>
              <th className="py-1.5 px-3 font-medium">p95</th>
              <th className="py-1.5 px-3 font-medium">avg</th>
            </tr>
          </thead>
          <tbody>
            {outcomes.map((o) => {
              const count = m.byOutcome[o.key] ?? 0;
              const lat = m.byOutcomeLatency[o.key];
              const share = m.total ? count / m.total : 0;
              return (
                <tr key={o.key} className="border-t border-border/40">
                  <td className={`py-1.5 pr-3 font-medium ${o.tone}`}>{o.label}</td>
                  <td className="py-1.5 px-3 text-foreground">{count}</td>
                  <td className="py-1.5 px-3 text-muted-foreground">{pct(share)}</td>
                  <td className="py-1.5 px-3 text-muted-foreground">{lat ? `${lat.p50}ms` : "—"}</td>
                  <td className="py-1.5 px-3 text-muted-foreground">{lat ? `${lat.p95}ms` : "—"}</td>
                  <td className="py-1.5 px-3 text-muted-foreground">{lat ? `${lat.avg}ms` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  badge,
}: {
  label: string;
  value: string;
  sub?: string;
  badge?: ReactNode;
}) {
  return (
    <div className="rounded-lg bg-card ring-1 ring-border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        {badge}
      </div>
      <div className="text-base font-display font-bold text-foreground mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function ThresholdField({
  label,
  value,
  onChange,
  suffix,
  min,
  max,
  step = 1,
  error,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  error?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5">
        <span>{label}</span>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            const parsed = Number.parseFloat(e.target.value);
            if (Number.isFinite(parsed)) onChange(parsed);
          }}
          className={`w-16 rounded-md bg-secondary text-secondary-foreground text-xs px-2 py-1 ring-1 tabular-nums ${
            error ? "ring-destructive focus-visible:ring-destructive" : "ring-border"
          }`}
        />
        {suffix && <span className="text-muted-foreground/70">{suffix}</span>}
      </span>
      {error && <span className="text-[10px] text-destructive">{error}</span>}
    </label>
  );
}

const REFRESH_INTERVALS = [
  { label: "2s", value: 2_000 },
  { label: "5s", value: 5_000 },
  { label: "10s", value: 10_000 },
  { label: "30s", value: 30_000 },
  { label: "1m", value: 60_000 },
  { label: "5m", value: 300_000 },
] as const;
const REFRESH_STORAGE_KEY = "adminCircuitBreakers.refreshIntervalMs";
const THRESHOLDS_STORAGE_KEY = "adminCircuitBreakers.alertThresholdProfiles";
const DEFAULT_REFRESH_MS = 10_000;

interface AlertThresholds {
  /** Warn when hit-rate drops at or below this percentage (0–100). */
  hitRateMinPct: number;
  /** Warn when p95 latency meets or exceeds this many ms. */
  p95MaxMs: number;
  /** Minimum total requests before alerts apply (avoids cold-start noise). */
  minSamples: number;
}

interface ThresholdProfileState {
  active: string;
  profiles: Record<string, AlertThresholds>;
}

const PRESET_PROFILES: Record<string, AlertThresholds> = {
  dev: { hitRateMinPct: 20, p95MaxMs: 5000, minSamples: 3 },
  staging: { hitRateMinPct: 35, p95MaxMs: 3500, minSamples: 5 },
  prod: { hitRateMinPct: 60, p95MaxMs: 2000, minSamples: 10 },
};
const DEFAULT_PROFILE_STATE: ThresholdProfileState = {
  active: "prod",
  profiles: { ...PRESET_PROFILES },
};
const DEFAULT_THRESHOLDS: AlertThresholds = PRESET_PROFILES.prod;

// Field bounds (also reused by the inputs' min/max so the browser blocks
// nonsense values before zod runs). Numbers are integers — partial percents
// or fractional ms don't add operational signal.
const THRESHOLD_BOUNDS = {
  hitRateMinPct: { min: 0, max: 100 },
  p95MaxMs: { min: 1, max: 60_000 },
  minSamples: { min: 1, max: 10_000 },
} as const;

const thresholdsSchema = z
  .object({
    hitRateMinPct: z.number()
      .int("Use a whole percent")
      .min(THRESHOLD_BOUNDS.hitRateMinPct.min, "Must be ≥ 0")
      .max(THRESHOLD_BOUNDS.hitRateMinPct.max, "Must be ≤ 100"),
    p95MaxMs: z.number()
      .int("Whole milliseconds only")
      .min(THRESHOLD_BOUNDS.p95MaxMs.min, "Must be ≥ 1ms")
      .max(THRESHOLD_BOUNDS.p95MaxMs.max, "Must be ≤ 60000ms"),
    minSamples: z.number()
      .int("Whole number of samples")
      .min(THRESHOLD_BOUNDS.minSamples.min, "Must be ≥ 1")
      .max(THRESHOLD_BOUNDS.minSamples.max, "Must be ≤ 10000"),
  })
  // Cross-field sanity: a hit-rate alert that requires 100% is unreachable in
  // practice; flag as invalid so the operator picks a meaningful threshold.
  .refine((v) => v.hitRateMinPct < 100, {
    path: ["hitRateMinPct"],
    message: "100% hit-rate is unreachable — pick a lower bound",
  });

// Profile-name rules: short, human-readable, safe to round-trip through
// localStorage and URLs without surprises.
const profileNameSchema = z
  .string()
  .trim()
  .min(1, "Name required")
  .max(32, "Max 32 characters")
  .regex(/^[A-Za-z0-9 _-]+$/, "Letters, numbers, space, _ or - only");

type ThresholdFieldErrors = Partial<Record<keyof AlertThresholds, string>>;

function validateThresholds(t: AlertThresholds): ThresholdFieldErrors {
  const result = thresholdsSchema.safeParse(t);
  if (result.success) return {};
  const errors: ThresholdFieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof AlertThresholds | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

function sanitizeThresholds(t: Partial<AlertThresholds> | undefined): AlertThresholds {
  // Clamp + coerce to defaults so a corrupt localStorage payload still loads.
  const raw = {
    hitRateMinPct: Number.isFinite(t?.hitRateMinPct) ? Number(t!.hitRateMinPct) : DEFAULT_THRESHOLDS.hitRateMinPct,
    p95MaxMs: Number.isFinite(t?.p95MaxMs) ? Number(t!.p95MaxMs) : DEFAULT_THRESHOLDS.p95MaxMs,
    minSamples: Number.isFinite(t?.minSamples) ? Number(t!.minSamples) : DEFAULT_THRESHOLDS.minSamples,
  };
  return {
    hitRateMinPct: Math.round(Math.max(THRESHOLD_BOUNDS.hitRateMinPct.min, Math.min(THRESHOLD_BOUNDS.hitRateMinPct.max, raw.hitRateMinPct))),
    p95MaxMs: Math.round(Math.max(THRESHOLD_BOUNDS.p95MaxMs.min, Math.min(THRESHOLD_BOUNDS.p95MaxMs.max, raw.p95MaxMs))),
    minSamples: Math.round(Math.max(THRESHOLD_BOUNDS.minSamples.min, Math.min(THRESHOLD_BOUNDS.minSamples.max, raw.minSamples))),
  };
}

function loadProfileState(): ThresholdProfileState {
  if (typeof window === "undefined") return DEFAULT_PROFILE_STATE;
  try {
    const raw = window.localStorage.getItem(THRESHOLDS_STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE_STATE;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.profiles) return DEFAULT_PROFILE_STATE;
    const profiles: Record<string, AlertThresholds> = {};
    for (const [name, value] of Object.entries(parsed.profiles)) {
      profiles[name] = sanitizeThresholds(value as Partial<AlertThresholds>);
    }
    if (Object.keys(profiles).length === 0) return DEFAULT_PROFILE_STATE;
    const active = typeof parsed.active === "string" && profiles[parsed.active]
      ? parsed.active
      : Object.keys(profiles)[0];
    return { active, profiles };
  } catch {
    return DEFAULT_PROFILE_STATE;
  }
}

function evaluateAlerts(m: RequestMetrics, t: AlertThresholds) {
  const eligible = m.total >= t.minSamples;
  return {
    hitRateBreached: eligible && m.hitRate * 100 < t.hitRateMinPct,
    p95Breached: eligible && m.overall.p95 >= t.p95MaxMs,
  };
}

const AdminCircuitBreakers = () => {
  const [results, setResults] = useState<FunctionResult[]>([]);
  const [history, setHistory] = useState<Record<string, MetricSample[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [intervalMs, setIntervalMs] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_REFRESH_MS;
    const raw = window.localStorage.getItem(REFRESH_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return REFRESH_INTERVALS.some((i) => i.value === parsed) ? parsed : DEFAULT_REFRESH_MS;
  });
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [profileState, setProfileState] = useState<ThresholdProfileState>(() => loadProfileState());
  const thresholds = profileState.profiles[profileState.active] ?? DEFAULT_THRESHOLDS;
  const thresholdErrors = validateThresholds(thresholds);
  const hasThresholdErrors = Object.keys(thresholdErrors).length > 0;
  const setThresholds: (updater: AlertThresholds | ((t: AlertThresholds) => AlertThresholds)) => void = (updater) => {
    setProfileState((s) => {
      const current = s.profiles[s.active] ?? DEFAULT_THRESHOLDS;
      const nextValue = typeof updater === "function" ? (updater as (t: AlertThresholds) => AlertThresholds)(current) : updater;
      return { ...s, profiles: { ...s.profiles, [s.active]: nextValue } };
    });
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(REFRESH_STORAGE_KEY, String(intervalMs));
  }, [intervalMs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Persist only valid configurations. An invalid in-flight edit stays in
    // component state (so the user sees their typo) but never overwrites the
    // last-known-good blob on disk — protects the alerting pipeline from a
    // refresh wiping out working thresholds.
    const allValid = Object.values(profileState.profiles).every(
      (p) => Object.keys(validateThresholds(p)).length === 0,
    );
    if (!allValid) return;
    window.localStorage.setItem(THRESHOLDS_STORAGE_KEY, JSON.stringify(profileState));
  }, [profileState]);

  const setActiveProfile = (name: string) => {
    setProfileState((s) => (s.profiles[name] ? { ...s, active: name } : s));
  };

  const saveAsProfile = () => {
    if (hasThresholdErrors) {
      toast.error("Fix threshold errors before saving", {
        description: Object.values(thresholdErrors).join(" · "),
      });
      return;
    }
    const raw = window.prompt("Save current thresholds as profile (name):", "");
    if (raw === null) return;
    const nameResult = profileNameSchema.safeParse(raw);
    if (!nameResult.success) {
      toast.error("Invalid profile name", { description: nameResult.error.issues[0].message });
      return;
    }
    const trimmed = nameResult.data;
    setProfileState((s) => {
      if (s.profiles[trimmed]) {
        const replace = window.confirm(`Profile "${trimmed}" already exists. Overwrite?`);
        if (!replace) return s;
      }
      return { active: trimmed, profiles: { ...s.profiles, [trimmed]: thresholds } };
    });
    toast.success(`Saved profile "${trimmed}"`);
  };

  const deleteActiveProfile = () => {
    setProfileState((s) => {
      const names = Object.keys(s.profiles);
      if (names.length <= 1) return s;
      const confirmed = window.confirm(`Delete profile "${s.active}"? This cannot be undone.`);
      if (!confirmed) return s;
      const { [s.active]: _, ...rest } = s.profiles;
      return { active: Object.keys(rest)[0], profiles: rest };
    });
  };

  const resetActiveProfile = () => {
    const preset = PRESET_PROFILES[profileState.active];
    setThresholds(preset ?? DEFAULT_THRESHOLDS);
  };

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const data = await Promise.all(FUNCTIONS.map(pollBreakers));
    setResults(data);
    setHistory((prev) => {
      const next = { ...prev };
      const at = Date.now();
      for (const r of data) {
        if (!r.ok || !r.metrics) continue;
        // Only append a sample when at least one request was observed; an
        // empty isolate would just flatten the chart with zeros.
        if (r.metrics.total === 0) continue;
        const sample: MetricSample = {
          at,
          hitRate: r.metrics.hitRate,
          p50: r.metrics.overall.p50,
          p95: r.metrics.overall.p95,
        };
        const series = [...(next[r.functionName] ?? []), sample];
        if (series.length > HISTORY_MAX) series.splice(0, series.length - HISTORY_MAX);
        next[r.functionName] = series;
      }
      return next;
    });
    setLastRefreshedAt(Date.now());
    setRefreshing(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(id);
  }, [autoRefresh, intervalMs, refresh]);

  useEffect(() => {
    // Tick once per second so cooldown timers + "last refreshed" age count
    // down in the UI without re-polling.
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Toast on threshold transition (ok → breached). Tracks the prior breach
  // state per `${functionName}:${metric}` so we don't spam on every refresh.
  const prevBreachRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    // Skip alert evaluation while the active profile is in an invalid state —
    // a partially-edited threshold should never fire bogus toasts.
    if (hasThresholdErrors) return;
    const next: Record<string, boolean> = {};
    for (const r of results) {
      if (!r.ok || !r.metrics) continue;
      const a = evaluateAlerts(r.metrics, thresholds);
      const checks: { key: string; breached: boolean; title: string; description: string }[] = [
        {
          key: `${r.functionName}:hitRate`,
          breached: a.hitRateBreached,
          title: `${r.functionName}: cache hit-rate low`,
          description: `${(r.metrics.hitRate * 100).toFixed(1)}% < ${thresholds.hitRateMinPct}% threshold`,
        },
        {
          key: `${r.functionName}:p95`,
          breached: a.p95Breached,
          title: `${r.functionName}: p95 latency high`,
          description: `${r.metrics.overall.p95}ms ≥ ${thresholds.p95MaxMs}ms threshold`,
        },
      ];
      for (const c of checks) {
        next[c.key] = c.breached;
        const wasBreached = prevBreachRef.current[c.key] === true;
        if (c.breached && !wasBreached) {
          toast.error(c.title, { description: c.description, id: c.key });
        } else if (!c.breached && wasBreached) {
          toast.success(`${r.functionName}: recovered`, {
            description: c.key.endsWith(":hitRate") ? "Hit-rate back above threshold" : "p95 latency back below threshold",
            id: `${c.key}:recovered`,
          });
        }
      }
    }
    prevBreachRef.current = next;
  }, [results, thresholds, hasThresholdErrors]);

  const sinceLast = lastRefreshedAt ? Math.max(0, Math.floor((now - lastRefreshedAt) / 1000)) : null;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-destructive" />
            </div>
            <span className="font-display text-base font-bold text-foreground">Circuit Breakers</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2 text-muted-foreground">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="accent-primary"
              />
              Auto-refresh
            </label>
            <label className="flex items-center gap-1.5 text-muted-foreground">
              <span className="text-xs">Every</span>
              <select
                value={intervalMs}
                onChange={(e) => setIntervalMs(Number.parseInt(e.target.value, 10))}
                disabled={!autoRefresh}
                className="rounded-md bg-secondary text-secondary-foreground text-xs px-2 py-1 ring-1 ring-border disabled:opacity-50"
              >
                {REFRESH_INTERVALS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            {sinceLast !== null && (
              <span className="text-[11px] text-muted-foreground tabular-nums">
                updated {sinceLast}s ago
              </span>
            )}
            <button
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link to="/admin/dashboard" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
              <Home className="w-3.5 h-3.5" /> Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="rounded-lg bg-muted/30 ring-1 ring-border px-4 py-3 text-xs text-muted-foreground leading-relaxed">
          <p className="flex items-center gap-1.5 font-medium text-foreground mb-1">
            <Activity className="w-3.5 h-3.5" /> About these counters
          </p>
          Each edge function maintains its breakers <span className="text-foreground">in-memory per warm isolate</span>.
          A snapshot reflects whichever isolate answered the poll, so the same function can briefly show different
          counts across refreshes. After a few minutes of idle, isolates recycle and counters reset to zero — that's
          expected, not a bug.
        </div>

        <div className="rounded-lg bg-card ring-1 ring-border px-4 py-3 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              Alert thresholds
              <span className="text-muted-foreground/70 font-normal">— profile</span>
              <select
                value={profileState.active}
                onChange={(e) => setActiveProfile(e.target.value)}
                className="rounded-md bg-secondary text-secondary-foreground text-xs px-2 py-1 ring-1 ring-border"
              >
                {Object.keys(profileState.profiles).map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              {PRESET_PROFILES[profileState.active] && (
                <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">preset</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={saveAsProfile}
                disabled={hasThresholdErrors}
                className="rounded-md px-2 py-1 ring-1 ring-border hover:bg-secondary/80 transition-colors text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                title={hasThresholdErrors ? "Fix validation errors first" : "Save current values as a new profile"}
              >
                Save as…
              </button>
              <button
                onClick={resetActiveProfile}
                disabled={!PRESET_PROFILES[profileState.active]}
                className="rounded-md px-2 py-1 ring-1 ring-border hover:bg-secondary/80 transition-colors text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                title={PRESET_PROFILES[profileState.active] ? "Reset to preset defaults" : "Only built-in presets can be reset"}
              >
                Reset
              </button>
              <button
                onClick={deleteActiveProfile}
                disabled={Object.keys(profileState.profiles).length <= 1}
                className="rounded-md px-2 py-1 ring-1 ring-destructive/30 hover:bg-destructive/10 transition-colors text-destructive disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            </div>
          </div>
          <div className="flex items-start gap-4 text-xs text-muted-foreground flex-wrap">
            <ThresholdField
              label="Hit-rate ≥"
              suffix="%"
              value={thresholds.hitRateMinPct}
              min={THRESHOLD_BOUNDS.hitRateMinPct.min}
              max={THRESHOLD_BOUNDS.hitRateMinPct.max}
              step={1}
              error={thresholdErrors.hitRateMinPct}
              onChange={(v) => setThresholds((t) => ({ ...t, hitRateMinPct: Math.round(v) }))}
            />
            <ThresholdField
              label="p95 ≤"
              suffix="ms"
              value={thresholds.p95MaxMs}
              min={THRESHOLD_BOUNDS.p95MaxMs.min}
              max={THRESHOLD_BOUNDS.p95MaxMs.max}
              step={50}
              error={thresholdErrors.p95MaxMs}
              onChange={(v) => setThresholds((t) => ({ ...t, p95MaxMs: Math.round(v) }))}
            />
            <ThresholdField
              label="Min samples"
              value={thresholds.minSamples}
              min={THRESHOLD_BOUNDS.minSamples.min}
              max={THRESHOLD_BOUNDS.minSamples.max}
              step={1}
              error={thresholdErrors.minSamples}
              onChange={(v) => setThresholds((t) => ({ ...t, minSamples: Math.round(v) }))}
            />
          </div>
          {hasThresholdErrors && (
            <div className="flex items-start gap-1.5 rounded-md bg-destructive/10 ring-1 ring-destructive/30 px-3 py-2 text-[11px] text-destructive">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Alerts are paused for this profile until validation errors are fixed. Invalid values are kept in the editor but not persisted.</span>
            </div>
          )}
        </div>



        {results.map((r) => (
          <section key={r.functionName} className="rounded-xl bg-card ring-1 ring-border overflow-hidden">
            <header className="px-5 py-3 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-foreground">{r.functionName}</h2>
                {r.sampledAt && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    sampled {new Date(r.sampledAt).toLocaleTimeString()}
                  </p>
                )}
              </div>
              {!r.ok && (
                <span className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> {r.error}
                </span>
              )}
            </header>

            {r.ok && r.metrics && <MetricsPanel m={r.metrics} history={history[r.functionName] ?? []} thresholds={thresholds} />}

            {r.ok && (r.breakers?.length ?? 0) === 0 && (
              <p className="px-5 py-6 text-sm text-muted-foreground text-center">
                No breakers registered yet — function hasn't made an upstream call this isolate.
              </p>
            )}

            {r.ok && r.breakers && r.breakers.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-5 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Breaker</th>
                    <th className="px-5 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">State</th>
                    <th className="px-5 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Failures</th>
                    <th className="px-5 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Cooldown</th>
                    <th className="px-5 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Cooldown left</th>
                  </tr>
                </thead>
                <tbody>
                  {r.breakers.map((b) => {
                    const remaining = cooldownRemaining(b, now);
                    return (
                      <tr key={b.key} className="border-b border-border/50">
                        <td className="px-5 py-3 font-mono text-foreground">{b.key}</td>
                        <td className="px-5 py-3"><StateBadge state={b.state} /></td>
                        <td className="px-5 py-3 text-foreground">{b.failures}</td>
                        <td className="px-5 py-3 text-muted-foreground">{(b.currentCooldownMs / 1000).toFixed(0)}s</td>
                        <td className="px-5 py-3 text-muted-foreground">
                          {b.state === "OPEN" ? `${Math.ceil(remaining / 1000)}s` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        ))}
      </main>
    </div>
  );
};

export default AdminCircuitBreakers;
