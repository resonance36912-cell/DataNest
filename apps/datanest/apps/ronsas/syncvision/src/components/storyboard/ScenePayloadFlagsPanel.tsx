import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ShieldCheck, ShieldAlert, FileJson } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  projectId?: string;
  sceneNumber: number;
  /** UI hint of the scene's role — used to flag mismatches vs. the actual payload. */
  isARoll: boolean;
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

interface JobRow {
  id: string;
  provider: string | null;
  status: string | null;
  created_at: string;
  input: {
    model?: string;
    audio_sent?: boolean;
    audio_stripped?: boolean;
    lipsync_mode?: string;
    is_broll?: boolean | null;
    is_instrumental?: boolean | null;
    is_aroll?: boolean | null;
    wan_payload_flags?: PayloadFlags;
  } | null;
}

/**
 * Displays the exact payload flags sent to the video generator for the most
 * recent render of a scene. Flags mismatches so users can confirm audio_url
 * was omitted for B-Roll / instrumental scenes.
 */
export default function ScenePayloadFlagsPanel({ projectId, sceneNumber, isARoll }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<JobRow | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    (async () => {
      const { data, error } = await supabase
        .from("render_jobs")
        .select("id, provider, status, created_at, input")
        .eq("project_id", projectId)
        .eq("scene_number", sceneNumber)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error) setErr(error.message);
      else setJob(data as JobRow | null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, projectId, sceneNumber]);

  const flags = job?.input?.wan_payload_flags;
  const audioSent = job?.input?.audio_sent === true;
  const audioStripped = job?.input?.audio_stripped === true;
  const mode = job?.input?.lipsync_mode ?? "unknown";
  // A B-Roll / instrumental scene must never have audio_url in the payload.
  const audioLeak = !isARoll && audioSent && mode !== "lipsync_dedicated";
  const healthy = !audioLeak;

  return (
    <div className="rounded-lg border border-border/50 bg-secondary/20 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-secondary/40 transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <FileJson className="h-3 w-3 text-primary" />
        <span className="font-medium">Provider payload flags</span>
        {job && (
          <span className={`ml-auto flex items-center gap-1 ${healthy ? "text-emerald-500" : "text-destructive"}`}>
            {healthy ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
            {healthy ? "OK" : "audio leak"}
          </span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          {loading && <div className="text-muted-foreground">Loading last render…</div>}
          {err && <div className="text-destructive">Error: {err}</div>}
          {!loading && !err && !job && (
            <div className="text-muted-foreground">No render job recorded for this scene yet.</div>
          )}
          {job && (
            <>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <Row label="Model" value={String(job.input?.model ?? job.provider ?? "—")} />
                <Row label="Lip-sync mode" value={mode} />
                <Row label="audio_url sent" value={audioSent ? "YES" : "no"} bad={audioLeak} good={!isARoll && !audioSent} />
                <Row label="audio_url stripped" value={audioStripped ? "yes" : "no"} good={audioStripped} />
                <Row label="is_aroll" value={fmtBool(job.input?.is_aroll)} />
                <Row label="is_broll" value={fmtBool(job.input?.is_broll)} />
                <Row label="is_instrumental" value={fmtBool(job.input?.is_instrumental)} />
                <Row label="Status" value={String(job.status ?? "—")} />
              </div>

              {audioLeak && (
                <div className="rounded border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-destructive">
                  ⚠ audio_url was forwarded to the provider for a {mode === "b_roll" ? "B-Roll" : mode === "instrumental" ? "instrumental" : "non-A-Roll"} scene.
                  Toggle this scene to A-Roll or regenerate — WAN 2.5 will lip-sync to the instrumental.
                </div>
              )}

              {flags && (
                <div className="space-y-1 border-t border-border/40 pt-2">
                  <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Exact keys sent</div>
                  <div className="flex flex-wrap gap-1">
                    {(flags.keys_sent ?? []).map((k) => (
                      <span
                        key={k}
                        className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
                          k === "audio_url"
                            ? "border-amber-500/40 text-amber-500 bg-amber-500/5"
                            : "border-border/50 text-foreground/80 bg-background/40"
                        }`}
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                  <div className="text-[10px] text-muted-foreground break-all">
                    Endpoint: <span className="font-mono">{flags.endpoint ?? "—"}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bad, good }: { label: string; value: string; bad?: boolean; good?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${bad ? "text-destructive" : good ? "text-emerald-500" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function fmtBool(v: boolean | null | undefined) {
  if (v === true) return "true";
  if (v === false) return "false";
  return "—";
}
