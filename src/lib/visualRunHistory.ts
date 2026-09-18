/**
 * Local-only history of card-diff runs started from /admin/visual-thresholds.
 *
 * Each entry records when the run happened, which preset (if any) was active,
 * the engines it targeted and a compact summary parsed out of Playwright's list
 * reporter output. Nothing leaves the browser.
 */

const STORAGE_KEY = "resonance.visualRunHistory.v1";
const MAX_ENTRIES = 30;

export interface VisualRunSummary {
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  /** Test titles that failed, capped for display. */
  failures: string[];
  /** Playwright's reported duration string, e.g. "12.4s". */
  duration?: string;
}

export interface VisualRunHistoryEntry {
  id: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  presetName: string | null;
  engines: string[];
  updateSnapshots: boolean;
  overrideSummary: string;
  exitCode: number | null;
  status: "passed" | "failed" | "cancelled";
  summary: VisualRunSummary;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function loadRunHistory(): VisualRunHistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord).map((e) => e as unknown as VisualRunHistoryEntry);
  } catch {
    return [];
  }
}

export function saveRunHistory(entries: VisualRunHistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    /* storage unavailable — history stays in memory only */
  }
}

export function addRunHistoryEntry(
  entries: VisualRunHistoryEntry[],
  entry: VisualRunHistoryEntry,
): VisualRunHistoryEntry[] {
  const next = [entry, ...entries].slice(0, MAX_ENTRIES);
  saveRunHistory(next);
  return next;
}

const stripAnsi = (line: string) => line.replace(/\u001b\[[0-9;]*m/g, "");

/**
 * Pull pass/fail/flaky counts and failing test titles out of Playwright's
 * `list` reporter stream.
 */
export function parseRunSummary(lines: string[]): VisualRunSummary {
  const summary: VisualRunSummary = {
    passed: 0,
    failed: 0,
    flaky: 0,
    skipped: 0,
    failures: [],
  };

  for (const raw of lines) {
    const line = stripAnsi(raw).trim();
    if (!line) continue;

    const totals = line.match(/^(\d+)\s+(passed|failed|flaky|skipped|did not run)\b(?:\s*\(([^)]+)\))?/i);
    if (totals) {
      const n = Number(totals[1]);
      const kind = totals[2].toLowerCase();
      if (kind === "passed") summary.passed = n;
      else if (kind === "failed") summary.failed = n;
      else if (kind === "flaky") summary.flaky = n;
      else summary.skipped += n;
      if (totals[3] && kind === "passed") summary.duration = totals[3];
      continue;
    }

    // "  1) e2e/provider-card-visual.spec.ts:42:3 › chromium › whatsapp /pricing"
    const failure = line.match(/^\d+\)\s+(.+)$/);
    if (failure && summary.failures.length < 20) {
      const title = failure[1].replace(/^e2e\/[^\s]*\s*/, "").trim();
      if (title && !summary.failures.includes(title)) summary.failures.push(title);
    }
  }

  return summary;
}

export function describeRunSummary(summary: VisualRunSummary): string {
  const bits: string[] = [];
  if (summary.passed) bits.push(`${summary.passed} passed`);
  if (summary.failed) bits.push(`${summary.failed} failed`);
  if (summary.flaky) bits.push(`${summary.flaky} flaky`);
  if (summary.skipped) bits.push(`${summary.skipped} skipped`);
  if (!bits.length) return "no results parsed";
  return bits.join(" · ");
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

/* ---------------- Export ---------------- */

const pad = (n: number) => String(n).padStart(2, "0");

/** `visual-run-history-2026-08-06-0925.json` */
export function runHistoryFilename(ext: "json" | "csv", now = new Date()): string {
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `visual-run-history-${stamp}.${ext}`;
}

export function runHistoryToJson(entries: VisualRunHistoryEntry[], now = new Date()): string {
  return JSON.stringify(
    {
      kind: "resonance.visualRunHistory",
      version: 1,
      exportedAt: now.toISOString(),
      count: entries.length,
      runs: entries,
    },
    null,
    2,
  );
}

const csvCell = (value: unknown): string => {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function runHistoryToCsv(entries: VisualRunHistoryEntry[]): string {
  const header = [
    "started_at",
    "finished_at",
    "duration_ms",
    "duration",
    "status",
    "exit_code",
    "preset",
    "engines",
    "update_snapshots",
    "overrides",
    "passed",
    "failed",
    "flaky",
    "skipped",
    "summary",
    "failures",
  ];
  const rows = entries.map((e) => [
    e.startedAt,
    e.finishedAt,
    e.durationMs,
    formatDurationMs(e.durationMs),
    e.status,
    e.exitCode ?? "",
    e.presetName ?? "",
    e.engines.join(" "),
    e.updateSnapshots ? "yes" : "no",
    e.overrideSummary,
    e.summary?.passed ?? 0,
    e.summary?.failed ?? 0,
    e.summary?.flaky ?? 0,
    e.summary?.skipped ?? 0,
    e.summary ? describeRunSummary(e.summary) : "",
    (e.summary?.failures ?? []).join(" | "),
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

/** Trigger a browser download of the run history. Returns the filename. */
export function downloadRunHistory(
  entries: VisualRunHistoryEntry[],
  format: "json" | "csv",
): string {
  const now = new Date();
  const filename = runHistoryFilename(format, now);
  const body = format === "json" ? runHistoryToJson(entries, now) : runHistoryToCsv(entries);
  const blob = new Blob([body], {
    type: format === "json" ? "application/json" : "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return filename;
}
