/**
 * Pure lifecycle rules for optimization_suggestions.
 * Mirrors the DB enum + edge function gates so the UI can validate before
 * round-tripping, and so tests can exhaustively verify transitions.
 *
 * Lifecycle:
 *   pending ──approve──> approved ──apply──> applied ──revert──> reverted
 *      └──reject──> rejected
 */

export type SuggestionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "applied"
  | "reverted";

export type LifecycleAction = "approved" | "rejected" | "apply" | "revert";

/** UI/audit-facing label for a status. */
export const STATUS_LABEL: Record<SuggestionStatus, string> = {
  pending: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  applied: "Applied",
  reverted: "Reverted",
};

/** Resulting status after a given action. */
export const RESULT_STATUS: Record<LifecycleAction, SuggestionStatus> = {
  approved: "approved",
  rejected: "rejected",
  apply: "applied",
  revert: "reverted",
};

/** Actions that REQUIRE a non-empty admin note (audit decision rationale). */
export const REQUIRES_NOTE: Record<LifecycleAction, boolean> = {
  approved: false,
  rejected: true,
  apply: false,
  revert: true,
};

/** Which actions are valid from a given status. */
const ALLOWED: Record<SuggestionStatus, LifecycleAction[]> = {
  pending: ["approved", "rejected"],
  approved: ["apply"],
  rejected: [],
  applied: ["revert"],
  reverted: [],
};

export function canTransition(from: SuggestionStatus, action: LifecycleAction): boolean {
  return ALLOWED[from].includes(action);
}

export interface TransitionInput {
  from: SuggestionStatus;
  action: LifecycleAction;
  note?: string | null;
  targetKey?: string | null;
}

export interface TransitionResult {
  ok: boolean;
  error?: string;
  /** Status to write if ok. */
  nextStatus?: SuggestionStatus;
  /** Timestamp columns to set if ok. */
  timestamps?: Partial<{
    reviewed_at: string;
    applied_at: string;
    reverted_at: string;
  }>;
}

/**
 * Validate a proposed transition and compute the column updates that should
 * land in the database. Always returns the timestamp columns relevant to the
 * action so callers cannot forget to stamp them.
 */
export function validateTransition(
  input: TransitionInput,
  now: () => string = () => new Date().toISOString()
): TransitionResult {
  const { from, action, note, targetKey } = input;

  if (!canTransition(from, action)) {
    return { ok: false, error: `Cannot ${action} a suggestion in "${from}" state` };
  }

  if (REQUIRES_NOTE[action] && !(note && note.trim())) {
    return { ok: false, error: `Admin note is required to ${action} a suggestion` };
  }

  if ((action === "apply" || action === "revert") && !targetKey) {
    return { ok: false, error: `Cannot ${action}: suggestion has no target_key` };
  }

  const ts = now();
  const timestamps: TransitionResult["timestamps"] = {};
  if (action === "approved" || action === "rejected") timestamps.reviewed_at = ts;
  if (action === "apply") timestamps.applied_at = ts;
  if (action === "revert") timestamps.reverted_at = ts;

  return { ok: true, nextStatus: RESULT_STATUS[action], timestamps };
}
