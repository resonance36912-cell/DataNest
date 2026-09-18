import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, X, AlertTriangle, CheckCircle2, Circle, Loader2, Download, Trash2 } from "lucide-react";
import type { PipelineState } from "./PipelineProgress";

export type WatchdogStep = "scrape" | "analyze" | "generate";

export interface WatchdogTrip {
  step: WatchdogStep;
  reason: string;
  at: number;
  budgetMs: number;
  elapsedMs: number;
}

export interface WatchdogTimings {
  scrapeStart?: number; scrapeEnd?: number;
  analyzeStart?: number; analyzeEnd?: number;
  generateStart?: number; generateEnd?: number;
}

interface Props {
  pipeline: PipelineState;
  budgets: Record<WatchdogStep, number>;
  timings: WatchdogTimings;
  lastTrip: WatchdogTrip | null;
  history?: WatchdogTrip[];
  onExportHistory?: () => void;
  onClearHistory?: () => void;
  autoRetryEnabled: Record<WatchdogStep, boolean>;
  autoRetried: Record<WatchdogStep, number>;
  visible: boolean;
  onClose: () => void;
}

const STEPS: WatchdogStep[] = ["scrape", "analyze", "generate"];
const LABELS: Record<WatchdogStep, string> = { scrape: "Scrape", analyze: "Analyse", generate: "Generate" };
const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

const WatchdogDebugPanel = ({
  pipeline, budgets, timings, lastTrip, history = [], onExportHistory, onClearHistory,
  autoRetryEnabled, autoRetried, visible, onClose,
}: Props) => {
  const [now, setNow] = useState(() => Date.now());
  const anyActive = STEPS.some((s) => pipeline[s] === "active");
  useEffect(() => {
    if (!visible || !anyActive) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [visible, anyActive]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-auto"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-2xl ring-1 ring-white/[0.08] bg-background/90 backdrop-blur-xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] p-4 w-[min(360px,92vw)]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
                  Watchdog · Debug
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Hide debug panel"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <ul className="space-y-2.5">
              {STEPS.map((step) => {
                const status = pipeline[step];
                const budget = budgets[step];
                const start = timings[`${step}Start`];
                const end = timings[`${step}End`];
                const elapsed = status === "active" && start
                  ? now - start
                  : start && end ? end - start : 0;
                const pct = budget > 0 ? Math.min(100, (elapsed / budget) * 100) : 0;
                const overBudget = elapsed > budget && status === "active";

                const Icon = status === "active" ? Loader2
                  : status === "done" ? CheckCircle2
                  : status === "error" ? AlertTriangle
                  : Circle;
                const iconCls = status === "active" ? "text-primary animate-spin"
                  : status === "done" ? "text-primary"
                  : status === "error" ? "text-destructive"
                  : "text-muted-foreground/50";

                return (
                  <li key={step} className="rounded-lg bg-white/[0.03] ring-1 ring-white/[0.06] px-3 py-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        <Icon className={`w-3 h-3 ${iconCls}`} />
                        {LABELS[step]}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {fmt(elapsed)} / {fmt(budget)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 ${
                          overBudget ? "bg-destructive" : status === "error" ? "bg-destructive/60" : "studio-gradient-bg"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground/80">
                      <span>{status}</span>
                      <span>
                        auto-retry: {autoRetryEnabled[step] ? "on" : "off"}
                        {autoRetried[step] > 0 ? ` · ${autoRetried[step]} used` : ""}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 rounded-lg bg-white/[0.02] ring-1 ring-white/[0.05] px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">
                Controlled exit reason
              </div>
              {pipeline.controlledExitReason ? (
                <div className="flex items-center justify-between gap-2">
                  <code className="text-[11px] font-mono text-foreground/90 break-all">
                    {pipeline.controlledExitReason}
                  </code>
                  <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ring-1 ${
                    pipeline.controlledExitReason.startsWith("server_status_success") || pipeline.controlledExitReason === "server_status_partial" || pipeline.controlledExitReason === "direct_image_url" || pipeline.controlledExitReason === "user_upload"
                      ? "bg-primary/15 ring-primary/30 text-primary"
                      : "bg-destructive/15 ring-destructive/30 text-destructive"
                  }`}>
                    {pipeline.controlledExitReason.startsWith("server_status_") ? "server" :
                      pipeline.controlledExitReason === "client_abort" ? "client" :
                      pipeline.controlledExitReason === "client_watchdog" ? "watchdog" :
                      pipeline.controlledExitReason === "legacy_scrape_error" ? "legacy" :
                      "shortcut"}
                  </span>
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground/70">
                  No scrape activity yet.
                </div>
              )}
            </div>

            <div className="mt-3 rounded-lg bg-white/[0.02] ring-1 ring-white/[0.05] px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">
                Last trigger
              </div>
              {lastTrip ? (
                <div className="text-[11px] space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-destructive">{LABELS[lastTrip.step]}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {new Date(lastTrip.at).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-muted-foreground/90">
                    Tripped at {fmt(lastTrip.elapsedMs)} (budget {fmt(lastTrip.budgetMs)})
                  </div>
                  <div className="text-foreground/80">{lastTrip.reason}</div>
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground/70">
                  No watchdog has fired this session.
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                History · {history.length}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onExportHistory}
                  disabled={!history.length || !onExportHistory}
                  className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] px-2 py-1 rounded-md ring-1 ring-white/[0.08] text-foreground/80 hover:text-foreground hover:ring-white/[0.18] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Export watchdog trip history as JSON"
                >
                  <Download className="w-3 h-3" /> Export JSON
                </button>
                <button
                  type="button"
                  onClick={onClearHistory}
                  disabled={!history.length || !onClearHistory}
                  className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] px-2 py-1 rounded-md ring-1 ring-white/[0.08] text-muted-foreground hover:text-destructive hover:ring-destructive/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Clear watchdog trip history"
                >
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              </div>
            </div>
            {history.length > 0 && (
              <ul className="mt-2 max-h-32 overflow-y-auto space-y-1 pr-1">
                {history.slice(0, 8).map((t, i) => (
                  <li key={`${t.at}-${i}`} className="text-[10px] font-mono flex items-center justify-between gap-2 rounded bg-white/[0.02] ring-1 ring-white/[0.04] px-2 py-1">
                    <span className="text-destructive/90 shrink-0">{LABELS[t.step]}</span>
                    <span className="text-muted-foreground tabular-nums shrink-0">{fmt(t.elapsedMs)}/{fmt(t.budgetMs)}</span>
                    <span className="text-muted-foreground/70 tabular-nums shrink-0">{new Date(t.at).toLocaleTimeString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WatchdogDebugPanel;
