import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Wallet,
  Clock,
  TrendingDown,
  Zap,
  BarChart3,
  CheckCircle2,
  XCircle,
  Monitor,
  CalendarDays,
  Music,
  Receipt,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Provider cost rates in GBP per job — WAN 2.5 only
const PROVIDER_COSTS: Record<string, number> = {
  "fal-kling": 0.03,
  "fal-ai/wan-25-preview": 0.04,
};

const getProviderCost = (provider: string): number => {
  const key = provider.toLowerCase();
  return PROVIDER_COSTS[key] || 0.04;
};

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);
  if (hours > 0) return secs > 0 ? `${hours}h ${mins}m ${secs}s` : mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
};

// Credits are unitless — no currency conversion needed

interface ProviderStats {
  provider: string;
  count: number;
  succeeded: number;
  failed: number;
  avgDuration: number;
  totalCost: number;
}

interface CreditData {
  balance: number;
  totalSpent: number;
  totalToppedUp: number;
}

interface PeriodStats {
  jobs: number;
  succeeded: number;
  failed: number;
  cost: number;
  timeSec: number;
}

function computePeriodStats(
  jobs: Array<{ provider: string; status: string; createdAt: string; updatedAt: string; costGbp: number | null; durationSec: number | null }>,
  cutoff: Date
): PeriodStats {
  const filtered = jobs.filter(j => new Date(j.createdAt) >= cutoff);
  let succeeded = 0, failed = 0, timeSec = 0, cost = 0;
  for (const j of filtered) {
    if (j.status === "succeeded" || j.status === "completed") {
      succeeded++;
      const dur = j.durationSec ?? ((new Date(j.updatedAt).getTime() - new Date(j.createdAt).getTime()) / 1000);
      if (dur > 0 && dur < 3600) timeSec += dur;
      cost += j.costGbp ?? getProviderCost(j.provider);
    } else if (j.status === "failed") {
      failed++;
    }
  }
  return { jobs: filtered.length, succeeded, failed, cost, timeSec };
}

function InvoiceHistory({
  topups,
  totals,
  currencySymbol,
  initialShow,
}: {
  topups: Array<{ amount: number; currency: string; description: string | null; paid_at: string }>;
  totals: Record<string, number>;
  currencySymbol: (c: string) => string;
  initialShow: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? topups : topups.slice(0, initialShow);
  const hasMore = topups.length > initialShow;

  // Group by provider/description
  const providerGroups = (() => {
    const map = new Map<string, { count: number; totals: Record<string, number> }>();
    for (const t of topups) {
      const key = t.description || "Other";
      if (!map.has(key)) map.set(key, { count: 0, totals: {} });
      const g = map.get(key)!;
      g.count++;
      g.totals[t.currency] = (g.totals[t.currency] || 0) + t.amount;
    }
    return Array.from(map.entries())
      .sort((a, b) => {
        const aTotal = Object.values(a[1].totals).reduce((s, v) => s + v, 0);
        const bTotal = Object.values(b[1].totals).reduce((s, v) => s + v, 0);
        return bTotal - aTotal;
      });
  })();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <Receipt className="h-4 w-4 text-primary" />
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Top-Up History
        </h3>
        <span className="text-[10px] text-muted-foreground ml-auto">{topups.length} invoices</span>
      </div>

      {/* Provider summary cards */}
      {providerGroups.length > 1 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {providerGroups.map(([desc, g]) => (
            <div key={desc} className="rounded-lg border border-border/40 bg-card/30 p-2.5 space-y-0.5">
              <p className="text-[10px] font-medium text-muted-foreground truncate" title={desc}>{desc}</p>
              <div className="flex flex-col">
                {Object.entries(g.totals).map(([cur, amt]) => (
                  <span key={cur} className="text-sm font-bold text-foreground">{currencySymbol(cur)}{amt.toFixed(2)}</span>
                ))}
              </div>
              <p className="text-[9px] text-muted-foreground">{g.count} invoice{g.count !== 1 ? "s" : ""}</p>
            </div>
          ))}
        </div>
      )}

      {/* Individual invoices */}
      <div className="space-y-1.5">
        {visible.map((t, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-md border border-border/30 bg-card/30 px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Wallet className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate text-muted-foreground">
                {t.description || "Invoice"}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-muted-foreground">
                {new Date(t.paid_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
              <span className="font-semibold text-foreground min-w-[70px] text-right">
                {currencySymbol(t.currency)}{t.amount.toFixed(2)}
              </span>
            </div>
          </div>
        ))}

        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-center gap-1 w-full rounded-md border border-border/30 bg-card/30 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Show less" : `Show all ${topups.length} invoices`}
          </button>
        )}

        {Object.entries(totals).map(([currency, total]) => (
          <div key={currency} className="flex justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-semibold">
            <span>Total ({currency})</span>
            <span>{currencySymbol(currency)}{total.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CreditEstimatorWidget() {
  const { user } = useAuth();
  const [credits, setCredits] = useState<CreditData>({ balance: 0, totalSpent: 0, totalToppedUp: 0 });
  const [providerStats, setProviderStats] = useState<ProviderStats[]>([]);
  const [dailyRate, setDailyRate] = useState(0);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [screentime, setScreentime] = useState<{ totalSec: number; sceneCount: number; projectCount: number }>({ totalSec: 0, sceneCount: 0, projectCount: 0 });
  const [allJobs, setAllJobs] = useState<Array<{ provider: string; status: string; createdAt: string; updatedAt: string; projectId: string | null; costGbp: number | null; durationSec: number | null }>>([]);
  const [projectNames, setProjectNames] = useState<Map<string, string>>(new Map());
  const [topups, setTopups] = useState<Array<{ amount: number; currency: string; description: string | null; paid_at: string }>>([]);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Load credits
      const { data: creditData } = await supabase
        .from("user_credits")
        .select("balance, total_spent, total_topped_up")
        .eq("user_id", user.id)
        .single();

      if (creditData) {
        setCredits({
          balance: creditData.balance,
          totalSpent: creditData.total_spent,
          totalToppedUp: creditData.total_topped_up,
        });
      }

      // Load job stats, lipsync jobs, and scenes
      const [genRes, renderRes, lipsyncRes, scenesRes, projectsRes, topupsRes] = await Promise.all([
        supabase
          .from("generation_jobs")
          .select("provider_name, status, created_at, updated_at, project_id, estimated_cost_gbp, actual_duration_seconds")
          .eq("user_id", user.id),
        supabase
          .from("render_jobs")
          .select("provider, status, created_at, updated_at, project_id, estimated_cost_gbp, actual_duration_seconds")
          .eq("user_id", user.id),
        supabase
          .from("lipsync_jobs")
          .select("provider, status, created_at, updated_at, project_id, estimated_cost_gbp, actual_duration_seconds")
          .eq("user_id", user.id),
        supabase
          .from("scenes")
          .select("project_id, time_start, time_end, video_url")
          .eq("user_id", user.id),
        supabase
          .from("projects")
          .select("id, name")
          .eq("user_id", user.id),
        supabase
          .from("credit_topups")
          .select("amount, currency, description, paid_at")
          .eq("user_id", user.id)
          .order("paid_at", { ascending: false }),
      ]);

      setTopups(topupsRes.data || []);

      // Build project name map
      const projectNameMap = new Map<string, string>();
      for (const p of projectsRes.data || []) {
        projectNameMap.set(p.id, p.name);
      }

      // Unify all jobs for period stats with real cost/duration data
      const unified = [
        ...(genRes.data || []).map(j => ({ provider: j.provider_name, status: j.status, createdAt: j.created_at, updatedAt: j.updated_at, projectId: j.project_id, costGbp: j.estimated_cost_gbp, durationSec: j.actual_duration_seconds })),
        ...(renderRes.data || []).map(j => ({ provider: j.provider, status: j.status, createdAt: j.created_at, updatedAt: j.updated_at, projectId: j.project_id, costGbp: j.estimated_cost_gbp, durationSec: j.actual_duration_seconds })),
        ...(lipsyncRes.data || []).map(j => ({ provider: j.provider, status: j.status, createdAt: j.created_at, updatedAt: j.updated_at, projectId: j.project_id, costGbp: j.estimated_cost_gbp, durationSec: j.actual_duration_seconds })),
      ];
      setAllJobs(unified);
      setProjectNames(projectNameMap);

      // Calculate screentime from scenes
      const sceneRows = scenesRes.data || [];
      let totalVideoSec = 0;
      const projectIds = new Set<string>();
      const timeToSec = (t: string | null): number => {
        if (!t) return 0;
        const parts = t.split(":").map(Number);
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        return 0;
      };
      for (const s of sceneRows) {
        if (s.video_url) {
          projectIds.add(s.project_id);
          const dur = timeToSec(s.time_end) - timeToSec(s.time_start);
          if (dur > 0) totalVideoSec += dur;
        }
      }
      setScreentime({ totalSec: totalVideoSec, sceneCount: sceneRows.filter(s => s.video_url).length, projectCount: projectIds.size });

      // Build unified stats
      const statsMap = new Map<string, { durations: number[]; succeeded: number; failed: number; total: number; costs: number[] }>();

      const addJob = (provider: string, status: string, createdAt: string, updatedAt: string, costGbp: number | null, durationSec: number | null) => {
        const key = provider;
        if (!statsMap.has(key)) statsMap.set(key, { durations: [], succeeded: 0, failed: 0, total: 0, costs: [] });
        const s = statsMap.get(key)!;
        s.total++;
        if (status === "succeeded" || status === "completed") {
          s.succeeded++;
          const dur = durationSec ?? ((new Date(updatedAt).getTime() - new Date(createdAt).getTime()) / 1000);
          if (dur > 0 && dur < 3600) s.durations.push(dur);
          s.costs.push(costGbp ?? getProviderCost(provider));
        } else if (status === "failed") {
          s.failed++;
        }
      };

      (genRes.data || []).forEach((j) => addJob(j.provider_name, j.status, j.created_at, j.updated_at, j.estimated_cost_gbp, j.actual_duration_seconds));
      (renderRes.data || []).forEach((j) => addJob(j.provider, j.status, j.created_at, j.updated_at, j.estimated_cost_gbp, j.actual_duration_seconds));
      (lipsyncRes.data || []).forEach((j) => addJob(j.provider, j.status, j.created_at, j.updated_at, j.estimated_cost_gbp, j.actual_duration_seconds));

      const stats: ProviderStats[] = Array.from(statsMap.entries())
        .map(([provider, s]) => ({
          provider,
          count: s.total,
          succeeded: s.succeeded,
          failed: s.failed,
          avgDuration: s.durations.length > 0 ? s.durations.reduce((a, b) => a + b, 0) / s.durations.length : 0,
          totalCost: s.costs.reduce((a, b) => a + b, 0),
        }))
        .sort((a, b) => b.count - a.count);

      setProviderStats(stats);

      // Calculate daily spend rate (jobs in last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const recentJobs = [
        ...(genRes.data || []).filter((j) => j.created_at >= sevenDaysAgo && (j.status === "succeeded" || j.status === "completed")),
        ...(renderRes.data || []).filter((j) => j.created_at >= sevenDaysAgo && (j.status === "succeeded" || j.status === "completed")),
        ...(lipsyncRes.data || []).filter((j) => j.created_at >= sevenDaysAgo && (j.status === "succeeded" || j.status === "completed")),
      ];

      const recentCost = recentJobs.reduce((sum, j) => {
        return sum + ((j as any).estimated_cost_gbp ?? getProviderCost((j as any).provider_name || (j as any).provider || "fal"));
      }, 0);

      const rate = recentCost / 7;
      setDailyRate(rate);

      if (creditData && rate > 0) {
        setDaysRemaining(Math.floor(creditData.balance / rate));
      }
    } catch (err) {
      console.error("Failed to load estimator data:", err);
    } finally {
      setLoading(false);
    }
  };

  const totalJobs = providerStats.reduce((s, p) => s + p.count, 0);
  const totalSucceeded = providerStats.reduce((s, p) => s + p.succeeded, 0);
  const totalEstCost = providerStats.reduce((s, p) => s + p.totalCost, 0);
  const successRate = totalJobs > 0 ? Math.round((totalSucceeded / totalJobs) * 100) : 0;

  // Period cutoffs
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const hourly = computePeriodStats(allJobs, hourAgo);
  const daily = computePeriodStats(allJobs, dayAgo);
  const weekly = computePeriodStats(allJobs, weekAgo);

  // Per-project breakdown
  const projectBreakdown = (() => {
    const map = new Map<string, { hourly: PeriodStats; daily: PeriodStats; weekly: PeriodStats }>();
    const projectIds = new Set(allJobs.map(j => j.projectId).filter(Boolean) as string[]);
    for (const pid of projectIds) {
      const pJobs = allJobs.filter(j => j.projectId === pid);
      map.set(pid, {
        hourly: computePeriodStats(pJobs, hourAgo),
        daily: computePeriodStats(pJobs, dayAgo),
        weekly: computePeriodStats(pJobs, weekAgo),
      });
    }
    return Array.from(map.entries())
      .map(([pid, stats]) => ({ id: pid, name: projectNames.get(pid) || pid.slice(0, 8), ...stats }))
      .filter(p => p.hourly.jobs > 0 || p.daily.jobs > 0 || p.weekly.jobs > 0)
      .sort((a, b) => b.weekly.cost - a.weekly.cost);
  })();

  if (loading) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Job Estimator</h2>
        </div>
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  const PeriodCard = ({ label, stats: ps }: { label: string; stats: PeriodStats }) => (
    <div className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[10px] text-muted-foreground">Credits</p>
          <p className="text-sm font-bold text-foreground">{ps.cost.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Time</p>
          <p className="text-sm font-bold text-foreground">{ps.timeSec > 0 ? formatDuration(ps.timeSec) : "—"}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Jobs</p>
          <p className="text-sm font-bold text-foreground">
            {ps.succeeded}
            {ps.failed > 0 && <span className="text-destructive text-[10px] ml-0.5">/{ps.failed}✗</span>}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="glass-card p-6 space-y-5"
    >
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Job Estimator & Credits</h2>
      </div>

      {/* Top stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Balance */}
        <div className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" /> Balance
          </div>
          <p className="text-xl font-bold text-foreground">
            {credits.balance.toFixed(2)}
          </p>
          <p className="text-[10px] text-muted-foreground">credits</p>
        </div>

        {/* Total Spent (actual from DB) */}
        <div className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendingDown className="h-3.5 w-3.5" /> Total Spent
          </div>
          <p className="text-xl font-bold text-foreground">
            {(credits.totalSpent > 0 ? credits.totalSpent : totalEstCost).toFixed(2)}
          </p>
          <p className="text-[10px] text-muted-foreground">credits</p>
        </div>

        {/* Success Rate */}
        <div className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Zap className="h-3.5 w-3.5" /> Success Rate
          </div>
          <p className="text-xl font-bold text-foreground">
            {successRate}%
          </p>
        </div>

        {/* Depletion Forecast */}
        <div className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Forecast
          </div>
          <p className="text-xl font-bold text-foreground">
            {daysRemaining !== null && daysRemaining > 0
              ? `${daysRemaining}d`
              : dailyRate > 0
              ? "< 1d"
              : "—"}
          </p>
          {dailyRate > 0 && (
            <p className="text-[10px] text-muted-foreground">
              ~{dailyRate.toFixed(2)} credits/day
            </p>
          )}
        </div>

        {/* Screentime */}
        <div className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Monitor className="h-3.5 w-3.5" /> Screentime
          </div>
          <p className="text-xl font-bold text-foreground">
            {screentime.totalSec > 0 ? formatDuration(screentime.totalSec) : "—"}
          </p>
          {screentime.sceneCount > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {screentime.sceneCount} clip{screentime.sceneCount !== 1 ? "s" : ""} · {screentime.projectCount} project{screentime.projectCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      {/* Activity breakdown by period */}
      {totalJobs > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Activity Breakdown
            </h3>
          </div>
          <Tabs defaultValue="daily" className="w-full">
            <TabsList className="h-8 bg-secondary/50">
              <TabsTrigger value="hourly" className="text-xs px-3 h-6">Last Hour</TabsTrigger>
              <TabsTrigger value="daily" className="text-xs px-3 h-6">Last 24h</TabsTrigger>
              <TabsTrigger value="weekly" className="text-xs px-3 h-6">Last 7 Days</TabsTrigger>
            </TabsList>
            <TabsContent value="hourly" className="mt-2">
              <PeriodCard label="Past Hour" stats={hourly} />
            </TabsContent>
            <TabsContent value="daily" className="mt-2">
              <PeriodCard label="Past 24 Hours" stats={daily} />
            </TabsContent>
            <TabsContent value="weekly" className="mt-2">
              <PeriodCard label="Past 7 Days" stats={weekly} />
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Per-project breakdown */}
      {projectBreakdown.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Music className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Per Project Spend
            </h3>
          </div>
          <div className="space-y-2">
            {projectBreakdown.map((proj) => (
              <div key={proj.id} className="rounded-lg border border-border/40 bg-card/30 p-3 space-y-2">
                <p className="text-sm font-semibold text-foreground truncate">{proj.name}</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Hour</p>
                    <p className="text-xs font-bold text-foreground">
                      {proj.hourly.cost.toFixed(2)}
                      {proj.hourly.timeSec > 0 && <span className="block text-[10px] text-muted-foreground font-normal">{formatDuration(proj.hourly.timeSec)}</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Day</p>
                    <p className="text-xs font-bold text-foreground">
                      {proj.daily.cost.toFixed(2)}
                      {proj.daily.timeSec > 0 && <span className="block text-[10px] text-muted-foreground font-normal">{formatDuration(proj.daily.timeSec)}</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Week</p>
                    <p className="text-xs font-bold text-foreground">
                      {proj.weekly.cost.toFixed(2)}
                      {proj.weekly.timeSec > 0 && <span className="block text-[10px] text-muted-foreground font-normal">{formatDuration(proj.weekly.timeSec)}</span>}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Provider breakdown */}
      {providerStats.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Provider Breakdown
          </h3>
          <div className="space-y-1.5">
            {providerStats.map((ps) => (
              <div
                key={ps.provider}
                className="flex items-center justify-between rounded-md border border-border/30 bg-card/30 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{ps.provider}</span>
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3 text-primary" />
                    {ps.succeeded}
                    {ps.failed > 0 && (
                      <>
                        <XCircle className="h-3 w-3 text-destructive ml-1" />
                        {ps.failed}
                      </>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                  {ps.avgDuration > 0 && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(ps.avgDuration)}
                    </span>
                  )}
                  <span className="font-medium text-foreground">
                    ~{getProviderCost(ps.provider).toFixed(2)} credits/job
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoice History */}
      {topups.length > 0 && (() => {
        const INITIAL_SHOW = 5;
        const currencySymbol = (_c: string) => "";
        // Group totals by currency
        const totals = topups.reduce<Record<string, number>>((acc, t) => {
          if (t.amount > 0) acc[t.currency] = (acc[t.currency] || 0) + t.amount;
          return acc;
        }, {});

        return (
          <InvoiceHistory
            topups={topups}
            totals={totals}
            currencySymbol={currencySymbol}
            initialShow={INITIAL_SHOW}
          />
        );
      })()}

      {totalJobs === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No jobs yet — estimates will appear after your first generation.
        </p>
      )}
    </motion.div>
  );
}
