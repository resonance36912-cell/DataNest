/**
 * Shared client for the unified two-tier job-status pattern.
 *
 * Used by both:
 *   - `useJobStatus` (single-job React hook)
 *   - `useVideoPolling` (many concurrent per-scene loops)
 *
 * Tier 1 — `fetchJobStatus`: cheap DB-first read against
 *   `/functions/v1/job-status`. ~20ms, returns a normalized envelope.
 * Tier 2 — `triggerReconcile`: fire-and-forget POST to a slower provider-
 *   reconciliation endpoint (e.g. `check-job-status`, `check-merge-status`)
 *   that advances fal.ai phase state and lets webhooks persist final URLs.
 */

import { supabase } from "@/integrations/supabase/client";

export type JobKind = "render" | "lipsync" | "generation" | "merge";
export type JobStatus = "queued" | "processing" | "succeeded" | "failed" | "idle";

export interface JobSegment {
  id: string;
  scene_number: number | null;
  segment_index: number;
  status: string;
  output_asset_url?: string | null;
  error_message?: string | null;
  retry_count?: number;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface JobStatusEnvelope {
  jobId: string;
  kind: JobKind;
  status: JobStatus;
  progress: number;
  error?: string;
  code?: string;
  phase?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  output?: { videoUrl?: string; audioUrl?: string; finalUrl?: string; metadata?: unknown };
  segments?: JobSegment[];
  raw?: Record<string, unknown>;
}

export interface FetchJobStatusResult {
  ok: boolean;
  /** Set on HTTP 404 (job not found / access denied). Caller should mark failed and stop. */
  notFound?: boolean;
  /** Set on transient HTTP error (5xx / network). Caller should keep polling. */
  transient?: boolean;
  status?: number;
  error?: string;
  envelope?: JobStatusEnvelope;
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return {
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${token}`,
  };
}

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

/** Tier 1 — DB-first read. */
export async function fetchJobStatus(
  kind: JobKind,
  jobId: string,
  includeResults = false,
  signal?: AbortSignal,
): Promise<FetchJobStatusResult> {
  try {
    const headers = await authHeaders();
    const resp = await fetch(`${FUNCTIONS_BASE}/job-status`, {
      method: "POST",
      headers,
      body: JSON.stringify({ kind, jobId, includeResults }),
      signal,
    });
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      const err = errBody.error || `job-status HTTP ${resp.status}`;
      if (resp.status === 404) return { ok: false, notFound: true, status: 404, error: err };
      return { ok: false, transient: true, status: resp.status, error: err };
    }
    const json = await resp.json();
    return { ok: true, envelope: { ...json, raw: json } as JobStatusEnvelope };
  } catch (e) {
    if ((e as any)?.name === "AbortError") return { ok: false, error: "aborted" };
    return { ok: false, transient: true, error: e instanceof Error ? e.message : "Network error" };
  }
}

/**
 * Tier 2 — fire-and-forget provider reconciliation.
 *
 * Errors are swallowed at the caller level (polling must continue), but the
 * boolean return lets callers track *consecutive* failures so they can
 * surface a non-blocking warning when a scene's reconcile loop is degraded.
 *
 * Returns:
 *   - true  → HTTP 2xx (or 3xx)
 *   - false → network error OR HTTP non-OK (4xx/5xx)
 *   Aborts also resolve to `false` but are signalled via `signal.aborted`
 *   so callers can ignore them.
 */
export async function triggerReconcile(
  endpoint: string,
  body: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const headers = await authHeaders();
    const resp = await fetch(`${FUNCTIONS_BASE}/${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
    // Drain the body to avoid Deno/runtime resource leaks even when we
    // don't care about the payload shape.
    try { await resp.text(); } catch { /* noop */ }
    return resp.ok;
  } catch (e) {
    if ((e as any)?.name === "AbortError") return false;
    console.warn(`[jobStatusClient] reconcile (${endpoint}) failed:`, e);
    return false;
  }
}

/** True for terminal states. */
export function isTerminalStatus(s: JobStatus | undefined): boolean {
  return s === "succeeded" || s === "failed";
}
