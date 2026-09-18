import { useState } from "react";
import { APP_KEY, HUB_URL } from "@/lib/entitlement";
import { Loader2, PlugZap, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { HubProjectMismatchFix } from "./HubProjectMismatchFix";

type Result =
  | { kind: "ok"; status: number; latencyMs: number; body: unknown }
  | { kind: "http"; status: number; latencyMs: number; body: string }
  | { kind: "no-session" }
  | { kind: "network"; message: string };

/**
 * One-click Hub entitlement diagnostic. Calls the real Hub endpoint
 * with the currently signed-in user's Supabase JWT and renders the
 * raw HTTP status + parsed tier payload. Confirms that this app's
 * Supabase project matches the Hub's (a JWT mismatch returns 401/403).
 */
export function HubEntitlementCheck() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const endpoint = "/_rons/session";

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      const t0 = performance.now();
      let res: Response;
      try {
        res = await fetch(endpoint, { credentials: "include", cache: "no-store", headers: { Accept: "application/json" } });
      } catch (e) {
        setResult({ kind: "network", message: e instanceof Error ? e.message : String(e) });
        return;
      }
      const latencyMs = Math.round(performance.now() - t0);
      const text = await res.text();
      if (res.ok) {
        let body: unknown = text;
        try { body = JSON.parse(text); } catch { /* keep raw */ }
        setResult({ kind: "ok", status: res.status, latencyMs, body });
      } else {
        setResult({ kind: "http", status: res.status, latencyMs, body: text });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="studio-card p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <PlugZap className="w-4 h-4 text-primary" />
            <h3 className="font-display font-bold text-foreground">Hub entitlement check</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Reads the same-origin HttpOnly-cookie session from <code className="text-foreground/80">{endpoint}</code> and shows the raw response.
            A <strong>200</strong> confirms the spoke session boundary is reachable.
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="shrink-0 inline-flex items-center gap-2 studio-gradient-bg text-primary-foreground text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
          {loading ? "Checking…" : "Run check"}
        </button>
      </div>

      {result && (
        <div className="mt-3 rounded-lg border border-border bg-card/60 p-4 text-sm">
          {result.kind === "no-session" && (
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              No active session. Sign in first, then re-run.
            </div>
          )}
          {result.kind === "network" && (
            <div className="flex items-start gap-2 text-destructive">
              <XCircle className="w-4 h-4 mt-0.5" />
              <div>
                <div className="font-semibold">Network error</div>
                <div className="text-muted-foreground text-xs mt-1">{result.message}</div>
              </div>
            </div>
          )}
          {result.kind === "ok" && (
            <div>
              <div className="flex items-center gap-2 text-emerald-400 mb-2">
                <CheckCircle2 className="w-4 h-4" />
                <span className="font-semibold">HTTP {result.status}</span>
                <span className="text-xs text-muted-foreground">· {result.latencyMs}ms</span>
              </div>
              {typeof result.body === "object" && result.body !== null && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
                  {(["tier", "status", "source", "expiresAt"] as const).map((k) => {
                    const v = (result.body as Record<string, unknown>)[k];
                    if (v == null) return null;
                    return (
                      <div key={k} className="contents">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="font-mono text-foreground">{String(v)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <pre className="text-xs bg-background/60 rounded p-3 overflow-x-auto text-muted-foreground">
                {JSON.stringify(result.body, null, 2)}
              </pre>
            </div>
          )}
          {result.kind === "http" && (
            <div>
              <div className="flex items-center gap-2 text-destructive mb-2">
                <XCircle className="w-4 h-4" />
                <span className="font-semibold">HTTP {result.status}</span>
                <span className="text-xs text-muted-foreground">· {result.latencyMs}ms</span>
              </div>
              {(result.status === 401 || result.status === 403) && (
                <p className="text-xs text-amber-400 mb-2">
                  Likely Supabase project mismatch — the Hub couldn't verify your JWT signature.
                </p>
              )}
              <pre className="text-xs bg-background/60 rounded p-3 overflow-x-auto text-muted-foreground">
                {result.body || "(empty body)"}
              </pre>
              {(result.status === 401 || result.status === 403) && <HubProjectMismatchFix />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
