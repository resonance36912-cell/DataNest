/**
 * Vocal Sync editor settings store.
 *
 * Persists per-scene fine-tuning overrides (audio offset, speaking window trim,
 * mouth-motion intensity, provider model) used by the Vocal Sync editor so the
 * user can nudge synced dialogue for the main character without re-running a job.
 *
 * Scoped per project, persisted in localStorage.
 */

export type VocalSyncModel = "auto" | "sync-3" | "sync-v2" | "sync-so";

export interface VocalSyncSceneSettings {
  /** Audio offset applied to the dialogue track, in milliseconds (negative = earlier). */
  offsetMs: number;
  /** Trim from the start of the scene's speaking window, in seconds. */
  leadInSec: number;
  /** Trim from the end of the scene's speaking window, in seconds. */
  tailSec: number;
  /** Mouth-motion strength 0-100. */
  intensity: number;
  /** Provider model override for a re-run. */
  model: VocalSyncModel;
  /** Optional free-text note for the scene. */
  note?: string;
  updatedAt: string;
}

export type VocalSyncProjectSettings = Record<number, VocalSyncSceneSettings>;

export const DEFAULT_VOCAL_SYNC_SETTINGS: VocalSyncSceneSettings = {
  offsetMs: 0,
  leadInSec: 0,
  tailSec: 0,
  intensity: 60,
  model: "auto",
  note: "",
  updatedAt: "",
};

export const OFFSET_RANGE_MS = 600;
export const MAX_TRIM_SEC = 2;

const KEY_PREFIX = "rsv:vocal-sync-settings:";

function storageKey(projectId: string) {
  return `${KEY_PREFIX}${projectId}`;
}

function safeParse(raw: string | null): VocalSyncProjectSettings {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: VocalSyncProjectSettings = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const sceneNumber = Number(k);
      if (!Number.isFinite(sceneNumber)) continue;
      out[sceneNumber] = normalizeSettings(v);
    }
    return out;
  } catch {
    return {};
  }
}

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function normalizeSettings(value: unknown): VocalSyncSceneSettings {
  const v = (value ?? {}) as Partial<VocalSyncSceneSettings>;
  const model: VocalSyncModel =
    v.model === "sync-3" || v.model === "sync-v2" || v.model === "sync-so" ? v.model : "auto";
  return {
    offsetMs: Math.round(clamp(Number(v.offsetMs ?? 0), -OFFSET_RANGE_MS, OFFSET_RANGE_MS)),
    leadInSec: Number(clamp(Number(v.leadInSec ?? 0), 0, MAX_TRIM_SEC).toFixed(2)),
    tailSec: Number(clamp(Number(v.tailSec ?? 0), 0, MAX_TRIM_SEC).toFixed(2)),
    intensity: Math.round(clamp(Number(v.intensity ?? 60), 0, 100)),
    model,
    note: typeof v.note === "string" ? v.note.slice(0, 400) : "",
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : "",
  };
}

export function isDefaultSettings(s: VocalSyncSceneSettings): boolean {
  return (
    s.offsetMs === DEFAULT_VOCAL_SYNC_SETTINGS.offsetMs &&
    s.leadInSec === DEFAULT_VOCAL_SYNC_SETTINGS.leadInSec &&
    s.tailSec === DEFAULT_VOCAL_SYNC_SETTINGS.tailSec &&
    s.intensity === DEFAULT_VOCAL_SYNC_SETTINGS.intensity &&
    s.model === DEFAULT_VOCAL_SYNC_SETTINGS.model &&
    !s.note
  );
}

export function loadVocalSyncSettings(projectId: string | null | undefined): VocalSyncProjectSettings {
  if (!projectId || typeof window === "undefined") return {};
  try {
    return safeParse(window.localStorage.getItem(storageKey(projectId)));
  } catch {
    return {};
  }
}

export function getSceneVocalSync(
  projectId: string | null | undefined,
  sceneNumber: number,
): VocalSyncSceneSettings {
  const all = loadVocalSyncSettings(projectId);
  return all[sceneNumber] ?? { ...DEFAULT_VOCAL_SYNC_SETTINGS };
}

export function saveSceneVocalSync(
  projectId: string | null | undefined,
  sceneNumber: number,
  settings: VocalSyncSceneSettings,
): VocalSyncProjectSettings {
  const all = loadVocalSyncSettings(projectId);
  const next = { ...all, [sceneNumber]: { ...normalizeSettings(settings), updatedAt: new Date().toISOString() } };
  persist(projectId, next);
  return next;
}

export function clearSceneVocalSync(
  projectId: string | null | undefined,
  sceneNumber: number,
): VocalSyncProjectSettings {
  const all = loadVocalSyncSettings(projectId);
  delete all[sceneNumber];
  persist(projectId, all);
  return all;
}

export function applyVocalSyncToScenes(
  projectId: string | null | undefined,
  sceneNumbers: number[],
  settings: VocalSyncSceneSettings,
): VocalSyncProjectSettings {
  const all = loadVocalSyncSettings(projectId);
  const stamped = { ...normalizeSettings(settings), updatedAt: new Date().toISOString() };
  for (const sn of sceneNumbers) all[sn] = { ...stamped };
  persist(projectId, all);
  return all;
}

export function clearAllVocalSync(projectId: string | null | undefined): VocalSyncProjectSettings {
  persist(projectId, {});
  return {};
}

function persist(projectId: string | null | undefined, value: VocalSyncProjectSettings) {
  if (!projectId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(value));
  } catch {
    /* quota / private mode — settings stay in-memory for this session */
  }
}

/** Export payload embedded into scene exports and provider re-run requests. */
export function buildVocalSyncExport(projectId: string | null | undefined) {
  const all = loadVocalSyncSettings(projectId);
  const scenes = Object.entries(all)
    .map(([sceneNumber, s]) => ({ scene_number: Number(sceneNumber), ...s }))
    .sort((a, b) => a.scene_number - b.scene_number);
  return {
    version: 1 as const,
    generated_at: new Date().toISOString(),
    tuned_scene_count: scenes.length,
    scenes,
  };
}
