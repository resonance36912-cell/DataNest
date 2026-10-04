import { useState } from "react";
import { Download, FileJson, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  projectId?: string | null;
}

interface PayloadFlags {
  endpoint?: string;
  keys_sent?: string[];
  has_image_url?: boolean;
  has_video_url?: boolean;
  has_audio_url?: boolean;
  has_source_image_url?: boolean;
  has_driven_audio_url?: boolean;
  duration?: unknown;
  resolution?: unknown;
  aspect_ratio?: unknown;
  enable_safety_checker?: unknown;
  sync_mode?: unknown;
  provider_model?: unknown;
}

interface JobInput {
  model?: string;
  audio_sent?: boolean;
  audio_stripped?: boolean;
  lipsync_mode?: string;
  is_broll?: boolean | null;
  is_instrumental?: boolean | null;
  is_aroll?: boolean | null;
  wan_payload_flags?: PayloadFlags;
  prompt?: string;
}

interface JobRow {
  id: string;
  scene_number: number | null;
  tracking_id: string | null;
  provider: string | null;
  status: string | null;
  created_at: string;
  input: JobInput | null;
}

interface FlagRow {
  scene_number: number | null;
  tracking_id: string | null;
  job_id: string;
  created_at: string;
  provider: string | null;
  status: string | null;
  model: string | null;
  lipsync_mode: string;
  is_aroll: boolean | null;
  is_broll: boolean | null;
  is_instrumental: boolean | null;
  audio_sent: boolean;
  audio_stripped: boolean;
  audio_leak: boolean;
  endpoint: string;
  keys_sent: string[];
  has_image_url: boolean;
  has_video_url: boolean;
  has_source_image_url: boolean;
  has_driven_audio_url: boolean;
  duration: string;
  resolution: string;
  aspect_ratio: string;
  sync_mode: string;
}

const LIPSYNC_DEDICATED = new Set(["sync-3", "sync-v2", "sync-so", "lipsync_dedicated"]);

function toRow(job: JobRow): FlagRow {
  const inp = job.input ?? {};
  const flags = inp.wan_payload_flags ?? {};
  const audioSent = inp.audio_sent === true;
  const mode = inp.lipsync_mode ?? "unknown";
  const isDedicated = LIPSYNC_DEDICATED.has(inp.model ?? "") || LIPSYNC_DEDICATED.has(mode);
  const nonARoll = inp.is_aroll === false || inp.is_broll === true || inp.is_instrumental === true;
  const audioLeak = !isDedicated && nonARoll && audioSent;
  return {
    scene_number: job.scene_number,
    tracking_id: job.tracking_id,
    job_id: job.id,
    created_at: job.created_at,
    provider: job.provider,
    status: job.status,
    model: inp.model ?? null,
    lipsync_mode: mode,
    is_aroll: inp.is_aroll ?? null,
    is_broll: inp.is_broll ?? null,
    is_instrumental: inp.is_instrumental ?? null,
    audio_sent: audioSent,
    audio_stripped: inp.audio_stripped === true,
    audio_leak: audioLeak,
    endpoint: String(flags.endpoint ?? ""),
    keys_sent: flags.keys_sent ?? [],
    has_image_url: flags.has_image_url === true,
    has_video_url: flags.has_video_url === true,
    has_source_image_url: flags.has_source_image_url === true,
    has_driven_audio_url: flags.has_driven_audio_url === true,
    duration: String(flags.duration ?? ""),
    resolution: String(flags.resolution ?? ""),
    aspect_ratio: String(flags.aspect_ratio ?? ""),
    sync_mode: String(flags.sync_mode ?? ""),
  };
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("|") : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: FlagRow[]): string {
  if (rows.length === 0) return "scene_number\n";
  const cols = Object.keys(rows[0]) as (keyof FlagRow)[];
  const header = cols.join(",");
  const body = rows.map((r) => cols.map((c) => csvEscape(r[c])).join(",")).join("\n");
  return `${header}\n${body}\n`;
}

function download(name: string, mime: string, body: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Exports the persisted provider-payload flags (from render_jobs.input) for
 * every scene in the current project. Latest render per scene wins. Includes
 * an `audio_leak` boolean flagging any non-A-Roll scene where audio_url was
 * forwarded to a non-dedicated model.
 */
export default function ExportPayloadFlagsButton({ projectId }: Props) {
  const [loading, setLoading] = useState(false);

  const fetchRows = async (): Promise<FlagRow[] | null> => {
    if (!projectId) {
      toast.error("No project loaded");
      return null;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("render_jobs")
        .select("id, scene_number, tracking_id, provider, status, created_at, input")
        .eq("project_id", projectId)
        .order("scene_number", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Keep only the most recent render per scene_number.
      const latest = new Map<number, JobRow>();
      for (const raw of (data ?? []) as JobRow[]) {
        const key = raw.scene_number ?? -1;
        if (!latest.has(key)) latest.set(key, raw);
      }
      const rows = Array.from(latest.values())
        .map(toRow)
        .sort((a, b) => (a.scene_number ?? 0) - (b.scene_number ?? 0));
      return rows;
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const exportJson = async () => {
    const rows = await fetchRows();
    if (!rows) return;
    const leaks = rows.filter((r) => r.audio_leak).length;
    const body = JSON.stringify(
      {
        project_id: projectId,
        exported_at: new Date().toISOString(),
        scene_count: rows.length,
        audio_leak_count: leaks,
        scenes: rows,
      },
      null,
      2,
    );
    download(`wan-payload-flags-${projectId}.json`, "application/json", body);
    toast.success(`Exported ${rows.length} scene${rows.length === 1 ? "" : "s"}${leaks ? ` — ${leaks} audio leak${leaks === 1 ? "" : "s"}` : ""}`);
  };

  const exportCsv = async () => {
    const rows = await fetchRows();
    if (!rows) return;
    const leaks = rows.filter((r) => r.audio_leak).length;
    download(`wan-payload-flags-${projectId}.csv`, "text/csv", toCsv(rows));
    toast.success(`Exported ${rows.length} scene${rows.length === 1 ? "" : "s"}${leaks ? ` — ${leaks} audio leak${leaks === 1 ? "" : "s"}` : ""}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={loading || !projectId}
          className="h-7 gap-1.5 text-[11px]"
          title="Export the exact provider-payload flags recorded for each scene"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          Payload flags
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="text-xs">
        <DropdownMenuItem onClick={exportJson} className="gap-2">
          <FileJson className="h-3.5 w-3.5" /> Download JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportCsv} className="gap-2">
          <FileSpreadsheet className="h-3.5 w-3.5" /> Download CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
