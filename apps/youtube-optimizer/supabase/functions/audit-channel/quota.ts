// Quota helpers for audit-channel. Pure functions + small fetch wrappers so they
// can be unit-tested with an injected fetcher.

export const TIER_CAPS: Record<string, number> = {
  free: 1,
  starter: 5,
  pro: 20,
  business: 100,
};

export type Tier = keyof typeof TIER_CAPS;
export type Fetcher = typeof fetch;

export const HUB_ENTITLEMENT_URL =
  "https://reson8.life/api/public/entitlement?app=youtube_optimizer";
export const HUB_UPGRADE_URL =
  "https://reson8.life/checkout?app=youtube_optimizer&plan=pro";

export async function fetchTier(
  authHeader: string,
  fetcher: Fetcher = fetch,
): Promise<Tier> {
  try {
    const res = await fetcher(HUB_ENTITLEMENT_URL, {
      headers: { Authorization: authHeader },
    });
    if (!res.ok) {
      await res.text().catch(() => "");
      return "free";
    }
    const ent = await res.json();
    const candidate = (ent?.tier ?? "free") as string;
    const active =
      ent?.status === "active" ||
      ent?.status === "past_due" ||
      candidate === "free";
    if (active && candidate in TIER_CAPS) return candidate as Tier;
    return "free";
  } catch {
    return "free";
  }
}

export async function fetchUsedThisPeriod(
  params: {
    supabaseUrl: string;
    serviceRoleKey: string;
    userId: string;
    sinceIso?: string;
  },
  fetcher: Fetcher = fetch,
): Promise<number> {
  const since =
    params.sinceIso ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const res = await fetcher(
      `${params.supabaseUrl}/rest/v1/audit_usage?select=id&user_id=eq.${params.userId}&created_at=gte.${since}`,
      {
        headers: {
          apikey: params.serviceRoleKey,
          Authorization: `Bearer ${params.serviceRoleKey}`,
          Prefer: "count=exact",
          Range: "0-0",
        },
      },
    );
    const range = res.headers.get("content-range") ?? "";
    await res.text().catch(() => "");
    const total = range.split("/")[1];
    return total && total !== "*" ? parseInt(total, 10) : 0;
  } catch {
    return 0;
  }
}

export type QuotaDecision =
  | { allowed: true; tier: Tier; limit: number; used: number }
  | {
      allowed: false;
      tier: Tier;
      limit: number;
      used: number;
      error: string;
      upgradeUrl: string;
    };

export function evaluateQuota(tier: Tier, used: number): QuotaDecision {
  const limit = TIER_CAPS[tier];
  if (used >= limit) {
    return {
      allowed: false,
      tier,
      limit,
      used,
      error: `Audit credit limit reached on your ${tier} pack (${limit}/${limit}). Buy a credit top-up or project pack on reson8.life to continue.`,
      upgradeUrl: HUB_UPGRADE_URL,
    };
  }
  return { allowed: true, tier, limit, used };
}
