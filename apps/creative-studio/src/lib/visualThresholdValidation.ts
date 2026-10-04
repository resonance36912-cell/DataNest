/**
 * Client-side range validation for the `VISUAL_*` override sandbox.
 *
 * Text fields on /admin/visual-thresholds are free-form, so a typo like
 * `0.5` for a tolerance (50% of the region allowed to differ) or `-1` retries
 * would silently produce a meaningless run or a misleading export. These checks
 * run before a preset is saved or a JSON export is generated.
 */

import { MAX_ALLOWED_RATIO } from "./visualThresholds";

/** Allowed input ranges, mirrored in the field hints. */
export const VISUAL_LIMITS = {
  /** VISUAL_MAX_DIFF_RATIO — global tolerance floor. */
  floor: { min: 0, max: MAX_ALLOWED_RATIO },
  /** VISUAL_THRESHOLD — per-pixel colour sensitivity. */
  threshold: { min: 0, max: 1 },
  /** VISUAL_RETRIES — whole re-render attempts. */
  retries: { min: 1, max: 10 },
  /** VISUAL_TOLERANCE_<PROVIDER> — per-provider tolerance. */
  tolerance: { min: 0, max: MAX_ALLOWED_RATIO },
} as const;

export interface VisualValidationIssue {
  /** "floor" | "threshold" | "retries" | provider id */
  field: string;
  label: string;
  message: string;
}

export interface VisualValidationResult {
  valid: boolean;
  issues: VisualValidationIssue[];
  /** Issues keyed by field for inline rendering. */
  byField: Record<string, string>;
}

interface NumericFieldOptions {
  min: number;
  max: number;
  integer?: boolean;
}

/** Validate one raw text field. Blank means "unset" and is always valid. */
export function validateNumericField(
  raw: string,
  { min, max, integer }: NumericFieldOptions,
): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^-?\d*\.?\d+(?:[eE][-+]?\d+)?$/.test(trimmed)) return "Enter a number.";

  const n = Number(trimmed);
  if (!Number.isFinite(n)) return "Enter a number.";
  if (integer && !Number.isInteger(n)) return "Must be a whole number.";
  if (n < min || n > max) return `Must be between ${min} and ${max}.`;
  return null;
}

export interface VisualOverrideInput {
  floor: string;
  threshold: string;
  retries: string;
  perProvider: Record<string, string>;
}

/** Validate every override field currently typed into the page. */
export function validateVisualOverrides(input: VisualOverrideInput): VisualValidationResult {
  const issues: VisualValidationIssue[] = [];

  const push = (field: string, label: string, message: string | null) => {
    if (message) issues.push({ field, label, message });
  };

  push(
    "floor",
    "VISUAL_MAX_DIFF_RATIO",
    validateNumericField(input.floor, VISUAL_LIMITS.floor),
  );
  push(
    "threshold",
    "VISUAL_THRESHOLD",
    validateNumericField(input.threshold, VISUAL_LIMITS.threshold),
  );
  push(
    "retries",
    "VISUAL_RETRIES",
    validateNumericField(input.retries, { ...VISUAL_LIMITS.retries, integer: true }),
  );

  for (const [id, raw] of Object.entries(input.perProvider ?? {})) {
    push(
      id,
      `VISUAL_TOLERANCE_${id.toUpperCase()}`,
      validateNumericField(raw, VISUAL_LIMITS.tolerance),
    );
  }

  const byField: Record<string, string> = {};
  for (const issue of issues) byField[issue.field] = issue.message;

  return { valid: issues.length === 0, issues, byField };
}

/** One-line summary suitable for a toast. */
export function describeValidationIssues(result: VisualValidationResult): string {
  return result.issues.map((i) => `${i.label}: ${i.message}`).join(" ");
}

/* ------------------------------------------------------------------ */
/* Coherence audit — missing or conflicting overrides before a save     */
/* ------------------------------------------------------------------ */

export interface VisualAuditIssue {
  /** "blocker" stops the save; "warning" is advisory. */
  level: "blocker" | "warning";
  field: string;
  label: string;
  message: string;
}

export interface VisualAuditResult {
  blockers: VisualAuditIssue[];
  warnings: VisualAuditIssue[];
  /** True when nothing prevents saving (warnings may still exist). */
  canSave: boolean;
}

export interface VisualAuditContext {
  /** Names already used by saved presets — for duplicate detection. */
  existingNames?: string[];
  /** Name being saved, when auditing a save. */
  name?: string;
  /** Presets whose values are identical to the current edits. */
  duplicateOfPresetName?: string | null;
}

const parse = (raw: string): number | undefined => {
  const t = raw.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Check a set of typed overrides for gaps and contradictions that range
 * validation cannot see: an empty preset, a name collision, a per-provider
 * tolerance that the global floor would silently override, a floor that makes
 * every provider entry meaningless, or values clamped by MAX_ALLOWED_RATIO.
 */
export function auditVisualOverrides(
  input: VisualOverrideInput,
  context: VisualAuditContext = {},
): VisualAuditResult {
  const blockers: VisualAuditIssue[] = [];
  const warnings: VisualAuditIssue[] = [];
  const add = (
    level: VisualAuditIssue["level"],
    field: string,
    label: string,
    message: string,
  ) => (level === "blocker" ? blockers : warnings).push({ level, field, label, message });

  const perProviderEntries = Object.entries(input.perProvider ?? {}).filter(
    ([, raw]) => raw.trim() !== "",
  );
  const floor = parse(input.floor);
  const threshold = parse(input.threshold);
  const retries = parse(input.retries);

  const hasAny =
    floor !== undefined ||
    threshold !== undefined ||
    retries !== undefined ||
    perProviderEntries.length > 0;

  // --- Missing ---------------------------------------------------------
  if (!hasAny) {
    add(
      "blocker",
      "all",
      "Overrides",
      "Nothing to save — every VISUAL_* field is blank, so this preset would be identical to the committed defaults.",
    );
  }

  const name = context.name?.trim() ?? "";
  if (context.name !== undefined && name === "") {
    add("blocker", "name", "Preset name", "Give the preset a name.");
  } else if (
    name &&
    (context.existingNames ?? []).some((n) => n.trim().toLowerCase() === name.toLowerCase())
  ) {
    add("blocker", "name", "Preset name", `“${name}” is already used by another preset.`);
  }

  if (context.duplicateOfPresetName) {
    add(
      "warning",
      "duplicate",
      "Duplicate preset",
      `These values are identical to “${context.duplicateOfPresetName}”.`,
    );
  }

  // --- Conflicts -------------------------------------------------------
  if (floor !== undefined && perProviderEntries.length > 0) {
    const shadowed = perProviderEntries
      .map(([id, raw]) => [id, parse(raw)] as const)
      .filter(([, value]) => value !== undefined && (value as number) < floor)
      .map(([id]) => id);
    if (shadowed.length) {
      add(
        "warning",
        "floor",
        "VISUAL_MAX_DIFF_RATIO",
        `The floor (${floor}) is above the tolerance set for ${shadowed.join(", ")}, so those per-provider values have no effect.`,
      );
    }
  }

  if (floor !== undefined && floor >= MAX_ALLOWED_RATIO) {
    add(
      "warning",
      "floor",
      "VISUAL_MAX_DIFF_RATIO",
      `A floor at the ${MAX_ALLOWED_RATIO} ceiling lets every card pass — a run with these values proves nothing.`,
    );
  }

  for (const [id, raw] of perProviderEntries) {
    const value = parse(raw);
    if (value === undefined) continue;
    if (value === 0) {
      add(
        "warning",
        id,
        `VISUAL_TOLERANCE_${id.toUpperCase()}`,
        "Zero tolerance fails on any anti-aliasing difference.",
      );
    }
    if (value >= MAX_ALLOWED_RATIO) {
      add(
        "warning",
        id,
        `VISUAL_TOLERANCE_${id.toUpperCase()}`,
        `Clamped to the ${MAX_ALLOWED_RATIO} ceiling before engine multipliers apply.`,
      );
    }
  }

  if (threshold !== undefined && threshold === 0 && floor === undefined) {
    add(
      "warning",
      "threshold",
      "VISUAL_THRESHOLD",
      "A threshold of 0 counts every sub-pixel difference — pair it with a tolerance floor or expect noise.",
    );
  }

  if (retries !== undefined && retries === 1) {
    add(
      "warning",
      "retries",
      "VISUAL_RETRIES",
      "A single attempt removes the flake retry — expect more intermittent failures.",
    );
  }

  return { blockers, warnings, canSave: blockers.length === 0 };
}

/** One-line summary of audit issues, suitable for a toast. */
export function describeAuditIssues(issues: VisualAuditIssue[]): string {
  return issues.map((i) => `${i.label}: ${i.message}`).join(" ");
}
