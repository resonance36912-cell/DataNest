/**
 * Structured error logger — captures errors with context for debugging.
 * Logs to console in dev, could be extended to send to a remote service.
 */

type ErrorSeverity = "warning" | "error" | "fatal";

export interface ErrorLogEntry {
  severity: ErrorSeverity;
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

const LOG_BUFFER: ErrorLogEntry[] = [];
const MAX_BUFFER = 100;

function createEntry(
  severity: ErrorSeverity,
  source: string,
  message: string,
  metadata?: Record<string, unknown>
): ErrorLogEntry {
  return {
    severity,
    source,
    message,
    metadata,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Log an error with structured context.
 * @param source - Component or module name (e.g. "SceneCard", "useSceneGeneration")
 * @param message - Human-readable description
 * @param metadata - Extra context (scene index, provider, etc.)
 */
export function logError(source: string, message: string, metadata?: Record<string, unknown>) {
  const entry = createEntry("error", source, message, metadata);
  pushEntry(entry);
  console.error(`[${source}]`, message, metadata ?? "");
}

export function logWarning(source: string, message: string, metadata?: Record<string, unknown>) {
  const entry = createEntry("warning", source, message, metadata);
  pushEntry(entry);
  console.warn(`[${source}]`, message, metadata ?? "");
}

export function logFatal(source: string, message: string, metadata?: Record<string, unknown>) {
  const entry = createEntry("fatal", source, message, metadata);
  pushEntry(entry);
  console.error(`[FATAL][${source}]`, message, metadata ?? "");
}

function pushEntry(entry: ErrorLogEntry) {
  LOG_BUFFER.push(entry);
  if (LOG_BUFFER.length > MAX_BUFFER) {
    LOG_BUFFER.shift();
  }
}

/** Get recent error log entries (useful for diagnostics / admin panel). */
export function getRecentErrors(count = 20): ErrorLogEntry[] {
  return LOG_BUFFER.slice(-count);
}

/** Clear the log buffer. */
export function clearErrorLog() {
  LOG_BUFFER.length = 0;
}

/**
 * Install global listeners for uncaught errors and unhandled promise rejections.
 * Call once at app startup (e.g. main.tsx).
 */
export function installGlobalErrorListeners() {
  window.addEventListener("error", (event) => {
    logFatal("window.onerror", event.message || "Uncaught error", {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack?.split("\n").slice(0, 6).join("\n"),
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : String(reason ?? "Unknown rejection");
    logFatal("unhandledrejection", message, {
      stack:
        reason instanceof Error
          ? reason.stack?.split("\n").slice(0, 6).join("\n")
          : undefined,
    });
  });
}
