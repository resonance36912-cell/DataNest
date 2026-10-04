/**
 * Client-side mirror of the entitlement contract emitted by
 * `supabase/functions/_shared/entitlement.ts` and its siblings.
 *
 * The server can deny a gated call in three shapes; all are normalized into
 * the same `TierRequiredError` so every gated UI renders the shared
 * `<TierRequiredState>` panel with a consistent "Upgrade required" CTA:
 *
 *   1. HTTP 402 { code: "tier_required" }
 *        Caller's tier is below the feature's minimum. Canonical paywall.
 *   2. HTTP 403 { code: "subscription_inactive" | "subscription_required"
 *                       | "entitlement_forbidden" }
 *        Caller has no active subscription (expired, canceled, unpaid).
 *   3. HTTP 409 { code: "entitlement_conflict" | "quota_exceeded"
 *                       | "trial_exhausted" | "plan_change_required" }
 *        Subscription exists but the current plan can't run this job
 *        (quota exhausted, trial ended, mid-flight plan change, etc.).
 *
 * All three are treated as "the workflow needs a plan change to proceed"
 * — the store surfaces the same denial to `useFeatureGate` and the same
 * upgrade CTA to the user. The `kind` field lets copy / toasts differ
 * without forking the paywall surface.
 */
import { useSyncExternalStore } from "react";
import type { GatedFeature } from "@/lib/featureGates";
import type { Tier } from "@/lib/entitlement";

export type EntitlementDenialKind =
  | "tier_required"
  | "subscription_inactive"
  | "entitlement_conflict";

export interface TierRequiredError {
  feature: GatedFeature;
  function_name: string;
  required_tier: Exclude<Tier, null | "free">;
  current_tier: Exclude<Tier, null>;
  message: string;
  /** Which class of entitlement failure this represents. */
  kind: EntitlementDenialKind;
  /** Original HTTP status the server responded with (402/403/409). */
  status: 402 | 403 | 409;
  /** ms epoch — when the denial was recorded on this client. */
  recordedAt: number;
}

const STORAGE_KEY = "sv:tier-required:v1";
const CHANGE_EVENT = "sv:tier-required-change";

type Store = Partial<Record<GatedFeature, TierRequiredError>>;

const isBrowser = typeof window !== "undefined";

function readStore(): Store {
  if (!isBrowser) return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function writeStore(next: Store) {
  if (!isBrowser) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — ignore */
  }
}

let state: Store = readStore();
const listeners = new Set<() => void>();

function emit() {

  for (const l of listeners) l();
  if (isBrowser) window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/** Record (or replace) the latest tier-required denial for `err.feature`. */
export function recordTierRequired(err: TierRequiredError) {
  state = { ...state, [err.feature]: err };
  writeStore(state);
  emit();
}

/** Clear a recorded denial once a subsequent call succeeds. */
export function clearTierRequired(feature: GatedFeature) {
  if (!(feature in state)) return;
  const next = { ...state };
  delete next[feature];
  state = next;
  writeStore(state);
  emit();
}

export function clearAllTierRequired() {
  if (Object.keys(state).length === 0) return;
  state = {};
  writeStore(state);
  emit();
}

/** Non-reactive read. */
export function getTierRequired(feature: GatedFeature): TierRequiredError | null {
  return state[feature] ?? null;
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onEvt = () => l();
  if (isBrowser) window.addEventListener(CHANGE_EVENT, onEvt);
  return () => {
    listeners.delete(l);
    if (isBrowser) window.removeEventListener(CHANGE_EVENT, onEvt);
  };
}

function getSnapshot(): Store { return state; }
function getServerSnapshot(): Store { return {}; }

/** Reactive per-feature denial, or `null` when none is recorded. */
export function useTierRequired(feature: GatedFeature): TierRequiredError | null {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return s[feature] ?? null;
}

/** Reactive full map — used by aggregate UIs (recommendations banner). */
export function useTierRequiredMap(): Store {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const ALLOWED_FEATURES: readonly GatedFeature[] = [
  "ai_character_gen",
  "storyboard_video",
  "hd_render",
  "assembly_merge",
];

const ALLOWED_TIERS = ["free", "starter", "creator", "pro", "business", "all_access"] as const;
type AnyTier = (typeof ALLOWED_TIERS)[number];

/**
 * Fallback minimum tier per feature — used when the server body omits
 * `required_tier` (older 403/409 payloads). Kept as a local copy to avoid
 * a circular import with `featureGates.ts`; the parity test in
 * `paywallFeatureParity.test.ts` guards divergence.
 */
const FEATURE_MIN_TIER: Record<GatedFeature, Exclude<Tier, null | "free">> = {
  ai_character_gen: "creator",
  storyboard_video: "creator",
  hd_render: "pro",
  assembly_merge: "creator",
};

/** Server `code` values grouped by which denial kind they map to. */
const CODE_TO_KIND: Record<string, EntitlementDenialKind> = {
  tier_required: "tier_required",
  subscription_inactive: "subscription_inactive",
  subscription_required: "subscription_inactive",
  entitlement_forbidden: "subscription_inactive",
  entitlement_conflict: "entitlement_conflict",
  quota_exceeded: "entitlement_conflict",
  trial_exhausted: "entitlement_conflict",
  plan_change_required: "entitlement_conflict",
};

/** Status codes we treat as entitlement failures worth surfacing. */
const ENTITLEMENT_STATUSES = new Set<number>([402, 403, 409]);

function coerceTier(v: unknown): AnyTier | null {
  return typeof v === "string" && (ALLOWED_TIERS as readonly string[]).includes(v)
    ? (v as AnyTier)
    : null;
}

function defaultMessage(kind: EntitlementDenialKind, feature: GatedFeature, required: string) {
  switch (kind) {
    case "subscription_inactive":
      return `Active pack required to use ${feature}`;
    case "entitlement_conflict":
      return `Your current pack can't run ${feature} right now`;
    default:
      return `Requires ${required} tier to use ${feature}`;
  }
}

function toEntitlementError(
  body: unknown,
  status: number,
  fallbackFnName: string,
): TierRequiredError | null {
  if (!body || typeof body !== "object") return null;
  if (!ENTITLEMENT_STATUSES.has(status)) return null;
  const b = body as Record<string, unknown>;
  const code = typeof b.code === "string" ? b.code : "";
  const kind = CODE_TO_KIND[code];
  if (!kind) return null;

  const feature = b.feature as GatedFeature | undefined;
  if (!feature || !ALLOWED_FEATURES.includes(feature)) return null;

  // required_tier is mandatory for `tier_required`; optional for the others
  // (we fall back to the feature's declared minimum).
  const requiredFromBody = coerceTier(b.required_tier);
  const required =
    requiredFromBody && requiredFromBody !== "free"
      ? (requiredFromBody as Exclude<Tier, null | "free">)
      : FEATURE_MIN_TIER[feature];
  if (kind === "tier_required" && (!requiredFromBody || requiredFromBody === "free")) return null;

  const currentFromBody = coerceTier(b.current_tier);
  const current = (currentFromBody ?? "free") as Exclude<Tier, null>;

  return {
    feature,
    function_name: typeof b.function_name === "string" ? b.function_name : fallbackFnName,
    required_tier: required,
    current_tier: current,
    message: typeof b.error === "string" ? b.error : defaultMessage(kind, feature, required),
    kind,
    status: status as 402 | 403 | 409,
    recordedAt: Date.now(),
  };
}

/**
 * Detects an entitlement denial from any of:
 *   - a raw `Response` (status 402/403/409 + JSON body with `code`)
 *   - a supabase-js `FunctionsHttpError` (has `.context.response`)
 *   - an already-parsed JSON body (status inferred from `code`)
 * Returns `null` for non-entitlement errors.
 */
export async function parseTierRequired(
  input: unknown,
  fallbackFnName = "unknown",
): Promise<TierRequiredError | null> {
  if (!input) return null;

  // Raw Response
  if (typeof Response !== "undefined" && input instanceof Response) {
    if (!ENTITLEMENT_STATUSES.has(input.status)) return null;
    try {
      const body = await input.clone().json();
      return toEntitlementError(body, input.status, fallbackFnName);
    } catch {
      return null;
    }
  }

  // FunctionsHttpError (supabase-js) — has .context.response
  const anyErr = input as { context?: { response?: Response }; status?: number };
  if (anyErr && anyErr.context && anyErr.context.response instanceof Response) {
    const res = anyErr.context.response;
    if (!ENTITLEMENT_STATUSES.has(res.status)) return null;
    try {
      const body = await res.clone().json();
      return toEntitlementError(body, res.status, fallbackFnName);
    } catch {
      return null;
    }
  }

  // Already-parsed body — infer the status from the code so callers that
  // hand us a decoded JSON payload still get normalised.
  if (typeof input === "object") {
    const b = input as Record<string, unknown>;
    const code = typeof b.code === "string" ? b.code : "";
    const kind = CODE_TO_KIND[code];
    const inferredStatus =
      kind === "tier_required" ? 402 : kind === "subscription_inactive" ? 403 : kind === "entitlement_conflict" ? 409 : 0;
    return toEntitlementError(input, inferredStatus, fallbackFnName);
  }
  return null;
}

export { ENTITLEMENT_STATUSES };
