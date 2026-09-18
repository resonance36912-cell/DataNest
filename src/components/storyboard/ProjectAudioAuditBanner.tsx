import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ShieldCheck, Volume2, VolumeX, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  projectId?: string | null;
  totalScenes: number;
}

interface JobRow {
  scene_number: number | null;
  created_at: string;
  input: {
    model?: string;
    audio_sent?: boolean;
    audio_stripped?: boolean;
    lipsync_mode?: string;
  } | null;
}

const LIPSYNC_DEDICATED = new Set(["sync-3", "sync-v2", "sync-so", "lipsync_dedicated"]);

/**
 * Project-level audit banner showing how many rendered scenes had audio_url
 * forwarded vs omitted, with a prominent warning count for any B-Roll or
 * instrumental scene that leaked audio to a non-dedicated model.
 */
export default function ProjectAudioAuditBanner({ projectId, totalScenes }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<JobRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    (async () => {
      const { data, error } = await supabase
        .from("render_jobs")
        .select("scene_number, created_at, input")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) setErr(error.message);
      else setRows((data ?? []) as JobRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId, reloadKey]);

  const stats = useMemo(() => {
    // Latest render per scene wins.
    const latest = new Map<number, JobRow>();
    for (const r of rows) {
      const key = r.scene_number ?? -1;
      if (!latest.has(key)) latest.set(key, r);
    }
    let rendered = 0;
    let audioSent = 0;
    let audioStripped = 0;
    let dedicated = 0;
    let leaks = 0;
    for (const r of latest.values()) {
      rendered += 1;
      const inp = r.input ?? {};
      const mode = inp.lipsync_mode ?? "";
      const isDedicated = LIPSYNC_DEDICATED.has(inp.model ?? "") || LIPSYNC_DEDICATED.has(mode);
      if (isDedicated) dedicated += 1;
      if (inp.audio_sent) audioSent += 1;
      if (inp.audio_stripped) audioStripped += 1;
      const nonARoll = mode === "b_roll" || mode === "instrumental";
      if (!isDedicated && nonARoll && inp.audio_sent) leaks += 1;
    }
    return {
      rendered,
      audioSent,
      audioOmitted: rendered - audioSent,
      audioStripped,
      dedicated,
      leaks,
      pending: Math.max(0, totalScenes - rendered),
    };
  }, [rows, totalScenes]);

  if (!projectId) return null;

  const healthy = !loading && stats.leaks === 0;

  return (
    <div
      className={`rounded-lg border px-4 py-3 flex items-center gap-4 flex-wrap ${
        stats.leaks > 0
          ? "border-destructive/50 bg-destructive/5"
          : "border-border/50 bg-secondary/20"
      }`}
    >
      <div className="flex items-center gap-2">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : stats.leaks > 0 ? (
          <AlertTriangle className="h-4 w-4 text-destructive" />
        ) : (
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
        )}
        <div className="text-xs">
          <div className="font-semibold text-foreground">Audio-forwarding audit</div>
          <div className="text-[10px] text-muted-foreground">
            Latest render per scene · {stats.rendered}/{totalScenes} scene{totalScenes === 1 ? "" : "s"} rendered
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap ml-auto text-[11px]">
        <Stat
          icon={<VolumeX className="h-3 w-3" />}
          label="audio_url omitted"
          value={stats.audioOmitted}
          tone="ok"
        />
        <Stat
          icon={<Volume2 className="h-3 w-3" />}
          label="audio_url sent"
          value={stats.audioSent}
          tone="neutral"
          sub={stats.dedicated > 0 ? `${stats.dedicated} dedicated` : undefined}
        />
        <Stat
          icon={<VolumeX className="h-3 w-3" />}
          label="policy-stripped"
          value={stats.audioStripped}
          tone={stats.audioStripped > 0 ? "ok" : "neutral"}
        />
        {stats.pending > 0 && (
          <Stat label="not yet rendered" value={stats.pending} tone="neutral" />
        )}
        <Stat
          icon={<AlertTriangle className="h-3 w-3" />}
          label={stats.leaks === 1 ? "audio leak" : "audio leaks"}
          value={stats.leaks}
          tone={stats.leaks > 0 ? "danger" : "ok"}
          emphasize={stats.leaks > 0}
        />
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="h-6 w-6 flex items-center justify-center rounded border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          title="Refresh audit"
          aria-label="Refresh audit"
          disabled={loading}
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {err && (
        <div className="w-full text-[10px] text-destructive">Failed to load render history: {err}</div>
      )}
      {healthy && stats.rendered > 0 && (
        <div className="w-full text-[10px] text-emerald-500/80">
          No B-Roll or instrumental scene received audio_url. WAN 2.5 lip-sync is scoped correctly.
        </div>
      )}
      {stats.leaks > 0 && (
        <div className="w-full text-[10px] text-destructive">
          {stats.leaks} scene{stats.leaks === 1 ? "" : "s"} rendered with audio_url on a non-A-Roll toggle — regenerate to fix instrumental lip-sync.
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
  sub,
  emphasize,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  tone: "ok" | "neutral" | "danger";
  sub?: string;
  emphasize?: boolean;
}) {
  const toneCls =
    tone === "danger"
      ? "text-destructive"
      : tone === "ok"
        ? "text-emerald-500"
        : "text-foreground";
  return (
    <div
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 ${
        emphasize
          ? "border-destructive/50 bg-destructive/10"
          : "border-border/40 bg-background/40"
      }`}
    >
      {icon && <span className={toneCls}>{icon}</span>}
      <span className={`font-mono font-semibold ${toneCls}`}>{value}</span>
      <span className="text-muted-foreground">{label}</span>
      {sub && <span className="text-[10px] text-muted-foreground/70">· {sub}</span>}
    </div>
  );
}
