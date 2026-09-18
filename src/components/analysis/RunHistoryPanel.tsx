import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, History, Loader2, RotateCcw, CheckCircle2, Database, FileText, Zap, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/contexts/ProjectContext";
import TranscriptDiffDialog from "./TranscriptDiffDialog";


type TranscriptRow = {
  kind: "transcript";
  id: string;
  ts: string;
  version_number: number;
  type: string;
  status: string;
  word_count: number | null;
};

type VerificationRow = {
  kind: "verification";
  id: string;
  ts: string;
  mode: string;
  hit_count: number;
  created_at: string;
  bpm: number | null;
  confidence_lyrics: number | null;
};

type Row = TranscriptRow | VerificationRow;

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function RunHistoryPanel() {
  const { projectId, activeTranscriptVersionId, setActiveTranscriptVersionId } = useProject();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [diffOpen, setDiffOpen] = useState(false);

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };


  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [tv, vc] = await Promise.all([
        supabase
          .from("transcript_versions")
          .select("id, version_number, type, status, created_at, updated_at, full_text")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(25),
        supabase
          .from("verification_cache")
          .select("id, mode, hit_count, created_at, last_used_at, result")
          .order("last_used_at", { ascending: false })
          .limit(25),
      ]);

      if (tv.error) throw tv.error;
      if (vc.error) throw vc.error;

      const tRows: TranscriptRow[] = (tv.data ?? []).map((r: any) => ({
        kind: "transcript",
        id: r.id,
        ts: r.updated_at ?? r.created_at,
        version_number: r.version_number,
        type: r.type,
        status: r.status,
        word_count: typeof r.full_text === "string" ? r.full_text.split(/\s+/).filter(Boolean).length : null,
      }));
      const vRows: VerificationRow[] = (vc.data ?? []).map((r: any) => ({
        kind: "verification",
        id: r.id,
        ts: r.last_used_at,
        mode: r.mode,
        hit_count: r.hit_count ?? 0,
        created_at: r.created_at,
        bpm: r.result?.bpm ?? null,
        confidence_lyrics: r.result?.confidence_lyrics ?? null,
      }));

      const merged = [...tRows, ...vRows].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
      setRows(merged);
    } catch (err) {
      toast.error("Failed to load run history", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handleRollback = useCallback(async (row: TranscriptRow) => {
    if (!projectId) return;
    if (row.id === activeTranscriptVersionId) {
      toast.info("This version is already active");
      return;
    }
    setSwitchingId(row.id);
    const t = toast.loading(`Rolling back to v${row.version_number}…`);
    try {
      const { error } = await supabase.rpc("atomic_switch_active_transcript", {
        p_project_id: projectId,
        p_new_version_id: row.id,
      });
      if (error) throw error;
      setActiveTranscriptVersionId(row.id);
      toast.success(`Switched to transcript v${row.version_number}`, { id: t });
      await load();
    } catch (err) {
      toast.error("Rollback failed", { id: t, description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSwitchingId(null);
    }
  }, [projectId, activeTranscriptVersionId, setActiveTranscriptVersionId, load]);

  return (
    <div className="glass-card p-4">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <History className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Run history</span>
          <span className="text-xs text-muted-foreground">Transcript versions & verification runs</span>
        </div>
        {open && (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              disabled={selected.length !== 2}
              onClick={() => setDiffOpen(true)}
              title={selected.length === 2 ? "Compare selected transcripts" : "Select 2 transcript versions"}
            >
              <ArrowLeftRight className="h-3 w-3" />
              Compare {selected.length > 0 ? `(${selected.length}/2)` : ""}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-xs"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Refresh
            </Button>
          </div>
        )}
      </button>


      {open && (
        <div className="mt-4 space-y-2">
          {loading && rows.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          )}
          {!loading && rows.length === 0 && (
            <p className="text-xs text-muted-foreground py-4">No runs yet for this project.</p>
          )}

          {rows.map((row) => {
            if (row.kind === "transcript") {
              const isActive = row.id === activeTranscriptVersionId;
              return (
                <div
                  key={`t-${row.id}`}
                  className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs ${
                    isActive ? "border-primary/40 bg-primary/5" : "border-border bg-background/40"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Checkbox
                      checked={selected.includes(row.id)}
                      onCheckedChange={() => toggleSelected(row.id)}
                      aria-label={`Select transcript v${row.version_number} for diff`}
                      className="shrink-0"
                    />
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">Transcript v{row.version_number}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {row.type}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                          row.status === "active" ? "bg-success/15 text-success" :
                          row.status === "accepted" ? "bg-primary/15 text-primary" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {row.status}
                        </span>
                        {isActive && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-success">
                            <CheckCircle2 className="h-3 w-3" /> current
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground mt-0.5">
                        {timeAgo(row.ts)} · {new Date(row.ts).toLocaleString()}
                        {row.word_count != null ? ` · ${row.word_count} words` : ""}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs shrink-0"
                    disabled={isActive || switchingId === row.id}
                    onClick={() => handleRollback(row)}
                  >
                    {switchingId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                    {isActive ? "Active" : "Rollback"}
                  </Button>
                </div>
              );
            }
            const reused = row.hit_count > 0;
            return (
              <div
                key={`v-${row.id}`}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {reused ? <Database className="h-3.5 w-3.5 text-success shrink-0" /> : <Zap className="h-3.5 w-3.5 text-primary shrink-0" />}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">Verification</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {row.mode}
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                        reused ? "bg-success/15 text-success" : "bg-primary/15 text-primary"
                      }`}>
                        {reused ? `cached · ${row.hit_count}× reused` : "fresh"}
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-0.5">
                      {timeAgo(row.ts)} · {new Date(row.ts).toLocaleString()}
                      {row.bpm ? ` · BPM ${row.bpm}` : ""}
                      {row.confidence_lyrics != null ? ` · lyrics ${Math.round(row.confidence_lyrics)}%` : ""}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  created {timeAgo(row.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <TranscriptDiffDialog
        open={diffOpen}
        onOpenChange={setDiffOpen}
        leftId={selected[0] ?? null}
        rightId={selected[1] ?? null}
      />
    </div>
  );
}
