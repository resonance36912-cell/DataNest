/**
 * Merge debug report builder.
 *
 * Produces a downloadable JSON snapshot of the inputs that drive merge-assembly,
 * focused on two things the user needs to diagnose post-merge artifacts:
 *
 *   - effective_windows: per-scene start_offset / end_offset / kept duration
 *     on the source clip (with overflow flags vs probed source duration).
 *   - timeline_gaps:    gaps and overlaps between consecutive scenes on the
 *     song timeline (timeStart → timeEnd), plus tail gap vs audio length.
 */
import JSZip from "jszip";
import type { SavedScene } from "@/components/assembly/SceneTimeline";
import type { SceneTrim } from "@/components/assembly/SceneTrimEditor";
import type { MergeJobState } from "@/hooks/useAssemblyMerge";
import { timeToSeconds } from "@/lib/audio-utils";

export interface RenderJobMeta {
  provider?: string | null;
  status?: string | null;
  merge_status?: string | null;
  quality?: string | null;
  assembly_profile_used?: string | null;
  idempotency_key?: string | null;
  tracking_id?: string | null;
  retry_count?: number | null;
  estimated_cost_gbp?: number | null;
  actual_duration_seconds?: number | null;
  input?: unknown;
  output?: unknown;
  final_output_metadata?: unknown;
  /** Lifted from input/output payloads when present, e.g. model_version, sync_mode. */
  model_versions?: Record<string, unknown> | null;
}

export interface ProjectMeta {
  title?: string | null;
  input_file_name?: string | null;
  input_file_path?: string | null;
}

export interface RenderJobEventRecord {
  created_at: string | null;
  kind: string | null;
  from_value: string | null;
  to_value: string | null;
  source: string | null;
  payload?: unknown;
}

export interface RenderJobLogs {
  merge_error_log: string | null;
  events: RenderJobEventRecord[];
}

export interface MergeDebugReport {
  generated_at: string;
  project_id: string | null;
  project: ProjectMeta;

  render_job: {
    id: string | null;
    phase: MergeJobState["phase"] | null;
    overall_status: string | null;
    merge_status: string | null;
    progress: number | null;
    final_url: string | null;
    error: string | null;
    error_code: string | null;
    provider: string | null;
    provider_task_id: string | null;
    quality: string | null;
    assembly_profile_used: string | null;
    idempotency_key: string | null;
    tracking_id: string | null;
    retry_count: number | null;
    estimated_cost_gbp: number | null;
    actual_duration_seconds: number | null;
    model_versions: Record<string, unknown> | null;
    input: unknown;
    output: unknown;
    final_output_metadata: unknown;
    created_at: string | null;
    updated_at: string | null;
  };
  logs?: RenderJobLogs | null;
  media_probe?: import("@/lib/media-probe").MediaProbeReport | null;

  audio: {
    url: string | null;
    file_name: string | null;
    inferred_duration_sec: number | null;
  };
  totals: {
    scene_count: number;
    total_kept_sec: number;
    total_timeline_sec: number;
    overflow_count: number;
    gap_count: number;
    overlap_count: number;
    total_gap_sec: number;
    total_overlap_sec: number;
    largest_gap_sec: number;
  };
  effective_windows: Array<{
    scene_number: number;
    tracking_id?: string | null;
    video_url: string | null;
    source_duration_sec: number | null;
    start_offset_sec: number;
    end_offset_sec: number;
    tail_cut_sec: number;
    kept_sec: number;
    overflow_sec: number;
    overflow: boolean;
    is_default: boolean;
  }>;
  timeline_gaps: Array<{
    index: number;
    kind: "gap" | "overlap" | "tail";
    from_scene: number | null;
    to_scene: number | null;
    from_sec: number;
    to_sec: number;
    delta_sec: number;
  }>;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function buildMergeDebugReport(args: {
  projectId: string | null;
  audioUrl: string | null;
  audioDurationSec?: number | null;
  scenes: SavedScene[];
  trims: Record<number, SceneTrim>;
  mergeState: MergeJobState;
  renderJobMeta?: RenderJobMeta | null;
  projectMeta?: ProjectMeta | null;
  renderJobLogs?: RenderJobLogs | null;
  mediaProbe?: import("@/lib/media-probe").MediaProbeReport | null;
}): MergeDebugReport {
  const { projectId, audioUrl, audioDurationSec, scenes, trims, mergeState, renderJobMeta, projectMeta, renderJobLogs, mediaProbe } = args;


  const effective_windows = scenes.map((s) => {
    const t = trims[s.sceneNumber];
    const startSec = t?.startSec ?? 0;
    const durationSec = t?.durationSec ?? s.durationSec;
    const tailCutSec = t?.tailCutSec ?? 0;
    const kept = Math.max(0, durationSec - tailCutSec);
    const src = typeof t?.sourceDurationSec === "number" ? t.sourceDurationSec : null;
    const requestedEnd = startSec + durationSec;
    const overflowSec = src !== null ? Math.max(0, requestedEnd - src) : 0;
    return {
      scene_number: s.sceneNumber,
      tracking_id: (s as unknown as { trackingId?: string | null }).trackingId ?? null,
      video_url: s.videoUrl ?? null,
      source_duration_sec: src !== null ? r3(src) : null,
      start_offset_sec: r3(startSec),
      end_offset_sec: r3(startSec + kept),
      tail_cut_sec: r3(tailCutSec),
      kept_sec: r3(kept),
      overflow_sec: r3(overflowSec),
      overflow: overflowSec > 0.05,
      is_default: !t,
    };
  });

  // Timeline gaps between consecutive scenes on the song timeline.
  const withTimes = scenes.map((s) => ({
    s,
    start: timeToSeconds(s.timeStart),
    end: timeToSeconds(s.timeEnd),
  }));
  const sorted = [...withTimes].sort((a, b) => a.start - b.start);
  const timeline_gaps: MergeDebugReport["timeline_gaps"] = [];
  let gap_count = 0;
  let overlap_count = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const delta = b.start - a.end;
    if (Math.abs(delta) < 0.005) continue;
    const kind: "gap" | "overlap" = delta > 0 ? "gap" : "overlap";
    if (kind === "gap") gap_count++;
    else overlap_count++;
    timeline_gaps.push({
      index: i,
      kind,
      from_scene: a.s.sceneNumber,
      to_scene: b.s.sceneNumber,
      from_sec: r3(a.end),
      to_sec: r3(b.start),
      delta_sec: r3(delta),
    });
  }

  // Optional tail gap vs audio duration.
  const last = sorted[sorted.length - 1];
  if (last && typeof audioDurationSec === "number" && audioDurationSec > 0) {
    const tail = audioDurationSec - last.end;
    if (Math.abs(tail) > 0.05) {
      timeline_gaps.push({
        index: sorted.length - 1,
        kind: "tail",
        from_scene: last.s.sceneNumber,
        to_scene: null,
        from_sec: r3(last.end),
        to_sec: r3(audioDurationSec),
        delta_sec: r3(tail),
      });
    }
  }

  const totalKept = effective_windows.reduce((sum, e) => sum + e.kept_sec, 0);
  const totalTimeline = sorted.reduce((sum, x) => sum + (x.end - x.start), 0);
  const overflowCount = effective_windows.filter((e) => e.overflow).length;

  const totalGapSec = timeline_gaps
    .filter((g) => g.delta_sec > 0)
    .reduce((sum, g) => sum + g.delta_sec, 0);
  const totalOverlapSec = timeline_gaps
    .filter((g) => g.delta_sec < 0)
    .reduce((sum, g) => sum + Math.abs(g.delta_sec), 0);
  const largestGapSec = timeline_gaps
    .filter((g) => g.delta_sec > 0)
    .reduce((max, g) => Math.max(max, g.delta_sec), 0);

  const m = renderJobMeta ?? {};
  const inputObj = m.input as Record<string, unknown> | null | undefined;
  const inputFileName =
    (inputObj && typeof inputObj === "object" && (inputObj.file_name as string | undefined)) ||
    projectMeta?.input_file_name ||
    (projectMeta?.input_file_path ? projectMeta.input_file_path.split("/").pop() ?? null : null) ||
    null;

  return {
    generated_at: new Date().toISOString(),
    project_id: projectId,
    project: {
      title: projectMeta?.title ?? null,
      input_file_name: inputFileName,
      input_file_path: projectMeta?.input_file_path ?? null,
    },
    render_job: {
      id: mergeState.mergeJobId ?? null,
      phase: mergeState.phase ?? null,
      overall_status: m.status ?? null,
      merge_status: m.merge_status ?? null,
      progress: typeof mergeState.progress === "number" ? mergeState.progress : null,
      final_url: mergeState.finalUrl ?? null,
      error: mergeState.error ?? null,
      error_code: mergeState.errorCode ?? null,
      provider: m.provider ?? null,
      provider_task_id: mergeState.providerTaskId ?? null,
      quality: m.quality ?? null,
      assembly_profile_used: m.assembly_profile_used ?? null,
      idempotency_key: m.idempotency_key ?? null,
      tracking_id: m.tracking_id ?? null,
      retry_count: m.retry_count ?? null,
      estimated_cost_gbp: m.estimated_cost_gbp ?? null,
      actual_duration_seconds: m.actual_duration_seconds ?? null,
      model_versions: m.model_versions ?? null,
      input: m.input ?? null,
      output: m.output ?? mergeState.rawOutput ?? null,
      final_output_metadata: m.final_output_metadata ?? null,
      created_at: mergeState.createdAt ?? null,
      updated_at: mergeState.updatedAt ?? null,
    },
    logs: renderJobLogs ?? null,
    media_probe: mediaProbe ?? null,
    audio: {
      url: audioUrl,
      file_name: inputFileName,
      inferred_duration_sec:
        typeof audioDurationSec === "number" && audioDurationSec > 0 ? r3(audioDurationSec) : null,
    },
    totals: {
      scene_count: scenes.length,
      total_kept_sec: r3(totalKept),
      total_timeline_sec: r3(totalTimeline),
      overflow_count: overflowCount,
      gap_count,
      overlap_count,
      total_gap_sec: r3(totalGapSec),
      total_overlap_sec: r3(totalOverlapSec),
      largest_gap_sec: r3(largestGapSec),
    },
    effective_windows,
    timeline_gaps,
  };
}

export function downloadMergeDebugReport(report: MergeDebugReport, filename?: string) {
  const json = JSON.stringify(report, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const jobSlug = report.render_job.id ? report.render_job.id.slice(0, 8) : "no-job";
  const ts = report.generated_at.replace(/[:.]/g, "-");
  a.href = url;
  a.download = filename ?? `merge-debug-${jobSlug}-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeCsvCell(v: string | number | boolean | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function makeCsv(rows: Record<string, string | number | boolean | null | undefined>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvCell(row[h])).join(","));
  }
  return lines.join("\r\n");
}

export function buildMergeDebugCsv(report: MergeDebugReport): { windows: string; gaps: string; overlaps: string } {
  const windows = report.effective_windows.map((w) => ({
    scene_number: w.scene_number,
    tracking_id: w.tracking_id ?? "",
    video_url: w.video_url ?? "",
    source_duration_sec: w.source_duration_sec ?? "",
    start_offset_sec: w.start_offset_sec,
    end_offset_sec: w.end_offset_sec,
    tail_cut_sec: w.tail_cut_sec,
    kept_sec: w.kept_sec,
    overflow_sec: w.overflow_sec,
    overflow: w.overflow,
    is_default: w.is_default,
  }));

  const gaps = report.timeline_gaps.map((g) => ({
    index: g.index,
    kind: g.kind,
    from_scene: g.from_scene ?? "",
    to_scene: g.to_scene ?? "",
    from_sec: g.from_sec,
    to_sec: g.to_sec,
    delta_sec: g.delta_sec,
  }));

  const overlaps = report.timeline_gaps
    .filter((g) => g.kind === "overlap")
    .map((g) => ({
      index: g.index,
      from_scene: g.from_scene ?? "",
      to_scene: g.to_scene ?? "",
      from_sec: g.from_sec,
      to_sec: g.to_sec,
      overlap_duration_sec: Math.abs(g.delta_sec),
    }));

  return {
    windows: makeCsv(windows),
    gaps: makeCsv(gaps),
    overlaps: makeCsv(overlaps),
  };
}

export type CsvExportMode = "windows" | "gaps" | "overlaps" | "both";

export function downloadMergeDebugCsv(report: MergeDebugReport, mode: CsvExportMode = "both") {
  const { windows, gaps, overlaps } = buildMergeDebugCsv(report);
  const jobSlug = report.render_job.id ? report.render_job.id.slice(0, 8) : "no-job";
  const ts = report.generated_at.replace(/[:.]/g, "-");

  const download = (content: string, suffix: string) => {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `merge-debug-${jobSlug}-${ts}-${suffix}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (mode === "windows" || mode === "both") download(windows, "windows");
  if (mode === "gaps" || mode === "both") download(gaps, "gaps");
  if (mode === "overlaps" || mode === "both") download(overlaps, "overlaps");
}

export function buildMergeDebugManifest(report: MergeDebugReport) {
  const rj = report.render_job;
  const inputObj = (rj.input ?? null) as Record<string, unknown> | null;
  const pick = (k: string) =>
    inputObj && typeof inputObj === "object" && k in inputObj ? (inputObj as Record<string, unknown>)[k] : undefined;

  return {
    manifest_version: 1,
    generated_at: report.generated_at,
    project_id: report.project_id,
    project_title: report.project.title ?? null,
    job: {
      id: rj.id,
      phase: rj.phase,
      overall_status: rj.overall_status,
      merge_status: rj.merge_status,
      provider: rj.provider,
      provider_task_id: rj.provider_task_id,
      tracking_id: rj.tracking_id,
      idempotency_key: rj.idempotency_key,
      retry_count: rj.retry_count,
      created_at: rj.created_at,
      updated_at: rj.updated_at,
      final_url: rj.final_url,
      error: rj.error,
      error_code: rj.error_code,
    },
    generation_settings: {
      quality: rj.quality,
      assembly_profile_used: rj.assembly_profile_used,
      model_versions: rj.model_versions,
      estimated_cost_gbp: rj.estimated_cost_gbp,
      actual_duration_seconds: rj.actual_duration_seconds,
      resolution: pick("resolution") ?? pick("output_resolution") ?? null,
      fps: pick("fps") ?? pick("output_fps") ?? null,
      sync_mode: pick("sync_mode") ?? null,
      model_version: pick("model_version") ?? null,
      audio_url: report.audio.url,
      audio_file_name: report.audio.file_name,
      audio_duration_sec: report.audio.inferred_duration_sec,
    },
    totals: report.totals,
    files: {
      "merge-debug-report.json": "Full JSON debug report (inputs, windows, gaps, render_job).",
      "effective_windows.csv": "Per-scene start/end offsets, kept duration, overflow flags.",
      "timeline_gaps.csv": "Gaps, overlaps, and tail gap between consecutive scenes.",
      "timeline_overlaps.csv": "Overlap-only rows with duration and affected scenes.",
      "render_job_logs.txt": "Human-readable render job log: error, merge stderr/stdout, event timeline.",
      "render_job_events.json": "Structured render_job_events rows (status/progress/error/merge/output).",
      "media_probe.json": "Browser-side ffprobe-equivalent: audio/video duration, sample rate, channels, resolution, FPS estimate.",
      "manifest.json": "This file — audit metadata for the ZIP bundle.",
      "README.txt": "Plain-text guide to every CSV column, units, and file in this bundle.",
      "schema.json": "Machine-readable column schema (type/unit/range) for every CSV.",
      "checksums.json": "SHA-256 digest and byte size for each artifact (integrity check).",
    },
  };
}

export function buildRenderJobLogText(report: MergeDebugReport): string {
  const rj = report.render_job;
  const logs = report.logs;
  const lines: string[] = [];
  lines.push(`# Render job log`);
  lines.push(`job_id:        ${rj.id ?? "(none)"}`);
  lines.push(`provider:      ${rj.provider ?? "-"}`);
  lines.push(`status:        ${rj.overall_status ?? "-"}  (merge: ${rj.merge_status ?? "-"})`);
  lines.push(`phase:         ${rj.phase ?? "-"}`);
  lines.push(`created_at:    ${rj.created_at ?? "-"}`);
  lines.push(`updated_at:    ${rj.updated_at ?? "-"}`);
  lines.push(`retry_count:   ${rj.retry_count ?? 0}`);
  lines.push(`final_url:     ${rj.final_url ?? "-"}`);
  lines.push("");
  lines.push(`## error`);
  lines.push(rj.error ? String(rj.error) : "(none)");
  if (rj.error_code) lines.push(`error_code: ${rj.error_code}`);
  lines.push("");
  lines.push(`## merge_error_log (stderr/stdout from merge stage)`);
  lines.push(logs?.merge_error_log ? String(logs.merge_error_log) : "(none)");
  lines.push("");
  lines.push(`## event timeline (${logs?.events.length ?? 0} events)`);
  if (logs?.events?.length) {
    for (const ev of logs.events) {
      const ts = ev.created_at ?? "-";
      const src = ev.source ? ` [${ev.source}]` : "";
      const from = ev.from_value ?? "∅";
      const to = ev.to_value ?? "∅";
      const payload =
        ev.payload && typeof ev.payload === "object" && Object.keys(ev.payload as object).length > 0
          ? " " + JSON.stringify(ev.payload)
          : "";
      lines.push(`${ts}${src} ${ev.kind}: ${from} → ${to}${payload}`);
    }
  } else {
    lines.push("(no events recorded)");
  }
  return lines.join("\n");
}

export function buildMergeDebugReadme(report: MergeDebugReport): string {
  const rj = report.render_job;
  return [
    `Merge Debug Bundle`,
    `==================`,
    `Generated:    ${report.generated_at}`,
    `Project:      ${report.project.title ?? "(untitled)"} (${report.project_id ?? "no id"})`,
    `Render job:   ${rj.id ?? "(none)"}  provider=${rj.provider ?? "-"}  status=${rj.overall_status ?? "-"}`,
    ``,
    `All time values are seconds (s) unless noted. All *_sec fields are floating-point`,
    `seconds rounded to 3 decimals. Booleans render as "true"/"false" in CSV.`,
    ``,
    `----------------------------------------------------------------`,
    `FILES`,
    `----------------------------------------------------------------`,
    `README.txt               This file.`,
    `manifest.json            Audit metadata: job id, timestamps, generation settings.`,
    `merge-debug-report.json  Full JSON snapshot (superset of every CSV).`,
    `effective_windows.csv    Per-scene trim window on the SOURCE clip.`,
    `timeline_gaps.csv        Gaps, overlaps, and tail gap on the SONG timeline.`,
    `timeline_overlaps.csv    Overlap-only subset with positive duration.`,
    `render_job_logs.txt      Human-readable job error, merge stderr/stdout, event feed.`,
    `render_job_events.json   Structured render_job_events rows.`,
    `checksums.json           SHA-256 digest + byte size for every other file.`,
    `schema.json              Machine-readable column schema (type/unit/range) for the CSVs.`,
    `media_probe.json         Audio/video metadata (duration, sample_rate, channels, width, height, FPS estimate).`,
    ``,
    `----------------------------------------------------------------`,
    `effective_windows.csv  (one row per scene, source-clip coordinates)`,
    `----------------------------------------------------------------`,
    `scene_number         int    1-based scene index shown in the UI.`,
    `tracking_id          text   Stable scene tracking id (e.g. S05-a3f8), may be blank.`,
    `video_url            text   Source video URL fed to the merge stage.`,
    `source_duration_sec  sec    Probed duration of the source clip (blank if unknown).`,
    `start_offset_sec     sec    Trim IN point on the source clip.`,
    `end_offset_sec       sec    Trim OUT point on the source clip (start + kept).`,
    `tail_cut_sec         sec    Extra tail trimmed after the kept region.`,
    `kept_sec             sec    Duration retained from the source (end - start).`,
    `overflow_sec         sec    How far the requested end exceeds source_duration_sec.`,
    `                            0 when there is no overflow.`,
    `overflow             bool   true when overflow_sec > 0.05s (potential black frames).`,
    `is_default           bool   true when no user trim was applied (defaults used).`,
    ``,
    `----------------------------------------------------------------`,
    `timeline_gaps.csv  (consecutive scene boundaries on the SONG timeline)`,
    `----------------------------------------------------------------`,
    `index        int    Boundary index (0-based). "tail" rows use the last scene index.`,
    `kind         text   "gap" | "overlap" | "tail".`,
    `                      - gap:     empty space between two scenes.`,
    `                      - overlap: two scenes cover the same time span.`,
    `                      - tail:    space between last scene and audio end.`,
    `from_scene   int    scene_number ending the earlier segment (blank if n/a).`,
    `to_scene     int    scene_number starting the later segment (blank for tail).`,
    `from_sec     sec    Timeline time where the boundary starts (earlier scene end`,
    `                    for gap/overlap; last scene end for tail).`,
    `to_sec       sec    Timeline time where the boundary ends (next scene start`,
    `                    for gap/overlap; audio_duration for tail).`,
    `delta_sec    sec    to_sec - from_sec. POSITIVE = gap, NEGATIVE = overlap,`,
    `                    signed for tail (positive = audio longer than video).`,
    ``,
    `----------------------------------------------------------------`,
    `timeline_overlaps.csv  (overlap rows only, unsigned duration)`,
    `----------------------------------------------------------------`,
    `index                int   Boundary index copied from timeline_gaps.`,
    `from_scene           int   scene_number ending the earlier segment.`,
    `to_scene             int   scene_number starting the later segment.`,
    `from_sec             sec   Timeline time where overlap starts.`,
    `to_sec               sec   Timeline time where overlap ends.`,
    `overlap_duration_sec sec   Positive length of the overlap (|delta_sec|).`,
    ``,
    `----------------------------------------------------------------`,
    `TIPS`,
    `----------------------------------------------------------------`,
    `- Sort effective_windows by overflow_sec DESC to surface scenes at risk of`,
    `  ending on a black/frozen frame.`,
    `- Sum kept_sec and compare with the audio duration in manifest.json.`,
    `- Filter timeline_gaps where kind = "gap" and delta_sec > 0.05 to find`,
    `  visible cuts to black on the timeline.`,
    ``,
  ].join("\n");
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Build the exact file set that goes into the debug ZIP, hash each entry with
 * SHA-256, and add a `checksums.json` manifest so recipients can verify the
 * bundle was not corrupted or tampered with in transit.
 *
 * Note: `checksums.json` cannot include its own hash, so it is intentionally
 * excluded from the digest map — verify it by rehashing the other files.
 */
export function buildMergeDebugCsvSchema() {
  return {
    schema_version: 1,
    description:
      "Column-level schema for every CSV in this bundle. Use it to build typed spreadsheet imports (e.g. Excel Power Query, pandas.read_csv dtype maps) without guessing units.",
    csv_dialect: {
      delimiter: ",",
      line_terminator: "\r\n",
      quote_char: '"',
      escape: "double-quote",
      header_row: true,
      encoding: "utf-8",
      null_value: "",
      boolean_format: "true|false (lowercase)",
    },
    files: {
      "effective_windows.csv": {
        primary_key: ["scene_number"],
        columns: [
          { name: "scene_number", type: "integer", unit: "index", min: 1, nullable: false, description: "1-based scene index shown in the UI." },
          { name: "tracking_id", type: "string", unit: null, nullable: true, pattern: "^S\\d{2}-[a-f0-9]{4}$", description: "Stable scene tracking id (blank when unset)." },
          { name: "video_url", type: "string", unit: "url", nullable: true, description: "Source video URL fed to the merge stage." },
          { name: "source_duration_sec", type: "number", unit: "seconds", min: 0, precision: 3, nullable: true, description: "Probed duration of the source clip." },
          { name: "start_offset_sec", type: "number", unit: "seconds", min: 0, precision: 3, nullable: false, description: "Trim IN point on the source clip." },
          { name: "end_offset_sec", type: "number", unit: "seconds", min: 0, precision: 3, nullable: false, description: "Trim OUT point on the source clip (start + kept)." },
          { name: "tail_cut_sec", type: "number", unit: "seconds", min: 0, precision: 3, nullable: false, description: "Extra tail trimmed after the kept region." },
          { name: "kept_sec", type: "number", unit: "seconds", min: 0, precision: 3, nullable: false, description: "Duration retained from the source." },
          { name: "overflow_sec", type: "number", unit: "seconds", min: 0, precision: 3, nullable: false, description: "How far requested_end exceeds source_duration_sec (0 = safe)." },
          { name: "overflow", type: "boolean", unit: null, nullable: false, description: "true when overflow_sec > 0.05s (risk of black/frozen tail)." },
          { name: "is_default", type: "boolean", unit: null, nullable: false, description: "true when no user trim was applied." },
        ],
      },
      "timeline_gaps.csv": {
        primary_key: ["index", "kind"],
        columns: [
          { name: "index", type: "integer", unit: "index", min: 0, nullable: false, description: "0-based boundary index (tail rows use the last scene index)." },
          { name: "kind", type: "string", unit: null, enum: ["gap", "overlap", "tail"], nullable: false, description: "Boundary kind." },
          { name: "from_scene", type: "integer", unit: "index", min: 1, nullable: true, description: "scene_number ending the earlier segment." },
          { name: "to_scene", type: "integer", unit: "index", min: 1, nullable: true, description: "scene_number starting the later segment (blank for tail)." },
          { name: "from_sec", type: "number", unit: "seconds", min: 0, precision: 3, nullable: false, description: "Timeline time where the boundary starts." },
          { name: "to_sec", type: "number", unit: "seconds", min: 0, precision: 3, nullable: false, description: "Timeline time where the boundary ends." },
          { name: "delta_sec", type: "number", unit: "seconds", precision: 3, nullable: false, description: "to_sec - from_sec. Positive = gap, negative = overlap; signed for tail." },
        ],
      },
      "timeline_overlaps.csv": {
        primary_key: ["index"],
        columns: [
          { name: "index", type: "integer", unit: "index", min: 0, nullable: false, description: "Boundary index copied from timeline_gaps." },
          { name: "from_scene", type: "integer", unit: "index", min: 1, nullable: true, description: "scene_number ending the earlier segment." },
          { name: "to_scene", type: "integer", unit: "index", min: 1, nullable: true, description: "scene_number starting the later segment." },
          { name: "from_sec", type: "number", unit: "seconds", min: 0, precision: 3, nullable: false, description: "Timeline time where overlap starts." },
          { name: "to_sec", type: "number", unit: "seconds", min: 0, precision: 3, nullable: false, description: "Timeline time where overlap ends." },
          { name: "overlap_duration_sec", type: "number", unit: "seconds", min: 0, precision: 3, nullable: false, description: "Positive length of the overlap (|delta_sec|)." },
        ],
      },
    },
  } as const;
}

export async function buildMergeDebugZipBlob(report: MergeDebugReport): Promise<Blob> {
  const { windows, gaps, overlaps } = buildMergeDebugCsv(report);
  const files: Record<string, string> = {
    "README.txt": buildMergeDebugReadme(report),
    "manifest.json": JSON.stringify(buildMergeDebugManifest(report), null, 2),
    "schema.json": JSON.stringify(buildMergeDebugCsvSchema(), null, 2),
    "merge-debug-report.json": JSON.stringify(report, null, 2),
    "effective_windows.csv": windows,
    "timeline_gaps.csv": gaps,
    "timeline_overlaps.csv": overlaps,
    "render_job_logs.txt": buildRenderJobLogText(report),
    "render_job_events.json": JSON.stringify(report.logs?.events ?? [], null, 2),
  };
  if (report.media_probe) {
    files["media_probe.json"] = JSON.stringify(report.media_probe, null, 2);
  }


  const entries = await Promise.all(
    Object.entries(files).map(async ([name, content]) => [
      name,
      { sha256: await sha256Hex(content), size_bytes: new TextEncoder().encode(content).length },
    ] as const),
  );
  const checksums = {
    algorithm: "sha256",
    encoding: "utf-8",
    generated_at: report.generated_at,
    note: "checksums.json is not self-hashed. Verify by re-hashing every other file.",
    files: Object.fromEntries(entries),
  };

  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  zip.file("checksums.json", JSON.stringify(checksums, null, 2));
  return zip.generateAsync({ type: "blob" });
}

export async function downloadMergeDebugZip(report: MergeDebugReport) {
  const blob = await buildMergeDebugZipBlob(report);
  const jobSlug = report.render_job.id ? report.render_job.id.slice(0, 8) : "no-job";
  const ts = report.generated_at.replace(/[:.]/g, "-");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `merge-debug-${jobSlug}-${ts}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
