import { useEffect, useState } from "react";
import { Clock, AlertTriangle, CheckCircle2, X } from "lucide-react";
import {
  recordScrapeTiming,
  SCRAPE_TIMINGS_KEY as STORAGE_KEY,
  type ScrapeTiming,
} from "@/lib/scrapeTimings";

// Re-export so existing imports keep working.
export { recordScrapeTiming };
export type { ScrapeTiming };


function fmtMs(ms: number | null | undefined) {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function shortUrl(url: string) {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 24 ? u.pathname.slice(0, 24) + "…" : u.pathname;
    return `${u.hostname}${path === "/" ? "" : path}`;
  } catch {
    return url.slice(0, 40);
  }
}

const ScrapeTimingReport = () => {
  const [entries, setEntries] = useState<ScrapeTiming[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const load = () => {
      try {
        setEntries(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"));
      } catch {
        setEntries([]);
      }
    };
    load();
    const onUpdate = () => load();
    window.addEventListener("studio:scrape-timing", onUpdate);
    return () => window.removeEventListener("studio:scrape-timing", onUpdate);
  }, []);

  if (!entries.length) return null;

  const clearAll = () => {
    localStorage.removeItem(STORAGE_KEY);
    setEntries([]);
  };

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-sm font-medium text-foreground/90 hover:text-foreground"
        >
          <Clock className="w-4 h-4 text-primary" />
          Scrape timings
          <span className="text-xs text-muted-foreground">({entries.length})</span>
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <X className="w-3 h-3" /> clear
        </button>
      </div>

      {open && (
        <div className="space-y-2">
          {entries.map((e, i) => {
            const status = e.timedOut
              ? "Timed out"
              : e.cached
                ? "Cached"
                : e.reachedTimeoutLabel
                  ? "Reached timeout label"
                  : "OK";
            const statusColor = e.timedOut
              ? "text-destructive"
              : e.reachedTimeoutLabel
                ? "text-amber-400"
                : "text-emerald-400";
            const Icon = e.timedOut || e.reachedTimeoutLabel ? AlertTriangle : CheckCircle2;
            return (
              <div
                key={`${e.at}-${i}`}
                className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-xs font-mono"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="truncate text-foreground/90" title={e.url}>
                    {shortUrl(e.url)}
                  </span>
                  <span className={`inline-flex items-center gap-1 shrink-0 ${statusColor}`}>
                    <Icon className="w-3 h-3" />
                    {status}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-muted-foreground">
                  <div>
                    <div className="opacity-60">fast</div>
                    <div className={e.fastPassOk ? "text-foreground/80" : "text-destructive"}>
                      {fmtMs(e.fastPassMs)}
                    </div>
                  </div>
                  <div>
                    <div className="opacity-60">deep</div>
                    <div className={e.deepPassSkipped ? "opacity-50" : e.deepPassOk ? "text-foreground/80" : "text-destructive"}>
                      {e.deepPassSkipped ? "skipped" : fmtMs(e.deepPassMs)}
                    </div>
                  </div>
                  <div>
                    <div className="opacity-60">emerg</div>
                    <div className={!e.emergencyRan ? "opacity-50" : e.emergencyOk ? "text-foreground/80" : "text-destructive"}>
                      {e.emergencyRan ? fmtMs(e.emergencyPassMs) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="opacity-60">client</div>
                    <div className="text-foreground/80">{fmtMs(e.clientElapsedMs)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ScrapeTimingReport;
