type Severity = "error" | "warn" | "info";

interface LogPayload {
  message: string;
  stack?: string;
  source?: string;
  lineno?: number;
  colno?: number;
  severity?: Severity;
  context?: Record<string, unknown>;
  /** Override the dedupe window (ms). Defaults to 5s; pass 0 to disable. */
  dedupeWindowMs?: number;
  /** Override the dedupe key. Defaults to message+lineno+colno. */
  dedupeKey?: string;
}

const MAX_MESSAGE = 8000;
const MAX_STACK = 16000;
const DEFAULT_DEDUPE_WINDOW_MS = 5_000;
const MAX_DEDUPE_ENTRIES = 200;

// In-memory LRU-ish dedupe. Persisted to sessionStorage so a crash → reload
// loop (very common for boundary errors on a broken route) doesn't re-flood
// the table on every fresh mount.
const SS_KEY = "__err_dedupe_v1";
const recentKeys = new Map<string, number>();

type SupabaseClient = (typeof import("@/integrations/supabase/client"))["supabase"];
let supabaseClientPromise: Promise<SupabaseClient> | null = null;

function getSupabaseClient(): Promise<SupabaseClient> {
  // Keep the backend client out of the critical boot bundle. Error logging is
  // best-effort telemetry and must never be able to delay or break React mount.
  supabaseClientPromise ??= import("@/integrations/supabase/client").then((mod) => mod.supabase);
  return supabaseClientPromise;
}

(function hydrateDedupe() {
  if (typeof sessionStorage === "undefined") return;
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Array<[string, number]>;
    const cutoff = Date.now() - 60_000; // drop anything older than 1 minute on hydrate
    for (const [k, t] of parsed) if (t > cutoff) recentKeys.set(k, t);
  } catch { /* noop */ }
})();

function persistDedupe(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify([...recentKeys.entries()]));
  } catch { /* noop — quota errors etc. */ }
}

function gcDedupe(now: number): void {
  // Drop expired keys, then bound the map size LRU-style.
  for (const [k, t] of recentKeys) {
    if (now - t > 60_000) recentKeys.delete(k);
  }
  if (recentKeys.size > MAX_DEDUPE_ENTRIES) {
    const overflow = recentKeys.size - MAX_DEDUPE_ENTRIES;
    const it = recentKeys.keys();
    for (let i = 0; i < overflow; i++) {
      const k = it.next().value;
      if (k !== undefined) recentKeys.delete(k);
    }
  }
}

function safeTrim(s: string | undefined | null, max: number): string | undefined {
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

async function getUserId(): Promise<string | null> {
  try {
    const supabase = await getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Best-effort fire-and-forget insert; never throws back to the caller. */
export async function logClientError(payload: LogPayload): Promise<void> {
  try {
    const message = safeTrim(payload.message, MAX_MESSAGE);
    if (!message) return;

    // Dedupe identical errors within a window. Cross-mount via sessionStorage
    // so a crash → reload loop doesn't repeatedly insert the same boundary
    // error on every fresh React tree.
    const windowMs = payload.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
    const key = payload.dedupeKey
      ?? `${message}|${payload.lineno ?? ""}|${payload.colno ?? ""}`;
    const now = Date.now();
    if (windowMs > 0) {
      const last = recentKeys.get(key);
      if (last && now - last < windowMs) return;
      recentKeys.set(key, now);
      gcDedupe(now);
      persistDedupe();
    }

    const user_id = await getUserId();
    const supabase = await getSupabaseClient();
    // Send the dedupe key as a server-side fingerprint so the DB trigger can
    // suppress duplicates even if the in-memory/sessionStorage dedupe is bypassed
    // (private windows, multiple tabs, cleared storage, etc.).
    const fingerprint = safeTrim(key, 255);
    await supabase.from("client_error_logs").insert([
      {
        user_id: user_id ?? undefined,
        route: typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined,
        message,
        stack: safeTrim(payload.stack, MAX_STACK),
        source: safeTrim(payload.source, 500),
        lineno: payload.lineno,
        colno: payload.colno,
        severity: payload.severity ?? "error",
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : undefined,
        context: (payload.context ?? {}) as never,
        fingerprint,
      },
    ]);
  } catch {
    // Swallow — logging must never break the app.
  }
}

let installed = false;

/** Install global window error + unhandledrejection handlers. Idempotent. */
export function installGlobalErrorLogger(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event: ErrorEvent) => {
    void logClientError({
      message: event.message || String(event.error ?? "Unknown error"),
      stack: event.error?.stack,
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      severity: "error",
    });
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    const reason: any = event.reason;
    void logClientError({
      message:
        (reason && (reason.message || reason.toString?.())) ||
        "Unhandled promise rejection",
      stack: reason?.stack,
      severity: "error",
      context: { kind: "unhandledrejection" },
    });
  });
}
