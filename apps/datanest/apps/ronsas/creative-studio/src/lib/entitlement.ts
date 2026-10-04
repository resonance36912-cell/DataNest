// Resonance Hub entitlement — all billing lives at reson8.life.
// This app reads tier/status from the same-origin RONS spoke session and
// hands users off to /checkout with a SKU. No local PayFast.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logHubEntitlementFailure } from "./hubDiagLogger";
import { FREE_PROMOTION_ACTIVE, FREE_PROMOTION_TIER } from "./promotion";

export const APP_KEY = "creative_studio" as const;
export const HUB_URL = "https://reson8.life";

export type Tier =
  | "free"
  | "starter"
  | "creator"
  | "pro"
  | "business"
  | "all_access"
  | null;

export type EntitlementSource =
  | "direct"
  | "all_access"
  | "admin_override"
  | "trial"
  | "none"
  // legacy — older Hub payloads may still emit "bundle"; normalized to "all_access".
  | "bundle";

/**
 * Aligned Hub entitlement contract (v3). Hub at reson8.life is the source of truth.
 *  - `ok`, `expiresAt`, `features`, `checkedAt` come straight from Hub.
 *  - `hasAccess` is derived: `status === "active" && source !== "none"`.
 *  - `currentPeriodEnd` is a backward-compat alias of `expiresAt`.
 */
export type Entitlement = {
  ok?: boolean;
  app: string;
  userId: string;
  tier: Exclude<Tier, null>;
  status: "active" | "inactive" | "pending" | "past_due" | "cancelled";
  source: EntitlementSource;
  expiresAt: string | null;
  features?: Record<string, boolean>;
  checkedAt?: string;
  /** @deprecated use `expiresAt` */
  currentPeriodEnd: string | null;
  /** Derived: `status === "active" && source !== "none"`. */
  hasAccess: boolean;
};

const ORDER = ["free", "starter", "creator", "pro", "business", "all_access"] as const;
export function tierMeets(have: Tier, need: Exclude<Tier, null>): boolean {
  if (FREE_PROMOTION_ACTIVE) return true;
  if (!have) return false;
  return ORDER.indexOf(have) >= ORDER.indexOf(need);
}

/** Hub may set `features.<key>` per plan. Falls back to tier order when absent. */
export function hasFeature(
  entitlement: Entitlement | null | undefined,
  feature: string,
  minTier?: Exclude<Tier, null>,
): boolean {
  if (FREE_PROMOTION_ACTIVE) return true;
  if (!entitlement || !entitlement.hasAccess) return false;
  const explicit = entitlement.features?.[feature];
  if (typeof explicit === "boolean") return explicit;
  if (minTier) return tierMeets(entitlement.tier, minTier);
  return true;
}

/** Normalize a raw Hub payload into the local Entitlement contract. */
function normalizeEntitlement(
  raw: Partial<Entitlement> & { app?: string },
  fallbackApp: string,
): Entitlement {
  const source = (raw.source ?? "none") as EntitlementSource;
  const normalizedSource: EntitlementSource =
    source === "bundle" ? "all_access" : source;
  const status = (raw.status ?? "inactive") as Entitlement["status"];
  const expiresAt = raw.expiresAt ?? raw.currentPeriodEnd ?? null;
  return {
    ok: raw.ok ?? true,
    app: raw.app ?? fallbackApp,
    userId: raw.userId ?? "",
    tier: (raw.tier ?? "free") as Entitlement["tier"],
    status,
    source: normalizedSource,
    expiresAt,
    features: raw.features ?? {},
    checkedAt: raw.checkedAt ?? new Date().toISOString(),
    currentPeriodEnd: expiresAt,
    hasAccess: status === "active" && normalizedSource !== "none",
  };
}

/** Canonical Hub URL where users manage packs, credits & receipts. */
export const MANAGE_BILLING_URL = `${HUB_URL}/account/subscriptions`;
/** Public Hub pricing page — source of truth for once-off packs & credits. */
export const HUB_PRICING_URL = `${HUB_URL}/pricing`;
/** Hub product updates & changelog. */
export const HUB_UPDATES_URL = `${HUB_URL}/updates`;


/**
 * Diagnostic info attached to entitlement load attempts. Surfaced by
 * <HubEntitlementBanner /> so users and admins can see exactly which
 * Hub endpoint failed and why.
 */
export type EntitlementDiagnostic = {
  endpoint: string;
  httpStatus: number | null;
  reason: "network" | "http" | "unauthenticated" | "ok";
  lastCheckedAt: string;
  message?: string;
};

/**
 * Tunable retry policy for Hub entitlement checks.
 *  - baseMs: initial backoff after the first failure (attempt 1).
 *  - capMs: maximum backoff between any two attempts.
 *  - maxAttempts: after this many consecutive failures, backoff stays at
 *    `capMs` and the hook stops auto-incrementing attemptCount further.
 *    Set to 0 / negative to disable the cap (uncapped retries).
 */
export type HubBackoffConfig = {
  baseMs: number;
  capMs: number;
  maxAttempts: number;
};

const DEFAULT_HUB_BACKOFF_CONFIG: HubBackoffConfig = {
  baseMs: 1_000,
  capMs: 60_000,
  maxAttempts: 8,
};

/**
 * Hard bounds for backoff config. Any value (env var, persisted, or
 * runtime patch) is coerced into these ranges so a typo or stale value
 * can't break retry behavior (e.g. baseMs=0 → tight loop, capMs<baseMs →
 * cap silently demoting backoff, NaN → broken setTimeout).
 */
export const HUB_BACKOFF_BOUNDS = {
  /** Lower bound for `baseMs` — prevents tight retry loops. */
  baseMsMin: 1,
  /** Upper bound for `baseMs` (10 minutes). */
  baseMsMax: 10 * 60 * 1000,
  /** Upper bound for `capMs` (1 hour). `capMsMin` is derived from baseMs. */
  capMsMax: 60 * 60 * 1000,
  /** Upper bound for `maxAttempts` — 0 means "uncapped". */
  maxAttemptsMax: 1000,
} as const;

function clampInt(n: unknown, lo: number, hi: number, fallback: number): number {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return fallback;
  const i = Math.floor(num);
  if (i < lo) return lo;
  if (i > hi) return hi;
  return i;
}

/**
 * Normalize a (possibly partial / dirty) config against `HUB_BACKOFF_BOUNDS`.
 * Missing or invalid fields fall back to `base`. Guarantees:
 *  - baseMs ∈ [baseMsMin, baseMsMax]
 *  - capMs  ∈ [baseMs, capMsMax]    (cap can never be smaller than base)
 *  - maxAttempts ∈ [0, maxAttemptsMax] (0 = uncapped)
 */
export function normalizeHubBackoffConfig(
  raw: Partial<HubBackoffConfig> | null | undefined,
  base: HubBackoffConfig = DEFAULT_HUB_BACKOFF_CONFIG,
): HubBackoffConfig {
  const baseMs = clampInt(
    raw?.baseMs,
    HUB_BACKOFF_BOUNDS.baseMsMin,
    HUB_BACKOFF_BOUNDS.baseMsMax,
    base.baseMs,
  );
  const capMs = Math.max(
    baseMs,
    clampInt(raw?.capMs, baseMs, HUB_BACKOFF_BOUNDS.capMsMax, base.capMs),
  );
  const maxAttempts = clampInt(
    raw?.maxAttempts,
    0,
    HUB_BACKOFF_BOUNDS.maxAttemptsMax,
    base.maxAttempts,
  );
  return { baseMs, capMs, maxAttempts };
}

function readEnvRaw(key: string): string | undefined {
  try {
    const v = (import.meta as unknown as { env?: Record<string, string | undefined> })
      .env?.[key];
    if (v == null || v === "") return undefined;
    return String(v);
  } catch {
    return undefined;
  }
}

function readEnvNumber(key: string): number | undefined {
  const v = readEnvRaw(key);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Raw, un-normalized values of the VITE_HUB_BACKOFF_* env vars. Returned
 * as strings (or `undefined` if unset) so diagnostics can show exactly
 * what the build saw — including invalid inputs like `"abc"` or `"0"` —
 * alongside the clamped values actually used at runtime.
 */
export type HubBackoffEnvRaw = {
  baseMs: string | undefined;
  capMs: string | undefined;
  maxAttempts: string | undefined;
};

export function getHubBackoffEnvRaw(): HubBackoffEnvRaw {
  return {
    baseMs: readEnvRaw("VITE_HUB_BACKOFF_BASE_MS"),
    capMs: readEnvRaw("VITE_HUB_BACKOFF_CAP_MS"),
    maxAttempts: readEnvRaw("VITE_HUB_MAX_ATTEMPTS"),
  };
}

export type HubBackoffClampField = "baseMs" | "capMs" | "maxAttempts";

export type HubBackoffClampInfo = {
  /** Raw env string the build saw (undefined = unset). */
  raw: string | undefined;
  /** `raw` parsed as a number. NaN means non-numeric input like "abc". */
  parsed: number;
  /** Value actually used at runtime after normalization. */
  effective: number;
  /** True when the env was provided and the runtime value differs from it. */
  clamped: boolean;
  /** Why it was clamped — useful for tooltips. */
  reason:
    | "ok"
    | "unset"
    | "nan"
    | "below-min"
    | "above-max"
    | "cap-below-base";
};

/**
 * Compare raw VITE_HUB_BACKOFF_* env values against the normalized config
 * so diagnostics can flag misconfigurations (typos, out-of-bounds, NaN).
 * Only env-provided fields can be "clamped" — unset fields are never flagged.
 */
export function describeHubBackoffClamps(): Record<
  HubBackoffClampField,
  HubBackoffClampInfo
> {
  const raw = getHubBackoffEnvRaw();
  const effective = normalizeHubBackoffConfig(
    {
      baseMs: readEnvNumber("VITE_HUB_BACKOFF_BASE_MS"),
      capMs: readEnvNumber("VITE_HUB_BACKOFF_CAP_MS"),
      maxAttempts: readEnvNumber("VITE_HUB_MAX_ATTEMPTS"),
    },
    DEFAULT_HUB_BACKOFF_CONFIG,
  );

  const build = (
    field: HubBackoffClampField,
    rawStr: string | undefined,
    eff: number,
    min: number,
    max: number,
  ): HubBackoffClampInfo => {
    if (rawStr === undefined) {
      return { raw: rawStr, parsed: NaN, effective: eff, clamped: false, reason: "unset" };
    }
    const parsed = Number(rawStr);
    if (!Number.isFinite(parsed)) {
      return { raw: rawStr, parsed: NaN, effective: eff, clamped: true, reason: "nan" };
    }
    const floored = Math.floor(parsed);
    if (floored === eff) {
      return { raw: rawStr, parsed, effective: eff, clamped: false, reason: "ok" };
    }
    let reason: HubBackoffClampInfo["reason"] = "ok";
    if (floored < min) reason = "below-min";
    else if (floored > max) reason = "above-max";
    else if (field === "capMs") reason = "cap-below-base";
    return { raw: rawStr, parsed, effective: eff, clamped: true, reason };
  };

  return {
    baseMs: build(
      "baseMs",
      raw.baseMs,
      effective.baseMs,
      HUB_BACKOFF_BOUNDS.baseMsMin,
      HUB_BACKOFF_BOUNDS.baseMsMax,
    ),
    capMs: build(
      "capMs",
      raw.capMs,
      effective.capMs,
      effective.baseMs,
      HUB_BACKOFF_BOUNDS.capMsMax,
    ),
    maxAttempts: build(
      "maxAttempts",
      raw.maxAttempts,
      effective.maxAttempts,
      0,
      HUB_BACKOFF_BOUNDS.maxAttemptsMax,
    ),
  };
}


/**
 * Backoff config is scoped per (app, hub host) so different environments
 * — e.g. `creative_studio @ reson8.life` vs `creative_studio @ staging.reson8.life`
 * — and different apps sharing the same browser keep independent tunings.
 */
export type HubBackoffScope = { app: string; hubUrl: string };

export const HUB_BACKOFF_CONFIG_STORAGE_PREFIX =
  "hub-entitlement:backoff-config";

function hubHost(hubUrl: string): string {
  try {
    return new URL(hubUrl).host || hubUrl;
  } catch {
    return hubUrl;
  }
}

export function hubBackoffConfigStorageKey(scope: HubBackoffScope): string {
  return `${HUB_BACKOFF_CONFIG_STORAGE_PREFIX}:${scope.app}@${hubHost(scope.hubUrl)}`;
}

const DEFAULT_SCOPE: HubBackoffScope = { app: APP_KEY, hubUrl: HUB_URL };

function envBackoffConfig(): HubBackoffConfig {
  // Read raw env values, then normalize against bounds so a typo like
  // `VITE_HUB_BACKOFF_BASE_MS=0` or `=abc` can't poison runtime.
  const raw: Partial<HubBackoffConfig> = {
    baseMs: readEnvNumber("VITE_HUB_BACKOFF_BASE_MS"),
    capMs: readEnvNumber("VITE_HUB_BACKOFF_CAP_MS"),
    maxAttempts: readEnvNumber("VITE_HUB_MAX_ATTEMPTS"),
  };
  // Strip undefined so normalize() falls back to defaults for missing keys.
  const cleaned: Partial<HubBackoffConfig> = {};
  for (const k of ["baseMs", "capMs", "maxAttempts"] as const) {
    if (raw[k] !== undefined) cleaned[k] = raw[k];
  }
  return normalizeHubBackoffConfig(cleaned, DEFAULT_HUB_BACKOFF_CONFIG);
}

function readPersistedBackoffConfig(
  scope: HubBackoffScope,
): Partial<HubBackoffConfig> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(hubBackoffConfigStorageKey(scope));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<HubBackoffConfig>;
    const out: Partial<HubBackoffConfig> = {};
    for (const k of ["baseMs", "capMs", "maxAttempts"] as const) {
      const v = parsed[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * In-memory cache of resolved configs keyed by storage key. Lazy-loaded on
 * first access so new scopes (e.g. a different hubUrl injected for tests)
 * pick up their persisted overrides automatically.
 */
const configCache = new Map<string, HubBackoffConfig>();

function resolveConfig(scope: HubBackoffScope): HubBackoffConfig {
  const key = hubBackoffConfigStorageKey(scope);
  const cached = configCache.get(key);
  if (cached) return cached;
  // env values are already normalized; merge persisted on top and re-normalize
  // so a previously stored bad value (e.g. capMs < baseMs after a baseMs bump)
  // is repaired on load.
  const env = envBackoffConfig();
  const resolved = normalizeHubBackoffConfig(
    { ...env, ...readPersistedBackoffConfig(scope) },
    env,
  );
  configCache.set(key, resolved);
  return resolved;
}

/** Read the active backoff config for a scope (defaults to the app's prod hub). */
export function getHubBackoffConfig(
  scope: HubBackoffScope = DEFAULT_SCOPE,
): HubBackoffConfig {
  return { ...resolveConfig(scope) };
}

/**
 * Override the runtime backoff config for a scope. Partial updates merge
 * with the current scoped config and are normalized + persisted to
 * localStorage. Pass no patch to reset that scope to env+baked defaults.
 */
export function setHubBackoffConfig(
  patch?: Partial<HubBackoffConfig>,
  scope: HubBackoffScope = DEFAULT_SCOPE,
): HubBackoffConfig {
  const key = hubBackoffConfigStorageKey(scope);
  if (!patch) {
    const next = envBackoffConfig();
    configCache.set(key, next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
    return { ...next };
  }
  // Merge then normalize — guarantees invariants regardless of caller hygiene.
  const next = normalizeHubBackoffConfig(
    { ...resolveConfig(scope), ...patch },
    resolveConfig(scope),
  );
  configCache.set(key, next);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return { ...next };
}

/**
 * Enumerate every persisted backoff-config scope found in this browser.
 * Used by the admin panel to surface tunings made for other envs/apps.
 */
export function listPersistedHubBackoffScopes(): Array<
  HubBackoffScope & { config: HubBackoffConfig }
> {
  if (typeof window === "undefined") return [];
  const out: Array<HubBackoffScope & { config: HubBackoffConfig }> = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(`${HUB_BACKOFF_CONFIG_STORAGE_PREFIX}:`)) continue;
      const tail = k.slice(HUB_BACKOFF_CONFIG_STORAGE_PREFIX.length + 1);
      const at = tail.lastIndexOf("@");
      if (at < 0) continue;
      const app = tail.slice(0, at);
      const host = tail.slice(at + 1);
      try {
        const raw = window.localStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as Partial<HubBackoffConfig>;
        const env = envBackoffConfig();
        const config = normalizeHubBackoffConfig({ ...env, ...parsed }, env);
        out.push({ app, hubUrl: `https://${host}`, config });
      } catch {
        /* ignore malformed entry */
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

/**
 * Remove every persisted backoff config entry in this browser, across all
 * (app, hubUrl) scopes. Returns the number of scope entries cleared.
 * After this, every scope falls back to env + DEFAULT_HUB_BACKOFF_CONFIG.
 */
export function clearAllPersistedHubBackoffConfigs(): number {
  if (typeof window === "undefined") return 0;
  const prefix = `${HUB_BACKOFF_CONFIG_STORAGE_PREFIX}:`;
  const keys: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    for (const k of keys) window.localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
  return keys.length;
}

/**
 * Exponential backoff in ms for the Nth consecutive failure (1-indexed).
 * Honors the active config for the given scope; `config` overrides per-call.
 */
export function hubBackoffMs(
  attempt: number,
  config?: Partial<HubBackoffConfig>,
  scope: HubBackoffScope = DEFAULT_SCOPE,
): number {
  if (attempt <= 0) return 0;
  const resolved = resolveConfig(scope);
  // Per-call overrides go through the same normalizer as everything else.
  const cfg = normalizeHubBackoffConfig({ ...resolved, ...(config ?? {}) }, resolved);
  const cappedAttempt =
    cfg.maxAttempts > 0 ? Math.min(attempt, cfg.maxAttempts) : attempt;
  const exp = Math.min(cappedAttempt - 1, 30); // guard against 2**N overflow
  return Math.min(cfg.baseMs * 2 ** exp, cfg.capMs);
}


/** localStorage key for persisted backoff state, scoped per app. */
export const hubBackoffStorageKey = (app: string) =>
  `hub-entitlement:backoff:${app}`;

type PersistedBackoff = { attemptCount: number; retryAvailableAt: number };

function readPersistedBackoff(app: string): PersistedBackoff {
  if (typeof window === "undefined") return { attemptCount: 0, retryAvailableAt: 0 };
  try {
    const raw = window.localStorage.getItem(hubBackoffStorageKey(app));
    if (!raw) return { attemptCount: 0, retryAvailableAt: 0 };
    const parsed = JSON.parse(raw) as Partial<PersistedBackoff>;
    const attemptCount =
      typeof parsed.attemptCount === "number" && parsed.attemptCount > 0
        ? parsed.attemptCount
        : 0;
    const retryAvailableAt =
      typeof parsed.retryAvailableAt === "number" && parsed.retryAvailableAt > 0
        ? parsed.retryAvailableAt
        : 0;
    return { attemptCount, retryAvailableAt };
  } catch {
    return { attemptCount: 0, retryAvailableAt: 0 };
  }
}

function writePersistedBackoff(app: string, state: PersistedBackoff): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      hubBackoffStorageKey(app),
      JSON.stringify(state),
    );
  } catch {
    /* ignore quota / disabled storage */
  }
}

function clearPersistedBackoff(app: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(hubBackoffStorageKey(app));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Shared dedupe + TTL cache for Hub entitlement fetches.
// Multiple components mount useEntitlement (PaywallGate, banner, CheckoutButton,
// Studio, …). Without coalescing, every mount + every onAuthStateChange event
// fires its own GET legacy Hub entitlement route — producing bursts of identical
// requests (and identical 401s) within a few hundred ms. We coalesce by
// (endpoint, token): one in-flight promise serves all callers, and successful
// responses are cached for ENTITLEMENT_TTL_MS so back-to-back mounts reuse it.
// ---------------------------------------------------------------------------
type HubFetchResult =
  | { kind: "ok"; status: number; body: Partial<Entitlement> }
  | { kind: "unauth"; status: number }
  | { kind: "http"; status: number; statusText: string }
  | { kind: "network"; message: string };

const ENTITLEMENT_TTL_MS = 30_000;
const inflightHubFetches = new Map<string, Promise<HubFetchResult>>();
const hubFetchCache = new Map<string, { at: number; result: HubFetchResult }>();

function hubCacheKey(endpoint: string, token: string | null): string {
  // Hash the token coarsely — we just need to bust the cache when the user
  // changes, not store the JWT. Length + first/last 6 chars is enough.
  const t = token ? `${token.length}:${token.slice(0, 6)}:${token.slice(-6)}` : "anon";
  return `${endpoint}|${t}`;
}

async function fetchHubEntitlement(
  endpoint: string,
  token: string,
  opts: { force?: boolean } = {},
): Promise<HubFetchResult> {
  const key = hubCacheKey(endpoint, token);
  if (!opts.force) {
    const cached = hubFetchCache.get(key);
    if (cached && Date.now() - cached.at < ENTITLEMENT_TTL_MS) {
      return cached.result;
    }
  }
  const existing = inflightHubFetches.get(key);
  if (existing) return existing;

  const p: Promise<HubFetchResult> = (async () => {
    let res: Response;
    try {
      res = await fetch(endpoint, { credentials: "include", cache: "no-store", headers: { Accept: "application/json" } });
    } catch (netErr) {
      return { kind: "network" as const, message: (netErr as Error).message };
    }
    if (res.status === 401 || res.status === 403) {
      return { kind: "unauth" as const, status: res.status };
    }
    if (!res.ok) {
      return { kind: "http" as const, status: res.status, statusText: res.statusText };
    }
    const body = (await res.json()) as Partial<Entitlement>;
    return { kind: "ok" as const, status: res.status, body };
  })();

  inflightHubFetches.set(key, p);
  try {
    const result = await p;
    // Cache everything except transient network errors so a flaky Hub doesn't
    // get hammered, but a real connectivity blip can retry next tick.
    if (result.kind !== "network") hubFetchCache.set(key, { at: Date.now(), result });
    return result;
  } finally {
    inflightHubFetches.delete(key);
  }
}

/** Test-only: clear the dedupe + TTL cache between cases. */
export function __resetHubEntitlementCache(): void {
  inflightHubFetches.clear();
  hubFetchCache.clear();
}

/**
 * useEntitlement(app)
 * Reads the same-origin RONS spoke session backed by a host-only HttpOnly cookie
 * and returns the effective tier for `app`. All-Access wins.
 */
export function useEntitlement(app: string = APP_KEY, hubUrl: string = HUB_URL) {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [diagnostic, setDiagnostic] = useState<EntitlementDiagnostic | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  // Rehydrate backoff so a page refresh during a Hub outage doesn't reset
  // the cooldown and let users hammer the Hub again.
  const [attemptCount, setAttemptCount] = useState(
    () => readPersistedBackoff(app).attemptCount,
  );
  const [retryAvailableAt, setRetryAvailableAt] = useState(
    () => readPersistedBackoff(app).retryAvailableAt,
  );

  const endpoint = "/_rons/session";
  // Periodic background refresh so a mid-session upgrade (user buys on the Hub
  // in another tab, returns here) reflects without a manual reload. Also
  // refreshes on tab focus / visibility change since that's when users typically
  // come back from /checkout. Both paths bypass the dedupe TTL via { force }.
  const ENTITLEMENT_REFRESH_MS = 60_000;

  useEffect(() => {
    let cancelled = false;

    async function load(opts: { force?: boolean; silent?: boolean } = {}) {
      if (!opts.silent) setLoading(true);
      setError(null);

      if (FREE_PROMOTION_ACTIVE) {
        if (!cancelled) {
          setEntitlement(
            normalizeEntitlement(
              {
                app,
                userId: "promotion-user",
                tier: FREE_PROMOTION_TIER,
                status: "active",
                source: "trial",
                features: {
                  posters: true,
                  videos: true,
                  teamSeats: true,
                  whiteLabel: true,
                },
              },
              app,
            ),
          );
          setDiagnostic({
            endpoint: "promotion://free-access",
            httpStatus: 200,
            reason: "ok",
            lastCheckedAt: new Date().toISOString(),
            message: "Free promotion access active",
          });
          setAttemptCount(0);
          setRetryAvailableAt(0);
          clearPersistedBackoff(app);
          setLoading(false);
        }
        return;
      }

      // Sovereign-local builds never call the public Hub for billing state.
      // The local owner workspace is intentionally unlocked; public/server-side
      // billing remains a separate deployment concern.
      const isSovereignLocal = typeof window !== "undefined" &&
        (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost");
      if (isSovereignLocal) {
        if (!cancelled) {
          setEntitlement(normalizeEntitlement(
            { app, userId: "sovereign-local-user", tier: "pro", status: "active", source: "admin_override" },
            app,
          ));
          setDiagnostic({
            endpoint: "local://sovereign-entitlement",
            httpStatus: 200,
            reason: "ok",
            lastCheckedAt: new Date().toISOString(),
            message: "Sovereign local owner mode",
          });
          setAttemptCount(0);
          setRetryAvailableAt(0);
          clearPersistedBackoff(app);
          setLoading(false);
        }
        return;
      }

      // Dev-only unlock: ?devUnlock=1 (persisted in sessionStorage) short-circuits
      // the Hub call so the sandbox/E2E browser can exercise gated UI when the
      // Hub at reson8.life is unreachable. Real billing/server enforcement is
      // unaffected — this only flips the client-side gate. Disabled in production
      // builds so deployed users cannot self-grant pro tier.
      if (import.meta.env.DEV) {
        try {
          if (typeof window !== "undefined") {
            const sp = new URLSearchParams(window.location.search);
            if (sp.get("devUnlock") === "1") {
              sessionStorage.setItem("resonance:devUnlock", "1");
            }
            if (sessionStorage.getItem("resonance:devUnlock") === "1") {
              if (!cancelled) {
                setEntitlement(
                  normalizeEntitlement(
                    { app, userId: "dev", tier: "pro", status: "active", source: "admin_override" },
                    app,
                  ),
                );
                setDiagnostic({
                  endpoint,
                  httpStatus: 200,
                  reason: "ok",
                  lastCheckedAt: new Date().toISOString(),
                  message: "devUnlock active",
                });
                setLoading(false);
              }
              return;
            }
          }
        } catch { /* ignore */ }
      } else if (typeof sessionStorage !== "undefined") {
        // Defensive cleanup: if a session was unlocked in dev and the same
        // browser later loads the prod bundle, scrub the stale flag.
        try { sessionStorage.removeItem("resonance:devUnlock"); } catch { /* ignore */ }
      }

      const startedAt = new Date().toISOString();

      try {
        // Production entitlement is carried by the host-only HttpOnly RONS spoke cookie.
        // No browser bearer token is read or transmitted for this decision.
        const result = await fetchHubEntitlement(endpoint, "cookie", { force: opts.force });

        if (cancelled) return;

        if (result.kind === "network") {
          throw Object.assign(
            new Error(`Network error reaching Hub: ${result.message}`),
            { __reason: "network" as const, __status: null as number | null },
          );
        }

        if (result.kind === "unauth") {
          setEntitlement(
            normalizeEntitlement(
              { app, userId: "", tier: "free", status: "inactive", source: "none" },
              app,
            ),
          );
          setDiagnostic({
            endpoint,
            httpStatus: result.status,
            reason: "unauthenticated",
            lastCheckedAt: startedAt,
            message: `Hub returned ${result.status} — treating as free tier`,
          });
          setAttemptCount(0);
          setRetryAvailableAt(0);
          clearPersistedBackoff(app);
          setLoading(false);
          return;
        }

        if (result.kind === "http") {
          throw Object.assign(
            new Error(`Entitlement lookup failed (${result.status} ${result.statusText})`),
            { __reason: "http" as const, __status: result.status },
          );
        }

        const body = normalizeEntitlement(result.body, app);
        setEntitlement(body);
        setDiagnostic({
          endpoint,
          httpStatus: result.status,
          reason: "ok",
          lastCheckedAt: startedAt,
        });
        // Healthy response — clear backoff state.
        setAttemptCount(0);
        setRetryAvailableAt(0);
        clearPersistedBackoff(app);
      } catch (e) {
        const err = e as Error & {
          __reason?: "network" | "http";
          __status?: number | null;
        };
        if (!cancelled) {
          setError(err);
          const failDiag: EntitlementDiagnostic = {
            endpoint,
            httpStatus: err.__status ?? null,
            reason: err.__reason ?? "network",
            lastCheckedAt: startedAt,
            message: err.message,
          };
          setDiagnostic(failDiag);
          logHubEntitlementFailure(app, failDiag);
          setAttemptCount((n) => {
            const scope = { app, hubUrl };
            const cfg = getHubBackoffConfig(scope);
            const raw = n + 1;
            const next = cfg.maxAttempts > 0 ? Math.min(raw, cfg.maxAttempts) : raw;
            const nextRetryAt = Date.now() + hubBackoffMs(next, undefined, scope);
            setRetryAvailableAt(nextRetryAt);
            writePersistedBackoff(app, {
              attemptCount: next,
              retryAvailableAt: nextRetryAt,
            });
            return next;
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    // Initial load on mount; force-bypass cache on every manual refetch so the
    // user always gets a fresh answer when they click "retry".
    load({ force: reloadTick > 0 });
    const { data: sub } = supabase.auth.onAuthStateChange(() => load({ force: true }));

    // Periodic background refresh — silent so the UI doesn't flash a loading
    // state every minute. Skips while the tab is hidden to avoid wasted Hub
    // calls; the visibility handler below catches up on the next focus.
    const interval = setInterval(() => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      load({ force: true, silent: true });
    }, ENTITLEMENT_REFRESH_MS);

    const onVisible = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      load({ force: true, silent: true });
    };
    const onFocus = () => {
      if (cancelled) return;
      load({ force: true, silent: true });
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("focus", onFocus);
    }

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      clearInterval(interval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onFocus);
      }
    };
  }, [app, hubUrl, endpoint, reloadTick]);

  /**
   * Manual retry. Honors exponential backoff: if called before
   * `retryAvailableAt`, it's a no-op and returns false. Returns true when a
   * refetch was actually scheduled.
   */
  const refetch = (): boolean => {
    if (Date.now() < retryAvailableAt) return false;
    setReloadTick((n) => n + 1);
    return true;
  };

  return {
    entitlement,
    isLoading,
    error,
    diagnostic,
    refetch,
    attemptCount,
    retryAvailableAt,
  };
}

/**
 * Build a Hub checkout URL for the given SKU.
 *   checkoutUrl("creative_studio:creator:monthly")
 * Anything that doesn't already look like a SKU (no ":" present) is treated
 * as a plan key for this app — kept for backward-compatibility.
 */
export function checkoutUrl(skuOrPlan: string, returnTo?: string): string {
  if (FREE_PROMOTION_ACTIVE) return "/studio";
  const back =
    returnTo ?? (typeof window !== "undefined" ? window.location.href : "/");
  const sku = skuOrPlan.includes(":")
    ? skuOrPlan
    : `${APP_KEY}:${skuOrPlan}:monthly`;
  return `${HUB_URL}/checkout?sku=${encodeURIComponent(sku)}&return_to=${encodeURIComponent(back)}`;
}
