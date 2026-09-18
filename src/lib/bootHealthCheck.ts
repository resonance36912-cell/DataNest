// Boot-time health check — verifies the runtime environment and critical
// provider modules can be imported before we hand control to React. If any
// check fails we surface a visible fallback in #root instead of leaving the
// preview iframe blank, and log the failure through the diagnostics buffer.

import { logDiagInfo } from "./previewDiag";

export type BootCheck = {
  name: string;
  ok: boolean;
  detail?: string;
  durationMs: number;
};

export type BootHealthReport = {
  ok: boolean;
  checks: BootCheck[];
  startedAt: number;
  durationMs: number;
};

async function timed(name: string, fn: () => Promise<void> | void): Promise<BootCheck> {
  const start = performance.now();
  try {
    await fn();
    return { name, ok: true, durationMs: Math.round(performance.now() - start) };
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err),
      durationMs: Math.round(performance.now() - start),
    };
  }
}

export async function runBootHealthCheck(): Promise<BootHealthReport> {
  const startedAt = Date.now();
  const t0 = performance.now();

  const checks: BootCheck[] = await Promise.all([
    timed("dom-root", () => {
      if (typeof document === "undefined") throw new Error("document is undefined");
      if (!document.getElementById("root")) throw new Error("#root element missing from index.html");
    }),
    timed("browser-apis", () => {
      if (typeof window === "undefined") throw new Error("window is undefined");
      if (typeof window.fetch !== "function") throw new Error("window.fetch missing");
      if (typeof window.localStorage === "undefined") throw new Error("localStorage unavailable");
      if (typeof window.sessionStorage === "undefined") throw new Error("sessionStorage unavailable");
    }),
    timed("react-dom", async () => {
      const mod = await import("react-dom/client");
      if (typeof mod.createRoot !== "function") throw new Error("createRoot export missing");
    }),
    timed("router", async () => {
      const mod = await import("react-router-dom");
      if (typeof mod.BrowserRouter !== "function") throw new Error("BrowserRouter export missing");
      if (typeof mod.Routes !== "function") throw new Error("Routes export missing");
    }),
    timed("query-client", async () => {
      const mod = await import("@tanstack/react-query");
      if (typeof mod.QueryClient !== "function") throw new Error("QueryClient export missing");
    }),
    timed("helmet", async () => {
      const mod = await import("react-helmet-async");
      if (typeof mod.HelmetProvider !== "function") throw new Error("HelmetProvider export missing");
    }),
    timed("tooltip-provider", async () => {
      const mod = await import("@/components/ui/tooltip");
      if (typeof mod.TooltipProvider !== "object" && typeof mod.TooltipProvider !== "function") {
        throw new Error("TooltipProvider export missing");
      }
    }),
    timed("local-data-client", async () => {
      const mod = await import("@/integrations/supabase/client");
      if (!mod.supabase) throw new Error("supabase client export missing");
    }),
  ]);

  const ok = checks.every((c) => c.ok);
  const durationMs = Math.round(performance.now() - t0);

  const summary = `Boot health: ${checks.filter((c) => c.ok).length}/${checks.length} OK in ${durationMs}ms`;
  logDiagInfo(summary, checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.name} (${c.durationMs}ms)${c.detail ? "\n  " + c.detail.split("\n")[0] : ""}`).join("\n"));

  return { ok, checks, startedAt, durationMs };
}

export function renderBootFailure(report: BootHealthReport): void {
  if (typeof document === "undefined") return;
  const root = document.getElementById("root");
  if (!root) return;
  const failed = report.checks.filter((c) => !c.ok);
  const rows = failed
    .map(
      (c) => `
        <li style="margin:0 0 12px 0;padding:12px;border-radius:8px;background:rgba(244,63,94,0.08);border:1px solid rgba(244,63,94,0.25);">
          <div style="font-weight:600;color:#fda4af;font-size:13px;">${escapeHtml(c.name)}</div>
          <pre style="margin:6px 0 0 0;white-space:pre-wrap;font-size:11px;color:#fecaca;font-family:ui-monospace,Menlo,monospace;">${escapeHtml(c.detail ?? "Unknown error")}</pre>
        </li>`,
    )
    .join("");

  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#0a0a14;color:#e2e8f0;font-family:ui-sans-serif,system-ui,sans-serif;">
      <div style="max-width:560px;width:100%;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:28px;">
        <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#a78bfa;margin-bottom:8px;">Boot Health Check</div>
        <h1 style="margin:0 0 6px 0;font-size:20px;font-weight:600;">The app couldn't start</h1>
        <p style="margin:0 0 18px 0;font-size:13px;color:#94a3b8;">${failed.length} of ${report.checks.length} startup checks failed. Reload to retry — the details below help us track the issue.</p>
        <ul style="list-style:none;margin:0 0 18px 0;padding:0;">${rows}</ul>
        <button onclick="window.location.reload()" style="appearance:none;cursor:pointer;background:linear-gradient(135deg,#a855f7,#ec4899);color:white;border:0;border-radius:8px;padding:10px 16px;font-size:13px;font-weight:600;">Reload</button>
      </div>
    </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
