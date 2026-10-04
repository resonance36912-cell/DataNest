// Lightweight in-memory ring buffer that captures console.log/warn/error
// output so a "Report crash" dialog can attach recent steps + traceIds
// automatically — no user copy/paste from devtools required.

export interface CrashLogEntry {
  t: number;            // epoch ms
  level: "log" | "warn" | "error";
  message: string;      // best-effort stringified args
  traceId?: string;     // parsed from "[Something][traceId]" prefix when present
}

const MAX_ENTRIES = 500;
const buffer: CrashLogEntry[] = [];
let installed = false;

const TRACE_RE = /\[[^\]]+\]\[([a-z0-9-]+)\]/i;

function stringifyArg(a: unknown): string {
  if (a == null) return String(a);
  if (typeof a === "string") return a;
  if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ""}`;
  try {
    return JSON.stringify(a, (_k, v) => (v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v));
  } catch {
    try { return String(a); } catch { return "[unserializable]"; }
  }
}

function record(level: CrashLogEntry["level"], args: unknown[]) {
  const message = args.map(stringifyArg).join(" ");
  const m = message.match(TRACE_RE);
  buffer.push({ t: Date.now(), level, message, traceId: m?.[1] });
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
}

export function installCrashLogger() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const orig = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  console.log = (...a: unknown[]) => { try { record("log", a); } catch { /* noop */ } orig.log(...a); };
  console.warn = (...a: unknown[]) => { try { record("warn", a); } catch { /* noop */ } orig.warn(...a); };
  console.error = (...a: unknown[]) => { try { record("error", a); } catch { /* noop */ } orig.error(...a); };

  window.addEventListener("error", (e) => {
    record("error", [`[window.error] ${e.message}`, e.error]);
  });
  window.addEventListener("unhandledrejection", (e) => {
    record("error", ["[unhandledrejection]", e.reason]);
  });
}

export function getCrashLogs(): CrashLogEntry[] {
  return buffer.slice();
}

export function clearCrashLogs() {
  buffer.length = 0;
}

/** Most recent N entries, optionally filtered to a specific traceId. */
export function getRecentCrashLogs(limit = 200, traceId?: string): CrashLogEntry[] {
  const src = traceId ? buffer.filter((e) => e.traceId === traceId) : buffer;
  return src.slice(-limit);
}

/** Unique traceIds present in the buffer, most-recent first. */
export function getKnownTraceIds(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = buffer.length - 1; i >= 0; i--) {
    const id = buffer[i].traceId;
    if (id && !seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
}

export function formatCrashReport(opts: {
  userNote?: string;
  traceId?: string;
  limit?: number;
  context?: Record<string, unknown>;
} = {}): string {
  const { userNote, traceId, limit = 200, context } = opts;
  const entries = getRecentCrashLogs(limit, traceId);
  const t0 = entries[0]?.t ?? Date.now();
  const lines: string[] = [];
  lines.push(`# Crash report`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  if (traceId) lines.push(`Trace: ${traceId}`);
  lines.push(`URL: ${typeof window !== "undefined" ? window.location.href : "n/a"}`);
  lines.push(`UA: ${typeof navigator !== "undefined" ? navigator.userAgent : "n/a"}`);
  if (context && Object.keys(context).length) {
    lines.push(`Context: ${JSON.stringify(context)}`);
  }
  if (userNote?.trim()) {
    lines.push("");
    lines.push(`## User note`);
    lines.push(userNote.trim());
  }
  lines.push("");
  lines.push(`## Recent log entries (${entries.length})`);
  for (const e of entries) {
    const dt = `+${String(e.t - t0).padStart(5, "0")}ms`;
    const lvl = e.level.toUpperCase().padEnd(5, " ");
    lines.push(`${dt} ${lvl} ${e.message}`);
  }
  return lines.join("\n");
}
