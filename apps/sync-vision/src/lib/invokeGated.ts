/**
 * Thin wrappers around `supabase.functions.invoke` and `fetch` that make
 * server-side entitlement denials (`HTTP 402 { code: "tier_required" }`)
 * a first-class result instead of an opaque error.
 *
 * On denial:
 *   - records the denial in the tier-required store so every gated UI
 *     re-renders with a consistent "Upgrade required" state;
 *   - marks the feature as attempted for the upgrade recommendations banner;
 *   - invalidates the cached Hub entitlement so the client re-checks the
 *     user's real tier (a coupon or upgrade that landed since the last
 *     Hub read will flip the gate back to allowed on its own);
 *   - shows a toast with the canonical upgrade copy;
 *   - returns `{ ok: false, tierRequired }` — callers do NOT throw or
 *     surface a generic "Something went wrong" for tier denials.
 *
 * On success the paired feature's stored denial is cleared.
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { queryClient } from "@/lib/queryClient";
import { ENTITLEMENT_QUERY_KEY } from "@/lib/entitlement";
import { FEATURE_GATES, type GatedFeature } from "@/lib/featureGates";
import { recordFeatureAttempt } from "@/lib/featureAttempts";
import {
  parseTierRequired,
  recordTierRequired,
  clearTierRequired,
  type TierRequiredError,
} from "@/lib/tierRequired";

export type InvokeGatedResult<T> =
  | { ok: true; data: T }
  | { ok: false; tierRequired: TierRequiredError | null; error: unknown };

interface InvokeOptions {
  body?: unknown;
  headers?: Record<string, string>;
  /** Silence the automatic upgrade toast (default: false). */
  silent?: boolean;
}

function toastCopyFor(err: TierRequiredError, label: string) {
  switch (err.kind) {
    case "subscription_inactive":
      return {
        title: `Pack required to use ${label}`,
        description:
          `Your pack isn't active. Buy a pack or upgrade to ${err.required_tier} on the Hub to continue.`,
      };
    case "entitlement_conflict":
      return {
        title: `Pack limit reached for ${label}`,
        description:
          `Your current pack (${err.current_tier}) can't run this job right now. Upgrade to ${err.required_tier} or higher.`,
      };
    default:
      return {
        title: `Upgrade required to use ${label}`,
        description:
          `Your current pack (${err.current_tier}) doesn't include ${label}. Upgrade to ${err.required_tier} or higher.`,
      };
  }
}

/**
 * Standalone denial handler for call sites that manage their own
 * `supabase.functions.invoke` / `fetch` (e.g. legacy hooks). Idempotent —
 * safe to call multiple times for the same denial.
 */
export async function reportTierRequired(err: TierRequiredError, silent = false) {
  recordTierRequired(err);
  recordFeatureAttempt(err.feature);
  queryClient.invalidateQueries({ queryKey: ENTITLEMENT_QUERY_KEY });
  if (!silent) {
    const label = FEATURE_GATES[err.feature]?.label ?? err.feature;
    const copy = toastCopyFor(err, label);
    toast.error(copy.title, { description: copy.description });
  }
}

async function handleDenial(err: TierRequiredError, silent: boolean) {
  await reportTierRequired(err, silent);
}

/**
 * Wrap `supabase.functions.invoke` with tier-required handling.
 * Pass `expectedFeature` so a successful response can clear any stale
 * denial banner for that feature.
 */
export async function invokeGated<T = unknown>(
  fnName: string,
  options: InvokeOptions = {},
  expectedFeature?: GatedFeature,
): Promise<InvokeGatedResult<T>> {
  const { body, headers, silent = false } = options;
  const { data, error } = await supabase.functions.invoke(fnName, {
    body: body as Record<string, unknown> | undefined,
    headers,
  });
  if (error) {
    const tier = await parseTierRequired(error, fnName);
    if (tier) {
      await handleDenial(tier, silent);
      return { ok: false, tierRequired: tier, error };
    }
    return { ok: false, tierRequired: null, error };
  }
  if (expectedFeature) clearTierRequired(expectedFeature);
  return { ok: true, data: data as T };
}

/**
 * Wrap raw `fetch` with tier-required handling. Use for endpoints where the
 * codebase already calls `${SUPABASE_URL}/functions/v1/<name>` directly.
 * Returns the original `Response` on both success and non-tier failures so
 * the caller keeps full control of parsing.
 */
export async function fetchGated(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  opts: { fnName: string; expectedFeature?: GatedFeature; silent?: boolean },
): Promise<{ ok: true; response: Response } | { ok: false; response: Response; tierRequired: TierRequiredError | null }> {
  const response = await fetch(input, init);
  // 402 tier_required, 403 subscription_inactive, 409 entitlement_conflict —
  // all get normalized into the same TierRequiredState surface.
  if (response.status === 402 || response.status === 403 || response.status === 409) {
    const tier = await parseTierRequired(response, opts.fnName);
    if (tier) {
      await handleDenial(tier, opts.silent ?? false);
      return { ok: false, response, tierRequired: tier };
    }
  }
  if (!response.ok) {
    return { ok: false, response, tierRequired: null };
  }
  if (opts.expectedFeature) clearTierRequired(opts.expectedFeature);
  return { ok: true, response };
}
