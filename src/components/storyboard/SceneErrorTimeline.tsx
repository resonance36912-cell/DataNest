import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, AlertCircle, Ban, CheckCircle2, Activity, Play, Clock, Info, RefreshCw } from "lucide-react";
import type { PollEvent, PollEventType, VideoJobState } from "@/types/storyboard";

interface SceneErrorTimelineProps {
  events?: PollEvent[];
  /** Final failure reason — surfaced prominently at the top when present. */
  finalError?: string;
  /** Whether this scene timed out (changes the failure-icon flavor). */
  timedOut?: boolean;
  /** Status drives the default open/closed state — failed scenes start open. */
  status?: VideoJobState["status"];
}

const TYPE_LABEL: Record<PollEventType, string> = {
  start: "Job started",
  poll: "Status check",
  phase: "Phase change",
  reconcile_ok: "Provider check OK",
  reconcile_fail: "Provider check failed",
  warning: "Warning",
  timeout: "Timed out",
  error: "Failed",
  canceled: "Canceled",
  done: "Completed",
};

function iconFor(type: PollEventType) {
  const cls = "h-3 w-3 shrink-0";
  switch (type) {
    case "start": return <Play className={`${cls} text-primary`} />;
    case "poll": return <Activity className={`${cls} text-muted-foreground`} />;
    case "phase": return <RefreshCw className={`${cls} text-primary`} />;
    case "reconcile_ok": return <CheckCircle2 className={`${cls} text-emerald-400`} />;
    case "reconcile_fail": return <AlertCircle className={`${cls} text-amber-400`} />;
    case "warning": return <AlertTriangle className={`${cls} text-amber-400`} />;
    case "timeout": return <Clock className={`${cls} text-destructive`} />;
    case "error": return <AlertTriangle className={`${cls} text-destructive`} />;
    case "canceled": return <Ban className={`${cls} text-muted-foreground`} />;
    case "done": return <CheckCircle2 className={`${cls} text-emerald-400`} />;
    default: return <Info className={cls} />;
  }
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

function relTime(fromTs: number, toTs: number): string {
  const dMs = Math.max(0, toTs - fromTs);
  if (dMs < 1000) return "+0s";
  if (dMs < 60_000) return `+${Math.round(dMs / 1000)}s`;
  const m = Math.floor(dMs / 60_000);
  const s = Math.round((dMs % 60_000) / 1000);
  return s ? `+${m}m${s}s` : `+${m}m`;
}

export default function SceneErrorTimeline({
  events,
  finalError,
  timedOut,
  status,
}: SceneErrorTimelineProps) {
  const isFailed = status === "error";
  const [open, setOpen] = useState<boolean>(isFailed);

  const list = useMemo(() => events ?? [], [events]);
  if (list.length === 0 && !finalError) return null;

  const firstTs = list[0]?.ts ?? Date.now();
  const count = list.length;

  return (
    <div className="rounded-md border border-border/60 bg-background/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted/30 rounded-md transition-colors"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {isFailed ? (
            <AlertTriangle className="h-3 w-3 text-destructive" />
          ) : (
            <Activity className="h-3 w-3 text-muted-foreground" />
          )}
          <span>Polling timeline</span>
          <span className="text-muted-foreground font-normal">({count} event{count === 1 ? "" : "s"})</span>
        </span>
        {isFailed && finalError && (
          <span className="text-destructive font-normal truncate max-w-[55%]" title={finalError}>
            {timedOut ? "timed out" : "failed"}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-border/60 px-2.5 py-2 space-y-1.5 max-h-56 overflow-y-auto">
          {finalError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
              <div className="flex items-start gap-1.5">
                {timedOut ? <Clock className="h-3 w-3 mt-0.5 shrink-0" /> : <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />}
                <div className="min-w-0">
                  <p className="font-semibold">Final failure reason</p>
                  <p className="font-normal break-words">{finalError}</p>
                </div>
              </div>
            </div>
          )}

          {list.length === 0 ? (
            <p className="text-[11px] text-muted-foreground px-1 py-2">No polling events recorded yet.</p>
          ) : (
            <ol className="space-y-1">
              {list.map((evt, i) => (
                <li
                  key={`${evt.ts}-${i}`}
                  className="flex items-start gap-2 px-1 py-1 rounded text-[11px] leading-snug"
                >
                  <span className="mt-0.5">{iconFor(evt.type)}</span>
                  <span className="text-muted-foreground tabular-nums w-[58px] shrink-0">
                    {formatTime(evt.ts)}
                  </span>
                  <span className="text-muted-foreground/70 tabular-nums w-[44px] shrink-0">
                    {relTime(firstTs, evt.ts)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="text-foreground font-medium">{TYPE_LABEL[evt.type]}</span>
                    {evt.phase && (
                      <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        · {evt.phase}
                      </span>
                    )}
                    {typeof evt.progress === "number" && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        · {Math.round(evt.progress)}%
                      </span>
                    )}
                    {evt.message && (
                      <span className="block text-muted-foreground break-words">{evt.message}</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
