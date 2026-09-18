/**
 * Admin → Entitlements panel.
 *
 * Lets an admin look up any Sync Vision user, see their cached Hub
 * entitlement (tier + status + renewal + source), force a refresh of the
 * Hub-backed cache for the currently signed-in admin session, and inspect
 * which feature gates would be granted vs blocked at the user's tier.
 *
 * Note on scope: the Resonance Hub (reson8.life) issues entitlements per
 * user-JWT, so cross-user real-time refresh requires an admin-scoped Hub
 * API. We expose what the spoke knows today: the live entitlement for the
 * signed-in admin, plus profile + role lookup for any user — and surface a
 * deep-link to the Hub admin for true cross-user revalidation.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Crown,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Search,
  ExternalLink,
  ShieldCheck,
  User as UserIcon,
  Wifi,
  WifiOff,
  Database,
} from "lucide-react";
import { AdminSection } from "../AdminSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  useEntitlement,
  useRefreshEntitlement,
  HUB_URL,
  hubCheckoutUrl,
  tierMeets,
  type Entitlement,
  type Tier,
} from "@/lib/entitlement";
import { FEATURE_GATES, type GatedFeature } from "@/lib/featureGates";
import { HUB_TIERS, tierDisplayName, type HubTier } from "@/lib/hubTiers";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at?: string | null;
}

interface RoleRow {
  user_id: string;
  role: string;
}

// ─── Hub health check ─────────────────────────────────────────────────────

async function pingHub(): Promise<{ ok: boolean; status: number; latencyMs: number }> {
  const start = performance.now();
  try {
    const res = await fetch("/_rons/session", { credentials: "include", cache: "no-store", headers: { Accept: "application/json" } });
    return { ok: res.ok, status: res.status, latencyMs: Math.round(performance.now() - start) };
  } catch {
    return { ok: false, status: 0, latencyMs: Math.round(performance.now() - start) };
  }
}

function useHubHealth() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin", "hub-health"],
    queryFn: pingHub,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 2,
  });
  return { health: data, isChecking: isFetching, recheck: refetch };
}

// ─── Profile search ───────────────────────────────────────────────────────

function useProfileSearch(query: string) {
  return useQuery({
    queryKey: ["admin", "profile-search", query],
    enabled: query.trim().length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<ProfileRow[]> => {
      const q = query.trim();
      // Try as UUID first, then fall back to display_name ILIKE.
      const looksLikeUuid = /^[0-9a-f-]{8,}$/i.test(q);
      let req = supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url, created_at")
        .limit(25);
      req = looksLikeUuid
        ? req.eq("user_id", q)
        : req.ilike("display_name", `%${q}%`);
      const { data, error } = await req;
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });
}

function useUserRoles(userId: string | null) {
  return useQuery({
    queryKey: ["admin", "user-roles", userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<RoleRow[]> => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []) as RoleRow[];
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function statusVariant(e: Entitlement | undefined) {
  if (!e) return { tone: "muted", icon: Lock, label: "Unknown" };
  if (e.hasAccess && e.status === "active")
    return { tone: "emerald", icon: CheckCircle2, label: "Active" };
  if (e.status === "past_due")
    return { tone: "red", icon: AlertTriangle, label: "Past due" };
  if (e.status === "pending")
    return { tone: "sky", icon: Loader2, label: "Pending" };
  if (e.status === "cancelled")
    return { tone: "muted", icon: AlertTriangle, label: "Cancelled" };
  if (!e.tier || e.tier === "free")
    return { tone: "amber", icon: Lock, label: "Free tier" };
  return { tone: "muted", icon: Lock, label: "Inactive" };
}

const TONE_CLASSES: Record<string, string> = {
  emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  red: "bg-red-500/15 text-red-300 border-red-500/30",
  sky: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  muted: "bg-muted text-muted-foreground border-border",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// ─── Section ──────────────────────────────────────────────────────────────

export function EntitlementsSection() {
  const { user: adminUser } = useAuth();
  const { data: ent, isLoading: entLoading, isFetching, error: entError, dataUpdatedAt } =
    useEntitlement();
  const refresh = useRefreshEntitlement();
  const { health, isChecking, recheck } = useHubHealth();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ProfileRow | null>(null);

  const { data: results = [], isFetching: searching } = useProfileSearch(query);
  const { data: roles = [] } = useUserRoles(selected?.user_id ?? null);

  const isSelf = selected?.user_id && selected.user_id === adminUser?.id;
  const showEnt = isSelf; // we can only authoritatively show the signed-in user's Hub entitlement

  const variant = statusVariant(showEnt ? ent : undefined);
  const Icon = variant.icon;

  const tier = (ent?.tier ?? "free") as Tier;
  const tierName = tierDisplayName(tier);
  const isPaid = tier && tier !== "free" && tier !== "starter" && tier in HUB_TIERS;
  const meta = isPaid ? HUB_TIERS[tier as HubTier] : null;

  const handleRefresh = async () => {
    await refresh();
    toast.success("Hub entitlement refreshed");
  };

  const gateRows = useMemo(() => {
    const tierForCheck: Tier = showEnt ? tier : null;
    const hasActive = showEnt && (ent?.status === "active" || ent?.status === "past_due");
    return (Object.keys(FEATURE_GATES) as GatedFeature[]).map((key) => {
      const spec = FEATURE_GATES[key];
      const meets = !!hasActive && tierMeets(tierForCheck, spec.minTier);
      return { key, spec, meets };
    });
  }, [tier, ent?.status, showEnt]);

  // derive a stable last-checked string from query dataUpdatedAt + health latency
  const healthSummary = useMemo(() => {
    if (isChecking) return { tone: "sky", icon: Loader2, label: "Checking…", latency: undefined } as const;
    if (!health) return { tone: "muted", icon: WifiOff, label: "Unknown", latency: undefined } as const;
    if (health.ok) return { tone: "emerald", icon: Wifi, label: "Connected", latency: health.latencyMs } as const;
    return { tone: "red", icon: WifiOff, label: "Unreachable", latency: health.latencyMs } as const;
  }, [health, isChecking]);

  return (
    <AdminSection
      icon={ShieldCheck}
      title="Hub Entitlements"
      description="Inspect a user's Resonance Hub pack and which Sync Vision features are gated."
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={handleRefresh}
          disabled={isFetching || !showEnt}
          className="gap-1.5"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          Refresh
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Hub connection health */}
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/40 p-3">
          <div className="flex items-center gap-2">
            {(() => {
              const H = healthSummary;
              const HealthIcon = H.icon;
              return (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] uppercase",
                    H.tone === "emerald" && TONE_CLASSES.emerald,
                    H.tone === "red" && TONE_CLASSES.red,
                    H.tone === "sky" && TONE_CLASSES.sky,
                    H.tone === "muted" && TONE_CLASSES.muted,
                  )}
                >
                  <HealthIcon className={cn("h-3 w-3", H.tone === "sky" && "animate-spin")} />
                  {H.label}
                </span>
              );
            })()}
            <span className="text-[11px] text-muted-foreground">
              {health?.latencyMs ? `${health.latencyMs} ms` : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              {health ? `Checked ${new Date().toLocaleTimeString()}` : ""}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => recheck()}
              disabled={isChecking}
            >
              <RefreshCw className={cn("h-3 w-3", isChecking && "animate-spin")} />
              Retry
            </Button>
          </div>
        </div>

        {/* User search */}
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Find user
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by display name or paste a user UUID…"
              className="pl-9"
            />
          </div>
          {query.length >= 2 && (
            <div className="rounded-lg border border-border/60 bg-background/40 max-h-56 overflow-y-auto">
              {searching && (
                <div className="p-3 text-xs text-muted-foreground">Searching…</div>
              )}
              {!searching && results.length === 0 && (
                <div className="p-3 text-xs text-muted-foreground">No users matched.</div>
              )}
              {results.map((r) => (
                <button
                  key={r.user_id}
                  onClick={() => setSelected(r)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/40",
                    selected?.user_id === r.user_id && "bg-muted/60",
                  )}
                >
                  <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate">
                    {r.display_name || "(no name)"}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {r.user_id.slice(0, 8)}…
                  </span>
                </button>
              ))}
            </div>
          )}
          {!query && (
            <p className="text-xs text-muted-foreground">
              Tip: leave blank to inspect your own admin entitlement, or load any user for profile + role context.
            </p>
          )}
        </div>

        {/* Selected user header */}
        {selected && (
          <div className="rounded-xl border border-border/60 bg-background/40 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {selected.display_name || "(no name)"}
                </p>
                <p className="truncate font-mono text-[10px] text-muted-foreground">
                  {selected.user_id}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {roles.map((r) => (
                  <Badge key={r.role} variant="secondary" className="text-[10px]">
                    {r.role}
                  </Badge>
                ))}
                {isSelf && (
                  <Badge className="bg-primary/15 text-primary text-[10px]">you</Badge>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Entitlement card */}
        <div className="rounded-xl border border-border/60 bg-background/40 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Crown className="h-3.5 w-3.5" />
              Hub Plan
            </div>
            <a
              href={`${HUB_URL}/admin/users`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              Open in Hub
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {!showEnt ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/10 p-4 text-xs text-muted-foreground">
              {selected
                ? "Cross-user Hub entitlement reads require the user's JWT and must be performed in the Hub admin (link above). Profile and roles for this user are shown above."
                : "Select a user to view profile + roles, or leave blank to inspect your own live Hub entitlement."}
            </div>
          ) : entLoading ? (
            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading entitlement…
            </div>
          ) : entError ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              Failed to fetch entitlement from Hub.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Data source indicator */}
              {ent?._source && (
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] uppercase",
                      ent._source === "fresh" && TONE_CLASSES.emerald,
                      ent._source === "cache" && TONE_CLASSES.sky,
                      ent._source === "fallback" && TONE_CLASSES.muted,
                    )}
                  >
                    {ent._source === "fresh" ? (
                      <Wifi className="h-3 w-3" />
                    ) : ent._source === "cache" ? (
                      <Database className="h-3 w-3" />
                    ) : (
                      <WifiOff className="h-3 w-3" />
                    )}
                    {ent._source === "fresh"
                      ? "Live Hub"
                      : ent._source === "cache"
                        ? "From cache"
                        : "Fallback"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {ent._fetchedAt
                      ? `Fetched ${new Date(ent._fetchedAt).toLocaleTimeString()}`
                      : "—"}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="Tier"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      {isPaid && <Crown className="h-3.5 w-3.5 text-amber-300" />}
                      {tierName}
                    </span>
                  }
                  sub={meta?.priceZAR}
                />
                <Stat
                  label="Status"
                  value={
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase",
                        TONE_CLASSES[variant.tone],
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-3 w-3",
                          variant.label === "Pending" && "animate-spin",
                        )}
                      />
                      {variant.label}
                    </span>
                  }
                  sub={ent?.status ?? "—"}
                />
                <Stat
                  label="Source"
                  value={ent?.source ?? "—"}
                  sub={ent?.app ?? "sync_vision"}
                />
                <Stat
                  label="Renews / Ends"
                  value={fmtDate(ent?.currentPeriodEnd ?? null)}
                  sub={`Updated ${
                    dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—"
                  }`}
                />
              </div>
            </div>
          )}
        </div>

        {/* Feature gate matrix */}
        <div className="rounded-xl border border-border/60 bg-background/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Feature gates
            </div>
            {!showEnt && (
              <span className="text-[11px] text-muted-foreground">
                Showing required tiers only
              </span>
            )}
          </div>
          <div className="divide-y divide-border/60">
            {gateRows.map(({ key, spec, meets }) => {
              const tierMeta = HUB_TIERS[spec.minTier as HubTier];
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{spec.label}</p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">
                      {key}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px]">
                      {tierMeta?.name ?? spec.minTier}
                    </Badge>
                    {showEnt ? (
                      meets ? (
                        <Badge className="gap-1 bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px]">
                          <CheckCircle2 className="h-3 w-3" /> Granted
                        </Badge>
                      ) : (
                        <a
                          href={hubCheckoutUrl(spec.sku)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-[10px] text-red-300 hover:bg-red-500/25"
                        >
                          <Lock className="h-3 w-3" /> Blocked
                        </a>
                      )
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        —
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AdminSection>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/40 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
      {sub != null && (
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}
