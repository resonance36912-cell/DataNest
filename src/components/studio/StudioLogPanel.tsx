import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, X, Copy, Trash2, ChevronDown, AlertCircle, Info, CheckCircle2, AlertTriangle } from "lucide-react";
import { useStudioLogs, studioLog, formatLogs, type StudioLogEntry, type StudioLogLevel } from "@/lib/studioLog";

const LEVEL_META: Record<StudioLogLevel, { Icon: typeof Info; cls: string; dot: string }> = {
  info:    { Icon: Info,           cls: "text-foreground/80",       dot: "bg-foreground/40" },
  success: { Icon: CheckCircle2,   cls: "text-emerald-300",          dot: "bg-emerald-400" },
  warn:    { Icon: AlertTriangle,  cls: "text-amber-300",            dot: "bg-amber-400" },
  error:   { Icon: AlertCircle,    cls: "text-destructive",          dot: "bg-destructive" },
};

const fmtTime = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
};

interface Props {
  visible: boolean;
  onClose: () => void;
}

const FILTERS: { key: "all" | StudioLogLevel; label: string }[] = [
  { key: "all", label: "All" },
  { key: "info", label: "Info" },
  { key: "success", label: "Success" },
  { key: "warn", label: "Warn" },
  { key: "error", label: "Error" },
];

const StudioLogPanel = ({ visible, onClose }: Props) => {
  const logs = useStudioLogs();
  const [filter, setFilter] = useState<"all" | StudioLogLevel>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<null | "all" | "errors">(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(
    () => (filter === "all" ? logs : logs.filter((l) => l.level === filter)),
    [logs, filter],
  );

  useEffect(() => {
    if (!autoScroll || !scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [filtered, autoScroll]);

  const counts = useMemo(() => {
    return logs.reduce(
      (acc, l) => { acc[l.level] = (acc[l.level] ?? 0) + 1; return acc; },
      { info: 0, success: 0, warn: 0, error: 0 } as Record<StudioLogLevel, number>,
    );
  }, [logs]);

  const copy = async (which: "all" | "errors") => {
    const entries = which === "errors" ? logs.filter((l) => l.level === "error" || l.level === "warn") : logs;
    if (entries.length === 0) return;
    try {
      await navigator.clipboard.writeText(formatLogs(entries));
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1400);
    } catch {
      // fall back: select & document.execCommand
      try {
        const ta = document.createElement("textarea");
        ta.value = formatLogs(entries);
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(which);
        window.setTimeout(() => setCopied(null), 1400);
      } catch { /* ignore */ }
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.22 }}
          className="pointer-events-auto"
          role="region"
          aria-label="Studio live log"
        >
          <div className="rounded-2xl ring-1 ring-white/[0.08] bg-background/90 backdrop-blur-xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] w-[min(520px,94vw)] max-h-[60vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-white/[0.06]">
              <Terminal className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">Live log</span>
              <span className="text-[10px] tabular-nums text-muted-foreground/80 ml-1">{logs.length}</span>
              {counts.error > 0 && (
                <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-destructive/15 ring-1 ring-destructive/30 px-1.5 py-0.5 text-[10px] text-destructive">
                  {counts.error} err
                </span>
              )}
              {counts.warn > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 ring-1 ring-amber-400/30 px-1.5 py-0.5 text-[10px] text-amber-300">
                  {counts.warn} warn
                </span>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close live log"
                className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/[0.06] flex-wrap">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-md transition-colors ${
                    filter === f.key
                      ? "bg-primary/20 text-foreground ring-1 ring-primary/40"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => copy("errors")}
                  disabled={counts.error + counts.warn === 0}
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                  title="Copy errors & warnings"
                >
                  <Copy className="w-3 h-3" /> {copied === "errors" ? "Copied" : "Errors"}
                </button>
                <button
                  type="button"
                  onClick={() => copy("all")}
                  disabled={logs.length === 0}
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                  title="Copy all logs"
                >
                  <Copy className="w-3 h-3" /> {copied === "all" ? "Copied" : "All"}
                </button>
                <button
                  type="button"
                  onClick={() => studioLog.clear()}
                  disabled={logs.length === 0}
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                  title="Clear log"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Log list */}
            <div
              ref={scrollerRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
                setAutoScroll(atBottom);
              }}
              className="flex-1 overflow-auto px-2.5 py-1.5 font-mono text-[11px] leading-relaxed bg-black/20"
            >
              {filtered.length === 0 ? (
                <p className="text-muted-foreground/60 text-center py-6 text-[11px] font-sans">
                  No events yet. Start a generation to see live logs.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {filtered.map((e) => {
                    const meta = LEVEL_META[e.level];
                    const Icon = meta.Icon;
                    const isOpen = expanded[e.id];
                    return (
                      <li key={e.id} className="group">
                        <div
                          className={`flex items-start gap-2 py-0.5 px-1 rounded hover:bg-white/[0.03] ${e.details ? "cursor-pointer" : ""}`}
                          onClick={() => { if (e.details) setExpanded((p) => ({ ...p, [e.id]: !p[e.id] })); }}
                        >
                          <span className="text-muted-foreground/60 tabular-nums shrink-0">{fmtTime(e.ts)}</span>
                          <Icon className={`w-3 h-3 shrink-0 mt-[3px] ${meta.cls}`} />
                          <span className="text-muted-foreground/70 uppercase text-[9px] tracking-[0.12em] shrink-0 mt-[2px] w-[52px]">
                            {e.step}
                          </span>
                          <span className={`flex-1 break-words ${meta.cls}`}>{e.message}</span>
                          {e.details && (
                            <ChevronDown
                              className={`w-3 h-3 text-muted-foreground/50 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                            />
                          )}
                        </div>
                        {e.details && isOpen && (
                          <pre className="ml-[68px] mr-1 mb-1 mt-0.5 px-2 py-1.5 rounded bg-black/40 ring-1 ring-white/[0.05] text-[10px] text-muted-foreground whitespace-pre-wrap break-words">
                            {e.details}
                          </pre>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {!autoScroll && (
              <button
                type="button"
                onClick={() => {
                  if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
                  setAutoScroll(true);
                }}
                className="absolute bottom-3 right-3 text-[10px] uppercase tracking-[0.14em] px-2 py-1 rounded-md bg-primary/30 ring-1 ring-primary/50 text-foreground hover:bg-primary/40 transition-colors"
              >
                Jump to latest
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default StudioLogPanel;

// Convenience for wiring a small launcher button beside the panel.
export const StudioLogToggleButton = ({
  open,
  onClick,
  errorCount,
}: { open: boolean; onClick: () => void; errorCount: number }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={open}
    className="pointer-events-auto inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] px-2.5 py-1 rounded-md bg-background/80 backdrop-blur ring-1 ring-white/[0.08] text-muted-foreground hover:text-foreground hover:ring-white/[0.16] transition-colors"
  >
    <Terminal className="w-3 h-3" />
    {open ? "Hide" : "Show"} live log
    {errorCount > 0 && (
      <span className="ml-0.5 inline-flex items-center justify-center min-w-[14px] h-[14px] rounded-full bg-destructive/30 ring-1 ring-destructive/50 text-destructive text-[9px] px-1">
        {errorCount}
      </span>
    )}
  </button>
);
