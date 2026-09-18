import { Component, lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import {
  reportChunkLoadFailure,
  reportRecoveryShellShown,
  reportRecoveryShellRetry,
} from "@/lib/bootTelemetry";

/**
 * Wraps a dynamic-import factory in a component that:
 *   1. Renders the lazy page on success.
 *   2. Automatically retries the import once on failure (in-place, no reload).
 *   3. On second failure, shows a branded fallback with:
 *        - "Try again" — re-runs the import (no page reload).
 *        - "Reload page" — hard-reload fallback for stale index bundles.
 *
 * Chunk-load failures are still reported to bootTelemetry for observability.
 */

const parseChunkHint = (factory: () => unknown): string => {
  const src = factory.toString();
  const m = src.match(/import\(\s*["']([^"']+)["']\s*\)/);
  return m?.[1] ?? src.slice(0, 80);
};

type LazyFactory<T> = () => Promise<{ default: ComponentType<T> }>;

const PageLoader = () => (
  <div className="h-screen flex items-center justify-center bg-background">
    <Loader2 className="w-6 h-6 animate-spin text-primary" />
  </div>
);

interface FallbackProps {
  chunkHint: string;
  error: unknown;
  onRetry: () => void;
}

const ChunkLoadFallback = ({ chunkHint, error, onRetry }: FallbackProps) => {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return (
    <div
      role="alert"
      className="min-h-screen flex items-center justify-center bg-background px-6"
    >
      <div className="max-w-md w-full text-center space-y-5">
        <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-destructive" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground">
            This page couldn't load
          </h1>
          <p className="text-sm text-muted-foreground">
            We couldn't fetch part of the app. This usually clears with a retry —
            it's often a brief network hiccup or a new version being deployed.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Try again
          </button>
          <button
            type="button"
            onClick={() => {
              reportRecoveryShellRetry({
                reason: "chunk-import-failed",
                chunk: chunkHint,
                method: "reload",
              });
              try {
                // Clear the reload guard so the reload path can also self-retry.
                Object.keys(sessionStorage)
                  .filter((k) => k.startsWith("__chunk_reload_"))
                  .forEach((k) => sessionStorage.removeItem(k));
              } catch {
                /* ignore */
              }
              window.location.reload();
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-border text-sm font-medium text-foreground hover:bg-muted transition"
          >
            Reload page
          </button>
        </div>
        {import.meta.env.DEV && (
          <details className="text-left text-xs text-muted-foreground bg-muted/40 rounded p-3">
            <summary className="cursor-pointer">Details</summary>
            <div className="mt-2 font-mono break-all">
              <div>chunk: {chunkHint}</div>
              <div>error: {message}</div>
            </div>
          </details>
        )}
      </div>
    </div>
  );
};

interface RetryBoundaryState {
  status: "loading" | "ready" | "failed";
  Component: ComponentType<unknown> | null;
  error: unknown;
  attempt: number;
}

interface RetryBoundaryProps {
  factory: LazyFactory<unknown>;
  chunkHint: string;
  forwardProps: Record<string, unknown>;
}

class LazyRetryBoundary extends Component<RetryBoundaryProps, RetryBoundaryState> {
  state: RetryBoundaryState = {
    status: "loading",
    Component: null,
    error: null,
    attempt: 0,
  };

  componentDidMount() {
    void this.load(0, /* auto */ false);
  }

  private load = async (attempt: number, isAutoRetry: boolean) => {
    this.setState({ status: "loading", error: null, attempt });
    try {
      const mod = await this.props.factory();
      this.setState({ status: "ready", Component: mod.default as ComponentType<unknown> });
    } catch (err) {
      reportChunkLoadFailure({
        chunkHint: this.props.chunkHint,
        willReload: false,
        error: err,
        attempt: attempt + 1,
      });

      if (attempt === 0) {
        // One automatic in-place retry (short backoff to let a flaky
        // network/CDN settle) before surfacing the fallback UI.
        setTimeout(() => {
          void this.load(1, true);
        }, 600);
        return;
      }

      this.setState({ status: "failed", error: err });
      reportRecoveryShellShown({
        reason: "chunk-import-failed",
        chunk: this.props.chunkHint,
        error: err,
        extra: { attempts: attempt + 1, wasAutoRetry: isAutoRetry },
      });
    }
  };

  private handleManualRetry = () => {
    reportRecoveryShellRetry({
      reason: "chunk-import-failed",
      chunk: this.props.chunkHint,
      method: "manual-retry",
    });
    void this.load(0, false);
  };

  render() {
    const { status, Component, error } = this.state;
    const { forwardProps, chunkHint } = this.props;

    if (status === "failed") {
      return (
        <ChunkLoadFallback
          chunkHint={chunkHint}
          error={error}
          onRetry={this.handleManualRetry}
        />
      );
    }
    if (status === "ready" && Component) {
      return <Component {...forwardProps} />;
    }
    return <PageLoader />;
  }
}

export const lazyWithReload = <T,>(factory: LazyFactory<T>): ComponentType<T> => {
  const chunkHint = parseChunkHint(factory);
  const Wrapped = (props: T) => (
    <LazyRetryBoundary
      factory={factory as LazyFactory<unknown>}
      chunkHint={chunkHint}
      forwardProps={props as Record<string, unknown>}
    />
  );
  Wrapped.displayName = `LazyWithRetry(${chunkHint})`;
  return Wrapped as ComponentType<T>;
};

/**
 * Kept for callers that want to wrap arbitrary lazy children in the same
 * Suspense loader used above.
 */
export const LazyRoute = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<PageLoader />}>{children}</Suspense>
);

// Re-export React.lazy for anywhere it's imported alongside these helpers.
export { lazy };
