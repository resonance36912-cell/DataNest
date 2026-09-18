import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileJson, Download, FileSpreadsheet, Package, AlertTriangle, Eye, Share2, Copy, Check } from "lucide-react";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SavedScene } from "@/components/assembly/SceneTimeline";
import type { SceneTrim } from "@/components/assembly/SceneTrimEditor";
import type { MergeJobState } from "@/hooks/useAssemblyMerge";
import {
  buildMergeDebugReport,
  downloadMergeDebugReport,
  downloadMergeDebugCsv,
  downloadMergeDebugZip,
  type CsvExportMode,
  type RenderJobMeta,
  type ProjectMeta,
} from "@/lib/merge-debug-report";
import { supabase } from "@/integrations/supabase/client";
import { probeMergeMedia } from "@/lib/media-probe";
import { shareMergeDebugZip, type ShareableDebugZip } from "@/lib/merge-debug-report-share";

interface Props {
  projectId: string | null;
  audioUrl: string | null;
  audioDurationSec?: number | null;
  scenes: SavedScene[];
  trims: Record<number, SceneTrim>;
  mergeState: MergeJobState;
}

/** Pull model/version-shaped hints from input/output blobs for the report. */
function extractModelVersions(input: unknown, output: unknown): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  const scan = (obj: unknown, prefix: string) => {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = k.toLowerCase();
      if (
        key === "model" || key === "model_id" || key === "model_version" ||
        key === "version" || key === "endpoint" || key === "sync_mode" ||
        key === "engine" || key.endsWith("_model") || key.endsWith("_version")
      ) {
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          out[`${prefix}${k}`] = v;
        }
      }
    }
  };
  scan(input, "input.");
  scan(output, "output.");
  return Object.keys(out).length > 0 ? out : null;
}

export default function MergeDebugReportPanel({
  projectId, audioUrl, audioDurationSec, scenes, trims, mergeState,
}: Props) {
  const [open, setOpen] = useState(false);
  const [renderJobMeta, setRenderJobMeta] = useState<RenderJobMeta | null>(null);
  const [projectMeta, setProjectMeta] = useState<ProjectMeta | null>(null);
  const [csvMode, setCsvMode] = useState<CsvExportMode>("both");
  const [sharing, setSharing] = useState(false);
  const [share, setShare] = useState<ShareableDebugZip | null>(null);
  const [copied, setCopied] = useState(false);

  // Invalidate stored share URL whenever the job/report identity changes.
  useEffect(() => {
    setShare(null);
    setCopied(false);
  }, [mergeState.mergeJobId, mergeState.updatedAt]);

  // Fetch render_jobs row metadata when we have a job id.
  useEffect(() => {
    let cancelled = false;
    const jobId = mergeState.mergeJobId;
    if (!jobId) {
      setRenderJobMeta(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("render_jobs")
        .select(
          "provider, status, merge_status, quality, assembly_profile_used, idempotency_key, tracking_id, retry_count, estimated_cost_gbp, actual_duration_seconds, input, output, final_output_metadata",
        )
        .eq("id", jobId)
        .maybeSingle();
      if (cancelled || error || !data) return;
      setRenderJobMeta({
        ...data,
        model_versions: extractModelVersions(data.input, data.output),
      });
    })();
    return () => { cancelled = true; };
  }, [mergeState.mergeJobId, mergeState.updatedAt]);

  // Fetch project title + audio file path for input filename.
  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setProjectMeta(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("title, file_path")
        .eq("id", projectId)
        .maybeSingle();
      if (cancelled || error || !data) return;
      const path = (data as { file_path?: string | null }).file_path ?? null;
      setProjectMeta({
        title: (data as { title?: string | null }).title ?? null,
        input_file_path: path,
        input_file_name: path ? path.split("/").pop() ?? null : null,
      });
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const report = useMemo(
    () => buildMergeDebugReport({
      projectId, audioUrl, audioDurationSec, scenes, trims, mergeState, renderJobMeta, projectMeta,
    }),
    [projectId, audioUrl, audioDurationSec, scenes, trims, mergeState, renderJobMeta, projectMeta],
  );

  const { totals, effective_windows, timeline_gaps, render_job } = report;


  return (
    <div className="mt-2 rounded-lg border border-border bg-card/50 p-3">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between gap-2">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 text-xs font-medium text-foreground hover:text-primary transition-colors"
            >
              {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <FileJson className="h-3.5 w-3.5" />
              Merge debug report
              <Badge variant="secondary" className="ml-1 h-5 text-[10px]">
                {totals.scene_count} scenes
              </Badge>
              {totals.overflow_count > 0 && (
                <Badge variant="destructive" className="h-5 text-[10px] gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {totals.overflow_count} overflow
                </Badge>
              )}
              {(totals.gap_count > 0 || totals.overlap_count > 0) && (
                <Badge variant="outline" className="h-5 text-[10px]">
                  {totals.gap_count} gap{totals.gap_count === 1 ? "" : "s"} · {totals.overlap_count} overlap{totals.overlap_count === 1 ? "" : "s"}
                </Badge>
              )}
              {totals.total_gap_sec > 0 && (
                <Badge variant="outline" className="h-5 text-[10px] text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                  {totals.total_gap_sec.toFixed(2)}s gaps
                </Badge>
              )}
              {totals.total_overlap_sec > 0 && (
                <Badge variant="outline" className="h-5 text-[10px] text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                  {totals.total_overlap_sec.toFixed(2)}s overlaps
                </Badge>
              )}
              {totals.largest_gap_sec > 0 && (
                <Badge variant="outline" className="h-5 text-[10px]">
                  largest gap {totals.largest_gap_sec.toFixed(2)}s
                </Badge>
              )}
            </button>
          </CollapsibleTrigger>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 text-xs h-7"
              onClick={() => {
                downloadMergeDebugReport(report);
                toast.success("Merge debug report downloaded");
              }}
            >
              <Download className="h-3.5 w-3.5" />
              JSON
            </Button>
            <Select
              value={csvMode}
              onValueChange={(v) => setCsvMode(v as CsvExportMode)}
            >
              <SelectTrigger className="h-7 w-[120px] text-xs px-2">
                <SelectValue placeholder="Both" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="both">Both</SelectItem>
                <SelectItem value="windows">Windows</SelectItem>
                <SelectItem value="gaps">Gaps</SelectItem>
                <SelectItem value="overlaps">Overlaps</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 text-xs h-7"
              onClick={() => {
                downloadMergeDebugCsv(report, csvMode);
                toast.success(
                  csvMode === "both"
                    ? "CSV sheets downloaded (windows + gaps + overlaps)"
                    : `CSV downloaded (${csvMode})`,
                );
              }}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 text-xs h-7"
              onClick={async () => {
                const t = toast.loading("Probing media (ffprobe-equivalent)…");
                let mediaProbe = null;
                try {
                  mediaProbe = await probeMergeMedia({ audioUrl, scenes });
                } catch (e) {
                  toast.warning(`Media probe failed: ${e instanceof Error ? e.message : "unknown"}`);
                }
                const reportWithProbe = { ...report, media_probe: mediaProbe };
                await downloadMergeDebugZip(reportWithProbe);
                toast.dismiss(t);
                toast.success("Debug ZIP downloaded (JSON + CSVs + media probe)");
              }}
            >
              <Package className="h-3.5 w-3.5" />
              ZIP
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 text-xs h-7"
              disabled={sharing}
              title="Upload the debug ZIP and get a shareable link (valid for 7 days)"
              onClick={async () => {
                setSharing(true);
                try {
                  let mediaProbe = null;
                  try {
                    mediaProbe = await probeMergeMedia({ audioUrl, scenes });
                  } catch {
                    /* non-fatal — share without probe */
                  }
                  const reportWithProbe = { ...report, media_probe: mediaProbe };
                  const result = await shareMergeDebugZip(reportWithProbe);
                  setShare(result);
                  setCopied(false);
                  try {
                    await navigator.clipboard.writeText(result.url);
                    setCopied(true);
                    toast.success("Share link copied to clipboard (valid 7 days)");
                  } catch {
                    toast.success("Share link ready — copy it below");
                  }
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed to create share link");
                } finally {
                  setSharing(false);
                }
              }}
            >
              <Share2 className="h-3.5 w-3.5" />
              {sharing ? "Sharing…" : "Share"}
            </Button>
          </div>
        </div>

        {share && (
          <div className="mt-2 flex items-center gap-2 rounded border border-border bg-muted/40 px-2 py-1.5">
            <Share2 className="h-3 w-3 text-muted-foreground shrink-0" />
            <input
              readOnly
              value={share.url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 bg-transparent text-[10px] font-mono text-foreground outline-none truncate"
            />
            <span className="text-[10px] text-muted-foreground shrink-0">
              {(share.size_bytes / 1024).toFixed(1)} KB · expires {new Date(share.expires_at).toLocaleDateString()}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 text-[10px] px-2"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(share.url);
                  setCopied(true);
                  toast.success("Copied");
                } catch {
                  toast.error("Copy failed — select and copy manually");
                }
              }}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        )}


        {/* Preview tables — always visible */}
        <div className="mt-3 space-y-3">
          {/* Effective windows preview */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              <Eye className="h-3 w-3" />
              effective_windows
              <span className="text-[10px] normal-case text-muted-foreground/70">
                ({effective_windows.length} row{effective_windows.length === 1 ? "" : "s"})
              </span>
            </div>
            <div className="rounded border border-border overflow-hidden">
              <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-x-3 px-2 py-1.5 bg-muted/40 text-[10px] font-mono text-muted-foreground border-b border-border">
                <span>#</span>
                <span>start_offset</span>
                <span>end_offset</span>
                <span>kept</span>
                <span>src_dur</span>
                <span>flag</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {effective_windows.map((w) => (
                  <div
                    key={w.scene_number}
                    className={`grid grid-cols-[auto_1fr_1fr_1fr_1fr_auto] gap-x-3 px-2 py-1 text-[10px] font-mono border-b border-border/50 last:border-0 ${
                      w.overflow ? "bg-destructive/10 text-destructive" : "text-foreground"
                    }`}
                  >
                    <span>S{String(w.scene_number).padStart(2, "0")}</span>
                    <span>{w.start_offset_sec.toFixed(2)}s</span>
                    <span>{w.end_offset_sec.toFixed(2)}s</span>
                    <span>{w.kept_sec.toFixed(2)}s</span>
                    <span>{w.source_duration_sec !== null ? `${w.source_duration_sec.toFixed(2)}s` : "—"}</span>
                    <span className="text-[9px]">
                      {w.overflow ? `+${w.overflow_sec.toFixed(2)}s EOF` : w.is_default ? "default" : "edited"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Timeline gaps preview */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              <Eye className="h-3 w-3" />
              timeline_gaps
              <span className="text-[10px] normal-case text-muted-foreground/70">
                ({timeline_gaps.length} row{timeline_gaps.length === 1 ? "" : "s"})
              </span>
            </div>
            {timeline_gaps.length === 0 ? (
              <div className="rounded border border-border bg-muted/20 px-2 py-2 text-[10px] text-muted-foreground italic">
                No gaps or overlaps detected on the song timeline.
              </div>
            ) : (
              <div className="rounded border border-border overflow-hidden">
                <div className="max-h-40 overflow-y-auto">
                  {timeline_gaps.map((g, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 px-2 py-1 text-[10px] font-mono border-b border-border/50 last:border-0 ${
                        g.kind === "overlap"
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : g.kind === "tail"
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          : "text-foreground"
                      }`}
                    >
                      <span className="uppercase text-[9px] font-semibold w-12">{g.kind}</span>
                      <span className="flex-1">
                        {g.from_scene !== null ? `S${String(g.from_scene).padStart(2, "0")}` : "—"}
                        {" → "}
                        {g.to_scene !== null ? `S${String(g.to_scene).padStart(2, "0")}` : "audio end"}
                      </span>
                      <span>{g.from_sec.toFixed(2)}s → {g.to_sec.toFixed(2)}s</span>
                      <span className="font-semibold">{g.delta_sec >= 0 ? "+" : ""}{g.delta_sec.toFixed(2)}s</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <CollapsibleContent className="mt-3 space-y-3">
          {/* Render job metadata */}
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              render_job
            </div>
            <div className="rounded border border-border bg-muted/20 px-2 py-1.5 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-[10px] font-mono">
              <div><span className="text-muted-foreground">id: </span>{render_job.id ?? "—"}</div>
              <div><span className="text-muted-foreground">status: </span>{render_job.overall_status ?? render_job.phase ?? "—"}</div>
              <div><span className="text-muted-foreground">merge_status: </span>{render_job.merge_status ?? "—"}</div>
              <div><span className="text-muted-foreground">provider: </span>{render_job.provider ?? "—"}</div>
              <div><span className="text-muted-foreground">quality: </span>{render_job.quality ?? "—"}</div>
              <div><span className="text-muted-foreground">profile: </span>{render_job.assembly_profile_used ?? "—"}</div>
              <div className="col-span-2 sm:col-span-3 truncate">
                <span className="text-muted-foreground">input_file: </span>{report.audio.file_name ?? "—"}
              </div>
              <div><span className="text-muted-foreground">created_at: </span>{render_job.created_at ?? "—"}</div>
              <div><span className="text-muted-foreground">updated_at: </span>{render_job.updated_at ?? "—"}</div>
              <div><span className="text-muted-foreground">provider_task: </span>{render_job.provider_task_id ?? "—"}</div>
              {render_job.model_versions && (
                <div className="col-span-2 sm:col-span-3">
                  <span className="text-muted-foreground">model_versions: </span>
                  {Object.entries(render_job.model_versions).map(([k, v]) => `${k}=${String(v)}`).join(", ")}
                </div>
              )}
            </div>
          </div>

          {/* Raw JSON */}
          <details className="rounded border border-border bg-muted/20">
            <summary className="cursor-pointer px-2 py-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground">
              Raw JSON
            </summary>
            <pre className="px-2 py-2 text-[10px] leading-tight font-mono overflow-auto max-h-64 bg-background/50">
              {JSON.stringify(report, null, 2)}
            </pre>
          </details>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
