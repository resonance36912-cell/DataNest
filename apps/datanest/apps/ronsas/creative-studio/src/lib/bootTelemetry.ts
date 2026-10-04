// Startup telemetry — tracks blank-screen occurrences, dynamic-import
// failures, boot health check failures, and time-to-first-render. Everything
// flows through `logClientError` so it surfaces in the existing
// /admin/errors dashboard alongside other client errors.
//
// Severities used:
//   - "error" → blank-screen, dynamic-import failure (user actually saw a
//     broken experience or is about to)
//   - "warn"  → boot health check failed (background diagnostic)
//   - "info"  → successful boot perf timings (sampled at 10%)

import { logClientError } from "./errorLogger";
import { getDiagEntries } from "./previewDiag";

// ---------------------------------------------------------------------------
// React mount marker
// ---------------------------------------------------------------------------

let reactMountedAt: number | null = null;
let blankScreenTimers: number[] = [];

/** Called by main.tsx right after createRoot(...).render(...). */
export function markReactMounted(): void {
  if (reactMountedAt !== null) return;
  reactMountedAt = performance.now();
  // Cancel any pending blank-screen probes — React mounted in time.
  blankScreenTimers.forEach((id) => window.clearTimeout(id));
  blankScreenTimers = [];

  // Sampled boot-perf log (10%) so we have baseline data without flooding.
  if (Math.random() < 0.1) {
    void logBootPerf();
  }
}

async function logBootPerf(): Promise<void> {
  try {
    const nav = (performance.getEntriesByType("navigation")[0] ?? null) as
      | PerformanceNavigationTiming
      | null;
    const ctx: Record<string, unknown> = {
      kind: "boot-perf",
      timeToReactMountMs: Math.round(reactMountedAt ?? 0),
    };
    if (nav) {
      ctx.domContentLoadedMs = Math.round(nav.domContentLoadedEventEnd);
      ctx.domInteractiveMs = Math.round(nav.domInteractive);
      ctx.responseEndMs = Math.round(nav.responseEnd);
      ctx.transferSize = nav.transferSize;
      ctx.navigationType = nav.type;
    }
    await logClientError({
      message: `[boot-perf] React mounted in ${Math.round(reactMountedAt ?? 0)}ms`,
      severity: "info",
      // Sample bucket dedupe so we don't spam identical perf entries from
      // the same user within the same minute.
      dedupeWindowMs: 60_000,
      dedupeKey: `boot-perf|${typeof window !== "undefined" ? window.location.pathname : ""}`,
      context: ctx,
    });
  } catch { /* noop */ }
}

// ---------------------------------------------------------------------------
// Blank-screen watchdog
// ---------------------------------------------------------------------------

/**
 * Schedules checks at 5s and 12s after install. If React still has not called
 * `markReactMounted()` AND #root is empty, we log a blank-screen event with
 * the buffered diagnostics so we know which boot path stalled.
 *
 * Idempotent — safe to call multiple times.
 */
let watchdogInstalled = false;
export function installBlankScreenWatchdog(): void {
  if (watchdogInstalled || typeof window === "undefined") return;
  watchdogInstalled = true;

  const probe = (atMs: number) => {
    const id = window.setTimeout(() => {
      if (reactMountedAt !== null) return;
      const root = document.getElementById("root");
      const empty = !root || root.childElementCount === 0;
      if (!empty) return;

      // Pull a short tail of diagnostics from the startup-loaded buffer.
      void Promise.resolve().then(() => {
          const tail = getDiagEntries().slice(-15).map((e) => ({
            kind: e.kind,
            message: e.message,
            t: e.t,
          }));
          return logClientError({
            message: `[blank-screen] #root still empty after ${atMs}ms — React never mounted`,
            severity: "error",
            // Heavy dedupe: at most one blank-screen report per session/route/window.
            dedupeWindowMs: 5 * 60_000,
            dedupeKey: `blank-screen|${window.location.pathname}|${atMs}`,
            context: {
              kind: "blank-screen",
              probeAtMs: atMs,
              navigationType: (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type,
              viewport: `${window.innerWidth}x${window.innerHeight}`,
              online: typeof navigator !== "undefined" ? navigator.onLine : undefined,
              diagTail: tail,
            },
          });
        })
        .catch(() => { /* noop */ });
    }, atMs);
    blankScreenTimers.push(id);
  };

  probe(5_000);
  probe(12_000);
}

// ---------------------------------------------------------------------------
// Dynamic-import failure reporting
// ---------------------------------------------------------------------------

/**
 * Called by App.tsx `lazyWithReload` when a dynamic chunk import throws.
 * Captures the chunk identifier (best-effort, parsed from the factory source)
 * plus whether we're about to hard-reload to recover.
 */
export function reportChunkLoadFailure(args: {
  chunkHint: string;
  willReload: boolean;
  error: unknown;
  attempt: number;
}): void {
  const err = args.error;
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Unknown dynamic import error";
  const stack = err instanceof Error ? err.stack : undefined;

  void logClientError({
    message: `[chunk-load] ${args.chunkHint} — ${message}`,
    stack,
    severity: "error",
    // Per-chunk dedupe within 60s so a flapping CDN doesn't spam the table.
    dedupeWindowMs: 60_000,
    dedupeKey: `chunk-load|${args.chunkHint}|${message.slice(0, 80)}`,
    context: {
      kind: "chunk-load-failure",
      chunk: args.chunkHint,
      attempt: args.attempt,
      willReload: args.willReload,
      online: typeof navigator !== "undefined" ? navigator.onLine : undefined,
      // Connection metadata is non-standard but useful when present.
      connection:
        typeof navigator !== "undefined" && "connection" in navigator
          ? safeConnection((navigator as Navigator & { connection?: unknown }).connection)
          : undefined,
    },
  });
}

function safeConnection(c: unknown): Record<string, unknown> | undefined {
  if (!c || typeof c !== "object") return undefined;
  const obj = c as Record<string, unknown>;
  const pick = (k: string) => (obj[k] !== undefined ? obj[k] : undefined);
  return {
    effectiveType: pick("effectiveType"),
    downlink: pick("downlink"),
    rtt: pick("rtt"),
    saveData: pick("saveData"),
  };
}

// ---------------------------------------------------------------------------
// Boot health check failure reporting
// ---------------------------------------------------------------------------

/** Logged from the background boot health check (warn level — diagnostic only). */
export function reportBootHealthFailure(report: {
  ok: boolean;
  durationMs: number;
  checks: Array<{ name: string; ok: boolean; detail?: string; durationMs: number }>;
}): void {
  if (report.ok) return;
  const failed = report.checks.filter((c) => !c.ok);
  const names = failed.map((c) => c.name).join(",");
  void logClientError({
    message: `[boot-health] ${failed.length}/${report.checks.length} checks failed: ${names}`,
    severity: "warn",
    dedupeWindowMs: 60_000,
    dedupeKey: `boot-health|${names}`,
    context: {
      kind: "boot-health-failure",
      durationMs: report.durationMs,
      failed: failed.map((c) => ({
        name: c.name,
        durationMs: c.durationMs,
        detail: c.detail?.slice(0, 600),
      })),
      ok: report.checks.filter((c) => c.ok).map((c) => c.name),
    },
  });
}

// ---------------------------------------------------------------------------
// Recovery-shell telemetry
// ---------------------------------------------------------------------------

/**
 * Reasons the app fell back to a recovery shell instead of the intended page.
 *   - "chunk-import-failed"     → lazyWithRetry exhausted its auto-retry and
 *                                 rendered the in-app fallback.
 *   - "boot-import-failed"      → main.tsx failed to import React/App shell.
 *   - "boot-timeout"            → main.tsx hit BOOT_TIMEOUT_MS before mount.
 *   - "boot-preload"            → vite:preloadError after reload guard tripped.
 *   - "react-error-boundary"    → AppErrorBoundary caught a render/lifecycle throw.
 */
export type RecoveryShellReason =
  | "chunk-import-failed"
  | "boot-import-failed"
  | "boot-timeout"
  | "boot-preload"
  | "react-error-boundary";

export interface RecoveryShellEvent {
  reason: RecoveryShellReason;
  /** Best-effort chunk identifier (e.g. "./pages/Studio") when applicable. */
  chunk?: string;
  /** Underlying error, if any. */
  error?: unknown;
  /** Extra reason-specific context (e.g. attempt count, error name). */
  extra?: Record<string, unknown>;
}

/** Emitted whenever a recovery shell UI is rendered to the user. */
export function reportRecoveryShellShown(evt: RecoveryShellEvent): void {
  const route =
    typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "";
  const err = evt.error;
  const errMessage =
    err instanceof Error ? err.message : typeof err === "string" ? err : undefined;
  const errName = err instanceof Error ? err.name : undefined;
  const stack = err instanceof Error ? err.stack : undefined;

  void logClientError({
    message: `[recovery-shell] shown (${evt.reason}) at ${route}${evt.chunk ? ` — chunk=${evt.chunk}` : ""}${errMessage ? ` — ${errMessage}` : ""}`,
    stack,
    severity: "error",
    dedupeWindowMs: 60_000,
    dedupeKey: `recovery-shell|${evt.reason}|${route}|${evt.chunk ?? ""}|${(errMessage ?? "").slice(0, 80)}`,
    context: {
      kind: "recovery-shell-shown",
      reason: evt.reason,
      route,
      chunk: evt.chunk,
      errorName: errName,
      errorMessage: errMessage,
      viewport:
        typeof window !== "undefined"
          ? `${window.innerWidth}x${window.innerHeight}`
          : undefined,
      online: typeof navigator !== "undefined" ? navigator.onLine : undefined,
      reactMountedAt: reactMountedAt !== null ? Math.round(reactMountedAt) : null,
      ...(evt.extra ?? {}),
    },
  });
}

/** Emitted when the user manually presses "Try again" on a recovery shell. */
export function reportRecoveryShellRetry(evt: {
  reason: RecoveryShellReason;
  chunk?: string;
  method: "manual-retry" | "reload";
}): void {
  const route =
    typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "";
  void logClientError({
    message: `[recovery-shell] ${evt.method} (${evt.reason})${evt.chunk ? ` — chunk=${evt.chunk}` : ""}`,
    severity: "info",
    dedupeWindowMs: 10_000,
    dedupeKey: `recovery-shell-retry|${evt.reason}|${evt.method}|${route}|${evt.chunk ?? ""}`,
    context: {
      kind: "recovery-shell-retry",
      reason: evt.reason,
      method: evt.method,
      route,
      chunk: evt.chunk,
    },
  });
}
