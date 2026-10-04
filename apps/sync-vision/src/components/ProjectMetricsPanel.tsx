/**
 * ProjectMetricsPanel — compact per-project latency + spend summary.
 *
 * Reads `generation_metrics` filtered by `project_id` (RLS guarantees
 * the user only sees their own rows). Shows average latency per stage
 * and total estimated AI cost for the project.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles } from "lucide-react";

interface Props {
  projectId: string;
}

interface Row {
  stage: "storyline" | "scene_image" | "scene_video" | "scene_video_completed";
  duration_ms: number | null;
  estimated_cost_usd: number | string | null;
  status: string;
}

const LABELS: Record<Row["stage"], string> = {
  storyline: "Storyline",
  scene_image: "Image",
  scene_video: "Video submit",
  scene_video_completed: "Video render",
};

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function ProjectMetricsPanel({ projectId }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("generation_metrics" as never)
        .select("stage, duration_ms, estimated_cost_usd, status")
        .eq("project_id", projectId)
        .limit(500);
      if (cancelled) return;
      setRows((data ?? []) as unknown as Row[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const summary = useMemo(() => {
    const stages: Row["stage"][] = ["storyline", "scene_image", "scene_video", "scene_video_completed"];
    const perStage = stages.map((stage) => {
      const sr = rows.filter((r) => r.stage === stage && r.duration_ms);
      const avg = sr.length ? sr.reduce((s, r) => s + (r.duration_ms || 0), 0) / sr.length : 0;
      return { stage, label: LABELS[stage], count: sr.length, avgMs: avg };
    }).filter((s) => s.count > 0);
    const totalCost = rows.reduce((sum, r) => {
      const c = typeof r.estimated_cost_usd === "string" ? parseFloat(r.estimated_cost_usd) : r.estimated_cost_usd ?? 0;
      return sum + (Number.isFinite(c) ? c : 0);
    }, 0);
    const errors = rows.filter((r) => r.status !== "success").length;
    return { perStage, totalCost, errors, total: rows.length };
  }, [rows]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Loading metrics…
      </div>
    );
  }

  if (summary.total === 0) {
    return (
      <p className="text-xs text-muted-foreground">No generation activity recorded yet.</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Sparkles className="size-3" /> Generation metrics
      </div>
      <div className="flex flex-wrap gap-2">
        {summary.perStage.map((s) => (
          <div key={s.stage} className="text-xs px-2 py-1 rounded-md bg-muted/50">
            <span className="text-muted-foreground">{s.label}: </span>
            <span className="font-medium tabular-nums">{formatMs(s.avgMs)}</span>
            <span className="text-muted-foreground"> avg ({s.count})</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 text-xs">
        <span>
          <span className="text-muted-foreground">Est. spend: </span>
          <span className="font-medium tabular-nums">${summary.totalCost.toFixed(2)}</span>
        </span>
        {summary.errors > 0 && (
          <span className="text-destructive">{summary.errors} error{summary.errors === 1 ? "" : "s"}</span>
        )}
      </div>
    </div>
  );
}

export default ProjectMetricsPanel;
