/**
 * Local-only storage for named `VISUAL_*` override presets.
 *
 * Presets never leave the browser — they exist so a maintainer can keep a few
 * tolerance experiments around ("loose webkit", "strict pinterest") and switch
 * between them on /admin/visual-thresholds before committing anything.
 */

const STORAGE_KEY = "resonance.visualThresholdPresets.v1";
const ACTIVE_KEY = "resonance.visualThresholdPresets.active.v1";

/** Raw text-field state, kept as strings so blank means "unset". */
export interface VisualPresetValues {
  floor: string;
  threshold: string;
  retries: string;
  perProvider: Record<string, string>;
}

export interface VisualPreset extends VisualPresetValues {
  id: string;
  name: string;
  updatedAt: string;
}

export const EMPTY_PRESET_VALUES: VisualPresetValues = {
  floor: "",
  threshold: "",
  retries: "",
  perProvider: {},
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const sanitizeValues = (raw: unknown): VisualPresetValues => {
  if (!isRecord(raw)) return { ...EMPTY_PRESET_VALUES };
  const perProvider: Record<string, string> = {};
  if (isRecord(raw.perProvider)) {
    for (const [key, value] of Object.entries(raw.perProvider)) {
      if (typeof value === "string" && value.trim() !== "") perProvider[key] = value;
    }
  }
  return {
    floor: typeof raw.floor === "string" ? raw.floor : "",
    threshold: typeof raw.threshold === "string" ? raw.threshold : "",
    retries: typeof raw.retries === "string" ? raw.retries : "",
    perProvider,
  };
};

export function loadPresets(): VisualPreset[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isRecord)
      .filter((p) => typeof p.id === "string" && typeof p.name === "string")
      .map((p) => ({
        id: p.id as string,
        name: p.name as string,
        updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : new Date(0).toISOString(),
        ...sanitizeValues(p),
      }));
  } catch {
    return [];
  }
}

export function savePresets(presets: VisualPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    /* storage unavailable (private mode / quota) — presets stay in memory only */
  }
}

export function loadActivePresetId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveActivePresetId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

export function makePreset(name: string, values: VisualPresetValues): VisualPreset {
  return {
    id:
      globalThis.crypto?.randomUUID?.() ??
      `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || "Untitled preset",
    updatedAt: new Date().toISOString(),
    ...sanitizeValues(values),
  };
}

/** Compact summary of what a preset changes, for the picker list. */
export function describePreset(preset: VisualPresetValues): string {
  const bits: string[] = [];
  if (preset.floor) bits.push(`floor ${preset.floor}`);
  if (preset.threshold) bits.push(`threshold ${preset.threshold}`);
  if (preset.retries) bits.push(`retries ${preset.retries}`);
  const providers = Object.entries(preset.perProvider).filter(([, v]) => v.trim() !== "");
  if (providers.length) bits.push(`${providers.length} provider override${providers.length > 1 ? "s" : ""}`);
  return bits.length ? bits.join(" · ") : "no overrides";
}

export function valuesEqual(a: VisualPresetValues, b: VisualPresetValues): boolean {
  const norm = (v: VisualPresetValues) =>
    JSON.stringify({
      floor: v.floor.trim(),
      threshold: v.threshold.trim(),
      retries: v.retries.trim(),
      perProvider: Object.fromEntries(
        Object.entries(v.perProvider)
          .filter(([, val]) => val.trim() !== "")
          .sort(([x], [y]) => x.localeCompare(y)),
      ),
    });
  return norm(a) === norm(b);
}

/* ------------------------------------------------------------------ */
/* Diffing against the closest saved preset                            */
/* ------------------------------------------------------------------ */

export interface PresetFieldDiff {
  field: string;
  label: string;
  /** Value in the saved preset ("" when unset). */
  from: string;
  /** Value in the current edits ("" when unset). */
  to: string;
  kind: "added" | "removed" | "changed";
}

const clean = (v: string | undefined) => (v ?? "").trim();

/** Field-by-field diff from a saved preset (`base`) to the current edits. */
export function diffPresetValues(
  base: VisualPresetValues,
  next: VisualPresetValues,
): PresetFieldDiff[] {
  const diffs: PresetFieldDiff[] = [];

  const compare = (field: string, label: string, from: string, to: string) => {
    if (from === to) return;
    diffs.push({
      field,
      label,
      from,
      to,
      kind: from === "" ? "added" : to === "" ? "removed" : "changed",
    });
  };

  compare("floor", "VISUAL_MAX_DIFF_RATIO", clean(base.floor), clean(next.floor));
  compare("threshold", "VISUAL_THRESHOLD", clean(base.threshold), clean(next.threshold));
  compare("retries", "VISUAL_RETRIES", clean(base.retries), clean(next.retries));

  const ids = new Set([
    ...Object.keys(base.perProvider ?? {}),
    ...Object.keys(next.perProvider ?? {}),
  ]);
  for (const id of [...ids].sort((a, b) => a.localeCompare(b))) {
    compare(
      id,
      `VISUAL_TOLERANCE_${id.toUpperCase()}`,
      clean(base.perProvider?.[id]),
      clean(next.perProvider?.[id]),
    );
  }

  return diffs;
}

/**
 * Find the saved preset that differs least from the current edits, so the save
 * dialog can show "what changed" instead of an unanchored list of values.
 * Ties break toward `preferId` (usually the active preset).
 */
export function findClosestPreset(
  presets: VisualPreset[],
  values: VisualPresetValues,
  preferId?: string | null,
): { preset: VisualPreset; diffs: PresetFieldDiff[] } | null {
  if (!presets.length) return null;

  let best: { preset: VisualPreset; diffs: PresetFieldDiff[] } | null = null;
  for (const preset of presets) {
    const diffs = diffPresetValues(preset, values);
    if (
      !best ||
      diffs.length < best.diffs.length ||
      (diffs.length === best.diffs.length && preferId && preset.id === preferId)
    ) {
      best = { preset, diffs };
    }
  }
  return best;
}
