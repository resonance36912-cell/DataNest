/**
 * User-defined Scene Director presets, persisted per browser in localStorage.
 * Each preset captures the subset of scene fields that Director controls:
 *   shot_role, is_broll, performance_direction, camera_direction,
 *   lighting_direction, vfx_level, scene_location
 *
 * Presets are cross-project (same browser). To promote to cross-device
 * later, back this store with a `user_director_presets` table and swap
 * the storage impl — the public API here won't change.
 */

const KEY = "syncvision.director-presets.v1";

export interface UserDirectorPreset {
  id: string;
  label: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  patch: Record<string, any>;
}

/** Fields the Director panel owns — anything else in the scene is ignored. */
const DIRECTOR_FIELDS = [
  "shot_role",
  "is_broll",
  "performance_direction",
  "camera_direction",
  "lighting_direction",
  "vfx_level",
  "scene_location",
] as const;

export function extractDirectorPatch(scene: any): Record<string, any> {
  const patch: Record<string, any> = {};
  for (const f of DIRECTOR_FIELDS) {
    const v = scene?.[f];
    if (v === undefined || v === null) continue;
    // Skip empty override objects (auto-generated placeholders)
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    patch[f] = v;
  }
  return patch;
}

function safeRead(): UserDirectorPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p) => p && p.id && p.label) : [];
  } catch {
    return [];
  }
}

function safeWrite(list: UserDirectorPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent("director-presets-changed"));
  } catch {
    /* quota exceeded — silently ignore */
  }
}

export function listUserPresets(): UserDirectorPreset[] {
  return safeRead().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveUserPreset(input: {
  label: string;
  description?: string;
  patch: Record<string, any>;
}): UserDirectorPreset {
  const list = safeRead();
  const now = Date.now();
  const preset: UserDirectorPreset = {
    id: `up_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    label: input.label.trim().slice(0, 60),
    description: input.description?.trim().slice(0, 140) || undefined,
    createdAt: now,
    updatedAt: now,
    patch: input.patch,
  };
  list.unshift(preset);
  safeWrite(list);
  return preset;
}

export function renameUserPreset(id: string, label: string): void {
  const list = safeRead();
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], label: label.trim().slice(0, 60), updatedAt: Date.now() };
  safeWrite(list);
}

export function deleteUserPreset(id: string): void {
  safeWrite(safeRead().filter((p) => p.id !== id));
}

/** Subscribe to changes (same-tab and cross-tab). Returns unsubscribe. */
export function subscribeUserPresets(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onLocal = () => cb();
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener("director-presets-changed", onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("director-presets-changed", onLocal);
    window.removeEventListener("storage", onStorage);
  };
}
