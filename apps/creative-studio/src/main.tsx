import { getDiagEntries, installPreviewDiag } from "./lib/previewDiag";
import "./index.css";

type BootTelemetry = typeof import("./lib/bootTelemetry");
type BootError = Error | { message?: string; stack?: string } | unknown;
type ReactModule = typeof import("react");
import type { ErrorInfo, ReactNode } from "react";

let telemetry: BootTelemetry | null = null;
let bootState: "starting" | "loading" | "mounted" | "failed" = "starting";
const BOOT_TIMEOUT_MS = 15_000;

// Install the loading-diagnostics capture as early as possible so it can record
// boot-time errors that would otherwise leave the iframe blank with no signal.
try {
  installPreviewDiag();
} catch (err) {
  console.warn("[boot] preview diagnostics unavailable", err);
}
installChunkPreloadRecovery();

// Strip the crawlable SEO fallback once the React app mounts — keeps the DOM clean for users.
document.getElementById("seo-fallback")?.remove();

const rootEl = document.getElementById("root");
if (rootEl) {
  renderBootLoading(rootEl);
  void bootApp(rootEl);
} else {
  console.error("[boot] #root element missing from index.html");
  document.body.innerHTML = bootShellHtml("Creative Studio could not load", "#root element missing from index.html");
}

async function bootApp(container: HTMLElement): Promise<void> {
  bootState = "loading";

  const timeoutId = window.setTimeout(() => {
    if (bootState === "mounted") return;
    const error = new Error("App startup timed out while loading the application shell");
    console.error("[boot] startup timeout", error);
    void reportBootStartupFailure(error, "timeout");
    bootState = "failed";
    renderBootFailure(container, error, "boot-timeout");
  }, BOOT_TIMEOUT_MS);

  try {
    // The visible loader above is plain DOM. React, the app shell, telemetry,
    // and backend logging are all dynamic so no optional module can blank the
    // page before there is a recovery UI.
    const [reactMod, reactDomMod, appMod, helmetMod] = await Promise.all([
      import("react"),
      import("react-dom/client"),
      import("./App.tsx"),
      import("react-helmet-async"),
    ]);

    if (hasBootFailed()) return;

    const root = reactDomMod.createRoot(container);
    const RuntimeBoundary = createRuntimeBoundary(reactMod);

    bootState = "mounted";
    window.clearTimeout(timeoutId);

    root.render(
      reactMod.createElement(
        helmetMod.HelmetProvider,
        null,
        reactMod.createElement(
          RuntimeBoundary,
          null,
          reactMod.createElement(appMod.default),
        ),
      ),
    );

    void installOptionalRuntimeServices().then(() => telemetry?.markReactMounted());

    // Fire-and-forget background diagnostics. Imported only after the app is
    // mounted so probe chunk failures cannot block startup.
    void import("./lib/bootHealthCheck")
      .then(({ runBootHealthCheck }) => runBootHealthCheck())
      .then((report) => telemetry?.reportBootHealthFailure(report))
      .catch((err) => {
        console.warn("[boot] background health check failed:", err);
      });
  } catch (err) {
    bootState = "failed";
    window.clearTimeout(timeoutId);
    console.error("[boot] failed to load application shell", err);
    void reportBootStartupFailure(err, "import");
    renderBootFailure(container, err, "boot-import-failed");
  }
}

function installChunkPreloadRecovery(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    const error = (event as Event & { payload?: unknown }).payload;
    const message = error instanceof Error ? error.message : String(error ?? "Unknown preload error");
    console.error("[boot] module preload failed", error);
    void reportBootStartupFailure(error ?? new Error(message), "preload");

    const reloadKey = "__vite_preload_reload__";
    try {
      if (sessionStorage.getItem(reloadKey)) {
        if (rootEl) renderBootFailure(rootEl, error ?? new Error(message), "boot-preload");
        return;
      }
      sessionStorage.setItem(reloadKey, "1");
    } catch { /* noop */ }
    window.location.reload();
  });
}

function hasBootFailed(): boolean {
  return bootState === "failed";
}

async function installOptionalRuntimeServices(): Promise<void> {
  try {
    const [telemetryMod, loggerMod] = await Promise.all([
      import("./lib/bootTelemetry"),
      import("./lib/errorLogger"),
    ]);
    telemetry = telemetryMod;
    telemetry.installBlankScreenWatchdog();
    loggerMod.installGlobalErrorLogger();
  } catch (err) {
    console.warn("[boot] optional runtime services unavailable", err);
  }
}

async function reportBootStartupFailure(error: BootError, phase: "import" | "timeout" | "preload"): Promise<void> {
  try {
    const message = error instanceof Error ? error.message : String(error ?? "Unknown startup error");
    const stack = error instanceof Error ? error.stack : undefined;
    const { logClientError } = await import("./lib/errorLogger");
    await logClientError({
      message: `[boot-startup] ${phase}: ${message}`,
      stack,
      severity: "error",
      dedupeWindowMs: 5 * 60_000,
      dedupeKey: `boot-startup|${phase}|${message.slice(0, 120)}`,
      context: {
        kind: "boot-startup-failure",
        phase,
        route: window.location.pathname + window.location.search,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        online: navigator.onLine,
        diagTail: getDiagEntries().slice(-15).map((e) => ({
          kind: e.kind,
          message: e.message,
          t: e.t,
        })),
      },
    });
  } catch {
    // Startup telemetry must never make startup worse.
  }
}

function createRuntimeBoundary(React: ReactModule) {
  type BoundaryState = { error: Error | null };
  return class RuntimeBoundary extends React.Component<{ children: ReactNode }, BoundaryState> {
    state: BoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): BoundaryState {
      return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
      console.error("[boot] React runtime boundary", error, info);
      void import("./lib/errorLogger")
        .then(({ logClientError }) => logClientError({
          message: `[runtime-boundary] ${error.name}: ${error.message}`,
          stack: [error.stack, info.componentStack].filter(Boolean).join("\n\n--- componentStack ---\n"),
          severity: "error",
          dedupeWindowMs: 60_000,
          dedupeKey: `runtime-boundary|${window.location.pathname}|${error.name}|${error.message}`,
          context: {
            kind: "react-runtime-boundary",
            viewport: `${window.innerWidth}x${window.innerHeight}`,
          },
        }))
        .catch(() => { /* noop */ });
    }

    render() {
      if (this.state.error) {
        return React.createElement(BootFailureView, { error: this.state.error, React });
      }
      return this.props.children;
    }
  };
}

function BootFailureView({ error, React }: { error: BootError; React: ReactModule }) {
  const message = error instanceof Error ? error.message : String(error ?? "The app could not finish loading.");

  const retry = () => {
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith("__chunk_reload_") || k.startsWith("__err_dedupe_"))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch { /* noop */ }
    window.location.reload();
  };

  return React.createElement("div", { className: "min-h-screen bg-background px-4 py-10 text-foreground" },
    React.createElement("div", { className: "flex min-h-screen items-center justify-center" },
      React.createElement("main", { className: "w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl" },
        React.createElement("p", { className: "text-xs font-semibold uppercase tracking-widest text-primary" }, "Startup recovery"),
        React.createElement("h1", { className: "mt-3 text-2xl font-semibold" }, "Creative Studio could not load"),
        React.createElement("p", { className: "mt-3 text-sm leading-6 text-muted-foreground" }, "A startup module failed before the app shell could open. This screen prevents a blank page and the issue has been logged for review."),
        React.createElement("pre", { className: "mt-4 max-h-40 overflow-auto rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground" }, message),
        React.createElement("div", { className: "mt-5 flex flex-wrap gap-2" },
          React.createElement("button", { type: "button", onClick: retry, className: "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" }, "Retry loading"),
          React.createElement("button", { type: "button", onClick: () => window.location.assign("/"), className: "rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground" }, "Go home"),
        ),
      ),
    ),
  );
}

function renderBootLoading(container: HTMLElement): void {
  container.innerHTML = `
    <div class="min-h-screen bg-background text-foreground" data-boot-state="loading">
      <div class="flex min-h-screen items-center justify-center px-6">
        <div class="flex items-center gap-3 text-sm text-muted-foreground">
          <span class="h-3 w-3 animate-pulse rounded-full bg-primary" aria-hidden="true"></span>
          <span>Loading Creative Studio…</span>
        </div>
      </div>
    </div>`;
}

function renderBootFailure(
  container: HTMLElement,
  error: BootError,
  reason: "boot-import-failed" | "boot-timeout" | "boot-preload" = "boot-import-failed",
): void {
  const message = error instanceof Error ? error.message : String(error ?? "The app could not finish loading.");
  container.innerHTML = bootShellHtml("Creative Studio could not load", message);
  container.querySelector<HTMLButtonElement>("[data-boot-retry]")?.addEventListener("click", () => {
    void import("./lib/bootTelemetry")
      .then((mod) => mod.reportRecoveryShellRetry({ reason, method: "reload" }))
      .catch(() => { /* noop */ });
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith("__chunk_reload_") || k.startsWith("__err_dedupe_"))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch { /* noop */ }
    window.location.reload();
  });
  container.querySelector<HTMLButtonElement>("[data-boot-home]")?.addEventListener("click", () => {
    window.location.assign("/");
  });

  // Fire recovery-shell telemetry through the deferred loader so bootTelemetry
  // isn't pulled into the critical boot bundle.
  void import("./lib/bootTelemetry")
    .then((mod) => mod.reportRecoveryShellShown({ reason, error }))
    .catch(() => { /* noop */ });
}

function bootShellHtml(title: string, message: string): string {
  return `
    <div class="min-h-screen bg-background px-4 py-10 text-foreground" data-boot-state="failed">
      <div class="flex min-h-screen items-center justify-center">
        <main class="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl">
          <p class="text-xs font-semibold uppercase tracking-widest text-primary">Startup recovery</p>
          <h1 class="mt-3 text-2xl font-semibold">${escapeHtml(title)}</h1>
          <p class="mt-3 text-sm leading-6 text-muted-foreground">A startup module failed before the app shell could open. This screen prevents a blank page and the issue has been logged for review.</p>
          <pre class="mt-4 max-h-40 overflow-auto rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">${escapeHtml(message)}</pre>
          <div class="mt-5 flex flex-wrap gap-2">
            <button type="button" data-boot-retry class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Retry loading</button>
            <button type="button" data-boot-home class="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground">Go home</button>
          </div>
        </main>
      </div>
    </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
