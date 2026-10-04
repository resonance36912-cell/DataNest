// Preview loading diagnostics — captures errors from the earliest possible
// moment (imported at the top of main.tsx) so a blank/white preview iframe can
// still surface what went wrong. Buffered in-memory and exposed via a tiny
// pub/sub so the React-side <PreviewDiagnostics /> panel can read & subscribe.

export type DiagEntry = {
  id: number;
  t: number; // epoch ms
  kind: "error" | "unhandled" | "console" | "network" | "info";
  message: string;
  detail?: string;
};

const MAX = 200;
let nextId = 1;
const entries: DiagEntry[] = [];
const listeners = new Set<() => void>();
let booted = false;
const bootAt = Date.now();

function push(kind: DiagEntry["kind"], message: string, detail?: string) {
  entries.push({ id: nextId++, t: Date.now(), kind, message: String(message).slice(0, 400), detail: detail?.slice(0, 2000) });
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
  listeners.forEach((l) => { try { l(); } catch { /* noop */ } });
}

export function getDiagEntries(): readonly DiagEntry[] { return entries; }
export function getBootAt(): number { return bootAt; }
export function subscribeDiag(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function clearDiag(): void { entries.length = 0; listeners.forEach((l) => l()); }
export function logDiagInfo(message: string, detail?: string): void { push("info", message, detail); }

export function installPreviewDiag(): void {
  if (booted || typeof window === "undefined") return;
  booted = true;

  window.addEventListener("error", (e) => {
    const msg = e.message || "Uncaught error";
    const src = e.filename ? `${e.filename}:${e.lineno ?? "?"}:${e.colno ?? "?"}` : undefined;
    push("error", msg, [src, (e.error as Error | undefined)?.stack].filter(Boolean).join("\n"));
  });

  window.addEventListener("unhandledrejection", (e) => {
    const r = (e as PromiseRejectionEvent).reason;
    const msg = (r && (r.message || String(r))) || "Unhandled promise rejection";
    push("unhandled", msg, r?.stack);
  });

  // Patch console.error/warn — keep originals.
  const origErr = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      const msg = args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : safeJson(a))).join(" ");
      // Skip the noisy React-Router future-flag and known dev warnings.
      if (!/React Router Future Flag|Download the React DevTools/.test(msg)) {
        push("console", msg.slice(0, 400));
      }
    } catch { /* noop */ }
    origErr(...args);
  };

  // Patch fetch to capture failed responses & network errors.
  const origFetch = window.fetch?.bind(window);
  if (origFetch) {
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
      try {
        const res = await origFetch(...args);
        if (!res.ok && !isExpectedNonOk(url, res.status)) {
          push("network", `${res.status} ${res.statusText} — ${shortUrl(url)}`);
        }
        return res;
      } catch (err) {
        push("network", `Network error — ${shortUrl(url)}`, (err as Error)?.message);
        throw err;
      }
    };
  }
}

// 401/403 from the Hub entitlement endpoint is a normal "free tier / not
// provisioned" signal — don't surface it as an error in the diagnostics panel.
function isExpectedNonOk(url: string, status: number): boolean {
  if (status !== 401 && status !== 403) return false;
  return /\/api\/public\/entitlement\b/.test(url);
}

function safeJson(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}
function shortUrl(u: string): string {
  try { const x = new URL(u, window.location.href); return x.pathname + (x.search ? "?…" : ""); } catch { return u; }
}
