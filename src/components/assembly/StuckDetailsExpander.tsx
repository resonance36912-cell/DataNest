/**
 * StuckDetailsExpander — collapsible block inside the Stuck diagnostics panel
 * that surfaces (a) the un-truncated error text and (b) a chronological list
 * of the most recent render_job_events transitions.
 *
 * Events are loaded lazily on first expand and refetched on demand so the
 * default closed state has zero network cost. We only query when there's a
 * mergeJobId — without one there's nothing meaningful to show.
 */
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw, ClipboardCopy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { copyWithFallback } from "@/lib/utils";

interface JobEvent {
  id: string;
  kind: string;
  from_value: string | null;
  to_value: string | null;
  source: string | null;
  created_at: string;
  payload: Record<string, unknown> | null;
}

interface Props {
  mergeJobId: string | null;
  errorText: string | null;
  errorCode: string | null;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return iso; }
}

const KIND_COLOR: Record<string, string> = {
  status: "text-primary",
  progress: "text-foreground/80",
  error: "text-red-400",
  merge: "text-amber-400",
  output: "text-emerald-400",
};

export default function StuckDetailsExpander({ mergeJobId, errorText, errorCode }: Props) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<JobEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!mergeJobId) return;
    setLoading(true);
    setErr(null);
    try {
      const { data, error } = await supabase
        .from("render_job_events")
        .select("id,kind,from_value,to_value,source,created_at,payload")
        .eq("render_job_id", mergeJobId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      setEvents((data ?? []) as JobEvent[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [mergeJobId]);

  // Lazy-load on first expand only.
  useEffect(() => {
    if (open && events === null && !loading) load();
  }, [open, events, loading, load]);

  const fullError = errorText
    ? `${errorCode ? `[${errorCode}] ` : ""}${errorText}`
    : null;

  const copyAll = () => {
    const lines: string[] = [];
    if (fullError) lines.push("ERROR", fullError, "");
    if (events && events.length > 0) {
      lines.push("RECENT TRANSITIONS");
      for (const ev of events) {
        const transition = ev.from_value || ev.to_value
          ? `${ev.from_value ?? "∅"} → ${ev.to_value ?? "∅"}`
          : "(no value)";
        lines.push(`${fmtTime(ev.created_at)} [${ev.kind}${ev.source ? `/${ev.source}` : ""}] ${transition}`);
      }
    }
    const ok = copyWithFallback(lines.join("\n"));
    if (ok) {
      toast.success("Details copied");
    } else {
      toast.error("Copy blocked — clipboard access denied.\nThis usually happens when the page isn't served over HTTPS. Try switching to https:// or manually select and copy the text.", {
        duration: 6000,
      });
    }
  };

  return (
    <div className="pt-1.5 border-t border-amber-500/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Full error & recent transitions
        {events && <span className="text-muted-foreground/70">· {events.length}</span>}
      </button>

      {open && (
        <div className="mt-1.5 space-y-2">
          {fullError && (
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Full error</p>
              </div>
              <pre className="text-[10px] text-red-400 bg-background/60 border border-border/40 rounded p-1.5 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono">
                {fullError}
              </pre>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-0.5">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                Recent transitions {events && `(latest ${events.length})`}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={load}
                  disabled={!mergeJobId || loading}
                  className="text-[9px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 disabled:opacity-50"
                  title="Reload events"
                >
                  <RefreshCw className={`h-2.5 w-2.5 ${loading ? "animate-spin" : ""}`} />
                  Reload
                </button>
                <button
                  type="button"
                  onClick={copyAll}
                  className="text-[9px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  title="Copy full error + transitions"
                >
                  <ClipboardCopy className="h-2.5 w-2.5" />
                  Copy
                </button>
              </div>
            </div>

            {!mergeJobId && (
              <p className="text-[10px] text-muted-foreground italic">
                No merge job id yet — transitions will appear once the job is registered.
              </p>
            )}
            {mergeJobId && loading && events === null && (
              <p className="text-[10px] text-muted-foreground italic">Loading events…</p>
            )}
            {err && (
              <p className="text-[10px] text-red-400">Failed to load: {err}</p>
            )}
            {events && events.length === 0 && !loading && (
              <p className="text-[10px] text-muted-foreground italic">No transitions recorded.</p>
            )}
            {events && events.length > 0 && (
              <ul className="space-y-0.5 max-h-48 overflow-auto rounded border border-border/40 bg-background/60 p-1.5">
                {events.map((ev) => {
                  const color = KIND_COLOR[ev.kind] ?? "text-foreground/80";
                  return (
                    <li key={ev.id} className="text-[10px] font-mono leading-relaxed flex items-start gap-1.5">
                      <span className="text-muted-foreground/70 tabular-nums shrink-0">
                        {fmtTime(ev.created_at)}
                      </span>
                      <span className={`uppercase shrink-0 ${color}`}>{ev.kind}</span>
                      {ev.source && (
                        <span className="text-muted-foreground/60 shrink-0">/{ev.source}</span>
                      )}
                      <span className="text-foreground/80 truncate" title={`${ev.from_value ?? "∅"} → ${ev.to_value ?? "∅"}`}>
                        {ev.from_value || ev.to_value
                          ? <>{ev.from_value ?? "∅"} <span className="text-muted-foreground">→</span> {ev.to_value ?? "∅"}</>
                          : <span className="text-muted-foreground italic">(no value)</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
