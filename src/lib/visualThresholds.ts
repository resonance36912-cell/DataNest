/**
 * Shared source of truth for the provider-card visual regression tolerances.
 *
 * The Playwright policy resolver (`e2e/visual-thresholds.ts`) and the admin
 * settings page (`/admin/visual-thresholds`) both read these tables, so the
 * numbers shown in the UI are always the numbers CI enforces. This module is
 * environment-agnostic on purpose — no `process.env` — so it imports cleanly
 * into the browser bundle.
 */

/** Baseline tolerance for any provider without an explicit entry. */
export const DEFAULT_TOLERANCE = 0.02;

/** Per-pixel colour comparison sensitivity passed to `toHaveScreenshot`. */
export const DEFAULT_PIXEL_THRESHOLD = 0.2;

/** Re-render attempts before a card is reported as failed. */
export const DEFAULT_ATTEMPTS = 2;

/** Beyond this a "pass" would stop meaning anything. */
export const MAX_ALLOWED_RATIO = 0.1;

/**
 * Share of the captured region allowed to differ, per provider.
 * Keep these as tight as the surface allows — a swapped crop or clipped
 * wordmark changes far more than 5% of the region, so real regressions still
 * fail everywhere below.
 */
export const PROVIDER_TOLERANCE: Record<string, number> = {
  facebook: 0.02,
  linkedin: 0.02,
  x: 0.015, // dark chrome, high contrast — drift shows clearly
  slack: 0.025,
  telegram: 0.025,
  discord: 0.02,
  google: 0.03, // dense two-line copy, most wrap-sensitive
  whatsapp: 0.04, // narrow bubble, copy dominates the region
  imessage: 0.04, // smallest card, largest relative text share
  teams: 0.03,
  pinterest: 0.02, // tall artwork dominates — keep strict
};

/** Why each provider sits where it does — surfaced in the settings page. */
export const TOLERANCE_RATIONALE: Record<string, string> = {
  facebook: "Standard wide card, stable chrome.",
  linkedin: "Standard wide card, stable chrome.",
  x: "Dark chrome, high contrast — any drift shows clearly, so keep it strict.",
  slack: "Slightly narrower card with a denser copy block.",
  telegram: "Narrow card, rounded chrome rasterises a little differently.",
  discord: "Dark chrome, wide artwork.",
  google: "Dense two-line copy — the most wrap-sensitive surface.",
  whatsapp: "Narrow bubble where copy dominates the captured region.",
  imessage: "Smallest card, so text is the largest relative share of pixels.",
  teams: "Narrow card with a compact copy block.",
  pinterest: "Tall artwork dominates the region — keep strict.",
};

/**
 * Engine multipliers. Chromium produced the baselines, so it stays at 1×;
 * Firefox and WebKit rasterise text on a different stack and need headroom
 * for glyph hinting without hiding layout-level drift.
 */
export const ENGINE_MULTIPLIER: Record<string, number> = {
  chromium: 1,
  firefox: 1.75,
  webkit: 1.5,
};

export const ENGINES = ["chromium", "firefox", "webkit"] as const;
export type Engine = (typeof ENGINES)[number];

export type VisualPolicy = {
  maxDiffPixelRatio: number;
  threshold: number;
  attempts: number;
};

/** Environment-style overrides, supplied explicitly instead of read globally. */
export type VisualOverrides = {
  /** VISUAL_MAX_DIFF_RATIO — global floor applied to every provider. */
  maxDiffRatioFloor?: number;
  /** VISUAL_THRESHOLD — per-pixel colour sensitivity (0-1, lower = stricter). */
  threshold?: number;
  /** VISUAL_RETRIES — re-render attempts before a card is failed. */
  retries?: number;
  /** VISUAL_TOLERANCE_<PROVIDER> — single-provider tolerance overrides. */
  perProvider?: Record<string, number | undefined>;
};

const num = (value: number | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;

/**
 * Resolve the effective comparison policy for one provider on one engine.
 * Pure: every override arrives as an argument, so the browser and the test
 * runner compute identical numbers.
 */
export function resolveVisualPolicy(
  providerId: string,
  engine: string,
  overrides: VisualOverrides = {},
): VisualPolicy {
  const base = num(
    overrides.perProvider?.[providerId],
    PROVIDER_TOLERANCE[providerId] ?? DEFAULT_TOLERANCE,
  );
  const multiplier = ENGINE_MULTIPLIER[engine] ?? 1;
  const floor = num(overrides.maxDiffRatioFloor, 0);

  return {
    maxDiffPixelRatio: Math.min(MAX_ALLOWED_RATIO, Math.max(base * multiplier, floor)),
    threshold: num(overrides.threshold, DEFAULT_PIXEL_THRESHOLD),
    attempts: Math.max(1, Math.round(num(overrides.retries, DEFAULT_ATTEMPTS))),
  };
}
