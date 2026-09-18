import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AlertTriangle, X, RefreshCw, Trash2, Activity, Copy, Check, Heart } from "lucide-react";
import { getDiagEntries, subscribeDiag, getBootAt, clearDiag, type DiagEntry } from "@/lib/previewDiag";

const LS_AUTOCOPY = "preview_diag_autocopy";
const LS_LIVEONLY = "preview_diag_liveonly";
/** Rolling window (ms) used by the "Live" health check — entries older than
 *  this are considered historical and hidden from the live view + status. */
const LIVE_WINDOW_MS = 15_000;

function buildReport(entries: readonly DiagEntry[], rootEmpty: boolean): string {
  const header = [
    `# Preview Diagnostics Report`,
    `Generated: ${new Date().toISOString()}`,
    `Route: ${window.location.pathname}${window.location.search}`,
    `URL: ${window.location.href}`,
    `Viewport: ${window.innerWidth}×${window.innerHeight} (dpr=${window.devicePixelRatio})`,
    `User-Agent: ${navigator.userAgent}`,
    `Uptime: ${Math.round((Date.now() - getBootAt()) / 1000)}s`,
    `Root mount: ${rootEmpty ? "EMPTY (blank screen)" : "mounted"}`,
    `Entries: ${entries.length}`,
    ``,
    `## Errors & Network`,
  ].join("\n");
  const body = entries.length === 0
    ? "(none captured)"
    : entries.map((e) => {
        const ts = new Date(e.t).toISOString();
        return `[${ts}] ${e.kind.toUpperCase()}: ${e.message}${e.detail ? `\n  ↳ ${e.detail.replace(/\n/g, "\n  ")}` : ""}`;
      }).join("\n\n");
  return `${header}\n${body}\n`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

/**
 * Floating loading-diagnostics panel for the preview iframe.
 *
 * - Auto-opens if #root is still empty ~4s after boot (blank-screen guard).
 * - Always reachable via the small ⚠/Activity button bottom-right.
 * - Can be force-shown with `?diag=1` in the URL.
 * - Hidden entirely in production unless explicitly opted-in with `?diag=1`.
 */
export default function PreviewDiagnostics() {
  const entries = useSyncExternalStore(subscribeDiag, getDiagEntries, getDiagEntries);
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [rootEmpty, setRootEmpty] = useState(false);
  const [autoCopy, setAutoCopy] = useState(false);
  const [liveOnly, setLiveOnly] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [copyState, setCopyState] = useState<"idle" | "ok" | "err">("idle");
  const lastAutoCopySigRef = useRef<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const force = params.get("diag") === "1";
    const isDev = Boolean((import.meta as ImportMeta).env?.DEV);
    setEnabled(isDev || force);
    if (force) setOpen(true);
    try { setAutoCopy(localStorage.getItem(LS_AUTOCOPY) === "1"); } catch { /* noop */ }
    try {
      const stored = localStorage.getItem(LS_LIVEONLY);
      if (stored !== null) setLiveOnly(stored === "1");
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      const root = document.getElementById("root");
      const empty = !root || root.children.length === 0 || (root.textContent ?? "").trim().length < 4;
      setRootEmpty(empty);
      // Drive the rolling "live" window even when no new entries arrive so
      // stale issues automatically age out of the panel.
      setNow(Date.now());
      if (empty && Date.now() - getBootAt() > 4000) setOpen(true);
    };
    const id = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(id);
  }, [enabled]);

  const handleCopy = useCallback(async (silent = false) => {
    const ok = await copyToClipboard(buildReport(entries, rootEmpty));
    if (!silent) {
      setCopyState(ok ? "ok" : "err");
      window.setTimeout(() => setCopyState("idle"), 1800);
    }
    return ok;
  }, [entries, rootEmpty]);

  // Auto-copy: debounce-copy whenever new error/network entries arrive.
  useEffect(() => {
    if (!enabled || !autoCopy) return;
    const errs = entries.filter((e) => e.kind !== "info");
    if (errs.length === 0) return;
    const sig = `${errs.length}:${errs[errs.length - 1]?.id}`;
    if (sig === lastAutoCopySigRef.current) return;
    const handle = window.setTimeout(() => {
      lastAutoCopySigRef.current = sig;
      void handleCopy(true);
    }, 800);
    return () => window.clearTimeout(handle);
  }, [enabled, autoCopy, entries, handleCopy]);

  // "Live" health check: only entries inside the rolling window count as
  // currently-blocking issues. Historical noise (resolved console warnings,
  // one-off network blips from minutes ago) is filtered out.
  const cutoff = now - LIVE_WINDOW_MS;
  const liveEntries = useMemo(
    () => entries.filter((e) => e.t >= cutoff && e.kind !== "info"),
    [entries, cutoff],
  );
  const visibleEntries = liveOnly ? liveEntries : entries;
  const isErrorKind = (k: DiagEntry["kind"]) =>
    k === "error" || k === "unhandled" || k === "network" || k === "console";
  const liveErrorCount = liveEntries.filter((e) => isErrorKind(e.kind)).length;
  const totalErrorCount = entries.filter((e) => isErrorKind(e.kind)).length;
  const errorCount = liveOnly ? liveErrorCount : totalErrorCount;
  const lastErr = [...visibleEntries].reverse().find((e) => isErrorKind(e.kind));
  // Blocking = root never mounted, or there is at least one error inside the
  // rolling live window. Healthy = mounted AND no live errors.
  const blocking = rootEmpty || liveErrorCount > 0;

  if (!enabled) return null;

  const toggleAutoCopy = () => {
    setAutoCopy((v) => {
      const next = !v;
      try { localStorage.setItem(LS_AUTOCOPY, next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  };

  const toggleLiveOnly = () => {
    setLiveOnly((v) => {
      const next = !v;
      try { localStorage.setItem(LS_LIVEONLY, next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open preview diagnostics"
          className="fixed bottom-3 right-3 z-[9999] flex items-center gap-1.5 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-[11px] font-medium text-white shadow-lg backdrop-blur hover:bg-black/85"
        >
          {blocking ? (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
          ) : (
            <Heart className="h-3.5 w-3.5 text-emerald-400" />
          )}
          <span>
            {blocking
              ? (rootEmpty && liveErrorCount === 0
                  ? "page blank"
                  : `${liveErrorCount} live issue${liveErrorCount === 1 ? "" : "s"}`)
              : "healthy"}
          </span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-3 right-3 z-[9999] flex max-h-[70vh] w-[min(440px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 text-zinc-100 shadow-2xl backdrop-blur">
          <header className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-semibold">Preview Diagnostics</span>
              <StatusPill blocking={blocking} rootEmpty={rootEmpty} liveErrorCount={liveErrorCount} />
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleLiveOnly}
                title={liveOnly
                  ? `Live mode: showing only blocking issues from the last ${LIVE_WINDOW_MS / 1000}s`
                  : "Showing full history (including resolved/historical entries)"}
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${liveOnly ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-zinc-400 hover:text-white"}`}
              >
                Live
              </button>
              <button
                onClick={toggleAutoCopy}
                title={autoCopy ? "Auto-copy on: new errors land in your clipboard" : "Auto-copy off"}
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${autoCopy ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-zinc-400 hover:text-white"}`}
              >
                Auto
              </button>
              <button
                onClick={() => handleCopy(false)}
                title="Copy full diagnostics report to clipboard"
                className={`rounded p-1 ${copyState === "ok" ? "text-emerald-400" : copyState === "err" ? "text-rose-400" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}
              >
                {copyState === "ok" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <button onClick={() => window.location.reload()} title="Reload preview" className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-white">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => clearDiag()} title="Clear log" className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-white">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setOpen(false)} title="Close" className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </header>

          <div className="grid grid-cols-2 gap-2 border-b border-white/5 px-3 py-2 text-[11px] text-zinc-400">
            <Stat label="Uptime" value={`${Math.round((now - getBootAt()) / 1000)}s`} />
            <Stat label="Root" value={rootEmpty ? "empty" : "mounted"} tone={rootEmpty ? "warn" : "ok"} />
            <Stat
              label={liveOnly ? `Live (${LIVE_WINDOW_MS / 1000}s)` : "Total"}
              value={liveOnly ? `${liveErrorCount} active` : `${totalErrorCount} total`}
              tone={errorCount > 0 ? "warn" : "ok"}
            />
            <Stat label="Route" value={window.location.pathname} />
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 text-[11px] font-mono">
            {visibleEntries.length === 0 ? (
              <p className="py-6 text-center text-zinc-500">
                {liveOnly
                  ? (rootEmpty
                      ? "Page is still blank — waiting for React to mount…"
                      : `No blocking issues in the last ${LIVE_WINDOW_MS / 1000}s. Page is healthy.`)
                  : "No errors captured."}
                {liveOnly && totalErrorCount > liveErrorCount && (
                  <span className="mt-1 block text-[10px] text-zinc-600">
                    {totalErrorCount - liveErrorCount} older entr{totalErrorCount - liveErrorCount === 1 ? "y" : "ies"} hidden — toggle “Live” off to view history.
                  </span>
                )}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {[...visibleEntries].reverse().map((e) => (
                  <EntryRow key={e.id} entry={e} />
                ))}
              </ul>
            )}
          </div>


          {lastErr && (
            <footer className="border-t border-white/10 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              Latest: <span className="font-semibold">{lastErr.kind}</span> — {lastErr.message}
            </footer>
          )}
        </div>
      )}
    </>
  );
}

function StatusPill({ blocking, rootEmpty, liveErrorCount }: { blocking: boolean; rootEmpty: boolean; liveErrorCount: number }) {
  const tone = !blocking
    ? "bg-emerald-500/20 text-emerald-300"
    : rootEmpty
    ? "bg-amber-500/20 text-amber-300"
    : "bg-rose-500/20 text-rose-300";
  const label = !blocking
    ? "healthy"
    : rootEmpty && liveErrorCount === 0
    ? "blank"
    : `${liveErrorCount} live`;
  return <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${tone}`}>{label}</span>;
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "ok" | "warn" }) {
  const color = tone === "warn" ? "text-amber-300" : tone === "ok" ? "text-emerald-300" : "text-zinc-200";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-zinc-500">{label}</span>
      <span className={`truncate ${color}`} title={value}>{value}</span>
    </div>
  );
}

function EntryRow({ entry }: { entry: DiagEntry }) {
  const tone =
    entry.kind === "error" || entry.kind === "unhandled" ? "border-rose-500/40 text-rose-200"
    : entry.kind === "network" ? "border-amber-500/40 text-amber-200"
    : entry.kind === "console" ? "border-yellow-500/30 text-yellow-200"
    : "border-zinc-700 text-zinc-300";
  const time = new Date(entry.t).toLocaleTimeString();
  return (
    <li className={`rounded border-l-2 bg-white/[0.02] px-2 py-1 ${tone}`}>
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide opacity-70">
        <span>{entry.kind}</span>
        <span>{time}</span>
      </div>
      <div className="whitespace-pre-wrap break-words text-[11px]">{entry.message}</div>
      {entry.detail && (
        <details className="mt-1">
          <summary className="cursor-pointer text-[10px] opacity-60 hover:opacity-100">details</summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[10px] opacity-80">{entry.detail}</pre>
        </details>
      )}
    </li>
  );
}
