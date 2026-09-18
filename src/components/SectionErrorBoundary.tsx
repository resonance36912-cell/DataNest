import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { logFatal } from "@/lib/error-logger";

interface SectionErrorBoundaryProps {
  children: ReactNode;
  /** Name of the section for error logging (e.g. "SceneCard", "Toolbar") */
  name: string;
  /** Optional compact mode for small sections */
  compact?: boolean;
  /** Optional custom fallback — overrides default */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Granular error boundary for individual UI sections.
 * Unlike the global ErrorBoundary, this:
 * - Logs structured error context
 * - Allows in-place recovery without full page reload
 * - Renders a compact fallback that doesn't break layout
 */
export default class SectionErrorBoundary extends Component<SectionErrorBoundaryProps, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logFatal("SectionErrorBoundary", `Crash in "${this.props.name}"`, {
      errorMessage: error.message,
      stack: error.stack?.split("\n").slice(0, 5).join("\n"),
      componentStack: info.componentStack?.split("\n").slice(0, 5).join("\n"),
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      if (this.props.compact) {
        return (
          <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{this.props.name} failed to render</span>
            <button
              onClick={this.handleRetry}
              className="ml-auto shrink-0 rounded px-2 py-0.5 text-[10px] font-medium bg-destructive/10 hover:bg-destructive/20 transition-colors"
            >
              Retry
            </button>
          </div>
        );
      }

      return (
        <div className="glass-card flex flex-col items-center gap-3 p-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium">{this.props.name} encountered an error</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              {this.state.error?.message || "Something went wrong in this section."}
            </p>
          </div>
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
