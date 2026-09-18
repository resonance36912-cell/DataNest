import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  CheckCircle2,
  Flag,
  Loader2,
  ShieldCheck,
  Clock,
  Activity,
  RefreshCw,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Defect {
  code?: string;
  severity?: string;
  description?: string;
}
interface QAReport {
  summary?: string;
  defects?: Defect[];
  frames_sampled?: number;
  model?: string;
  [k: string]: unknown;
}

export interface SceneDrawerRow {
  id: string;
  project_id: string;
  scene_number: number;
  tracking_id: string | null;
  video_url: string | null;
  qa_status: string | null;
  qa_report: QAReport | null;
  qa_checked_at: string | null;
  qa_review_status?: string | null;
  qa_review_note?: string | null;
  qa_reviewed_at?: string | null;
  project_title?: string | null;
  merge_status?: string | null;
  merge_error_log?: string | null;
}

interface TimelineEvent {
  id: string;
  kind: string;
  from_value: string | null;
  to_value: string | null;
  source: string | null;
  created_at: string;
  payload: any;
}

function reviewBadge(status?: string | null) {
  switch (status) {
    case "approved":
      return (
        <Badge className="bg-emerald-600/15 text-emerald-400 border-emerald-600/30">
          approved
        </Badge>
      );
    case "flagged":
      return (
        <Badge className="bg-red-600/15 text-red-400 border-red-600/30">
          flagged
        </Badge>
      );
    default:
      return <Badge variant="outline">unreviewed</Badge>;
  }
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

interface Props {
  scene: SceneDrawerRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUpdated?: () => void;
}

export function SceneQualityDrawer({ scene, open, onOpenChange, onUpdated }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState<"approve" | "flag" | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  useEffect(() => {
    setNote(scene?.qa_review_note ?? "");
  }, [scene?.id, scene?.qa_review_note]);

  const loadTimeline = useCallback(async () => {
    if (!scene) return;
    setLoadingTimeline(true);
    try {
      const { data: jobs } = await supabase
        .from("render_jobs")
        .select("id")
        .eq("project_id", scene.project_id)
        .eq("scene_number", scene.scene_number);
      const jobIds = (jobs ?? []).map((j: any) => j.id);
      if (jobIds.length === 0) {
        setEvents([]);
        return;
      }
      const { data: evs, error } = await supabase
        .from("render_job_events")
        .select("id, kind, from_value, to_value, source, created_at, payload")
        .in("render_job_id", jobIds)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      setEvents((evs ?? []) as TimelineEvent[]);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load postprocess timeline", {
        description: (e as Error).message,
      });
    } finally {
      setLoadingTimeline(false);
    }
  }, [scene]);

  useEffect(() => {
    if (open && scene) loadTimeline();
  }, [open, scene, loadTimeline]);

  const loadJobs = useCallback(async () => {
    if (!scene) return;
    setLoadingJobs(true);
    try {
      const { data, error } = await (supabase as any)
        .from("scene_qa_jobs")
        .select("*")
        .eq("scene_id", scene.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setJobs(data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingJobs(false);
    }
  }, [scene]);

  // Initial load + realtime subscription for this scene's jobs.
  useEffect(() => {
    if (!open || !scene) return;
    loadJobs();
    const channel = supabase
      .channel(`scene_qa_jobs:${scene.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "scene_qa_jobs",
          filter: `scene_id=eq.${scene.id}`,
        },
        (payload) => {
          setJobs((prev) => {
            const next = [...prev];
            const row: any = payload.new ?? payload.old;
            if (!row?.id) return prev;
            const idx = next.findIndex((j) => j.id === row.id);
            if (payload.eventType === "DELETE") {
              return idx >= 0 ? next.filter((j) => j.id !== row.id) : prev;
            }
            if (idx >= 0) next[idx] = { ...next[idx], ...payload.new };
            else next.unshift(payload.new as any);
            return next.sort(
              (a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
            );
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, scene, loadJobs]);


  const setReview = useCallback(
    async (status: "approved" | "flagged") => {
      if (!scene) return;
      setSubmitting(status === "approved" ? "approve" : "flag");
      try {
        const { data: auth } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("scenes")
          .update({
            qa_review_status: status,
            qa_review_note: note.trim() || null,
            qa_reviewed_by: auth.user?.id ?? null,
            qa_reviewed_at: new Date().toISOString(),
          } as any)
          .eq("id", scene.id);
        if (error) throw error;
        toast.success(
          status === "approved"
            ? `Scene ${scene.scene_number} approved`
            : `Scene ${scene.scene_number} flagged for review`,
        );
        onUpdated?.();
        onOpenChange(false);
      } catch (e) {
        toast.error("Review update failed", {
          description: (e as Error).message,
        });
      } finally {
        setSubmitting(null);
      }
    },
    [scene, note, onUpdated, onOpenChange],
  );

  const defects = scene?.qa_report?.defects ?? [];
  const critical = useMemo(
    () => defects.filter((d) => d.severity === "critical").length,
    [defects],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-3 border-b border-border/50">
          <SheetTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
            Scene{" "}
            <span className="font-mono">
              {scene?.tracking_id ??
                (scene ? `S${String(scene.scene_number).padStart(2, "0")}` : "")}
            </span>
            <span className="ml-auto">{reviewBadge(scene?.qa_review_status)}</span>
          </SheetTitle>
          <SheetDescription className="truncate">
            {scene?.project_title ?? scene?.project_id}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          {!scene ? (
            <p className="text-sm text-muted-foreground">No scene selected.</p>
          ) : (
            <div className="space-y-6 text-sm">
              {/* QA Report */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
                    QA report
                  </h3>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="capitalize">
                      {scene.qa_status ?? "pending"}
                    </Badge>
                    {critical > 0 && (
                      <span className="inline-flex items-center gap-1 text-red-400">
                        <AlertTriangle className="h-3 w-3" /> {critical} critical
                      </span>
                    )}
                  </div>
                </div>
                {scene.qa_report ? (
                  <div className="space-y-2">
                    {scene.qa_report.summary && (
                      <p className="text-foreground/90">{scene.qa_report.summary}</p>
                    )}
                    {defects.length === 0 ? (
                      <p className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> No defects reported.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {defects.map((d, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <Badge
                              variant="outline"
                              className={
                                d.severity === "critical"
                                  ? "bg-red-600/15 text-red-400 border-red-600/30"
                                  : d.severity === "warning"
                                    ? "bg-amber-600/15 text-amber-400 border-amber-600/30"
                                    : ""
                              }
                            >
                              {d.severity ?? "info"}
                            </Badge>
                            <div className="min-w-0">
                              <div className="font-mono text-xs">
                                {d.code ?? "unknown"}
                              </div>
                              {d.description && (
                                <div className="text-muted-foreground text-xs">
                                  {d.description}
                                </div>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {scene.qa_report.frames_sampled ?? "?"} frames ·{" "}
                      {scene.qa_report.model ?? "model n/a"} ·{" "}
                      {scene.qa_checked_at
                        ? fmtTime(scene.qa_checked_at)
                        : "never checked"}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground italic">
                    No QA report yet. Run QA from the table to generate one.
                  </p>
                )}
              </section>

              <Separator />

              {/* Postprocess timeline */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
                    Postprocess timeline
                  </h3>
                  {loadingTimeline && (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                </div>
                {events.length === 0 && !loadingTimeline ? (
                  <p className="text-muted-foreground italic text-xs">
                    No render events recorded for this scene.
                  </p>
                ) : (
                  <ol className="relative border-l border-border/60 ml-2 space-y-3">
                    {events.map((ev) => (
                      <li key={ev.id} className="pl-4 relative">
                        <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-cyan-500/70" />
                        <div className="flex items-center gap-2 text-xs">
                          <Badge variant="outline" className="capitalize">
                            {ev.kind}
                          </Badge>
                          <span className="text-muted-foreground">
                            {ev.from_value ?? "—"} → {ev.to_value ?? "—"}
                          </span>
                          {ev.source && (
                            <span className="ml-auto text-[10px] uppercase text-muted-foreground/70">
                              {ev.source}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                          <Clock className="h-3 w-3" />
                          {fmtTime(ev.created_at)}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
                {scene.merge_error_log && (
                  <pre className="mt-3 whitespace-pre-wrap rounded bg-background/40 p-2 text-[11px] text-red-400 border border-red-600/20 max-h-40 overflow-auto">
                    {scene.merge_error_log}
                  </pre>
                )}
                {scene.video_url && (
                  <a
                    href={scene.video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block mt-2 text-xs text-cyan-400 hover:underline break-all"
                  >
                    Open rendered video ↗
                  </a>
                )}
              </section>

              <Separator />

              {/* Job history (QA + normalize re-runs) */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5" /> Job history
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{jobs.length} run{jobs.length === 1 ? "" : "s"}</span>
                    <button
                      onClick={loadJobs}
                      className="hover:text-foreground"
                      title="Refresh"
                    >
                      <RefreshCw className={`h-3 w-3 ${loadingJobs ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                </div>
                {jobs.length === 0 && !loadingJobs ? (
                  <p className="text-muted-foreground italic text-xs">
                    No QA or normalize runs yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {jobs.map((j) => {
                      const color =
                        j.status === "succeeded"
                          ? "bg-emerald-600/15 text-emerald-400 border-emerald-600/30"
                          : j.status === "failed"
                            ? "bg-red-600/15 text-red-400 border-red-600/30"
                            : j.status === "running"
                              ? "bg-cyan-600/15 text-cyan-400 border-cyan-600/30"
                              : j.status === "fallback"
                                ? "bg-amber-600/15 text-amber-400 border-amber-600/30"
                                : "";
                      const dur =
                        j.finished_at && j.started_at
                          ? `${Math.max(0, Math.round((new Date(j.finished_at).getTime() - new Date(j.started_at).getTime()) / 100) / 10)}s`
                          : null;
                      return (
                        <li
                          key={j.id}
                          className="rounded border border-border/40 bg-background/30 px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="capitalize">{j.kind}</Badge>
                            <Badge variant="outline" className={color}>{j.status}</Badge>
                            <span className="text-muted-foreground">
                              attempt #{j.attempt}
                            </span>
                            <span className="ml-auto text-muted-foreground text-[11px]">
                              {fmtTime(j.created_at)}{dur ? ` · ${dur}` : ""}
                            </span>
                          </div>
                          {j.status === "running" && (
                            <Progress value={j.progress ?? 0} className="h-1 mt-2" />
                          )}
                          {j.error && (
                            <pre className="mt-1.5 whitespace-pre-wrap text-[11px] text-red-400 max-h-24 overflow-auto">
                              {j.error}
                            </pre>
                          )}
                          {j.output?.video_url && (
                            <a
                              href={j.output.video_url}
                              target="_blank"
                              rel="noreferrer"
                              className="block mt-1 text-cyan-400 hover:underline break-all"
                            >
                              Output ↗
                            </a>
                          )}
                          {j.output?.qa_status && (
                            <div className="text-muted-foreground mt-1">
                              QA result: {j.output.qa_status}
                              {typeof j.output.defects === "number"
                                ? ` · ${j.output.defects} defect${j.output.defects === 1 ? "" : "s"}`
                                : ""}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <Separator />

              {/* Review */}
              <section>
                <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  Reviewer decision
                </h3>
                {scene.qa_reviewed_at && (
                  <p className="text-xs text-muted-foreground mb-2">
                    Last reviewed {fmtTime(scene.qa_reviewed_at)} ·{" "}
                    {scene.qa_review_status ?? "unreviewed"}
                  </p>
                )}
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note (visible to other admins)…"
                  className="text-xs min-h-[80px]"
                />
              </section>
            </div>
          )}
        </ScrollArea>

        <div className="border-t border-border/50 px-6 py-3 flex items-center gap-2 justify-end bg-background/60">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={!!submitting}
          >
            Close
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-red-600/40 text-red-400 hover:bg-red-600/10 hover:text-red-300"
            onClick={() => setReview("flagged")}
            disabled={!scene || !!submitting}
          >
            {submitting === "flag" ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Flag className="h-3.5 w-3.5 mr-1" />
            )}
            Flag
          </Button>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500"
            onClick={() => setReview("approved")}
            disabled={!scene || !!submitting}
          >
            {submitting === "approve" ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            )}
            Approve
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
