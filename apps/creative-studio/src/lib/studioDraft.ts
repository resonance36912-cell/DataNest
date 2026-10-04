// Auto-save / restore for the Studio working draft.
// Persisted in localStorage, keyed per-user, so signing out + back in resumes
// where you left off. Files (binary uploads) are NOT serialised.
import type { CreativeBrief } from "@/pages/Studio";
import type { SocialMediaConfig } from "@/components/studio/socialConfig";
import type { SourceBrief } from "@/lib/sourceBrief";

const PREFIX = "resonance:studio:draft:";
const VERSION = 2;

export interface StudioDraft {
  v: number;
  savedAt: string;
  contentType: string;
  style: string;
  aspectRatio: string;
  url: string;
  instructions: string;
  brief: CreativeBrief | null;
  sourceBrief: SourceBrief | null;
  screenshotUrl: string | null;
  posters: string[];
  videos: {
    posterUrl: string;
    headline?: string;
    subheadline?: string;
    callToAction?: string;
    colors?: string[];
  }[];
  socialConfig: SocialMediaConfig;
  generatedLibrary: { type: string; url: string; label: string }[];
}


export function draftKey(userId: string) {
  return `${PREFIX}${userId}`;
}

export function isDraftKey(key: string) {
  return key.startsWith(PREFIX);
}

export function saveDraft(userId: string, draft: Omit<StudioDraft, "v" | "savedAt">) {
  if (!userId) return;
  try {
    const payload: StudioDraft = { v: VERSION, savedAt: new Date().toISOString(), ...draft };
    localStorage.setItem(draftKey(userId), JSON.stringify(payload));
    try {
      window.dispatchEvent(new CustomEvent("resonance:draft-saved", { detail: { savedAt: payload.savedAt } }));
    } catch { /* ignore */ }
  } catch (e) {
    console.warn("saveDraft failed:", e);
  }
}

export function loadDraft(userId: string): StudioDraft | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StudioDraft;
    if (parsed?.v !== VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(userId: string) {
  try {
    localStorage.removeItem(draftKey(userId));
  } catch {}
}

// ───────────────── Named project snapshots ─────────────────
// Auto-save tracks ONE working draft per user. Named snapshots let users
// keep multiple in-progress projects and switch between them.

const PROJECTS_PREFIX = "resonance:studio:projects:";

export interface SavedProject {
  id: string;
  name: string;
  savedAt: string;
  data: Omit<StudioDraft, "v" | "savedAt">;
}

function projectsKey(userId: string) {
  return `${PROJECTS_PREFIX}${userId}`;
}

export function listSavedProjects(userId: string): SavedProject[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(projectsKey(userId));
    if (!raw) return [];
    const arr = JSON.parse(raw) as SavedProject[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeProjects(userId: string, list: SavedProject[]) {
  try {
    localStorage.setItem(projectsKey(userId), JSON.stringify(list));
  } catch (e) {
    console.warn("writeProjects failed:", e);
  }
}

export function saveProjectSnapshot(
  userId: string,
  name: string,
  data: Omit<StudioDraft, "v" | "savedAt">,
  existingId?: string,
): SavedProject | null {
  if (!userId) return null;
  const list = listSavedProjects(userId);
  const id = existingId ?? (crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: SavedProject = { id, name: name.trim() || "Untitled project", savedAt: new Date().toISOString(), data };
  const idx = list.findIndex((p) => p.id === id);
  if (idx >= 0) list[idx] = entry;
  else list.unshift(entry);
  writeProjects(userId, list);
  return entry;
}

export function getSavedProject(userId: string, id: string): SavedProject | null {
  return listSavedProjects(userId).find((p) => p.id === id) ?? null;
}

export function deleteSavedProject(userId: string, id: string) {
  writeProjects(userId, listSavedProjects(userId).filter((p) => p.id !== id));
}

// Global hook that signOut() can call synchronously to flush the latest state
// before storage is purged.
declare global {
  interface Window {
    __resonanceSaveDraft?: () => void;
  }
}
