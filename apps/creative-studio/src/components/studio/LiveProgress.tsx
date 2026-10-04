import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, X, Check, AlertCircle } from "lucide-react";
import type { PipelineState } from "@/components/studio/PipelineProgress";

interface Props {
  pipeline: PipelineState;
  isAnalyzing: boolean;
  isGenerating: boolean;
  isCanceling: boolean;
  onCancel?: () => void;
}

type StageKey = "scrape" | "analyze" | "generate";

const STAGE_LABELS: Record<StageKey, string> = {
  scrape: "Reading source",
  analyze: "Building creative brief",
  generate: "Rendering variants",
};

const isDone = (s: string) => s === "done" || s === "success" || s === "partial";
const isErr = (s: string) => s === "error" || s === "failed_fast" || s === "needs_image_upload";

/**
 * Slim live progress bar shown directly below the studio stepper.
 * Drives a continuously-updating shimmer + percentage off the same
 * pipeline state the right-hand panel uses, so the user always sees
 * "what's happening right now" without scanning the diagnostics column.
 *
 * Stays mounted (and shows a "Cancelling…" state) while an in-flight
 * cancellation is propagating to the backend.
 */
export function LiveProgress({ pipeline, isAnalyzing, isGenerating, isCanceling, onCancel }: Props) {
  // Tick once a second so the within-stage estimated progress animates
  // even when no pipeline update fires (e.g. a slow scrape call).
  const [, force] = useState(0);
  useEffect(() => {
    if (!isAnalyzing && !isGenerating && !isCanceling) return;
    const id = window.setInterval(() => force((n) => n + 1), 750);
    return () => window.clearInterval(id);
  }, [isAnalyzing, isGenerating, isCanceling]);

  const active = isAnalyzing || isGenerating || isCanceling;
  const anyError = isErr(pipeline.scrape) || isErr(pipeline.analyze) || isErr(pipeline.generate);
  const anyCanceled =
    pipeline.scrape === "canceled" || pipeline.analyze === "canceled" || pipeline.generate === "canceled";

  // Don't render in the idle/clean state — keeps the layout calm.
  if (!active && !anyError && !anyCanceled && !isDone(pipeline.generate)) return null;

  // Derive percent: each of the 3 stages contributes ~33%.
  const stageWeight = 100 / 3;
  const stageProgress = (key: StageKey): number => {
    const s = pipeline[key];
    if (isDone(s)) return 1;
    if (s === "canceled" || isErr(s)) return 0.5; // freeze mid-step visually
    if (s === "active") {
      if (key === "generate" && pipeline.generateProgress?.total) {
        const { done, total } = pipeline.generateProgress;
        return Math.min(0.95, done / Math.max(total, 1));
      }
      // Mild creep so the bar moves without lying about completion.
      return 0.4;
    }
    return 0;
  };
  const percent = Math.min(
    100,
    Math.round((stageProgress("scrape") + stageProgress("analyze") + stageProgress("generate")) * stageWeight),
  );

  // Headline label: prefer the freshest server-sent userMessage, fall back
  // to the active stage's name.
  const activeStage: StageKey | null =
    pipeline.generate === "active"
      ? "generate"
      : pipeline.analyze === "active"
        ? "analyze"
        : pipeline.scrape === "active"
          ? "scrape"
          : null;

  const label = isCanceling
    ? "Cancelling — aborting in-flight requests…"
    : anyCanceled && !active
      ? "Generation canceled"
      : anyError && !active
        ? pipeline.errorMessage ?? "Something went wrong"
        : pipeline.userMessage ??
          (activeStage ? STAGE_LABELS[activeStage] : isDone(pipeline.generate) ? "Done" : "Working…");

  const tone = isCanceling
    ? "canceling"
    : anyError
      ? "error"
      : anyCanceled
        ? "canceled"
        : isDone(pipeline.generate) && !active
          ? "done"
          : "active";

  const trackTone =
    tone === "error" || tone === "canceled"
      ? "bg-destructive/50"
      : tone === "done"
        ? "bg-primary"
        : tone === "canceling"
          ? "bg-amber-400"
          : "studio-gradient-bg";

  const Icon = tone === "done" ? Check : tone === "error" || tone === "canceled" ? AlertCircle : Loader2;

  return (
    <div
      className="shrink-0 border-b border-white/[0.05] bg-background/60 backdrop-blur-md px-4 sm:px-6 py-2"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="max-w-6xl mx-auto flex items-center gap-3">
        <span
          className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${
            tone === "error" || tone === "canceled"
              ? "bg-destructive/15 text-destructive"
              : tone === "done"
                ? "bg-primary/15 text-primary"
                : tone === "canceling"
                  ? "bg-amber-400/15 text-amber-300"
                  : "bg-primary/15 text-primary"
          }`}
          aria-hidden
        >
          <Icon
            className={`w-3.5 h-3.5 ${
              tone === "active" || tone === "canceling" ? "animate-spin" : ""
            }`}
          />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12.5px] sm:text-[13px] text-foreground/90 truncate">{label}</p>
            <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
              {tone === "done" ? "100%" : `${percent}%`}
            </span>
          </div>
          <div
            className="mt-1.5 h-1 rounded-full bg-white/[0.06] overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <motion.div
              className={`h-full ${trackTone}`}
              animate={{ width: `${tone === "done" ? 100 : percent}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 22 }}
            />
          </div>
        </div>

        {active && onCancel && !isCanceling && (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground bg-white/[0.04] ring-1 ring-white/[0.08] hover:bg-white/[0.08] transition-colors"
            aria-label="Cancel generation"
          >
            <X className="w-3 h-3" />
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export default LiveProgress;
