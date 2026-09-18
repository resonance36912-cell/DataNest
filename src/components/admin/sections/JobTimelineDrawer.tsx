/**
 * JobTimelineDrawer — Admin-facing chronological timeline of every transition
 * recorded for a single render_jobs row, sourced from `render_job_events`.
 *
 * The trigger on render_jobs writes one event per material change (status,
 * progress bucket, error, merge, output URL), tagged with the actor source
 * — `webhook`/`system` for service-role writes (provider webhooks, polling
 * workers), `client` when the owning user wrote it, and `admin` when another
 * user (e.g. a moderator) did. That lets us label rows so it's obvious
 * whether a transition came from a webhook callback or a manual action.
 *
 * Realtime subscription keeps the drawer live while the user watches a job
 * — useful for confirming a manual reconcile/cancel actually moved state.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertCircle, ArrowRight, CheckCircle2, Clock, Cloud,
  RefreshCw, Server, User as UserIcon, Webhook, XCircle,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface JobTimelineDrawerProps {
  jobId: string | null;
  onClose: () => void;
}

interface JobEventRow {
  id: string;
  render_job_id: string;
  user_id: string | null;
  kind: string;
  from_value: string | null;
  to_value: string | null;
  source: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

const KIND_ICON: Record<string, typeof Activity> = {
  status: ArrowRight,
  progress: Activity,
  error: AlertCircle,
  merge: Cloud,
  output: CheckCircle2,
  manual: UserIcon,
};

const KIND_TONE: Record<string, string> = {
  status: "text-primary",
  progress: "text-muted-foreground",
  error: "text-destructive",
  merge: "text-amber-400",
  output: "text-emerald-400",
  manual: "text-foreground",
};

const SOURCE_LABEL: Record<string, { label: string; Icon: typeof Activity; tone: string }> = {
  webhook: { label: "Webhook", Icon: Webhook, tone: "bg-primary/10 text-primary border-primary/30" },
  system: { label: "System / Worker", Icon: Server, tone: "bg-muted/50 text-muted-foreground border-muted-foreground/30" },
  poll: { label: "Polling", Icon: RefreshCw, tone: "bg-muted/50 text-muted-foreground border-muted-foreground/30" },
  client: { label: "Client (owner)", Icon: UserIcon, tone: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  admin: { label: "Admin", Icon: UserIcon, tone: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
};

function fmtAbs(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { hour12: false });
  } catch {
    return iso;
  }
}

function fmtRel(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (Number.isNaN(diff)) return "";
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function JobTimelineDrawer({ jobId, onClose }: JobTimelineDrawerProps) {
  const [events, setEvents] = useState<JobEventRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Load + subscribe whenever a new jobId is selected.
  useEffect(() => {
    if (!jobId) { setEvents([]); return; }
    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from("render_job_events")
        .select("*")
        .eq("render_job_id", jobId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (cancelled) return;
      if (error) {
        toast.error("Failed to load job events");
        setEvents([]);
      } else {
        setEvents((data as JobEventRow[]) ?? []);
      }
      setLoading(false);
    })();

    // Live updates while the drawer is open — new transitions stream in
    // without the admin needing to click Refresh.
    const channel = supabase
      .channel(`render-job-events:${jobId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "render_job_events", filter: `render_job_id=eq.${jobId}` },
        (payload) => {
          if (cancelled) return;
          const row = payload.new as JobEventRow;
          setEvents((prev) => (prev.find((e) => e.id === row.id) ? prev : [...prev, row]));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    return counts;
  }, [events]);

  return (
    <Sheet open={!!jobId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4" /> Job timeline
          </SheetTitle>
          <SheetDescription className="text-[11px] font-mono break-all">
            {jobId}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-center gap-1.5 mt-3 mb-2">
          {Object.entries(summary).map(([kind, count]) => (
            <Badge key={kind} variant="outline" className="text-[10px]">
              {kind}: {count}
            </Badge>
          ))}
          {!loading && events.length === 0 && (
            <span className="text-[11px] text-muted-foreground">
              No transitions recorded for this job yet.
            </span>
          )}
          {loading && (
            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" /> loading…
            </span>
          )}
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <ol className="relative border-l border-border/60 ml-2 space-y-3 pb-6">
            {events.map((e) => {
              const Icon = KIND_ICON[e.kind] ?? Activity;
              const tone = KIND_TONE[e.kind] ?? "text-foreground";
              const src = SOURCE_LABEL[e.source ?? ""] ?? {
                label: e.source ?? "unknown",
                Icon: Server,
                tone: "bg-muted/50 text-muted-foreground border-muted-foreground/30",
              };
              const SrcIcon = src.Icon;
              const failed = e.kind === "error" || e.to_value === "failed";
              const succeeded = e.to_value === "succeeded" || e.to_value === "completed" || e.kind === "output";
              const TerminalIcon = failed ? XCircle : succeeded ? CheckCircle2 : Icon;

              return (
                <li key={e.id} className="relative pl-5">
                  <span
                    className={`absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border border-border/60 bg-background flex items-center justify-center ${tone}`}
                  >
                    <TerminalIcon className="h-2.5 w-2.5" />
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`text-xs font-semibold ${tone}`}>{e.kind}</span>
                    {(e.from_value || e.to_value) && (
                      <span className="text-xs text-muted-foreground">
                        {e.from_value ?? "—"} <ArrowRight className="inline h-3 w-3 mx-0.5" /> {e.to_value ?? "—"}
                      </span>
                    )}
                    <Badge variant="outline" className={`text-[9px] gap-1 ml-auto ${src.tone}`}>
                      <SrcIcon className="h-2.5 w-2.5" /> {src.label}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5" title={fmtAbs(e.created_at)}>
                    {fmtAbs(e.created_at)} · {fmtRel(e.created_at)}
                  </div>
                  {e.payload && Object.keys(e.payload).length > 0 && (
                    <pre className="mt-1 rounded bg-muted/40 border border-border/40 p-2 text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(e.payload, null, 2)}
                    </pre>
                  )}
                </li>
              );
            })}
          </ol>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
