import { supabase } from "@/integrations/supabase/client";

/**
 * Performance telemetry — writes a row into perf_events.
 * Fire-and-forget: never throws, never blocks UI.
 *
 * Step labels mirror the 6-step workflow plus provider operations.
 */
export type PerfStep =
  | "upload"
  | "analysis"
  | "character"
  | "storyboard"
  | "assembly"
  | "export"
  | "render"
  | "lipsync"
  | "navigation";

export type PerfStatus = "ok" | "error" | "timeout";

interface PerfRow {
  step: PerfStep;
  action: string;
  duration_ms: number;
  status?: PerfStatus;
  provider?: string;
  error_code?: string;
  project_id?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordPerf(row: PerfRow): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("perf_events").insert({
      user_id: user.id,
      project_id: row.project_id ?? null,
      step: row.step,
      action: row.action,
      provider: row.provider ?? null,
      duration_ms: Math.max(0, Math.round(row.duration_ms)),
      status: row.status ?? "ok",
      error_code: row.error_code ?? null,
      metadata: (row.metadata ?? {}) as never,
    } as never);
  } catch {
    /* swallow — telemetry must never break the app */
  }
}

/**
 * Wrap an async operation and emit a perf_event when it completes (or fails).
 */
export async function timePerf<T>(
  meta: Omit<PerfRow, "duration_ms" | "status">,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = performance.now();
  try {
    const result = await fn();
    void recordPerf({ ...meta, duration_ms: performance.now() - t0, status: "ok" });
    return result;
  } catch (err) {
    void recordPerf({
      ...meta,
      duration_ms: performance.now() - t0,
      status: "error",
      error_code: err instanceof Error ? err.name : "unknown",
      metadata: { ...meta.metadata, message: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}

/** Map workflow step indices to readable labels for the step transition log. */
export const STEP_LABELS: Record<number, PerfStep> = {
  0: "upload",
  1: "analysis",
  2: "character",
  3: "storyboard",
  4: "assembly",
  5: "export",
};
