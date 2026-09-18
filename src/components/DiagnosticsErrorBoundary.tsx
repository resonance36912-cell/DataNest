// Silent error boundary that wraps non-essential diagnostics/banner widgets
// (PreviewDiagnostics, HubEntitlementBanner, EntitlementUpgradeWatcher).
//
// Goal: if any of these auxiliary components crash, they MUST NOT take the
// rest of the app down with them. We render nothing on failure (no scary UI
// for end users) but we DO:
//   1. console.error the raw error + componentStack (dev tools / Sentry)
//   2. push a diag entry into the in-memory previewDiag buffer (visible in
//      the floating diagnostics panel)
//   3. fire-and-forget insert into `client_error_logs` via logClientError
//      so the crash shows up in the admin Errors dashboard, deduped per
//      widget-label + error name + message within a 60s window so a render
//      loop can't flood the table.
//   4. surface a small, non-blocking toast to the user ONCE per widget per
//      session — enough to say "a non-critical panel failed", never enough
//      to block their flow.

import { Component, type ErrorInfo, type ReactNode } from "react";
import { toast } from "sonner";
import { logDiagInfo } from "@/lib/previewDiag";
import { logClientError } from "@/lib/errorLogger";

type Props = { children: ReactNode; label?: string };
type State = { hasError: boolean };

// Module-level so we only toast once per widget per page load, even across
// remounts of the boundary itself.
const toastedLabels = new Set<string>();

/** Extract the first React component name from the componentStack trace. */
function parseCrashedComponent(componentStack?: string): string | null {
  if (!componentStack) return null;
  const lines = componentStack
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^in\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (match) return match[1];
  }
  return null;
}

/** Serialize the boundary's own props into a safe, inspectable context object. */
function summarizeProps(props: Props): Record<string, unknown> {
  const children = props.children;
  return {
    label: props.label,
    hasChildren: Boolean(children),
    childrenType: typeof children,
    childCount: Array.isArray(children) ? children.length : children ? 1 : 0,
  };
}

export default class DiagnosticsErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const label = this.props.label ?? "diagnostics";
    const componentName = parseCrashedComponent(info.componentStack) ?? "unknown";
    const propsContext = summarizeProps(this.props);
    const timestamp = new Date().toISOString();

    // 1. Raw console.error — preserves stack for dev tools and any error
    //    aggregator already listening on window.onerror.
    try {
      // eslint-disable-next-line no-console
      console.error(
        `[DiagnosticsErrorBoundary:${label}] crashed component=${componentName}`,
        error,
        info.componentStack,
      );
    } catch {
      // ignore
    }

    // 2. In-memory diag buffer (PreviewDiagnostics panel).
    try {
      logDiagInfo(
        `Diagnostics widget crashed (${label}) — suppressed to protect app shell`,
        JSON.stringify(
          {
            componentName,
            label,
            timestamp,
            message: error.message,
            componentStack: info.componentStack,
          },
          null,
          2,
        ),
      );
    } catch {
      // ignore
    }

    // 3. Persisted, deduped report to client_error_logs with full context.
    void logClientError({
      message: `[DiagnosticsBoundary:${label}|${componentName}] ${error.name}: ${error.message}`,
      stack: [error.stack, info.componentStack]
        .filter(Boolean)
        .join("\n\n--- componentStack ---\n"),
      severity: "error",
      dedupeWindowMs: 60_000,
      dedupeKey: `diag-boundary|${label}|${componentName}|${error.name}|${error.message}`,
      context: {
        kind: "diagnostics-error-boundary",
        label,
        componentName,
        errorName: error.name,
        props: propsContext,
        stack: error.stack,
        componentStack: info.componentStack,
        timestamp,
        route:
          typeof window !== "undefined" ? window.location.pathname : undefined,
      },
    });

    // 4. User-safe, one-shot toast. Non-blocking; auxiliary panel only.
    if (!toastedLabels.has(label)) {
      toastedLabels.add(label);
      try {
        toast.error("A diagnostics panel hit an error", {
          description: `The "${label}" widget was hidden to keep the app running. The issue was reported automatically.`,
          duration: 6000,
        });
      } catch {
        // ignore — toast must never escalate a suppressed crash.
      }
    }
  }

  render(): ReactNode {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
