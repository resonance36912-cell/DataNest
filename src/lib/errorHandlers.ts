import type { useToast } from "@/hooks/use-toast";
import { checkoutUrl } from "@/lib/entitlement";

type ToastFn = ReturnType<typeof useToast>["toast"];

const DEFAULT_PREMIUM_SKU = "creative_studio:premium:monthly";

type PremiumPayload = {
  requiresPremium?: boolean;
  upgradeSku?: string;
  error?: string;
};

/** Best-effort extraction of a JSON body from a supabase-js FunctionsHttpError. */
async function readErrorPayload(error: unknown): Promise<PremiumPayload | null> {
  const ctx = (error as any)?.context;
  if (!ctx) return null;
  // supabase-js v2: context is a Response
  if (typeof ctx.clone === "function" && typeof ctx.json === "function") {
    try {
      return (await ctx.clone().json()) as PremiumPayload;
    } catch {
      return null;
    }
  }
  // Some shapes pre-parse to context.json
  if (ctx.json && typeof ctx.json === "object") return ctx.json as PremiumPayload;
  return null;
}

function showPremiumToast(toast: ToastFn, payload: PremiumPayload, context: string) {
  const sku = payload.upgradeSku || DEFAULT_PREMIUM_SKU;
  toast({
    title: `${context} requires Premium`,
    description:
      payload.error ||
      "Opening upgrade on the Resonance Hub — your free tier covers posters & copy.",
    variant: "destructive",
  });
  setTimeout(() => {
    window.open(checkoutUrl(sku), "_blank", "noopener,noreferrer");
  }, 600);
}

/** Returns true when the payload was a premium-gate 402. */
export function handlePremiumGatePayload(
  toast: ToastFn,
  payload: unknown,
  context: string,
): boolean {
  const p = payload as PremiumPayload | null | undefined;
  if (p && p.requiresPremium) {
    showPremiumToast(toast, p, context);
    return true;
  }
  return false;
}

/**
 * Handles common Supabase edge-function errors (premium-gate, rate-limit, credits, generic).
 * Returns `true` if the error was handled (caller should bail), `false` otherwise.
 *
 * Now async so it can parse the FunctionsHttpError response body for 402/requiresPremium.
 */
export async function handleEdgeFunctionError(
  toast: ToastFn,
  error: unknown,
  context: string,
): Promise<boolean> {
  // 1) Premium gate (402 with requiresPremium)
  const payload = await readErrorPayload(error);
  if (payload && handlePremiumGatePayload(toast, payload, context)) return true;

  const msg =
    typeof error === "string"
      ? error
      : payload?.error ||
        (error as any)?.context?.json?.error ||
        (error as any)?.message ||
        "";

  // Fallback string-sniff for premium hints
  if (/requires? a? premium|requires premium/i.test(msg)) {
    showPremiumToast(toast, { error: msg }, context);
    return true;
  }

  if (/429|rate.?limit/i.test(msg)) {
    toast({
      title: "Rate limited",
      description: "Please wait 30 seconds and try again.",
      variant: "destructive",
    });
    return true;
  }

  if (/402|credits?.?exhaust/i.test(msg)) {
    toast({
      title: "Credits exhausted",
      description: "Please add funds in Settings → Workspace → Usage.",
      variant: "destructive",
    });
    return true;
  }

  toast({
    title: `${context} failed`,
    description: msg || `Could not complete ${context.toLowerCase()}`,
    variant: "destructive",
  });
  return true;
}

/**
 * Checks a Supabase response { data, error } for common failures.
 * Returns `true` if the error was handled.
 */
export async function handleResponseError(
  toast: ToastFn,
  data: any,
  error: any,
  context: string,
): Promise<boolean> {
  // Premium gate may arrive either as a thrown error (FunctionsHttpError) or
  // as a parsed body with success=false.
  if (data && handlePremiumGatePayload(toast, data, context)) return true;
  if (error) return handleEdgeFunctionError(toast, error, context);
  if (!data?.success) {
    return handleEdgeFunctionError(toast, { message: data?.error || "" }, context);
  }
  return false;
}
