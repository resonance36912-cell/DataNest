/**
 * ScenePhaseTimeline — compact horizontal timeline showing the lifecycle of
 * a per-scene render job (queued → processing → succeeded/failed).
 *
 * Driven by the `phase` + `phaseUpdatedAt` fields on `VideoJobState`, both
 * sourced from the `job-status` envelope. When `phase` is missing (e.g. very
 * early in an attempt before the first poll lands) we default to "queued"
 * and render the timestamp as "—".
 */

import { useEffect, useState } from "react";
import { Check, Loader2, AlertCircle, CircleDashed } from "lucide-react";

type Phase = "queued" | "processing" | "succeeded" | "failed";

const ORDER: Phase[] = ["queued", "processing", "succeeded"];

const LABELS: Record<Phase, string> = {
  queued: "Queued",
  processing: "Processing",
  succeeded: "Done",
  failed: "Failed",
};

function relTime(iso?: string | null, nowMs: number = Date.now()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const deltaSec = Math.max(0, Math.round((nowMs - t) / 1000));
  if (deltaSec < 5) return "just now";
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const min = Math.floor(deltaSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

interface Props {
  phase?: Phase;
  phaseUpdatedAt?: string | null;
}

export default function ScenePhaseTimeline({ phase, phaseUpdatedAt }: Props) {
  const current: Phase = phase ?? "queued";
  const failed = current === "failed";

  // Re-render every 10s so the relative timestamp stays fresh while polling.
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  // For the failed branch we still show queued/processing as completed up to
  // wherever the job got, then a destructive "Failed" terminus.
  const steps: Phase[] = failed ? ["queued", "processing", "failed"] : ORDER;
  const currentIdx = steps.indexOf(current);

  return (
    <div className="space-y-1.5" role="group" aria-label="Job phase timeline">
      <div className="flex items-center gap-1">
        {steps.map((step, i) => {
          const isDone = i < currentIdx || (current === "succeeded" && step !== "failed");
          const isActive = i === currentIdx && !failed && current !== "succeeded";
          const isFailedNode = step === "failed" && failed;

          const dotClass = isFailedNode
            ? "border-destructive bg-destructive/20 text-destructive"
            : isDone
            ? "border-primary/60 bg-primary/20 text-primary"
            : isActive
            ? "border-accent bg-accent/20 text-accent-foreground"
            : "border-border bg-muted/30 text-muted-foreground";

          const Icon = isFailedNode
            ? AlertCircle
            : isDone
            ? Check
            : isActive
            ? Loader2
            : CircleDashed;

          return (
            <div key={step} className="flex items-center gap-1 flex-1 last:flex-initial">
              <div
                className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${dotClass}`}
                title={LABELS[step]}
              >
                <Icon className={`h-3 w-3 ${isActive ? "animate-spin" : ""}`} />
                <span className="leading-none">{LABELS[step]}</span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`h-px flex-1 ${
                    i < currentIdx ? "bg-primary/50" : "bg-border"
                  }`}
                  aria-hidden
                />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Last updated {relTime(phaseUpdatedAt)}
      </p>
    </div>
  );
}
