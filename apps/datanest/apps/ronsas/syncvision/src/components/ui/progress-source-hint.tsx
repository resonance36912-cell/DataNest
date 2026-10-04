import { Activity, Clock3, CheckCircle2, CircleDashed } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ProgressSource } from "@/hooks/useSmoothedProgress";

interface ProgressSourceHintProps {
  source: ProgressSource;
  /** Epoch ms of the most recent real sample, used to render "Xs ago". */
  lastRealAt?: number | null;
  /** Optional extra classes for the wrapper badge. */
  className?: string;
  /** Render a compact dot-only variant (label hidden, tooltip retained). */
  compact?: boolean;
}

const META: Record<ProgressSource, {
  label: string;
  shortLabel: string;
  tooltip: string;
  Icon: typeof Activity;
  classes: string;
}> = {
  real: {
    label: "Live update",
    shortLabel: "Live",
    tooltip:
      "Progress is being driven by real updates from the backend (database / webhook events).",
    Icon: Activity,
    classes:
      "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
  },
  simulated: {
    label: "Estimating…",
    shortLabel: "Est.",
    tooltip:
      "No fresh backend update yet — the bar is moving on a smoothed time-based estimate while we wait for the next real sample.",
    Icon: Clock3,
    classes:
      "text-amber-300 border-amber-400/30 bg-amber-400/10",
  },
  complete: {
    label: "Complete",
    shortLabel: "Done",
    tooltip: "Job finished — bar snapped to the final value.",
    Icon: CheckCircle2,
    classes:
      "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
  },
  idle: {
    label: "Idle",
    shortLabel: "Idle",
    tooltip: "Not running.",
    Icon: CircleDashed,
    classes:
      "text-muted-foreground border-border bg-muted/30",
  },
};

export function ProgressSourceHint({ source, lastRealAt, className, compact }: ProgressSourceHintProps) {
  const meta = META[source];
  const Icon = meta.Icon;
  const ago = (() => {
    if (source !== "real" || !lastRealAt) return null;
    const secs = Math.max(0, Math.round((Date.now() - lastRealAt) / 1000));
    if (secs < 2) return "just now";
    if (secs < 60) return `${secs}s ago`;
    const m = Math.floor(secs / 60);
    return `${m}m ago`;
  })();

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none transition-colors",
              meta.classes,
              className,
            )}
            aria-label={`Progress source: ${meta.label}`}
          >
            <Icon
              className={cn(
                "h-3 w-3",
                source === "simulated" && "animate-pulse",
                source === "real" && "animate-pulse",
              )}
              aria-hidden="true"
            />
            {!compact && <span>{meta.shortLabel}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs leading-snug">
          <div className="font-semibold">{meta.label}</div>
          <div className="mt-0.5 text-muted-foreground">{meta.tooltip}</div>
          {ago && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              Last backend update: {ago}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
