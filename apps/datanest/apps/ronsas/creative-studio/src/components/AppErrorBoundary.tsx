import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { logClientError } from "@/lib/errorLogger";
import {
  reportRecoveryShellShown,
  reportRecoveryShellRetry,
} from "@/lib/bootTelemetry";

type Props = { children: ReactNode };
type State = { error: Error | null; info: ErrorInfo | null };

/**
 * Top-level error boundary. Catches render/lifecycle errors anywhere in the
 * React tree and shows a branded fallback with a one-click reload (and a
 * "Go home" escape hatch) so a crashed page never leaves the user staring at
 * a blank screen.
 *
 * Note: error boundaries do NOT catch errors in event handlers, async code,
 * or SSR — those are surfaced by the global handlers in `previewDiag.ts`.
 */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the raw Error so the stack trace is preserved in dev tools / Sentry.
    console.error("[AppErrorBoundary]", error, info);
    this.setState({ error, info });

    // Fire-and-forget report to client_error_logs so blank-crash trends are
    // visible in the admin Errors dashboard (route + user_id + stack captured
    // server-side by logClientError).
    void logClientError({
      message: `[ErrorBoundary] ${error.name}: ${error.message}`,
      stack: [error.stack, info.componentStack].filter(Boolean).join("\n\n--- componentStack ---\n"),
      severity: "error",
      // Suppress crash-reload spam: same route + error name + message within
      // 60s collapses to a single insert (incl. across reloads via sessionStorage).
      dedupeWindowMs: 60_000,
      dedupeKey: `boundary|${typeof window !== "undefined" ? window.location.pathname : ""}|${error.name}|${error.message}`,
      context: {
        kind: "react-error-boundary",
        errorName: error.name,
        viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : undefined,
      },
    });

    // Distinct recovery-shell event so we can chart fallback occurrences
    // separately from raw error volume.
    reportRecoveryShellShown({
      reason: "react-error-boundary",
      error,
      extra: {
        errorName: error.name,
        componentStackHead: info.componentStack?.split("\n").slice(0, 4).join("\n"),
      },
    });
  }

  private handleReload = () => {
    reportRecoveryShellRetry({ reason: "react-error-boundary", method: "reload" });
    try {
      // Best-effort: clear the lazy-chunk reload guard so a stale-chunk crash
      // can re-attempt the import after the hard reload.
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith("__chunk_reload_"))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch { /* noop */ }
    window.location.reload();
  };

  private handleHome = () => {
    reportRecoveryShellRetry({ reason: "react-error-boundary", method: "manual-retry" });
    window.location.assign("/");
  };

  render() {
    if (!this.state.error) return this.props.children;

    const { error, info } = this.state;
    const isDev = Boolean((import.meta as ImportMeta).env?.DEV);

    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10 text-foreground">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Something went wrong</h1>
              <p className="text-sm text-muted-foreground">
                This page hit an unexpected error and couldn't finish loading.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              <RefreshCw className="h-4 w-4" />
              Reload page
            </button>
            <button
              type="button"
              onClick={this.handleHome}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 text-sm font-medium text-foreground transition hover:bg-white/[0.06]"
            >
              <Home className="h-4 w-4" />
              Go home
            </button>
          </div>

          {isDev && (
            <details className="mt-5 rounded-lg border border-white/10 bg-black/30 p-3 text-xs">
              <summary className="cursor-pointer font-medium text-zinc-300">
                Error details (dev only)
              </summary>
              <div className="mt-2 space-y-2">
                <div className="font-mono text-rose-300">{error.name}: {error.message}</div>
                {error.stack && (
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[10px] text-zinc-400">
                    {error.stack}
                  </pre>
                )}
                {info?.componentStack && (
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[10px] text-zinc-500">
                    {info.componentStack}
                  </pre>
                )}
              </div>
            </details>
          )}

          <p className="mt-5 text-xs text-muted-foreground">
            If this keeps happening, try clearing your browser cache or contact support.
          </p>
        </div>
      </div>
    );
  }
}
