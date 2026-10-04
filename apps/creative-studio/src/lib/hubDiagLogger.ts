// Hub entitlement failure logger.
//
// Sends a structured event whenever the Hub entitlement check fails, so we get
// visibility beyond the in-app banner. Three sinks, all best-effort and silent
// on error:
//   1) Sentry — if `window.Sentry` is present (auto-detected, no hard dep).
//   2) Custom HTTP — if `VITE_HUB_DIAG_ENDPOINT` is set, POST JSON to it
//      with `keepalive: true` so unloads don't drop the report.
//   3) console.warn — always, so devs see failures in the browser console.
//
// Deduplicated by failureKey (`endpoint|httpStatus`) for the page session, so
// a flapping Hub doesn't spam the sink.

import type { EntitlementDiagnostic } from "./entitlement";

export type HubFailurePayload = {
  app: string;
  endpoint: string;
  httpStatus: number | null;
  reason: EntitlementDiagnostic["reason"];
  lastCheckedAt: string;
  message?: string;
  userAgent?: string;
  pageUrl?: string;
};

type SentryLike = {
  captureMessage?: (msg: string, ctx?: unknown) => void;
};

const seen = new Set<string>();

/** Test-only: reset the dedup cache. */
export function __resetHubDiagDedup() {
  seen.clear();
}

export function logHubEntitlementFailure(
  app: string,
  diag: EntitlementDiagnostic,
): void {
  if (diag.reason !== "network" && diag.reason !== "http") return;

  const failureKey = `${diag.endpoint}|${diag.httpStatus ?? "net"}`;
  if (seen.has(failureKey)) return;
  seen.add(failureKey);

  const payload: HubFailurePayload = {
    app,
    endpoint: diag.endpoint,
    httpStatus: diag.httpStatus,
    reason: diag.reason,
    lastCheckedAt: diag.lastCheckedAt,
    message: diag.message,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    pageUrl: typeof window !== "undefined" ? window.location.href : undefined,
  };

  // 1) console — always
  try {
    // eslint-disable-next-line no-console
    console.warn("[hub-entitlement] failure", payload);
  } catch {
    /* ignore */
  }

  // 2) Sentry — if loaded on the page
  try {
    const sentry = (globalThis as { Sentry?: SentryLike }).Sentry;
    if (sentry?.captureMessage) {
      sentry.captureMessage("hub-entitlement failure", {
        level: "warning",
        tags: { app, reason: diag.reason, status: String(diag.httpStatus ?? "net") },
        extra: payload,
      });
    }
  } catch {
    /* ignore */
  }

  // 3) Custom endpoint — fire-and-forget
  try {
    const url = (import.meta.env?.VITE_HUB_DIAG_ENDPOINT as string | undefined) ?? "";
    if (url && typeof fetch !== "undefined") {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {
        /* swallow — diagnostic logging must never crash the app */
      });
    }
  } catch {
    /* ignore */
  }
}
