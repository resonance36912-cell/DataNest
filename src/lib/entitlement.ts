import { useQuery } from "@tanstack/react-query";
import { FREE_PROMOTION_ACTIVE, FREE_PROMOTION_TIER } from "@/lib/promotion";

export type Tier = "free" | "starter" | "pro" | "business" | null;
export type Entitlement = {
  tier: Tier;
  status: "active" | "past_due" | "cancelled" | "none";
};

export const APP_KEY = "youtube_optimizer" as const;
const browserHost = typeof window !== "undefined" ? window.location.hostname : null;
const isLocal = browserHost === "127.0.0.1" || browserHost === "localhost";
export const HUB_URL = isLocal && browserHost ? `http://${browserHost}:4173` : "https://reson8.life";

export function hubUrl(path: string = "/") {
  if (/^https?:\/\//i.test(path)) return path;
  return `${HUB_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export const HUB_PRICING_URL = hubUrl("/pricing");
export const HUB_UPDATES_URL = hubUrl("/updates");
export const HUB_DOCS_URL = hubUrl("/docs");
export const HUB_SUPPORT_URL = hubUrl("/support");
export const HUB_CREDITS_URL = hubUrl("/pricing#credits");

type RonsSession = { authenticated?: boolean; tier?: Tier; status?: string };

async function readEntitlement(): Promise<Entitlement> {
  if (isLocal) return { tier: "business", status: "active" };
  try {
    const res = await fetch("/_rons/session", {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { tier: null, status: "none" };
    const json = (await res.json()) as RonsSession;
    if (!json.authenticated) return { tier: null, status: "none" };
    if (FREE_PROMOTION_ACTIVE) return { tier: FREE_PROMOTION_TIER, status: "active" };
    const status: Entitlement["status"] =
      json.status === "active" ? "active" :
      json.status === "past_due" ? "past_due" :
      json.status === "cancelled" ? "cancelled" : "none";
    return { tier: json.tier ?? null, status };
  } catch {
    return { tier: null, status: "none" };
  }
}

export function useEntitlement() {
  return useQuery<Entitlement>({
    queryKey: ["entitlement", APP_KEY, isLocal ? "local" : "cookie"],
    queryFn: readEntitlement,
    staleTime: 60_000,
    refetchOnWindowFocus: !isLocal,
  });
}

export function tierMeets(have: Tier, need: Exclude<Tier, null | "free">) {
  if (FREE_PROMOTION_ACTIVE) return true;
  const order = ["free", "starter", "pro", "business"] as const;
  if (!have) return false;
  return (order as readonly string[]).indexOf(have) >= (order as readonly string[]).indexOf(need);
}

export const APP_START_URL = isLocal && browserHost ? `http://${browserHost}:3401/` : "/";

export function checkoutUrl(plan: string = "credits", returnTo?: string) {
  if (FREE_PROMOTION_ACTIVE || plan === "free") return APP_START_URL;
  const back = returnTo ?? (typeof window !== "undefined" ? window.location.href : "/");
  return `${HUB_URL}/checkout?app=${APP_KEY}&pack=${plan}&return_to=${encodeURIComponent(back)}`;
}
