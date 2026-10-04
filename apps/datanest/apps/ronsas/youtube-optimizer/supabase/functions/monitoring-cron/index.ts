// Automated daily monitoring for YouTube Optimizer.
// Runs uptime, DB health, edge-function health, and GSC SEO drift checks,
// persists snapshots to public.monitoring_snapshots, and (when an email
// domain is configured) fires a transactional alert on new failures.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SITE_URL = "https://youtubeoptimizer.life";
const GSC_SITE = "https://youtubeoptimizer.life/";
const ADMIN_ALERT_EMAIL = Deno.env.get("MONITORING_ALERT_EMAIL") ?? "";

type Snapshot = {
  kind: "uptime" | "db_health" | "gsc_drift" | "edge_health";
  ok: boolean;
  severity: "info" | "warn" | "error";
  metrics: Record<string, unknown>;
  error?: string;
};

function svc() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function checkUptime(): Promise<Snapshot> {
  const started = performance.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(SITE_URL, { signal: ctrl.signal, redirect: "follow" });
    clearTimeout(t);
    const ms = Math.round(performance.now() - started);
    const ok = res.ok;
    return {
      kind: "uptime",
      ok,
      severity: ok ? (ms > 3000 ? "warn" : "info") : "error",
      metrics: { status: res.status, response_ms: ms, url: SITE_URL },
      error: ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      kind: "uptime",
      ok: false,
      severity: "error",
      metrics: { response_ms: Math.round(performance.now() - started), url: SITE_URL },
      error: (e as Error).message,
    };
  }
}

async function checkDbHealth(supabase: ReturnType<typeof svc>): Promise<Snapshot> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ count: totalJobs }, { count: failedJobs }, { count: audits24h }] = await Promise.all([
      supabase.from("audit_jobs").select("*", { count: "exact", head: true }).gte("created_at", since),
      supabase.from("audit_jobs").select("*", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since),
      supabase.from("audit_usage").select("*", { count: "exact", head: true }).gte("created_at", since),
    ]);
    const failureRate = totalJobs && totalJobs > 0 ? (failedJobs ?? 0) / totalJobs : 0;
    const ok = failureRate < 0.25;
    return {
      kind: "db_health",
      ok,
      severity: !ok ? "error" : failureRate > 0.1 ? "warn" : "info",
      metrics: {
        audit_jobs_24h: totalJobs ?? 0,
        audit_jobs_failed_24h: failedJobs ?? 0,
        audit_usage_24h: audits24h ?? 0,
        failure_rate: Number(failureRate.toFixed(3)),
      },
      error: ok ? undefined : `High audit failure rate: ${(failureRate * 100).toFixed(0)}%`,
    };
  } catch (e) {
    return { kind: "db_health", ok: false, severity: "error", metrics: {}, error: (e as Error).message };
  }
}

async function checkEdgeHealth(): Promise<Snapshot> {
  // Ping the audit-channel with OPTIONS to confirm reachability & CORS.
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/audit-channel`;
  try {
    const started = performance.now();
    const res = await fetch(url, { method: "OPTIONS" });
    const ms = Math.round(performance.now() - started);
    const ok = res.status < 500;
    return {
      kind: "edge_health",
      ok,
      severity: ok ? "info" : "error",
      metrics: { status: res.status, response_ms: ms, target: "audit-channel" },
      error: ok ? undefined : `Edge unreachable (HTTP ${res.status})`,
    };
  } catch (e) {
    return { kind: "edge_health", ok: false, severity: "error", metrics: {}, error: (e as Error).message };
  }
}

async function checkGscDrift(): Promise<Snapshot> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GSC_KEY = Deno.env.get("GOOGLE_SEARCH_CONSOLE_API_KEY");
  if (!LOVABLE_API_KEY || !GSC_KEY) {
    return { kind: "gsc_drift", ok: true, severity: "info", metrics: { skipped: "GSC connector not linked" } };
  }
  const encoded = encodeURIComponent(GSC_SITE);
  const url = `https://connector-gateway.lovable.dev/google_search_console/webmasters/v3/sites/${encoded}/searchAnalytics/query`;
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const end = iso(new Date(today.getTime() - 2 * 86400000));
  const midStart = iso(new Date(today.getTime() - 9 * 86400000));
  const priorEnd = iso(new Date(today.getTime() - 10 * 86400000));
  const priorStart = iso(new Date(today.getTime() - 17 * 86400000));

  async function q(startDate: string, endDate: string) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GSC_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ startDate, endDate, dimensions: [], rowLimit: 1 }),
    });
    if (!res.ok) throw new Error(`GSC ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const row = data.rows?.[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    return row as { clicks: number; impressions: number; ctr: number; position: number };
  }

  try {
    const [recent, prior] = await Promise.all([q(midStart, end), q(priorStart, priorEnd)]);
    const clicksDelta = prior.clicks > 0 ? (recent.clicks - prior.clicks) / prior.clicks : 0;
    const impressionsDelta = prior.impressions > 0 ? (recent.impressions - prior.impressions) / prior.impressions : 0;
    const drift = clicksDelta <= -0.3 || impressionsDelta <= -0.3;
    return {
      kind: "gsc_drift",
      ok: !drift,
      severity: drift ? "warn" : "info",
      metrics: {
        window_recent: { start: midStart, end, ...recent },
        window_prior: { start: priorStart, end: priorEnd, ...prior },
        clicks_delta: Number(clicksDelta.toFixed(3)),
        impressions_delta: Number(impressionsDelta.toFixed(3)),
      },
      error: drift ? `SEO drift: clicks ${(clicksDelta * 100).toFixed(0)}%, impressions ${(impressionsDelta * 100).toFixed(0)}%` : undefined,
    };
  } catch (e) {
    return { kind: "gsc_drift", ok: false, severity: "warn", metrics: {}, error: (e as Error).message };
  }
}

async function sendAlertEmail(supabase: ReturnType<typeof svc>, failures: Snapshot[]) {
  if (!ADMIN_ALERT_EMAIL || failures.length === 0) return { skipped: true };
  const subject = `⚠️ YouTube Optimizer monitoring — ${failures.length} check(s) failed`;
  const body = failures
    .map((f) => `<li><strong>${f.kind}</strong> (${f.severity}) — ${f.error ?? "failed"}<br/><code>${JSON.stringify(f.metrics)}</code></li>`)
    .join("");
  const html = `<h2>Monitoring alert</h2><p>${new Date().toISOString()}</p><ul>${body}</ul><p><a href="${SITE_URL}">Open site</a></p>`;
  try {
    const { error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "monitoring-alert",
        to: ADMIN_ALERT_EMAIL,
        subject,
        html,
        purpose: "transactional",
        idempotencyKey: `monitoring-${new Date().toISOString().slice(0, 13)}`,
      },
    });
    if (error) return { skipped: false, error: error.message };
    return { skipped: false, sent: true };
  } catch (e) {
    return { skipped: false, error: (e as Error).message };
  }
}

function parseJwtClaims(token: string): { role?: string } | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: require a service-role bearer token. This function performs paid
  // external API calls (GSC), DB aggregates, and can trigger alert emails,
  // so it must not be callable unauthenticated. Invoke it from cron or admin
  // tooling using the service-role key.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.slice("Bearer ".length).trim();
  const claims = parseJwtClaims(token);
  if (claims?.role !== "service_role") {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = svc();
  const [uptime, dbHealth, edgeHealth, gsc] = await Promise.all([
    checkUptime(),
    checkDbHealth(supabase),
    checkEdgeHealth(),
    checkGscDrift(),
  ]);

  const snapshots: Snapshot[] = [uptime, dbHealth, edgeHealth, gsc];
  const rows = snapshots.map((s) => ({
    kind: s.kind,
    ok: s.ok,
    severity: s.severity,
    metrics: s.metrics,
    error: s.error ?? null,
  }));

  const { error: insertErr } = await supabase.from("monitoring_snapshots").insert(rows);
  if (insertErr) console.error("insert failed", insertErr);

  const failures = snapshots.filter((s) => !s.ok || s.severity === "error");
  const alert = await sendAlertEmail(supabase, failures);

  return new Response(
    JSON.stringify({ ok: true, snapshots, failures: failures.length, alert }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
