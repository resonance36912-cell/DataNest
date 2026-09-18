/**
 * JobDetailsDrawer — Inspect a long-running job (merge/render/lipsync/generation).
 *
 * Polls `job-status` (with `includeResults` for merge to load render_segments)
 * and renders normalized status, phase, progress, timestamps, error/code, and
 * a per-segment table when applicable. Also exposes "Force refresh" which
 * triggers `forceProviderPoll()` to re-poll fal.ai immediately.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Activity, AlertCircle, CheckCircle2, Clock, Loader2,
  RefreshCw, AlertTriangle, ExternalLink, Hash, Download, RotateCcw, Copy, ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useJobStatus, type JobKind, type JobSegment } from "@/hooks/useJobStatus";

interface JobDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: JobKind;
  jobId: string | null;
  title?: string;
}

const STATUS_VARIANT: Record<string, { label: string; className: string; icon: typeof Activity }> = {
  queued:     { label: "Queued",     className: "bg-muted text-muted-foreground",     icon: Clock },
  processing: { label: "Processing", className: "bg-cyan-500/15 text-cyan-400",       icon: Loader2 },
  succeeded:  { label: "Succeeded",  className: "bg-emerald-500/15 text-emerald-400", icon: CheckCircle2 },
  failed:     { label: "Failed",     className: "bg-destructive/15 text-destructive", icon: AlertCircle },
  idle:       { label: "Idle",       className: "bg-muted text-muted-foreground",     icon: Clock },
};

const SEGMENT_STATUS_COLOR: Record<string, string> = {
  pending:   "text-muted-foreground",
  queued:    "text-muted-foreground",
  retrying:  "text-amber-500",
  processing:"text-cyan-400",
  completed: "text-emerald-500",
  succeeded: "text-emerald-500",
  failed:    "text-destructive",
};

function fmtTs(ts?: string | null) {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

function fmtDur(start?: string | null, end?: string | null) {
  if (!start) return "—";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const sec = Math.max(0, Math.round((e - s) / 1000));
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export default function JobDetailsDrawer({
  open, onOpenChange, kind, jobId, title,
}: JobDetailsDrawerProps) {
  const includeResults = kind === "merge";
  const { data, status, progress, error, isTerminal, forceProviderPoll } = useJobStatus({
    kind,
    jobId,
    enabled: open && !!jobId,
    includeResults,
    pollMs: 3000,
  });

  const variant = STATUS_VARIANT[status] || STATUS_VARIANT.idle;
  const StatusIcon = variant.icon;

  const segments: JobSegment[] = useMemo(() => {
    const raw = (data as any)?.segments || (data?.raw as any)?.segments;
    return Array.isArray(raw) ? raw : [];
  }, [data]);

  const failedSegments = segments.filter(s => /fail/i.test(s.status));

  // Filter + sort controls for the segments table.
  type SegmentFilter = "all" | "failed" | "completed" | "in-flight";
  type SegmentSortKey = "segment_index" | "scene_number" | "status" | "retry_count" | "duration";
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("all");
  const [sortKey, setSortKey] = useState<SegmentSortKey>("segment_index");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const visibleSegments = useMemo(() => {
    const matchesFilter = (s: JobSegment) => {
      switch (segmentFilter) {
        case "failed":     return /fail/i.test(s.status);
        case "completed":  return /complete|succeed/i.test(s.status);
        case "in-flight":  return /process|retry|queue|pending/i.test(s.status);
        default:           return true;
      }
    };
    const durationOf = (s: JobSegment) => {
      if (!s.started_at) return -1;
      const start = new Date(s.started_at).getTime();
      const end = s.completed_at ? new Date(s.completed_at).getTime() : Date.now();
      return Math.max(0, end - start);
    };
    const valueOf = (s: JobSegment): number | string => {
      switch (sortKey) {
        case "scene_number": return s.scene_number ?? -1;
        case "status":       return s.status ?? "";
        case "retry_count":  return s.retry_count ?? 0;
        case "duration":     return durationOf(s);
        default:             return s.segment_index ?? 0;
      }
    };
    const filtered = segments.filter(matchesFilter);
    const sorted = [...filtered].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [segments, segmentFilter, sortKey, sortDir]);

  const toggleSort = (key: SegmentSortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "status" ? "asc" : "asc");
    }
  };

  const sortIndicator = (key: SegmentSortKey) =>
    sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : "";

  const finalUrl = data?.output?.finalUrl || (data?.raw as any)?.final_url || null;
  const videoUrl = data?.output?.videoUrl || (data?.raw as any)?.videoUrl || null;
  const billing = data?.code === "FAL_BILLING_EXHAUSTED";

  const handleExportJson = () => {
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      kind,
      jobId,
      status,
      phase: data?.phase ?? null,
      progress,
      isTerminal,
      createdAt: data?.createdAt ?? null,
      updatedAt: data?.updatedAt ?? null,
      elapsed: fmtDur(data?.createdAt, isTerminal ? data?.updatedAt : null),
      error: error ?? null,
      errorCode: data?.code ?? null,
      output: { finalUrl, videoUrl, ...(data?.output || {}) },
      segments,
      failedSegments,
      raw: data?.raw ?? null,
    };
    try {
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.href = url;
      a.download = `${kind}-job-${(jobId ?? "unknown").slice(0, 8)}-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Job details exported");
    } catch (err) {
      console.error("[JobDetailsDrawer] export failed", err);
      toast.error("Failed to export job details");
    }
  };

  // Fetch project_id once per job (needed for the trigger_segment_retry RPC).
  const [projectId, setProjectId] = useState<string | null>(null);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!open || !jobId || kind !== "merge") {
      setProjectId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: row, error: err } = await supabase
        .from("render_jobs")
        .select("project_id")
        .eq("id", jobId)
        .maybeSingle();
      if (cancelled) return;
      if (err) {
        console.warn("[JobDetailsDrawer] failed to load project_id", err);
        return;
      }
      setProjectId((row as any)?.project_id ?? null);
    })();
    return () => { cancelled = true; };
  }, [open, jobId, kind]);

  const handleRetrySegment = async (segment: JobSegment) => {
    if (!jobId) return;
    if (!projectId) {
      toast.error("Project context unavailable — reopen this drawer and try again.");
      return;
    }
    if (retryingIds.has(segment.id)) return;
    setRetryingIds(prev => {
      const next = new Set(prev);
      next.add(segment.id);
      return next;
    });
    try {
      const { error: rpcError } = await supabase.rpc("trigger_segment_retry", {
        p_project_id: projectId,
        p_job_id: jobId,
        p_segment_id: segment.id,
      });
      if (rpcError) throw rpcError;
      toast.success(
        `Segment ${segment.segment_index} queued for retry (attempt ${(segment.retry_count ?? 0) + 1})`,
      );
      // Re-poll provider so the UI reflects the new retrying state quickly.
      forceProviderPoll();
    } catch (err: any) {
      console.error("[JobDetailsDrawer] retry segment failed", err);
      toast.error(err?.message || "Failed to retry segment");
    } finally {
      setRetryingIds(prev => {
        const next = new Set(prev);
        next.delete(segment.id);
        return next;
      });
    }
  };

  const canRetrySegment = (seg: JobSegment) =>
    /fail|complete|succeed/i.test(seg.status);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col">
        <SheetHeader className="space-y-1.5">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            {title || `${kind[0].toUpperCase()}${kind.slice(1)} job details`}
          </SheetTitle>
          <SheetDescription className="font-mono text-[10px] flex items-center gap-1 flex-wrap">
            <Hash className="h-2.5 w-2.5" />
            <span className="truncate max-w-[180px]" title={jobId || ""}>{jobId || "—"}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-5 px-1.5 gap-1 text-[10px]"
              disabled={!jobId}
              onClick={() => {
                if (!jobId) return;
                navigator.clipboard?.writeText(jobId).then(
                  () => toast.success("Job ID copied"),
                  () => toast.error("Couldn't copy job ID"),
                );
              }}
            >
              <Copy className="h-2.5 w-2.5" />
              Copy ID
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-5 px-1.5 gap-1 text-[10px]"
              disabled={!error && !data?.code && failedSegments.length === 0}
              onClick={() => {
                const lines = [
                  `Job: ${kind} ${jobId ?? "—"}`,
                  `Status: ${status}${data?.phase ? ` (${data.phase})` : ""}`,
                  data?.code ? `Code: ${data.code}` : null,
                  error ? `Error: ${error}` : null,
                  data?.createdAt ? `Created: ${data.createdAt}` : null,
                  data?.updatedAt ? `Updated: ${data.updatedAt}` : null,
                  failedSegments.length
                    ? `Failed segments (${failedSegments.length}):\n` +
                      failedSegments
                        .map(
                          s =>
                            `  - #${s.segment_index} S${String(s.scene_number ?? "—").padStart(2, "0")} ` +
                            `(retry ${s.retry_count ?? 0}): ${s.error_message || "no message"}`,
                        )
                        .join("\n")
                    : null,
                ].filter(Boolean).join("\n");
                if (!lines) {
                  toast.info("No errors to copy");
                  return;
                }
                navigator.clipboard?.writeText(lines).then(
                  () => toast.success("Error summary copied"),
                  () => toast.error("Couldn't copy error summary"),
                );
              }}
            >
              <Copy className="h-2.5 w-2.5" />
              Copy error summary
            </Button>
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 py-4">
            {/* Status row */}
            <div className="flex items-center gap-2">
              <Badge className={`${variant.className} gap-1 text-[11px]`}>
                <StatusIcon className={`h-3 w-3 ${status === "processing" ? "animate-spin" : ""}`} />
                {variant.label}
              </Badge>
              {data?.phase && (
                <Badge variant="outline" className="text-[10px] font-mono">
                  {data.phase}
                </Badge>
              )}
              {billing && (
                <Badge className="bg-amber-500/15 text-amber-500 text-[10px]">
                  FAL_BILLING_EXHAUSTED
                </Badge>
              )}
              <Button
                size="sm" variant="ghost"
                className="ml-auto h-7 gap-1 text-[11px]"
                onClick={() => forceProviderPoll()}
                disabled={!jobId || isTerminal}
              >
                <RefreshCw className="h-3 w-3" />
                Force refresh
              </Button>
              <Button
                size="sm" variant="ghost"
                className="h-7 gap-1 text-[11px]"
                onClick={handleExportJson}
                disabled={!jobId}
                title="Download status, timestamps, segments, and errors as JSON"
              >
                <Download className="h-3 w-3" />
                Export JSON
              </Button>
            </div>

            {/* Progress */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Progress</span>
                <span className="font-mono">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>

            {/* Error block */}
            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-[11px] space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Error
                </div>
                <p className="text-muted-foreground break-words">{error}</p>
                {billing && (
                  <Button
                    size="sm"
                    className="mt-1 h-7 gap-1 text-[11px] bg-amber-500 text-amber-950 hover:bg-amber-500/90"
                    onClick={() => window.open("https://fal.ai/dashboard/billing", "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Top up fal.ai
                  </Button>
                )}
              </div>
            )}

            <Separator />

            {/* Metadata */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
              <dt className="text-muted-foreground">Kind</dt>
              <dd className="font-mono">{kind}</dd>

              <dt className="text-muted-foreground">Created</dt>
              <dd className="font-mono">{fmtTs(data?.createdAt)}</dd>

              <dt className="text-muted-foreground">Updated</dt>
              <dd className="font-mono">{fmtTs(data?.updatedAt)}</dd>

              <dt className="text-muted-foreground">Elapsed</dt>
              <dd className="font-mono">{fmtDur(data?.createdAt, isTerminal ? data?.updatedAt : null)}</dd>

              {finalUrl && (<>
                <dt className="text-muted-foreground">Final video</dt>
                <dd>
                  <a href={finalUrl} target="_blank" rel="noopener noreferrer"
                     className="text-primary hover:underline inline-flex items-center gap-1">
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                </dd>
              </>)}
              {videoUrl && !finalUrl && (<>
                <dt className="text-muted-foreground">Output</dt>
                <dd>
                  <a href={videoUrl} target="_blank" rel="noopener noreferrer"
                     className="text-primary hover:underline inline-flex items-center gap-1">
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                </dd>
              </>)}
            </dl>

            {/* Segments (merge only) */}
            {includeResults && segments.length > 0 && (
              <div className="space-y-2">
                <Separator />
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold">Render segments ({segments.length})</h4>
                  {failedSegments.length > 0 && (
                    <Badge variant="destructive" className="text-[10px]">
                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                      {failedSegments.length} failed
                    </Badge>
                  )}
                </div>

                {/* Filter + sort controls */}
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className="text-muted-foreground">Filter:</span>
                  {([
                    { key: "all", label: `All (${segments.length})` },
                    { key: "failed", label: `Failed (${failedSegments.length})` },
                    { key: "completed", label: "Completed" },
                    { key: "in-flight", label: "In flight" },
                  ] as { key: SegmentFilter; label: string }[]).map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setSegmentFilter(opt.key)}
                      className={`px-2 py-0.5 rounded-md border transition-colors ${
                        segmentFilter === opt.key
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <div className="ml-auto flex items-center gap-1.5">
                    <span className="text-muted-foreground">Sort:</span>
                    <select
                      value={sortKey}
                      onChange={e => setSortKey(e.target.value as SegmentSortKey)}
                      className="bg-secondary/40 border border-border rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="segment_index">Segment #</option>
                      <option value="scene_number">Scene</option>
                      <option value="status">Status</option>
                      <option value="retry_count">Retries</option>
                      <option value="duration">Duration</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setSortDir(d => (d === "asc" ? "desc" : "asc"))}
                      className="h-5 px-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex items-center gap-1"
                      title={`Toggle direction (currently ${sortDir})`}
                    >
                      <ArrowUpDown className="h-2.5 w-2.5" />
                      {sortDir === "asc" ? "Asc" : "Desc"}
                    </button>
                  </div>
                </div>

                {visibleSegments.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground text-center">
                    No segments match the current filter.
                  </div>
                ) : (
                <div className="rounded-md border border-border overflow-hidden">
                  <table className="w-full text-[10.5px]">
                    <thead className="bg-secondary/40">
                      <tr className="border-b border-border">
                        <th
                          className="text-left px-2 py-1.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                          onClick={() => toggleSort("segment_index")}
                        >
                          # {sortIndicator("segment_index")}
                        </th>
                        <th
                          className="text-left px-2 py-1.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                          onClick={() => toggleSort("scene_number")}
                        >
                          Scene {sortIndicator("scene_number")}
                        </th>
                        <th
                          className="text-left px-2 py-1.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                          onClick={() => toggleSort("status")}
                        >
                          Status {sortIndicator("status")}
                        </th>
                        <th
                          className="text-right px-2 py-1.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                          onClick={() => toggleSort("retry_count")}
                        >
                          Retry {sortIndicator("retry_count")}
                        </th>
                        <th
                          className="text-right px-2 py-1.5 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                          onClick={() => toggleSort("duration")}
                        >
                          Duration {sortIndicator("duration")}
                        </th>
                        <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleSegments.map((seg, i) => {
                        const isRetrying = retryingIds.has(seg.id);
                        const retryable = canRetrySegment(seg);
                        return (
                          <tr key={seg.id} className={`border-b border-border/50 last:border-0 ${
                            /fail/i.test(seg.status) ? "bg-destructive/5" : i % 2 === 0 ? "" : "bg-secondary/20"
                          }`}>
                            <td className="px-2 py-1.5 font-mono text-muted-foreground">{seg.segment_index}</td>
                            <td className="px-2 py-1.5 font-mono">
                              S{String(seg.scene_number ?? "—").padStart(2, "0")}
                            </td>
                            <td className={`px-2 py-1.5 font-medium ${SEGMENT_STATUS_COLOR[seg.status] || "text-muted-foreground"}`}>
                              {seg.status}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono">{seg.retry_count ?? 0}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                              {fmtDur(seg.started_at, seg.completed_at)}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              {retryable ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-1.5 gap-1 text-[10px]"
                                  onClick={() => handleRetrySegment(seg)}
                                  disabled={isRetrying || !projectId}
                                  title={
                                    !projectId
                                      ? "Loading project context…"
                                      : `Retry segment ${seg.segment_index}`
                                  }
                                >
                                  {isRetrying ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-3 w-3" />
                                  )}
                                  {isRetrying ? "Retrying…" : "Retry"}
                                </Button>
                              ) : (
                                <span className="text-muted-foreground/60 text-[10px]">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                )}

                {failedSegments.length > 0 && (
                  <div className="space-y-1.5">
                    <h5 className="text-[10px] font-medium text-destructive uppercase tracking-wider">
                      Segment errors
                    </h5>
                    {failedSegments.map(seg => {
                      const isRetrying = retryingIds.has(seg.id);
                      return (
                        <div key={`err-${seg.id}`} className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[10.5px] space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-mono font-medium">
                              Segment {seg.segment_index} · S{String(seg.scene_number ?? "—").padStart(2, "0")}
                              {(seg.retry_count ?? 0) > 0 && (
                                <span className="ml-1.5 text-muted-foreground font-normal">
                                  · {seg.retry_count} prior {seg.retry_count === 1 ? "retry" : "retries"}
                                </span>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 gap-1 text-[10px] shrink-0"
                              onClick={() => handleRetrySegment(seg)}
                              disabled={isRetrying || !projectId}
                            >
                              {isRetrying ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3 w-3" />
                              )}
                              {isRetrying ? "Retrying…" : "Retry segment"}
                            </Button>
                          </div>
                          <p className="text-muted-foreground break-words">
                            {seg.error_message || "No error message recorded."}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {!jobId && (
              <p className="text-[11px] text-muted-foreground italic">
                No job ID provided.
              </p>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
