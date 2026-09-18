// Cross-project, cross-format storage for the user's TranscriptDiffDialog
// export filter presets. Persisted in localStorage so presets follow the user
// across projects and across CSV / VTT / SRT / JSON exports.

export type ExportFilterPreset = {
  id: string;
  name: string;
  excludeEmptyCues: boolean;
  useMinConfidence: boolean;
  minConfidence: number; // 0..1
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "transcript-diff:export-filter-presets:v1";
const LAST_USED_KEY = "transcript-diff:export-filter-presets:last-used:v1";

export function loadPresets(): ExportFilterPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is ExportFilterPreset =>
        p &&
        typeof p.id === "string" &&
        typeof p.name === "string" &&
        typeof p.excludeEmptyCues === "boolean" &&
        typeof p.useMinConfidence === "boolean" &&
        typeof p.minConfidence === "number"
    );
  } catch {
    return [];
  }
}

export function savePresets(presets: ExportFilterPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Swallow quota errors — presets are best-effort.
  }
}

export function loadLastUsedPresetId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_USED_KEY);
  } catch {
    return null;
  }
}

export function saveLastUsedPresetId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(LAST_USED_KEY, id);
    else window.localStorage.removeItem(LAST_USED_KEY);
  } catch {
    // ignore
  }
}

export function makePresetId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function presetMatches(
  preset: ExportFilterPreset,
  state: { excludeEmptyCues: boolean; useMinConfidence: boolean; minConfidence: number }
): boolean {
  return (
    preset.excludeEmptyCues === state.excludeEmptyCues &&
    preset.useMinConfidence === state.useMinConfidence &&
    // Tolerate float drift from the slider step.
    Math.abs(preset.minConfidence - state.minConfidence) < 1e-6
  );
}
