import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, CheckCircle2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAuthEnvironment } from "@/lib/auth-environment";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

type CouponRow = {
  id: string;
  code: string;
  type: string | null;
  tier: string | null;
  created_at: string;
};

function relativeTime(from: Date, now: Date): string {
  const secs = Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000));
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return from.toLocaleString();
}

/**
 * Live sync status for credits + coupons: shows when data was last pulled,
 * which backend environment served it, and which account it belongs to.
 */
export default function CreditsSyncStatus({
  user,
  lastSyncedAt,
  live,
  onRefresh,
  refreshing,
}: {
  user: User | null;
  lastSyncedAt: Date | null;
  live: boolean;
  onRefresh: () => void | Promise<void>;
  refreshing?: boolean;
}) {
  const env = useMemo(() => getAuthEnvironment(), []);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  const loadCoupons = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("coupon_redemptions")
      .select("id, code, type, tier, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setCoupons((data as CouponRow[]) ?? []);
  }, [user]);

  useEffect(() => {
    void loadCoupons();
  }, [loadCoupons, lastSyncedAt]);

  return (
    <section
      data-testid="credits-sync-status"
      aria-label="Credits and coupons sync status"
      className="mb-8 rounded-xl border border-border/60 bg-card/40 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${
              live
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-muted-foreground/30 bg-muted/30 text-muted-foreground"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground"}`}
              aria-hidden="true"
            />
            {live ? "Live" : "Offline"}
          </span>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${
              env.isNonProduction
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : "border-primary/30 bg-primary/10 text-primary"
            }`}
            title={`Backend: ${env.projectRef} · Host: ${env.host || "unknown"}`}
          >
            {env.label} environment
            <span className="font-mono opacity-70">{env.projectRef.slice(0, 6)}</span>
          </span>

          <span className="text-muted-foreground">
            Last updated:{" "}
            <span className="font-medium text-foreground" data-testid="credits-last-synced">
              {lastSyncedAt ? relativeTime(lastSyncedAt, now) : "—"}
            </span>
          </span>

          {user?.email && (
            <span className="text-muted-foreground">
              Account: <span className="font-medium text-foreground">{user.email}</span>
            </span>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => void onRefresh()}
          disabled={refreshing}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Syncing…" : "Refresh"}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3 text-xs">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Ticket className="h-3.5 w-3.5" />
          Coupons applied:
          <span className="font-medium text-foreground">{coupons.length}</span>
        </span>
        {coupons.slice(0, 6).map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 font-mono"
            title={`${c.type ?? "coupon"}${c.tier ? ` · ${c.tier}` : ""} · ${new Date(c.created_at).toLocaleString()}`}
          >
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            {c.code}
          </span>
        ))}
        {coupons.length > 6 && (
          <span className="text-muted-foreground">+{coupons.length - 6} more</span>
        )}
      </div>
    </section>
  );
}
