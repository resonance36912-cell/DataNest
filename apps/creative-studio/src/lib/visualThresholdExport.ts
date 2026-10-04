/**
 * Serialise the currently effective provider × engine visual thresholds into a
 * shareable JSON document, so a teammate can see exactly which tolerances a
 * given set of `VISUAL_*` overrides produces.
 */

import { SHARE_PROVIDERS } from "@/lib/shareMeta";
import {
  DEFAULT_ATTEMPTS,
  DEFAULT_PIXEL_THRESHOLD,
  DEFAULT_TOLERANCE,
  ENGINES,
  ENGINE_MULTIPLIER,
  MAX_ALLOWED_RATIO,
  PROVIDER_TOLERANCE,
  TOLERANCE_RATIONALE,
  resolveVisualPolicy,
  type VisualOverrides,
} from "@/lib/visualThresholds";

export const THRESHOLD_EXPORT_VERSION = 1;

export type ThresholdExport = {
  version: number;
  generatedAt: string;
  source: string;
  defaults: {
    tolerance: number;
    pixelThreshold: number;
    attempts: number;
    maxAllowedRatio: number;
  };
  engineMultipliers: Record<string, number>;
  overrides: {
    active: boolean;
    maxDiffRatioFloor?: number;
    threshold?: number;
    retries?: number;
    perProvider: Record<string, number>;
    env: Record<string, string>;
    command: string;
  };
  providers: Array<{
    id: string;
    label: string;
    rationale: string;
    committedTolerance: number;
    overriddenTolerance?: number;
    engines: Record<
      string,
      {
        committed: { maxDiffPixelRatio: number; threshold: number; attempts: number };
        effective: { maxDiffPixelRatio: number; threshold: number; attempts: number };
        changed: boolean;
      }
    >;
  }>;
};

/** Env-var pairs that differ from the committed defaults. */
export function overrideEnv(overrides: VisualOverrides): Record<string, string> {
  const env: Record<string, string> = {};
  if (overrides.maxDiffRatioFloor !== undefined)
    env.VISUAL_MAX_DIFF_RATIO = String(overrides.maxDiffRatioFloor);
  if (overrides.threshold !== undefined) env.VISUAL_THRESHOLD = String(overrides.threshold);
  if (overrides.retries !== undefined)
    env.VISUAL_RETRIES = String(Math.max(1, Math.round(overrides.retries)));
  for (const [id, value] of Object.entries(overrides.perProvider ?? {})) {
    if (value !== undefined) env[`VISUAL_TOLERANCE_${id.toUpperCase()}`] = String(value);
  }
  return env;
}

export function buildThresholdExport(
  overrides: VisualOverrides = {},
  now: Date = new Date(),
): ThresholdExport {
  const env = overrideEnv(overrides);
  const envPairs = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  const perProvider: Record<string, number> = {};
  for (const [id, value] of Object.entries(overrides.perProvider ?? {})) {
    if (value !== undefined) perProvider[id] = value;
  }

  return {
    version: THRESHOLD_EXPORT_VERSION,
    generatedAt: now.toISOString(),
    source: "src/lib/visualThresholds.ts",
    defaults: {
      tolerance: DEFAULT_TOLERANCE,
      pixelThreshold: DEFAULT_PIXEL_THRESHOLD,
      attempts: DEFAULT_ATTEMPTS,
      maxAllowedRatio: MAX_ALLOWED_RATIO,
    },
    engineMultipliers: { ...ENGINE_MULTIPLIER },
    overrides: {
      active: envPairs.length > 0,
      maxDiffRatioFloor: overrides.maxDiffRatioFloor,
      threshold: overrides.threshold,
      retries: overrides.retries,
      perProvider,
      env,
      command: envPairs.length
        ? `${envPairs.join(" ")} bun run test:cards`
        : "bun run test:cards",
    },
    providers: SHARE_PROVIDERS.map((provider) => ({
      id: provider.id,
      label: provider.label,
      rationale: TOLERANCE_RATIONALE[provider.id] ?? "",
      committedTolerance: PROVIDER_TOLERANCE[provider.id] ?? DEFAULT_TOLERANCE,
      overriddenTolerance: overrides.perProvider?.[provider.id],
      engines: Object.fromEntries(
        ENGINES.map((engine) => {
          const committed = resolveVisualPolicy(provider.id, engine);
          const effective = resolveVisualPolicy(provider.id, engine, overrides);
          return [
            engine,
            {
              committed,
              effective,
              changed:
                committed.maxDiffPixelRatio !== effective.maxDiffPixelRatio ||
                committed.threshold !== effective.threshold ||
                committed.attempts !== effective.attempts,
            },
          ];
        }),
      ),
    })),
  };
}

/** `visual-thresholds-2026-08-06.json`, or `…-overrides-…` when tweaked. */
export function thresholdExportFilename(hasOverrides: boolean, now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `visual-thresholds${hasOverrides ? "-overrides" : ""}-${stamp}.json`;
}

/** Trigger a browser download of the export document. */
export function downloadThresholdExport(overrides: VisualOverrides = {}): string {
  const now = new Date();
  const doc = buildThresholdExport(overrides, now);
  const filename = thresholdExportFilename(doc.overrides.active, now);
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

/** String-form override fields, matching the admin page's text inputs. */
export type ImportedOverrides = {
  floor: string;
  threshold: string;
  retries: string;
  perProvider: Record<string, string>;
  /** Providers named in the file that this build does not know about. */
  unknownProviders: string[];
  generatedAt?: string;
};

const num = (v: unknown): string =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? String(v) : "";

/**
 * Read an exported threshold document (or a plain `{ env: {...} }` map) and
 * return the VISUAL_* overrides it encodes, as input-ready strings.
 * Throws with a human-readable message when the file is not usable.
 */
export function parseThresholdExport(raw: string): ImportedOverrides {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new Error("That file is not valid JSON");
  }
  if (!doc || typeof doc !== "object") throw new Error("Unexpected file contents");

  const known = new Set<string>(SHARE_PROVIDERS.map((p) => p.id));
  const record = doc as Record<string, unknown>;
  const overrides = (record.overrides ?? record) as Record<string, unknown>;
  const env = (overrides.env ?? {}) as Record<string, unknown>;

  const out: ImportedOverrides = {
    floor: "",
    threshold: "",
    retries: "",
    perProvider: {},
    unknownProviders: [],
    generatedAt: typeof record.generatedAt === "string" ? record.generatedAt : undefined,
  };

  // Structured fields first.
  out.floor = num(overrides.maxDiffRatioFloor);
  out.threshold = num(overrides.threshold);
  out.retries = num(overrides.retries);
  const per = (overrides.perProvider ?? {}) as Record<string, unknown>;
  for (const [id, value] of Object.entries(per)) {
    const v = num(value);
    if (!v) continue;
    if (known.has(id)) out.perProvider[id] = v;
    else out.unknownProviders.push(id);
  }

  // Env map as a fallback / secondary source (also supports raw env exports).
  for (const [key, value] of Object.entries(env)) {
    const v = num(typeof value === "string" ? Number(value) : value);
    if (!v) continue;
    if (key === "VISUAL_MAX_DIFF_RATIO") out.floor ||= v;
    else if (key === "VISUAL_THRESHOLD") out.threshold ||= v;
    else if (key === "VISUAL_RETRIES") out.retries ||= v;
    else if (key.startsWith("VISUAL_TOLERANCE_")) {
      const id = key.slice("VISUAL_TOLERANCE_".length).toLowerCase();
      if (known.has(id)) out.perProvider[id] ||= v;
      else if (!out.unknownProviders.includes(id)) out.unknownProviders.push(id);
    }
  }

  const count =
    Object.keys(out.perProvider).length +
    (out.floor ? 1 : 0) +
    (out.threshold ? 1 : 0) +
    (out.retries ? 1 : 0);
  if (count === 0) throw new Error("No VISUAL_* overrides found in that file");

  return out;
}
