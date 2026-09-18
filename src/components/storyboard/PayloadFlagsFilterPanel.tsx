import { useEffect, useMemo, useState } from "react";
import { Search, Filter, AlertTriangle, VolumeX, Volume2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { Scene } from "@/contexts/ProjectContext";

type FilterKey = "all" | "audio_sent" | "audio_stripped" | "mismatch" | "leak" | "no_render";

interface Props {
  projectId?: string | null;
  scenes: Scene[];
  onSelectScene: (idx: number) => void;
}

interface JobRow {
  scene_number: number | null;
  created_at: string;
  status: string | null;
  input: {
    model?: string;
    audio_sent?: boolean;
    audio_stripped?: boolean;
    lipsync_mode?: string;
  } | null;
}

interface SceneMeta {
  index: number;
  scene: Scene;
  uiRole: "a_roll" | "b_roll";
  hasRender: boolean;
  audioSent: boolean;
  audioStripped: boolean;
  lipsyncMode: string;
  model: string | null;
  mismatch: boolean;
  audioLeak: boolean;
  status: string | null;
}

const LIPSYNC_DEDICATED = new Set(["sync-3", "sync-v2", "sync-so", "lipsync_dedicated"]);

/**
 * Search + filter surface for auditing WAN payload flags per scene.
 * Highlights scenes where audio_url was forwarded, or where the persisted
 * lipsync_mode disagrees with the scene's current A-Roll/B-Roll toggle.
 */
export default function PayloadFlagsFilterPanel({ projectId, scenes, onSelectScene }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<Map<number, JobRow>>(new Map());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("render_jobs")
        .select("scene_number, created_at, status, input")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (!error && data) {
        const latest = new Map<number, JobRow>();
        for (const row of data as JobRow[]) {
          const key = row.scene_number ?? -1;
          if (!latest.has(key)) latest.set(key, row);
        }
        setJobs(latest);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, projectId]);

  const meta: SceneMeta[] = useMemo(() => {
    return scenes.map((s, index) => {
      const job = jobs.get(s.scene_number);
      const inp = job?.input ?? {};
      const uiRole: "a_roll" | "b_roll" = s.is_broll === true ? "b_roll" : "a_roll";
      const lipsyncMode = inp.lipsync_mode ?? "";
      const audioSent = inp.audio_sent === true;
      const isDedicated = LIPSYNC_DEDICATED.has(inp.model ?? "") || LIPSYNC_DEDICATED.has(lipsyncMode);
      const nonARoll = lipsyncMode === "b_roll" || lipsyncMode === "instrumental";
      const audioLeak = !isDedicated && nonARoll && audioSent;
      // Mismatch: the persisted lipsync_mode doesn't match the current UI toggle.
      // Ignore dedicated-model renders (they're allowed to send audio for any role).
      const persistedRole = lipsyncMode === "a_roll" ? "a_roll" : nonARoll ? "b_roll" : null;
      const mismatch = !!job && !isDedicated && persistedRole !== null && persistedRole !== uiRole;
      return {
        index,
        scene: s,
        uiRole,
        hasRender: !!job,
        audioSent,
        audioStripped: inp.audio_stripped === true,
        lipsyncMode: lipsyncMode || "—",
        model: inp.model ?? null,
        mismatch,
        audioLeak,
        status: job?.status ?? null,
      };
    });
  }, [scenes, jobs]);

  const counts = useMemo(() => ({
    all: meta.length,
    audio_sent: meta.filter((m) => m.audioSent).length,
    audio_stripped: meta.filter((m) => m.audioStripped).length,
    mismatch: meta.filter((m) => m.mismatch).length,
    leak: meta.filter((m) => m.audioLeak).length,
    no_render: meta.filter((m) => !m.hasRender).length,
  }), [meta]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return meta.filter((m) => {
      if (filter === "audio_sent" && !m.audioSent) return false;
      if (filter === "audio_stripped" && !m.audioStripped) return false;
      if (filter === "mismatch" && !m.mismatch) return false;
      if (filter === "leak" && !m.audioLeak) return false;
      if (filter === "no_render" && m.hasRender) return false;
      if (!q) return true;
      const hay = [
        `s${m.scene.scene_number}`,
        m.scene.trackingId ?? "",
        m.scene.lyric_segment ?? "",
        m.scene.section_type ?? "",
        m.lipsyncMode,
        m.model ?? "",
        m.uiRole,
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [meta, filter, query]);

  const totalAlerts = counts.leak + counts.mismatch;

  return (
    <div className="rounded-lg border border-border/50 bg-secondary/10 px-3 py-2 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-xs font-semibold text-foreground hover:text-primary transition-colors"
        >
          <Filter className="h-3.5 w-3.5" />
          Payload flag search &amp; filter
          {totalAlerts > 0 && (
            <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/5 text-[10px] px-1.5 py-0 gap-1">
              <AlertTriangle className="h-2.5 w-2.5" /> {totalAlerts}
            </Badge>
          )}
        </button>
        {open && loading && <span className="text-[10px] text-muted-foreground">Loading renders…</span>}
      </div>

      {open && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by scene #, tracking ID, lyric, model…"
                className="h-7 pl-7 text-[11px]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <XCircle className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Chip active={filter === "all"} onClick={() => setFilter("all")} count={counts.all} label="All" />
              <Chip active={filter === "audio_sent"} onClick={() => setFilter("audio_sent")} count={counts.audio_sent} label={<><Volume2 className="h-2.5 w-2.5" /> audio_url sent</>} />
              <Chip active={filter === "audio_stripped"} onClick={() => setFilter("audio_stripped")} count={counts.audio_stripped} label={<><VolumeX className="h-2.5 w-2.5" /> stripped</>} />
              <Chip active={filter === "mismatch"} onClick={() => setFilter("mismatch")} count={counts.mismatch} label="Mode ≠ toggle" tone={counts.mismatch ? "warn" : undefined} />
              <Chip active={filter === "leak"} onClick={() => setFilter("leak")} count={counts.leak} label={<><AlertTriangle className="h-2.5 w-2.5" /> audio leak</>} tone={counts.leak ? "danger" : undefined} />
              <Chip active={filter === "no_render"} onClick={() => setFilter("no_render")} count={counts.no_render} label="No render" />
            </div>
          </div>

          <div className="rounded-md border border-border/50 divide-y divide-border/30 max-h-[280px] overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">No scenes match this filter.</div>
            )}
            {filtered.map((m) => (
              <button
                type="button"
                key={m.index}
                onClick={() => onSelectScene(m.index)}
                className="w-full text-left px-3 py-2 hover:bg-secondary/40 transition-colors flex items-center gap-2 text-[11px]"
              >
                <span className="font-mono text-foreground/80 shrink-0">S{String(m.scene.scene_number).padStart(2, "0")}</span>
                {m.scene.trackingId && (
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0">{m.scene.trackingId}</span>
                )}
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 shrink-0 ${
                    m.uiRole === "a_roll"
                      ? "border-primary/40 text-primary bg-primary/5"
                      : "border-muted-foreground/30 text-muted-foreground"
                  }`}
                >
                  {m.uiRole === "a_roll" ? "A-Roll" : "B-Roll"}
                </Badge>
                <span className="text-muted-foreground shrink-0">→</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 shrink-0 font-mono ${
                    m.mismatch
                      ? "border-amber-500/50 text-amber-500 bg-amber-500/5"
                      : "border-border/50 text-foreground/80"
                  }`}
                >
                  {m.lipsyncMode}
                </Badge>
                {m.audioSent ? (
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 shrink-0 gap-0.5 ${
                      m.audioLeak
                        ? "border-destructive/50 text-destructive bg-destructive/5"
                        : "border-emerald-500/40 text-emerald-500 bg-emerald-500/5"
                    }`}
                  >
                    <Volume2 className="h-2.5 w-2.5" /> audio_url
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 gap-0.5 border-muted-foreground/30 text-muted-foreground">
                    <VolumeX className="h-2.5 w-2.5" /> no audio
                  </Badge>
                )}
                <span className="truncate flex-1 text-muted-foreground italic">
                  {m.scene.lyric_segment || "instrumental"}
                </span>
                {m.audioLeak && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Chip({
  active, onClick, count, label, tone,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  label: React.ReactNode;
  tone?: "danger" | "warn";
}) {
  const base = active
    ? tone === "danger"
      ? "bg-destructive/15 border-destructive/50 text-destructive"
      : tone === "warn"
        ? "bg-amber-500/15 border-amber-500/50 text-amber-500"
        : "bg-primary/15 border-primary/50 text-primary"
    : "bg-transparent border-border/50 text-muted-foreground hover:text-foreground hover:border-border";
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      className={`h-6 px-2 gap-1 text-[10px] rounded-full border ${base}`}
    >
      <span className="flex items-center gap-1">{label}</span>
      <span className="font-mono opacity-80">{count}</span>
    </Button>
  );
}
