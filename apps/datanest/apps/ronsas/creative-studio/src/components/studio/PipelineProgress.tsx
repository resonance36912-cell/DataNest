import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, AlertCircle, Globe, Brain, Sparkles, Circle, Clock, RotateCw, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { ControlledExitReason } from "@/lib/scrapeResponse";

// Re-export so existing consumers (Studio.tsx) keep their import path stable.
export type { ControlledExitReason };

export type StepStatus =
  | "pending"
  | "active"
  | "done"
  | "error"
  | "canceled"              // user-initiated stop — pipeline halted mid-flight
  // Controlled scrape outcomes — never "thrown", always returned.
  | "success"               // scrape produced usable brief + image
  | "partial"               // scrape produced enough to continue
  | "needs_image_upload"    // product page parsed but no image — user must supply one
  | "failed_fast"           // URL reader could not extract — user must retry/upload
  | "skipped";              // downstream stage was short-circuited by an upstream controlled failure

export interface PipelineState {
  scrape: StepStatus;
  analyze: StepStatus;
  generate: StepStatus;
  errorMessage?: string;
  userMessage?: string;
  generateProgress?: { done: number; total: number };
  /** Latest server heartbeat from the streaming generate edge function. Lets
   *  the UI distinguish "still alive, waiting on model" from a true stall. */
  generateHeartbeat?: { receivedAt: number; sinceUpstreamMs: number; seq: number };
  /** Why the scrape stage produced its current status.
   *  REQUIRED end-to-end — use `null` for the initial/idle state.
   *  Any code path that mutates `scrape` must also set this so the
   *  diagnostics panel never shows a stale reason. */
  controlledExitReason: ControlledExitReason | null;
}

type StepKey = "scrape" | "analyze" | "generate";

// Per-variant server budget. Bumped to reflect real Pro-model timings observed
// in production (Gemini 3 Pro image gen routinely runs 2–4 min per variant).
const PER_VARIANT_MS = 180_000;
const GENERATE_OVERHEAD_MS = 15_000;
const DEFAULT_GENERATE_ETA_MS = 2 * PER_VARIANT_MS + GENERATE_OVERHEAD_MS;

const computeGenerateEtaMs = (total?: number) =>
  total && total > 0 ? total * PER_VARIANT_MS + GENERATE_OVERHEAD_MS : DEFAULT_GENERATE_ETA_MS;

const STEPS: { key: StepKey; label: string; description: string; Icon: typeof Globe; etaMs: number }[] = [
  { key: "scrape",   label: "Scrape URL",        description: "Fetching page content",     Icon: Globe,     etaMs: 45_000 },
  { key: "analyze",  label: "Analyse content",   description: "Building creative brief",   Icon: Brain,     etaMs: 15_000 },
  { key: "generate", label: "Generate variants", description: "Composing poster variants", Icon: Sparkles,  etaMs: DEFAULT_GENERATE_ETA_MS },
];

// Heuristic Firecrawl substages — we don't get streamed progress from the API,
// so we time-gate them to mirror what's actually happening server-side.
const SCRAPE_SUBSTAGES: { at: number; label: string }[] = [
  { at: 0,     label: "Contacting Firecrawl…" },
  { at: 1200,  label: "Resolving target URL…" },
  { at: 2800,  label: "Loading page (waiting for render)…" },
  { at: 7000,  label: "Extracting main content…" },
  { at: 14000, label: "Parsing links & metadata…" },
  { at: 24000, label: "Page is heavy — checking for blockers…" },
  { at: 30000, label: "Page is slow — server will fall back if needed…" },
  { at: 45000, label: "Still waiting for the URL reader…" },
  { at: 70000, label: "Final attempt before timeout…" },
];

const ANALYZE_SUBSTAGES: { at: number; label: string }[] = [
  { at: 0,    label: "Sending content to Lovable AI…" },
  { at: 1500, label: "Identifying brand & audience…" },
  { at: 4000, label: "Drafting headline & key points…" },
  { at: 8000, label: "Polishing the creative brief…" },
];

/** Variant-aware generate substages — one entry per variant so the user sees
 *  exactly which variant is being composed. Status comes from generateProgress
 *  (server-reported) instead of pure time-gating. */
const buildGenerateSubstages = (
  total: number,
  done: number,
): { label: string; state: "done" | "active" | "pending" }[] => {
  const out: { label: string; state: "done" | "active" | "pending" }[] = [
    { label: "Preparing prompt & references…", state: done > 0 || total === 0 ? "done" : "active" },
  ];
  for (let i = 0; i < total; i++) {
    out.push({
      label: `Composing variant ${i + 1} of ${total}…`,
      state: i < done ? "done" : i === done ? "active" : "pending",
    });
  }
  out.push({
    label: "Upscaling & finalising…",
    state: done >= total && total > 0 ? "active" : "pending",
  });
  return out;
};

const formatSeconds = (ms: number) => `${Math.max(0, ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;

const StatusDot = ({ status }: { status: StepStatus }) => {
  if (status === "done" || status === "success" || status === "partial")
    return (
      <div className="w-7 h-7 rounded-full bg-primary/20 ring-1 ring-primary/40 flex items-center justify-center">
        <Check className="w-4 h-4 text-primary" />
      </div>
    );
  if (status === "active")
    return (
      <div className="w-7 h-7 rounded-full studio-gradient-bg flex items-center justify-center shadow-[0_0_18px_-2px_hsl(var(--primary)/0.7)]">
        <Loader2 className="w-4 h-4 text-primary-foreground animate-spin" />
      </div>
    );
  if (status === "canceled")
    return (
      <div className="w-7 h-7 rounded-full bg-amber-500/15 ring-1 ring-amber-400/50 flex items-center justify-center">
        <X className="w-4 h-4 text-amber-400" />
      </div>
    );
  if (status === "error" || status === "failed_fast" || status === "needs_image_upload")
    return (
      <div className="w-7 h-7 rounded-full bg-destructive/20 ring-1 ring-destructive/50 flex items-center justify-center">
        <AlertCircle className="w-4 h-4 text-destructive" />
      </div>
    );
  // pending + skipped — muted dot
  return <div className="w-7 h-7 rounded-full bg-white/[0.04] ring-1 ring-white/[0.08]" />;
};

export const isPipelineActive = (s: PipelineState) =>
  (s.scrape !== "pending" && s.scrape !== "skipped") ||
  (s.analyze !== "pending" && s.analyze !== "skipped") ||
  (s.generate !== "pending" && s.generate !== "skipped");

export const isPipelineCanceled = (s: PipelineState) =>
  s.scrape === "canceled" || s.analyze === "canceled" || s.generate === "canceled";

/** Per-step ETA strip — elapsed / target, with a thin progress bar. */
const EtaStrip = ({
  startedAt,
  etaMs,
  status,
  doneMs,
}: {
  startedAt: number | undefined;
  etaMs: number;
  status: StepStatus;
  doneMs?: number;
}) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== "active") return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [status]);

  if (status === "pending" || status === "skipped") {
    return (
      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
        <Clock className="w-3 h-3" />
        <span>{status === "skipped" ? "skipped" : `~${formatSeconds(etaMs)} estimated`}</span>
      </div>
    );
  }

  if (status === "done" || status === "success" || status === "partial") {
    return (
      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Check className="w-3 h-3 text-primary" />
        <span>
          {status === "partial" ? "partial" : "completed"}
          {typeof doneMs === "number" ? ` in ${formatSeconds(doneMs)}` : ""}
        </span>
      </div>
    );
  }

  if (status === "canceled") {
    return (
      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-amber-400/80">
        <X className="w-3 h-3" />
        <span>canceled{typeof doneMs === "number" ? ` after ${formatSeconds(doneMs)}` : ""}</span>
      </div>
    );
  }

  if (status === "error" || status === "failed_fast" || status === "needs_image_upload") return null;

  // active
  const elapsed = startedAt ? now - startedAt : 0;
  const pct = Math.min(98, (elapsed / etaMs) * 100);
  const remaining = Math.max(0, etaMs - elapsed);
  const overdue = elapsed > etaMs;

  return (
    <div className="mt-1.5">
      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          className="h-full studio-gradient-bg"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.25, ease: "linear" }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>{formatSeconds(elapsed)} elapsed</span>
        <span className="text-foreground/80 font-medium">{Math.round(pct)}%</span>
        <span className={overdue ? "text-amber-400/80" : ""}>
          {overdue ? "taking longer than usual…" : `~${formatSeconds(remaining)} left`}
        </span>
      </div>
    </div>
  );
};

/** Live substage panel — animates through stages based on elapsed time. */
const SubstagePanel = ({
  stages,
  startedAt,
}: {
  stages: { at: number; label: string }[];
  startedAt: number;
}) => {
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 250);
    return () => clearInterval(id);
  }, [startedAt]);

  const currentIdx = Math.max(
    0,
    stages.reduce((acc, s, i) => (elapsed >= s.at ? i : acc), 0),
  );

  return (
    <div className="mt-2 rounded-lg bg-white/[0.03] ring-1 ring-white/[0.06] px-3 py-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Live</span>
        <span className="text-[10px] tabular-nums text-muted-foreground">{(elapsed / 1000).toFixed(1)}s</span>
      </div>
      <ul className="space-y-1">
        {stages.map((s, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <li key={s.label} className="flex items-center gap-2 text-[11px]">
              {done ? (
                <Check className="w-3 h-3 text-primary shrink-0" />
              ) : active ? (
                <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
              ) : (
                <Circle className="w-2.5 h-2.5 text-muted-foreground/40 shrink-0" />
              )}
              <span
                className={
                  done
                    ? "text-foreground/70 line-through decoration-primary/40"
                    : active
                      ? "text-foreground"
                      : "text-muted-foreground/60"
                }
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** Variant-aware substage panel — one row per requested variant. The active
 *  row tracks the server-reported generateProgress so users see exactly which
 *  variant is rendering and how long it's been working. */
const VariantSubstagePanel = ({
  startedAt,
  done,
  total,
}: {
  startedAt: number;
  done: number;
  total: number;
}) => {
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 250);
    return () => clearInterval(id);
  }, [startedAt]);

  const stages = buildGenerateSubstages(total, done);
  const remainingVariants = Math.max(0, total - done);
  const variantEtaMs = Math.max(2_000, remainingVariants * PER_VARIANT_MS);

  return (
    <div className="mt-2 rounded-lg bg-white/[0.03] ring-1 ring-white/[0.06] px-3 py-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Variants {done}/{total}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {(elapsed / 1000).toFixed(1)}s · ~{formatSeconds(variantEtaMs)} left
        </span>
      </div>
      <ul className="space-y-1">
        {stages.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-[11px]">
            {s.state === "done" ? (
              <Check className="w-3 h-3 text-primary shrink-0" />
            ) : s.state === "active" ? (
              <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
            ) : (
              <Circle className="w-2.5 h-2.5 text-muted-foreground/40 shrink-0" />
            )}
            <span
              className={
                s.state === "done"
                  ? "text-foreground/70 line-through decoration-primary/40"
                  : s.state === "active"
                    ? "text-foreground"
                    : "text-muted-foreground/60"
              }
            >
              {s.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

interface PipelineProgressProps {
  state: PipelineState;
  autoRetry?: { step: StepKey; secondsLeft: number } | null;
  autoRetriedCounts?: Record<StepKey, number>;
  maxAutoRetries?: number;
  onRetryNow?: (step: StepKey) => void;
  onCancelAutoRetry?: () => void;
  onCancel?: () => void;
  onDismiss?: () => void;
  onRestart?: () => void;
}

const PipelineProgress = ({
  state,
  autoRetry,
  autoRetriedCounts,
  maxAutoRetries = 3,
  onRetryNow,
  onCancelAutoRetry,
  onCancel,
  onDismiss,
  onRestart,
}: PipelineProgressProps) => {
  const visible = isPipelineActive(state);

  // Track when each step entered "active" and when it finished, so substages
  // and ETAs can time themselves and we can show actual elapsed for done steps.
  const [startedAt, setStartedAt] = useState<Partial<Record<StepKey, number>>>({});
  const [endedAt, setEndedAt] = useState<Partial<Record<StepKey, number>>>({});

  useEffect(() => {
    setStartedAt((prev) => {
      const next = { ...prev };
      (["scrape", "analyze", "generate"] as StepKey[]).forEach((k) => {
        if (state[k] === "active" && !next[k]) next[k] = Date.now();
      });
      return next;
    });
    setEndedAt((prev) => {
      const next = { ...prev };
      (["scrape", "analyze", "generate"] as StepKey[]).forEach((k) => {
        if ((state[k] === "done" || state[k] === "error" || state[k] === "canceled") && !next[k]) next[k] = Date.now();
        if (state[k] === "pending" || state[k] === "active") delete next[k];
      });
      return next;
    });
    // Reset everything when the pipeline goes fully idle.
    if (!isPipelineActive(state)) {
      setStartedAt({});
      setEndedAt({});
    }
  }, [state.scrape, state.analyze, state.generate]);

  // Ticking "now" for the overall ETA in the header.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [visible]);

  // Resolve a per-render STEPS list whose generate.etaMs reflects the actual
  // number of variants requested (server-reported via generateProgress.total).
  const liveSteps = STEPS.map((s) =>
    s.key === "generate"
      ? { ...s, etaMs: computeGenerateEtaMs(state.generateProgress?.total) }
      : s,
  );

  // Overall ETA: sum remaining for active + pending steps.
  const overallRemaining = liveSteps.reduce((acc, s) => {
    const st = state[s.key];
    if (st === "done" || st === "error") return acc;
    if (st === "active") {
      const start = startedAt[s.key];
      const elapsed = start ? now - start : 0;
      return acc + Math.max(2_000, s.etaMs - elapsed);
    }
    return acc + s.etaMs; // pending
  }, 0);

  const doneCount = liveSteps.filter((s) => state[s.key] === "done").length;
  const hasError = liveSteps.some((s) => state[s.key] === "error");
  const canceled = isPipelineCanceled(state);
  const totalEta = liveSteps.reduce((acc, s) => acc + s.etaMs, 0);
  const allDone = doneCount === liveSteps.length;
  const overallPct = hasError || canceled
    ? 0
    : allDone
      ? 100
      : Math.max(0, Math.min(99, Math.round(((totalEta - overallRemaining) / totalEta) * 100)));

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.25 }}
          className="pointer-events-auto"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-2xl ring-1 ring-white/[0.08] bg-background/85 backdrop-blur-xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] p-4 sm:p-5 w-[min(420px,92vw)] max-h-[min(70vh,560px)] overflow-y-auto overscroll-contain">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
                Pipeline
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {!hasError && !canceled && (
                  <span className="tabular-nums font-semibold text-foreground">{overallPct}%</span>
                )}
                {canceled && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 ring-1 ring-amber-400/40 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-amber-400 font-semibold">
                    <X className="w-3 h-3" /> Canceled
                  </span>
                )}
                <span>{doneCount}/{STEPS.length}</span>
                {(() => {
                  const starts = Object.values(startedAt).filter((v): v is number => typeof v === "number");
                  if (!starts.length) return null;
                  const pipelineStart = Math.min(...starts);
                  const lastEnd = allDone || canceled
                    ? Math.max(...Object.values(endedAt).filter((v): v is number => typeof v === "number"), pipelineStart)
                    : now;
                  const totalElapsed = lastEnd - pipelineStart;
                  return (
                    <span className="flex items-center gap-1 text-foreground/70" title="Total elapsed">
                      <Clock className="w-3 h-3" />
                      <span className="tabular-nums">{formatSeconds(totalElapsed)} elapsed</span>
                    </span>
                  );
                })()}
                {!hasError && !canceled && !allDone && (() => {
                  const starts = Object.values(startedAt).filter((v): v is number => typeof v === "number");
                  const pipelineStart = starts.length ? Math.min(...starts) : now;
                  const totalElapsed = now - pipelineStart;
                  const overdue = totalElapsed > totalEta;
                  if (overdue) {
                    return <span className="text-amber-400/80">taking longer than usual…</span>;
                  }
                  return overallRemaining > 0 ? (
                    <span className="tabular-nums text-foreground/60">~{formatSeconds(overallRemaining)} left</span>
                  ) : null;
                })()}
                {onCancel && !hasError && !canceled && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        className="ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-foreground/80 ring-1 ring-amber-400/40 bg-amber-500/10 hover:bg-amber-500/20 hover:text-foreground transition-colors"
                        aria-label="Cancel generation"
                      >
                        <X className="w-3 h-3" />
                        Cancel
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel this generation?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will stop every in-flight request immediately. Any progress on
                          variants that haven't finished yet will be lost — completed steps stay
                          visible. You can always start a new run.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep generating</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={onCancel}
                          className="bg-amber-500 text-amber-950 hover:bg-amber-400 focus-visible:ring-amber-400"
                        >
                          Yes, cancel
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {onRestart && canceled && (
                  <button
                    type="button"
                    onClick={onRestart}
                    className="ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-amber-100 bg-amber-500/15 ring-1 ring-amber-400/40 hover:bg-amber-500/25 transition-colors"
                    aria-label="Restart generation with same inputs"
                  >
                    <RotateCw className="w-3 h-3" />
                    Restart
                  </button>
                )}
                {onDismiss && canceled && (
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-foreground/80 ring-1 ring-white/[0.12] hover:bg-white/[0.06] hover:text-foreground transition-colors"
                    aria-label="Dismiss canceled pipeline"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            </div>

            {canceled && (
              <div className="mb-3 rounded-xl ring-1 ring-amber-400/40 bg-amber-500/10 p-3 flex items-start gap-2.5">
                <X className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-foreground">Generation canceled</div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    {state.errorMessage || "All in-flight requests were stopped. Adjust your inputs and run again whenever you're ready."}
                  </p>
                  {onRestart && (
                    <button
                      type="button"
                      onClick={onRestart}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-amber-50 bg-amber-500/20 ring-1 ring-amber-400/50 hover:bg-amber-500/30 transition-colors"
                      aria-label="Restart generation with same inputs"
                    >
                      <RotateCw className="w-3 h-3" />
                      Restart generation
                    </button>
                  )}
                </div>
              </div>
            )}

            {!hasError && !canceled && (
              <div className="mb-3 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  className="h-full studio-gradient-bg"
                  initial={false}
                  animate={{ width: `${overallPct}%` }}
                  transition={{ duration: 0.3, ease: "linear" }}
                />
              </div>
            )}

            {/* Prominent scrape-error banner — surfaces watchdog/timeout failures
                with a large Retry CTA and a visible auto-retry countdown bar. */}
            {state.scrape === "error" && onRetryNow && (() => {
              const msg = state.errorMessage ?? "";
              const isTimeout = /timed out|watchdog|stuck past|stalled|exceeded/i.test(msg);
              const countdown = autoRetry?.step === "scrape" ? autoRetry.secondsLeft : null;
              // Countdown starts at 8s in Studio.tsx — derive a % for the bar.
              const AUTO_RETRY_TOTAL = 8;
              const pct = countdown != null
                ? Math.max(0, Math.min(100, ((AUTO_RETRY_TOTAL - countdown) / AUTO_RETRY_TOTAL) * 100))
                : 0;
              return (
                <div className="mb-3 rounded-xl ring-1 ring-destructive/40 bg-destructive/10 p-3">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-foreground">
                        {isTimeout ? "Scrape timed out" : "Scrape failed"}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        {msg || "The extractor didn't return in time. Tap Retry to try again."}
                      </p>
                    </div>
                  </div>

                  {countdown != null && (
                    <div className="mt-2.5">
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">
                        <span>Auto-retrying</span>
                        <span className="tabular-nums text-foreground/80">in {countdown}s</span>
                      </div>
                      <div
                        className="h-1 rounded-full bg-white/[0.06] overflow-hidden"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(pct)}
                        aria-label="Auto-retry countdown"
                      >
                        <div
                          className="h-full studio-gradient-bg transition-[width] duration-500 ease-linear"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onRetryNow("scrape")}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg studio-gradient-bg px-3 py-2 text-[12px] font-semibold text-primary-foreground shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.6)] hover:opacity-95 active:opacity-90 transition-opacity"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      {countdown != null ? `Retry now (${countdown}s)` : "Retry scrape"}
                    </button>
                    {countdown != null && onCancelAutoRetry && (
                      <button
                        type="button"
                        onClick={onCancelAutoRetry}
                        className="inline-flex items-center gap-1 rounded-lg ring-1 ring-white/[0.1] px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground hover:ring-white/[0.2] transition-colors"
                      >
                        <X className="w-3 h-3" /> Cancel
                      </button>
                    )}
                  </div>

                  {autoRetriedCounts && autoRetriedCounts.scrape > 0 && (
                    <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-amber-400/80 inline-flex items-center gap-1">
                      <RotateCw className="w-2.5 h-2.5" />
                      attempt {autoRetriedCounts.scrape + 1} / {maxAutoRetries + 1}
                    </div>
                  )}
                </div>
              );
            })()}

            <ol className="space-y-3">
              {liveSteps.map((step, i) => {
                const status = state[step.key];
                const Icon = step.Icon;
                const start = startedAt[step.key];
                const end = endedAt[step.key];
                const doneMs = status === "done" && start && end ? end - start : undefined;
                return (
                  <li key={step.key} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <StatusDot status={status} />
                      {i < liveSteps.length - 1 && (
                        <div
                          className={`w-px flex-1 mt-1 mb-1 min-h-[18px] ${
                            state[liveSteps[i + 1].key] !== "pending" || status === "done"
                              ? "bg-primary/40"
                              : "bg-white/[0.08]"
                          }`}
                        />
                      )}
                    </div>
                    <div className="flex-1 pt-0.5">
                      <div className="flex items-center gap-2">
                        <Icon
                          className={`w-3.5 h-3.5 ${
                            status === "active"
                              ? "text-primary"
                              : status === "done"
                                ? "text-foreground"
                                : status === "error"
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                          }`}
                        />
                        <span
                          className={`text-sm font-medium ${
                            status === "pending" ? "text-muted-foreground" : "text-foreground"
                          }`}
                        >
                          {step.label}
                        </span>
                        <span
                          className={`ml-auto text-[10px] uppercase tracking-[0.14em] ${
                            status === "active"
                              ? "text-primary"
                              : status === "done" || status === "success" || status === "partial"
                                ? "text-primary/70"
                                : status === "canceled"
                                  ? "text-amber-400"
                                  : status === "error" || status === "failed_fast" || status === "needs_image_upload"
                                    ? "text-destructive"
                                    : "text-muted-foreground/60"
                          }`}
                        >
                          {status === "active"
                            ? "in progress"
                            : status === "canceled"
                              ? "canceled"
                              : status === "failed_fast"
                                ? "could not read url"
                                : status === "needs_image_upload"
                                  ? "image needed"
                                  : status === "partial"
                                    ? "partial data"
                                    : status === "success"
                                      ? "done"
                                      : status}
                        </span>

                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {status === "error" && state.errorMessage
                          ? state.errorMessage
                          : step.key === "generate" && status === "active" && state.generateProgress
                            ? (() => {
                                const beat = state.generateHeartbeat;
                                const stallSec = beat ? Math.round(beat.sinceUpstreamMs / 1000) : 0;
                                const beatAgeSec = beat ? Math.round((Date.now() - beat.receivedAt) / 1000) : null;
                                const base = `Rendering variants… ${state.generateProgress.done}/${state.generateProgress.total} ready`;
                                if (!beat) return base;
                                if (beatAgeSec !== null && beatAgeSec > 8) return `${base} — no heartbeat for ${beatAgeSec}s (channel may be stalling)`;
                                if (stallSec > 20) return `${base} — model warming up, ${stallSec}s since last byte`;
                                return `${base} · heartbeat ok`;
                              })()
                            : step.key === "generate" && status === "done" && state.generateProgress
                              ? `${state.generateProgress.done}/${state.generateProgress.total} variants ready`
                              : step.description}
                      </p>

                      <EtaStrip
                        startedAt={start}
                        etaMs={step.etaMs}
                        status={status}
                        doneMs={doneMs}
                      />

                      {step.key === "scrape" && status === "active" && start && (
                        <SubstagePanel stages={SCRAPE_SUBSTAGES} startedAt={start} />
                      )}
                      {step.key === "analyze" && status === "active" && start && (
                        <SubstagePanel stages={ANALYZE_SUBSTAGES} startedAt={start} />
                      )}
                      {step.key === "generate" && status === "active" && start && (
                        <VariantSubstagePanel
                          startedAt={start}
                          done={state.generateProgress?.done ?? 0}
                          total={state.generateProgress?.total ?? 2}
                        />
                      )}

                      {/* Attempt counter — show whenever auto-retry has fired at least once for this step */}
                      {autoRetriedCounts && autoRetriedCounts[step.key] > 0 && status !== "pending" && (
                        <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-amber-400/80">
                          <RotateCw className="w-2.5 h-2.5" />
                          attempt {autoRetriedCounts[step.key] + (status === "error" ? 0 : 1)} / {maxAutoRetries + 1}
                        </div>
                      )}

                      {/* Inline retry controls on error */}
                      {status === "error" && (onRetryNow || onCancelAutoRetry) && (
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          {autoRetry?.step === step.key ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onRetryNow?.(step.key)}
                                className="inline-flex items-center gap-1.5 rounded-md bg-primary/20 hover:bg-primary/30 ring-1 ring-primary/40 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors"
                              >
                                <RotateCw className="w-3 h-3" />
                                Retry now ({autoRetry.secondsLeft}s)
                              </button>
                              <button
                                type="button"
                                onClick={onCancelAutoRetry}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <X className="w-3 h-3" /> Cancel
                              </button>
                            </>
                          ) : onRetryNow ? (
                            <button
                              type="button"
                              onClick={() => onRetryNow(step.key)}
                              className="inline-flex items-center gap-1.5 rounded-md bg-destructive/25 hover:bg-destructive/35 ring-1 ring-destructive/40 px-2.5 py-1 text-[11px] font-medium text-destructive-foreground transition-colors"
                            >
                              <RotateCw className="w-3 h-3" />
                              {autoRetriedCounts && autoRetriedCounts[step.key] >= maxAutoRetries
                                ? "Retry manually"
                                : "Retry"}
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PipelineProgress;
