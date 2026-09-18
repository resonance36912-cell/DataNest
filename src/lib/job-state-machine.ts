/**
 * Job State Machine — Phase 2
 *
 * Defines valid state transitions for all job types.
 * Prevents invalid state transitions that could corrupt job tracking.
 */

export type JobStatus =
  | "queued"
  | "submitted"
  | "processing"
  | "running"
  | "succeeded"
  | "completed"
  | "failed"
  | "cancelled"
  | "canceled"
  | "error"
  | "merge_blocked"
  | "merging"
  | "validating"
  | "normalizing"
  | "muxing";

const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set([
  "succeeded",
  "completed",
  "failed",
  "cancelled",
  "canceled",
  "error",
]);

const ACTIVE_STATUSES: ReadonlySet<JobStatus> = new Set([
  "queued",
  "submitted",
  "processing",
  "running",
  "validating",
  "normalizing",
  "merging",
  "muxing",
]);

/**
 * Valid state transitions map.
 * Key = current status, Value = set of allowed next statuses.
 */
const TRANSITIONS: Record<string, ReadonlySet<JobStatus>> = {
  queued: new Set(["submitted", "processing", "running", "failed", "cancelled", "canceled"]),
  submitted: new Set(["processing", "running", "succeeded", "completed", "failed", "cancelled", "canceled", "error"]),
  processing: new Set(["running", "succeeded", "completed", "failed", "error"]),
  running: new Set(["succeeded", "completed", "failed", "error", "cancelled", "canceled"]),
  validating: new Set(["merge_blocked", "normalizing", "merging", "failed"]),
  normalizing: new Set(["merging", "failed"]),
  merging: new Set(["muxing", "completed", "failed"]),
  muxing: new Set(["completed", "failed"]),
  merge_blocked: new Set(["queued", "failed"]), // can retry
};

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isActive(status: JobStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  if (from === to) return true; // idempotent
  const allowed = TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.has(to);
}

/**
 * Validate and return the new status, or throw if transition is invalid.
 */
export function validateTransition(from: JobStatus, to: JobStatus): JobStatus {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid job state transition: ${from} → ${to}`);
  }
  return to;
}

/**
 * Determine if a job should be polled based on its status.
 */
export function shouldPoll(status: JobStatus): boolean {
  return isActive(status);
}
