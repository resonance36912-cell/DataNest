/**
 * Scheduled auto-tuning of `VISUAL_*` presets.
 *
 * Everything here is local-only: it reads the card-diff run history stored in
 * localStorage by /admin/visual-thresholds and derives a recommended set of
 * overrides — loosening providers that keep failing, gently tightening ones
 * that have been green for a while. A small scheduler config decides how often
 * that recommendation is regenerated and saved back as a preset.
 */

import { SHARE_PROVIDERS } from "@/lib/shareMeta";
import {
  DEFAULT_ATTEMPTS,
  DEFAULT_TOLERANCE,
  MAX_ALLOWED_RATIO,
  PROVIDER_TOLERANCE,
} from "@/lib/visualThresholds";
import { EMPTY_PRESET_VALUES, type VisualPresetValues } from "@/lib/visualPresets";
import type { VisualRunHistoryEntry } from "@/lib/visualRunHistory";

const CONFIG_KEY = "resonance.visualAutoTune.v1";

export type AutoTuneMode = "update" | "new";

export interface AutoTuneConfig {
  /** Master switch for the background scheduler. */
  enabled: boolean;
  /** How often the scheduler may regenerate a preset, in minutes. */
  intervalMinutes: number;
  /** Minimum number of runs in the window before tuning is allowed. */
  minRuns: number;
  /** How many recent runs feed the recommendation. */
  windowRuns: number;
  /** `update` keeps one rolling preset; `new` timestamps a fresh one each time. */
  mode: AutoTuneMode;
  /** Base preset name used for the tuned preset. */
  presetName: string;
  /** Apply the tuned preset to the editor immediately after saving. */
  applyAfterSave: boolean;
  /** ISO timestamp of the last successful tune. */
  lastTunedAt: string | null;
  /** Run id the last tune was based on — avoids re-tuning on the same data. */
  lastRunId: string | null;
}

export const DEFAULT_AUTO_TUNE_CONFIG: AutoTuneConfig = {
  enabled: false,
  intervalMinutes: 60,
  minRuns: 3,
  windowRuns: 10,
  mode: "update",
  presetName: "Auto-tuned",
  applyAfterSave: false,
  lastTunedAt: null,
  lastRunId: null,
};

export const AUTO_TUNE_LIMITS = {
  intervalMinutes: { min: 5, max: 24 * 60 },
  minRuns: { min: 1, max: 30 },
  windowRuns: { min: 2, max: 30 },
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function loadAutoTuneConfig(): AutoTuneConfig {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "null");
    if (!isRecord(parsed)) return { ...DEFAULT_AUTO_TUNE_CONFIG };
    return {
      ...DEFAULT_AUTO_TUNE_CONFIG,
      ...parsed,
      enabled: parsed.enabled === true,
      intervalMinutes: clamp(
        Number(parsed.intervalMinutes) || DEFAULT_AUTO_TUNE_CONFIG.intervalMinutes,
        AUTO_TUNE_LIMITS.intervalMinutes.min,
        AUTO_TUNE_LIMITS.intervalMinutes.max,
      ),
      minRuns: clamp(
        Number(parsed.minRuns) || DEFAULT_AUTO_TUNE_CONFIG.minRuns,
        AUTO_TUNE_LIMITS.minRuns.min,
        AUTO_TUNE_LIMITS.minRuns.max,
      ),
      windowRuns: clamp(
        Number(parsed.windowRuns) || DEFAULT_AUTO_TUNE_CONFIG.windowRuns,
        AUTO_TUNE_LIMITS.windowRuns.min,
        AUTO_TUNE_LIMITS.windowRuns.max,
      ),
      mode: parsed.mode === "new" ? "new" : "update",
      presetName:
        typeof parsed.presetName === "string" && parsed.presetName.trim()
          ? parsed.presetName.trim()
          : DEFAULT_AUTO_TUNE_CONFIG.presetName,
      applyAfterSave: parsed.applyAfterSave === true,
      lastTunedAt: typeof parsed.lastTunedAt === "string" ? parsed.lastTunedAt : null,
      lastRunId: typeof parsed.lastRunId === "string" ? parsed.lastRunId : null,
    };
  } catch {
    return { ...DEFAULT_AUTO_TUNE_CONFIG };
  }
}

export function saveAutoTuneConfig(config: AutoTuneConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* storage unavailable — config stays in memory only */
  }
}

/* ------------------------------------------------------------------ */
/* Recommendation                                                      */
/* ------------------------------------------------------------------ */

export interface AutoTuneRecommendation {
  values: VisualPresetValues;
  reasons: string[];
  /** True when the recommendation differs from the values it started from. */
  changed: boolean;
  /** Runs the recommendation was computed from (most recent first). */
  runs: VisualRunHistoryEntry[];
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

const baselineFor = (providerId: string) =>
  PROVIDER_TOLERANCE[providerId] ?? DEFAULT_TOLERANCE;

const parseNum = (raw: string | undefined): number | undefined => {
  if (!raw || !raw.trim()) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Count how many runs in the window mention each provider in a failure title. */
function failuresByProvider(runs: VisualRunHistoryEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const run of runs) {
    const seen = new Set<string>();
    for (const title of run.summary?.failures ?? []) {
      const lower = title.toLowerCase();
      for (const provider of SHARE_PROVIDERS) {
        if (seen.has(provider.id)) continue;
        if (lower.includes(provider.id)) {
          seen.add(provider.id);
          counts[provider.id] = (counts[provider.id] ?? 0) + 1;
        }
      }
    }
  }
  return counts;
}

/**
 * Derive a tuned override set from recent runs.
 *
 * Rules, deliberately conservative:
 * - a provider failing in ≥40% of runs gets its tolerance raised 25% (capped)
 * - a provider with an above-baseline override and zero failures relaxes 10%
 *   back toward its committed baseline
 * - flaky results or a run with retries exhausted bump `VISUAL_RETRIES` to 3
 * - an all-green window with no per-provider overrides leaves things alone
 */
export function recommendAutoTune(
  history: VisualRunHistoryEntry[],
  current: VisualPresetValues,
  windowRuns: number,
): AutoTuneRecommendation {
  const runs = history
    .filter((r) => r.status !== "cancelled")
    .slice(0, Math.max(1, windowRuns));

  const reasons: string[] = [];
  const perProvider: Record<string, string> = { ...current.perProvider };
  const failCounts = failuresByProvider(runs);

  for (const provider of SHARE_PROVIDERS) {
    const fails = failCounts[provider.id] ?? 0;
    const rate = runs.length ? fails / runs.length : 0;
    const currentValue = parseNum(perProvider[provider.id]);
    const base = currentValue ?? baselineFor(provider.id);

    if (rate >= 0.4) {
      const next = round4(Math.min(MAX_ALLOWED_RATIO, base * 1.25 + 0.002));
      if (next > base) {
        perProvider[provider.id] = String(next);
        reasons.push(
          `${provider.label}: failed ${fails}/${runs.length} runs — tolerance ${base} → ${next}`,
        );
      }
    } else if (fails === 0 && currentValue !== undefined && currentValue > baselineFor(provider.id)) {
      const floorValue = baselineFor(provider.id);
      const next = round4(Math.max(floorValue, currentValue * 0.9));
      if (next < currentValue) {
        if (next <= floorValue) delete perProvider[provider.id];
        else perProvider[provider.id] = String(next);
        reasons.push(
          `${provider.label}: green across ${runs.length} runs — tolerance ${currentValue} → ${next <= floorValue ? `baseline ${floorValue}` : next}`,
        );
      }
    }
  }

  // Retries: raise when results are flaky, lower back to the default when calm.
  let retries = current.retries;
  const flakyRuns = runs.filter((r) => (r.summary?.flaky ?? 0) > 0).length;
  const failedRuns = runs.filter((r) => r.status === "failed").length;
  const currentRetries = parseNum(current.retries) ?? DEFAULT_ATTEMPTS;
  if (flakyRuns > 0 && currentRetries < 3) {
    retries = "3";
    reasons.push(`Flaky results in ${flakyRuns} run(s) — retries ${currentRetries} → 3`);
  } else if (flakyRuns === 0 && failedRuns === 0 && currentRetries > DEFAULT_ATTEMPTS) {
    retries = "";
    reasons.push(`No flakes in ${runs.length} runs — retries back to default ${DEFAULT_ATTEMPTS}`);
  }

  const values: VisualPresetValues = {
    ...EMPTY_PRESET_VALUES,
    floor: current.floor,
    threshold: current.threshold,
    retries,
    perProvider,
  };

  const changed = reasons.length > 0;
  if (!changed) {
    reasons.push(
      runs.length
        ? `No adjustment needed across the last ${runs.length} run(s).`
        : "No completed runs recorded yet.",
    );
  }

  return { values, reasons, changed, runs };
}

/* ------------------------------------------------------------------ */
/* Scheduling                                                          */
/* ------------------------------------------------------------------ */

export interface AutoTuneDue {
  due: boolean;
  reason: string;
  /** ms until the next eligible tune, or null when blocked for another reason. */
  waitMs: number | null;
}

export function isAutoTuneDue(
  config: AutoTuneConfig,
  history: VisualRunHistoryEntry[],
  now = new Date(),
): AutoTuneDue {
  if (!config.enabled) return { due: false, reason: "Scheduler is off", waitMs: null };

  const runs = history.filter((r) => r.status !== "cancelled");
  if (runs.length < config.minRuns) {
    return {
      due: false,
      reason: `Waiting for ${config.minRuns - runs.length} more run(s)`,
      waitMs: null,
    };
  }

  const latest = runs[0];
  if (latest && config.lastRunId === latest.id) {
    return { due: false, reason: "No new runs since the last tune", waitMs: null };
  }

  if (config.lastTunedAt) {
    const elapsed = now.getTime() - new Date(config.lastTunedAt).getTime();
    const interval = config.intervalMinutes * 60_000;
    if (elapsed < interval) {
      return {
        due: false,
        reason: `Next tune in ${formatWait(interval - elapsed)}`,
        waitMs: interval - elapsed,
      };
    }
  }

  return { due: true, reason: "Ready to tune", waitMs: 0 };
}

export function formatWait(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** Name used for the preset a scheduled tune writes. */
export function tunedPresetName(config: AutoTuneConfig, now = new Date()): string {
  if (config.mode === "update") return config.presetName;
  const stamp = now.toISOString().slice(0, 16).replace("T", " ");
  return `${config.presetName} ${stamp}`;
}
