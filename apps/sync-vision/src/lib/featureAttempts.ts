/**
 * Tracks which gated features the user has *attempted* to use during this
 * session. Powers the in-workflow upgrade recommendations banner so users see
 * exactly which plan unlocks the actions they tried.
 *
 * Storage: sessionStorage (per-tab, cleared when the tab closes) + an
 * in-memory pub/sub for live React updates. Intentionally not persisted to
 * the database — attempts are an ephemeral UX hint, not durable state.
 */
import { useSyncExternalStore } from "react";
import type { GatedFeature } from "@/lib/featureGates";

const STORAGE_KEY = "syncvision.attempted_features.v1";

type AttemptMap = Partial<Record<GatedFeature, number>>; // feature -> last-attempt timestamp (ms)

const isBrowser = typeof window !== "undefined";

function readStorage(): AttemptMap {
  if (!isBrowser) return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as AttemptMap) : {};
  } catch {
    return {};
  }
}

function writeStorage(map: AttemptMap) {
  if (!isBrowser) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode — ignore */
  }
}

let state: AttemptMap = readStorage();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function recordFeatureAttempt(feature: GatedFeature) {
  state = { ...state, [feature]: Date.now() };
  writeStorage(state);
  emit();
}

export function clearFeatureAttempt(feature: GatedFeature) {
  if (!(feature in state)) return;
  const next = { ...state };
  delete next[feature];
  state = next;
  writeStorage(state);
  emit();
}

export function clearAllFeatureAttempts() {
  if (Object.keys(state).length === 0) return;
  state = {};
  writeStorage(state);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AttemptMap {
  return state;
}

function getServerSnapshot(): AttemptMap {
  return {};
}

/** Hook returning attempted features sorted by most-recent attempt. */
export function useAttemptedFeatures(): GatedFeature[] {
  const map = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (Object.keys(map) as GatedFeature[]).sort(
    (a, b) => (map[b] ?? 0) - (map[a] ?? 0),
  );
}
