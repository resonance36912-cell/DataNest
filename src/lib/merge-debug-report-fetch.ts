/**
 * Fetch render_jobs + project metadata then build & download the merge debug report.
 * Used by both the on-page preview panel and the result UI shortcut so the two
 * stay in lockstep without duplicating the supabase reads inline.
 */
import { supabase } from "@/integrations/supabase/client";
import type { SavedScene } from "@/components/assembly/SceneTimeline";
import type { SceneTrim } from "@/components/assembly/SceneTrimEditor";
import type { MergeJobState } from "@/hooks/useAssemblyMerge";
import { probeMergeMedia } from "@/lib/media-probe";
import {
  buildMergeDebugReport,
  downloadMergeDebugReport,
  downloadMergeDebugCsv,
  downloadMergeDebugZip,
  type RenderJobMeta,
  type ProjectMeta,
  type RenderJobLogs,
  type CsvExportMode,
} from "@/lib/merge-debug-report";


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

export async function fetchRenderJobMeta(jobId: string | null): Promise<RenderJobMeta | null> {
  if (!jobId) return null;
  const { data, error } = await supabase
    .from("render_jobs")
    .select(
      "provider, status, merge_status, quality, assembly_profile_used, idempotency_key, tracking_id, retry_count, estimated_cost_gbp, actual_duration_seconds, input, output, final_output_metadata",
    )
    .eq("id", jobId)
    .maybeSingle();
  if (error || !data) return null;
  return { ...data, model_versions: extractModelVersions(data.input, data.output) };
}

export async function fetchRenderJobLogs(jobId: string | null): Promise<RenderJobLogs | null> {
  if (!jobId) return null;
  const [jobRes, eventsRes] = await Promise.all([
    supabase.from("render_jobs").select("merge_error_log").eq("id", jobId).maybeSingle(),
    supabase
      .from("render_job_events")
      .select("created_at, kind, from_value, to_value, source, payload")
      .eq("render_job_id", jobId)
      .order("created_at", { ascending: true })
      .limit(500),
  ]);
  const merge_error_log =
    (jobRes.data as { merge_error_log?: string | null } | null)?.merge_error_log ?? null;
  const events = (eventsRes.data ?? []) as RenderJobLogs["events"];
  if (!merge_error_log && events.length === 0) return { merge_error_log: null, events: [] };
  return { merge_error_log, events };
}

export async function fetchProjectMeta(projectId: string | null): Promise<ProjectMeta | null> {
  if (!projectId) return null;
  const { data, error } = await supabase
    .from("projects")
    .select("title, file_path")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !data) return null;
  const path = (data as { file_path?: string | null }).file_path ?? null;
  return {
    title: (data as { title?: string | null }).title ?? null,
    input_file_path: path,
    input_file_name: path ? path.split("/").pop() ?? null : null,
  };
}

export async function downloadMergeDebugReportFor(args: {
  projectId: string | null;
  audioUrl: string | null;
  audioDurationSec?: number | null;
  scenes: SavedScene[];
  trims: Record<number, SceneTrim>;
  mergeState: MergeJobState;
}) {
  const [renderJobMeta, projectMeta] = await Promise.all([
    fetchRenderJobMeta(args.mergeState.mergeJobId),
    fetchProjectMeta(args.projectId),
  ]);
  const report = buildMergeDebugReport({ ...args, renderJobMeta, projectMeta });
  downloadMergeDebugReport(report);
  return report;
}

export async function downloadMergeDebugCsvFor(
  args: {
    projectId: string | null;
    audioUrl: string | null;
    audioDurationSec?: number | null;
    scenes: SavedScene[];
    trims: Record<number, SceneTrim>;
    mergeState: MergeJobState;
  },
  mode: CsvExportMode = "both",
) {
  const [renderJobMeta, projectMeta] = await Promise.all([
    fetchRenderJobMeta(args.mergeState.mergeJobId),
    fetchProjectMeta(args.projectId),
  ]);
  const report = buildMergeDebugReport({ ...args, renderJobMeta, projectMeta });
  downloadMergeDebugCsv(report, mode);
  return report;
}

export async function downloadMergeDebugZipFor(args: {
  projectId: string | null;
  audioUrl: string | null;
  audioDurationSec?: number | null;
  scenes: SavedScene[];
  trims: Record<number, SceneTrim>;
  mergeState: MergeJobState;
}) {
  const [renderJobMeta, projectMeta, renderJobLogs, mediaProbe] = await Promise.all([
    fetchRenderJobMeta(args.mergeState.mergeJobId),
    fetchProjectMeta(args.projectId),
    fetchRenderJobLogs(args.mergeState.mergeJobId),
    probeMergeMedia({ audioUrl: args.audioUrl, scenes: args.scenes }).catch(() => null),
  ]);
  const report = buildMergeDebugReport({ ...args, renderJobMeta, projectMeta, renderJobLogs, mediaProbe });
  await downloadMergeDebugZip(report);
  return report;
}
