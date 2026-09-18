import { useEffect, useMemo, useState } from "react";
import { Activity, RotateCcw, Save, Check, Layers, Trash2 } from "lucide-react";
import {
  APP_KEY,
  HUB_URL,
  getHubBackoffConfig,
  setHubBackoffConfig,
  hubBackoffMs,
  listPersistedHubBackoffScopes,
  clearAllPersistedHubBackoffConfigs,
  type HubBackoffConfig,
  type HubBackoffScope,
} from "@/lib/entitlement";

/**
 * Admin-only runtime tuner for the Hub entitlement exponential backoff.
 * Tunings are persisted in localStorage **per (app, hub host)** scope, so
 * different environments (prod vs staging Hub URL) and different apps
 * sharing this browser keep independent retry policies that survive
 * refreshes and redeploys.
 */
const CURRENT_SCOPE: HubBackoffScope = { app: APP_KEY, hubUrl: HUB_URL };

type ScopeOption = HubBackoffScope & { label: string };

function scopeKey(s: HubBackoffScope): string {
  try {
    return `${s.app}@${new URL(s.hubUrl).host}`;
  } catch {
    return `${s.app}@${s.hubUrl}`;
  }
}

export function HubBackoffSettings() {
  const [scope, setScope] = useState<HubBackoffScope>(CURRENT_SCOPE);
  const [persistedScopes, setPersistedScopes] = useState(
    () => listPersistedHubBackoffScopes(),
  );

  const scopeOptions: ScopeOption[] = useMemo(() => {
    const map = new Map<string, ScopeOption>();
    const add = (s: HubBackoffScope, suffix = "") => {
      const k = scopeKey(s);
      if (map.has(k)) return;
      map.set(k, { ...s, label: `${k}${suffix}` });
    };
    add(CURRENT_SCOPE, "  (current)");
    for (const p of persistedScopes) add(p);
    return Array.from(map.values());
  }, [persistedScopes]);

  const [cfg, setCfg] = useState<HubBackoffConfig>(() =>
    getHubBackoffConfig(scope),
  );
  const [draft, setDraft] = useState<HubBackoffConfig>(() =>
    getHubBackoffConfig(scope),
  );
  const [saved, setSaved] = useState(false);

  // When the user picks a different scope, reload its persisted config.
  useEffect(() => {
    const next = getHubBackoffConfig(scope);
    setCfg(next);
    setDraft(next);
    setSaved(false);
  }, [scope]);

  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(false), 1500);
    return () => window.clearTimeout(t);
  }, [saved]);

  const dirty =
    draft.baseMs !== cfg.baseMs ||
    draft.capMs !== cfg.capMs ||
    draft.maxAttempts !== cfg.maxAttempts;

  const valid =
    Number.isFinite(draft.baseMs) &&
    draft.baseMs >= 0 &&
    Number.isFinite(draft.capMs) &&
    draft.capMs >= 0 &&
    Number.isFinite(draft.maxAttempts) &&
    draft.maxAttempts >= 0;

  const apply = () => {
    if (!valid) return;
    const next = setHubBackoffConfig(draft, scope);
    setCfg(next);
    setDraft(next);
    setSaved(true);
    setPersistedScopes(listPersistedHubBackoffScopes());
  };

  const reset = () => {
    const next = setHubBackoffConfig(undefined, scope);
    setCfg(next);
    setDraft(next);
    setSaved(true);
    setPersistedScopes(listPersistedHubBackoffScopes());
  };

  const resetAllScopes = () => {
    const count = listPersistedHubBackoffScopes().length;
    if (count === 0) return;
    const ok = window.confirm(
      `Clear persisted backoff configs for all ${count} scope${count === 1 ? "" : "s"}? ` +
        `Every (app @ hub host) tuning will reset to env defaults. This cannot be undone.`,
    );
    if (!ok) return;
    clearAllPersistedHubBackoffConfigs();
    const next = getHubBackoffConfig(scope);
    setCfg(next);
    setDraft(next);
    setSaved(true);
    setPersistedScopes(listPersistedHubBackoffScopes());
  };


  // Simulate hubBackoffMs() for attempts 1..maxAttempts (or 20 if uncapped)
  // so admins can visually verify their tuning before applying it.
  const simAttempts = draft.maxAttempts > 0 ? Math.min(draft.maxAttempts, 200) : 20;
  const series = useMemo(
    () =>
      Array.from({ length: simAttempts }, (_, i) => {
        const ms = hubBackoffMs(i + 1, draft, scope);
        return { attempt: i + 1, ms };
      }),
    [simAttempts, draft, scope],
  );
  let cumulative = 0;
  const seriesWithCumulative = series.map((p) => {
    cumulative += p.ms;
    return { ...p, cumulativeMs: cumulative };
  });
  const maxMs = Math.max(draft.capMs, ...series.map((p) => p.ms), 1);
  const totalWait = cumulative;


  return (
    <div className="studio-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Activity className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-bold text-foreground text-sm">
            Hub Backoff Settings
          </h2>
          <p className="text-xs text-muted-foreground">
            Per-scope retry policy. Tunings persist in this browser and survive
            redeploys.
          </p>
        </div>
      </div>

      {/* Scope selector */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-end gap-2">
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
            <Layers className="w-3 h-3" /> Scope (app @ hub host)
          </span>
          <select
            value={scopeKey(scope)}
            onChange={(e) => {
              const opt = scopeOptions.find((o) => scopeKey(o) === e.target.value);
              if (opt) setScope({ app: opt.app, hubUrl: opt.hubUrl });
            }}
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {scopeOptions.map((o) => (
              <option key={scopeKey(o)} value={scopeKey(o)}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Field
          label="Base (ms)"
          hint="Initial delay after 1st failure"
          value={draft.baseMs}
          onChange={(n) => setDraft((d) => ({ ...d, baseMs: n }))}
        />
        <Field
          label="Cap (ms)"
          hint="Max delay between retries"
          value={draft.capMs}
          onChange={(n) => setDraft((d) => ({ ...d, capMs: n }))}
        />
        <Field
          label="Max attempts"
          hint="Clamp exponent growth (0 = uncapped)"
          value={draft.maxAttempts}
          onChange={(n) => setDraft((d) => ({ ...d, maxAttempts: n }))}
        />
      </div>

      <RetrySimulation
        series={seriesWithCumulative}
        capMs={draft.capMs}
        maxMs={maxMs}
        totalWait={totalWait}
        uncapped={draft.maxAttempts === 0}
      />


      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={apply}
          disabled={!dirty || !valid}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saved && !dirty ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {saved && !dirty ? "Saved" : "Apply"}
        </button>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/60 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset scope
        </button>
        <button
          type="button"
          onClick={resetAllScopes}
          disabled={persistedScopes.length === 0}
          title={
            persistedScopes.length === 0
              ? "No persisted scopes to clear"
              : `Clear ${persistedScopes.length} persisted scope(s)`
          }
          className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-background px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Reset all scopes
          {persistedScopes.length > 0 && (
            <span className="ml-0.5 rounded bg-destructive/15 px-1 py-0.5 text-[10px] font-mono">
              {persistedScopes.length}
            </span>
          )}
        </button>
        <span className="ml-auto text-[11px] text-muted-foreground font-mono">
          {scopeKey(scope)} → base={cfg.baseMs}ms · cap={cfg.capMs}ms · max=
          {cfg.maxAttempts}
        </span>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <input
        type="number"
        min={0}
        step={1}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        className="h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <span className="text-[10px] text-muted-foreground">{hint}</span>
    </label>
  );
}

function formatMs(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(ms >= 600_000 ? 0 : 1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(ms >= 10_000 ? 0 : 1)}s`;
  return `${Math.round(ms)}ms`;
}

function RetrySimulation({
  series,
  capMs,
  maxMs,
  totalWait,
  uncapped,
}: {
  series: { attempt: number; ms: number; cumulativeMs: number }[];
  capMs: number;
  maxMs: number;
  totalWait: number;
  uncapped: boolean;
}) {
  // SVG viewport — use a 0-1000 x 0-300 coordinate system that scales fluidly.
  const W = 1000;
  const H = 220;
  const padL = 56;
  const padR = 16;
  const padT = 12;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = series.length;
  const xFor = (i: number) =>
    padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yFor = (ms: number) => padT + innerH - (ms / maxMs) * innerH;
  const capY = yFor(capMs);

  const linePath = series
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.ms).toFixed(1)}`)
    .join(" ");
  const areaPath =
    linePath +
    ` L ${xFor(n - 1).toFixed(1)} ${(padT + innerH).toFixed(1)}` +
    ` L ${xFor(0).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;

  // X-axis ticks — show ~6 evenly spaced attempt numbers.
  const tickCount = Math.min(n, 6);
  const tickIndexes =
    n <= tickCount
      ? series.map((_, i) => i)
      : Array.from({ length: tickCount }, (_, k) =>
          Math.round((k / (tickCount - 1)) * (n - 1)),
        );

  // Y-axis ticks — 0, cap, max.
  const yTicks = Array.from(
    new Set([0, capMs, maxMs].filter((v) => Number.isFinite(v))),
  ).sort((a, b) => a - b);

  return (
    <div className="rounded-md border border-border bg-secondary/40 p-3 mb-4">
      <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Retry simulation — attempts 1–{n}
          {uncapped && (
            <span className="ml-1.5 text-foreground/70 normal-case tracking-normal">
              (maxAttempts=0, showing first 20)
            </span>
          )}
        </p>
        <p className="text-[11px] font-mono text-muted-foreground">
          total wait if all fail:{" "}
          <span className="text-foreground">{formatMs(totalWait)}</span>
        </p>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Backoff delay per retry attempt, peaking at ${formatMs(maxMs)}`}
        className="w-full h-auto block"
      >
        <defs>
          <linearGradient id="hub-backoff-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.45" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Y grid + labels */}
        {yTicks.map((v) => (
          <g key={`y-${v}`}>
            <line
              x1={padL}
              x2={W - padR}
              y1={yFor(v)}
              y2={yFor(v)}
              stroke="hsl(var(--border))"
              strokeDasharray={v === capMs ? "4 4" : "1 4"}
              strokeWidth={1}
            />
            <text
              x={padL - 6}
              y={yFor(v) + 3}
              textAnchor="end"
              fontSize="10"
              fill="hsl(var(--muted-foreground))"
              fontFamily="ui-monospace, monospace"
            >
              {formatMs(v)}
            </text>
          </g>
        ))}
        {/* Cap label */}
        <text
          x={W - padR}
          y={Math.max(padT + 10, capY - 4)}
          textAnchor="end"
          fontSize="10"
          fill="hsl(var(--muted-foreground))"
          fontFamily="ui-monospace, monospace"
        >
          cap {formatMs(capMs)}
        </text>

        {/* Area + line */}
        <path d={areaPath} fill="url(#hub-backoff-area)" />
        <path
          d={linePath}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points + tooltips */}
        {series.map((p, i) => (
          <g key={p.attempt}>
            <circle
              cx={xFor(i)}
              cy={yFor(p.ms)}
              r={2.5}
              fill="hsl(var(--primary))"
            >
              <title>{`Attempt #${p.attempt}: wait ${formatMs(p.ms)} · cumulative ${formatMs(p.cumulativeMs)}`}</title>
            </circle>
          </g>
        ))}

        {/* X-axis ticks */}
        {tickIndexes.map((i) => (
          <text
            key={`x-${i}`}
            x={xFor(i)}
            y={H - 8}
            textAnchor="middle"
            fontSize="10"
            fill="hsl(var(--muted-foreground))"
            fontFamily="ui-monospace, monospace"
          >
            #{series[i].attempt}
          </text>
        ))}
      </svg>

      <p className="mt-2 text-[10px] text-muted-foreground">
        Hover a point for its exact delay and cumulative wait. The dashed line
        marks the configured <span className="text-foreground">cap</span>.
      </p>
    </div>
  );
}
