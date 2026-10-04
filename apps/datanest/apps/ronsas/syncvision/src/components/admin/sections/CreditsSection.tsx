import { useCallback, useEffect, useRef, useState } from "react";
import { Wallet, ExternalLink, RefreshCw, AlertTriangle, CheckCircle2, MinusCircle, History, TrendingUp, TrendingDown } from "lucide-react";
import { AdminSection } from "@/components/admin/AdminSection";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type ProviderStatus = "ok" | "error" | "unavailable" | "unconfigured";

interface ProviderBalance {
  id: string;
  name: string;
  status: ProviderStatus;
  balance?: string;
  detail?: string;
  topupUrl: string;
  docsUrl?: string;
  error?: string;
  fetchedAt: string;
}

interface ActivityRow {
  id: string;
  provider_id: string;
  provider_name: string;
  event_type: "topup_attempt" | "balance_snapshot" | "balance_change";
  balance_before: number | null;
  balance_after: number | null;
  delta: number | null;
  raw_balance: string | null;
  note: string | null;
  created_at: string;
}

const STATUS_META: Record<ProviderStatus, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  ok:           { label: "Live",           cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: CheckCircle2 },
  unavailable:  { label: "No API",         cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",       icon: AlertTriangle },
  error:        { label: "Error",          cls: "bg-red-500/15 text-red-300 border-red-500/30",             icon: AlertTriangle },
  unconfigured: { label: "Not configured", cls: "bg-muted/40 text-muted-foreground border-border",          icon: MinusCircle },
};

const EVENT_META: Record<ActivityRow["event_type"], { label: string; cls: string }> = {
  topup_attempt:     { label: "Top-up clicked", cls: "bg-primary/15 text-primary border-primary/30" },
  balance_snapshot:  { label: "Snapshot",       cls: "bg-muted/40 text-muted-foreground border-border" },
  balance_change:    { label: "Balance change", cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
};

/** Extract a numeric balance from a human string like "$12.34", "1,234 credits", "10,000 chars". */
function parseBalance(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export function CreditsSection() {
  const { user } = useAuth();
  const [providers, setProviders] = useState<ProviderBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const lastBalanceRef = useRef<Record<string, number>>({});

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    const { data, error } = await supabase
      .from("provider_credit_activity")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error && data) setActivity(data as ActivityRow[]);
    setActivityLoading(false);
  }, []);

  const recordBalanceChanges = useCallback(async (incoming: ProviderBalance[]) => {
    if (!user) return;
    const rows: Array<Omit<ActivityRow, "id" | "created_at"> & { user_id: string }> = [];
    for (const p of incoming) {
      if (p.status !== "ok") continue;
      const val = parseBalance(p.balance);
      if (val == null) continue;
      const prev = lastBalanceRef.current[p.id];
      if (prev == null) {
        // First snapshot this session
        rows.push({
          user_id: user.id,
          provider_id: p.id,
          provider_name: p.name,
          event_type: "balance_snapshot",
          balance_before: null,
          balance_after: val,
          delta: null,
          raw_balance: p.balance ?? null,
          note: null,
        });
      } else if (Math.abs(prev - val) > 0.0001) {
        rows.push({
          user_id: user.id,
          provider_id: p.id,
          provider_name: p.name,
          event_type: "balance_change",
          balance_before: prev,
          balance_after: val,
          delta: val - prev,
          raw_balance: p.balance ?? null,
          note: null,
        });
      }
      lastBalanceRef.current[p.id] = val;
    }
    if (rows.length > 0) {
      const { error } = await supabase.from("provider_credit_activity").insert(rows);
      if (!error) loadActivity();
    }
  }, [user, loadActivity]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("provider-balances");
      if (error) throw error;
      const list: ProviderBalance[] = data?.providers ?? [];
      setProviders(list);
      setFetchedAt(data?.fetchedAt ?? new Date().toISOString());
      recordBalanceChanges(list);
    } catch (e: any) {
      toast.error("Failed to load provider balances", { description: e?.message });
    } finally {
      setLoading(false);
    }
  }, [recordBalanceChanges]);

  useEffect(() => { load(); loadActivity(); }, [load, loadActivity]);

  const handleTopupClick = async (p: ProviderBalance) => {
    if (!user) return;
    const balanceNum = parseBalance(p.balance);
    await supabase.from("provider_credit_activity").insert({
      user_id: user.id,
      provider_id: p.id,
      provider_name: p.name,
      event_type: "topup_attempt",
      balance_before: balanceNum,
      balance_after: null,
      delta: null,
      raw_balance: p.balance ?? null,
      note: "Admin opened top-up page",
    });
    loadActivity();
  };

  return (
    <div className="space-y-6">
      <AdminSection
        icon={Wallet}
        title="API Credits & Balances"
        description="Live balance snapshot for external AI providers. Click any card to top up."
        action={
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      >
        {loading && providers.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-lg border border-border/60 bg-muted/20 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {providers.map((p) => {
              const meta = STATUS_META[p.status];
              const StatusIcon = meta.icon;
              return (
                <a
                  key={p.id}
                  href={p.topupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handleTopupClick(p)}
                  className="group rounded-lg border border-border/60 bg-card/40 p-4 transition hover:border-primary/60 hover:bg-card/70"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tracking-tight">{p.name}</span>
                      <Badge variant="outline" className={`gap-1 px-1.5 py-0 text-[10px] ${meta.cls}`}>
                        <StatusIcon className="h-3 w-3" />
                        {meta.label}
                      </Badge>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-lg font-semibold leading-tight">
                      {p.balance ?? <span className="text-muted-foreground text-sm">—</span>}
                    </p>
                    {p.detail && <p className="text-[11px] text-muted-foreground line-clamp-2">{p.detail}</p>}
                    {p.error && <p className="text-[11px] text-red-400 line-clamp-2">Error: {p.error}</p>}
                  </div>
                  <div className="mt-3 text-[10px] text-muted-foreground">Top up →</div>
                </a>
              );
            })}
          </div>
        )}
        {fetchedAt && (
          <p className="mt-4 text-[10px] uppercase tracking-wider text-muted-foreground">
            Last refreshed {new Date(fetchedAt).toLocaleString()}
          </p>
        )}
      </AdminSection>

      <AdminSection
        icon={History}
        title="Credit Activity Log"
        description="Top-up attempts and balance changes across providers (most recent 50)."
        action={
          <Button variant="outline" size="sm" onClick={loadActivity} disabled={activityLoading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${activityLoading ? "animate-spin" : ""}`} />
            Reload
          </Button>
        }
      >
        {activityLoading && activity.length === 0 ? (
          <div className="h-40 rounded-lg border border-border/60 bg-muted/20 animate-pulse" />
        ) : activity.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No activity yet. Top-up clicks and balance changes will appear here.
          </p>
        ) : (
          <ScrollArea className="h-[420px] rounded-lg border border-border/60">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background/95 backdrop-blur">
                <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Provider</th>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 font-medium text-right">Before</th>
                  <th className="px-3 py-2 font-medium text-right">After</th>
                  <th className="px-3 py-2 font-medium text-right">Δ</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((r) => {
                  const m = EVENT_META[r.event_type];
                  const delta = r.delta;
                  const positive = delta != null && delta > 0;
                  const negative = delta != null && delta < 0;
                  return (
                    <tr key={r.id} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 font-medium">{r.provider_name}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={`px-1.5 py-0 text-[10px] ${m.cls}`}>{m.label}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.balance_before != null ? r.balance_before.toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.balance_after != null ? r.balance_after.toLocaleString() : "—"}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${positive ? "text-emerald-400" : negative ? "text-red-400" : "text-muted-foreground"}`}>
                        {delta != null ? (
                          <span className="inline-flex items-center gap-0.5">
                            {positive && <TrendingUp className="h-3 w-3" />}
                            {negative && <TrendingDown className="h-3 w-3" />}
                            {delta > 0 ? "+" : ""}{delta.toLocaleString()}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
        )}
      </AdminSection>
    </div>
  );
}
