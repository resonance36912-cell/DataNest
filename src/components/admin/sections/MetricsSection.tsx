/**
 * MetricsSection — admin-only view of per-stage AI generation latency + cost.
 *
 * Reads from `public.generation_metrics`. The RLS policy
 * "Admins can read all metrics" lets admins see every user's rows; non-admins
 * see only their own. Aggregation is done client-side over the most recent
 * 1000 rows, which is plenty for the 7-day rolling window we surface.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2, Clock, DollarSign, AlertTriangle, Activity } from "lucide-react";

type Stage = "storyline" | "scene_image" | "scene_video" | "scene_video_completed";

interface MetricRow {
  id: string;
  stage: Stage;
  provider: string | null;
  model: string | null;
  duration_ms: number | null;
  estimated_cost_usd: number | string | null;
  retries: number;
  status: "success" | "error" | "rate_limited" | "canceled";
  created_at: string;
}

interface StageStats {
  count: number;
  errors: number;
  p50: number;
  p95: number;
  totalCostUsd: number;
}

const STAGE_LABELS: Record<Stage, string> = {
  storyline: "Storyline",
  scene_image: "Scene image",
  scene_video: "Video submit",
  scene_video_completed: "Video end-to-end",
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function MetricsSection() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<MetricRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
        const { data, error } = await supabase
          .from("generation_metrics" as never)
          .select("id, stage, provider, model, duration_ms, estimated_cost_usd, retries, status, created_at")
          .gte("created_at", sevenDaysAgo)
          .order("created_at", { ascending: false })
          .limit(1000);
        if (cancelled) return;
        if (error) throw error;
        setRows((data ?? []) as unknown as MetricRow[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load metrics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const statsByStage = useMemo<Record<Stage, StageStats>>(() => {
    const stages: Stage[] = ["storyline", "scene_image", "scene_video", "scene_video_completed"];
    const out = {} as Record<Stage, StageStats>;
    for (const stage of stages) {
      const stageRows = rows.filter((r) => r.stage === stage);
      const durations = stageRows
        .map((r) => r.duration_ms ?? 0)
        .filter((d) => d > 0)
        .sort((a, b) => a - b);
      const totalCost = stageRows.reduce((sum, r) => {
        const c = typeof r.estimated_cost_usd === "string"
          ? parseFloat(r.estimated_cost_usd)
          : r.estimated_cost_usd ?? 0;
        return sum + (Number.isFinite(c) ? c : 0);
      }, 0);
      out[stage] = {
        count: stageRows.length,
        errors: stageRows.filter((r) => r.status !== "success").length,
        p50: percentile(durations, 50),
        p95: percentile(durations, 95),
        totalCostUsd: totalCost,
      };
    }
    return out;
  }, [rows]);

  const totalCost = useMemo(
    () => Object.values(statsByStage).reduce((sum, s) => sum + s.totalCostUsd, 0),
    [statsByStage],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
        <Loader2 className="size-4 animate-spin" /> Loading metrics…
      </div>
    );
  }
  if (error) {
    return (
      <Card className="p-4 bg-destructive/10 border-destructive/30">
        <p className="text-sm text-destructive">{error}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
            <Activity className="size-3.5" /> Last 7 days
          </div>
          <div className="text-2xl font-semibold mt-1">{rows.length} events</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
            <DollarSign className="size-3.5" /> Est. AI spend
          </div>
          <div className="text-2xl font-semibold mt-1">${totalCost.toFixed(2)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
            <AlertTriangle className="size-3.5" /> Failures
          </div>
          <div className="text-2xl font-semibold mt-1">
            {Object.values(statsByStage).reduce((s, x) => s + x.errors, 0)}
          </div>
        </Card>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Stage</th>
              <th className="py-2 pr-3 font-medium">Events</th>
              <th className="py-2 pr-3 font-medium">p50</th>
              <th className="py-2 pr-3 font-medium">p95</th>
              <th className="py-2 pr-3 font-medium">Errors</th>
              <th className="py-2 pr-3 font-medium">Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(STAGE_LABELS) as Stage[]).map((stage) => {
              const s = statsByStage[stage];
              return (
                <tr key={stage} className="border-b border-border/50">
                  <td className="py-2.5 pr-3 font-medium">{STAGE_LABELS[stage]}</td>
                  <td className="py-2.5 pr-3 tabular-nums">{s.count}</td>
                  <td className="py-2.5 pr-3 tabular-nums">{s.count ? formatMs(s.p50) : "—"}</td>
                  <td className="py-2.5 pr-3 tabular-nums">{s.count ? formatMs(s.p95) : "—"}</td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    {s.errors > 0 ? (
                      <span className="text-destructive">{s.errors}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums">${s.totalCostUsd.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm font-medium mb-3">
          <Clock className="size-4" /> Recent events
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">When</th>
                <th className="py-1.5 pr-3 font-medium">Stage</th>
                <th className="py-1.5 pr-3 font-medium">Model</th>
                <th className="py-1.5 pr-3 font-medium">Status</th>
                <th className="py-1.5 pr-3 font-medium">Latency</th>
                <th className="py-1.5 pr-3 font-medium">Cost</th>
                <th className="py-1.5 pr-3 font-medium">Retries</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 30).map((r) => {
                const cost = typeof r.estimated_cost_usd === "string"
                  ? parseFloat(r.estimated_cost_usd)
                  : r.estimated_cost_usd ?? 0;
                return (
                  <tr key={r.id} className="border-b border-border/30">
                    <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="py-1.5 pr-3">{STAGE_LABELS[r.stage]}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground truncate max-w-[200px]">{r.model || "—"}</td>
                    <td className="py-1.5 pr-3">
                      <span className={r.status === "success" ? "text-success" : r.status === "rate_limited" ? "text-warning" : "text-destructive"}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">{r.duration_ms ? formatMs(r.duration_ms) : "—"}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{cost > 0 ? `$${cost.toFixed(3)}` : "—"}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{r.retries}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default MetricsSection;
