// Backend persistence for Studio projects (per-user, RLS-protected).
//
// `studio_projects` rows store a full StudioDraft snapshot in a single
// jsonb column so the draft shape can evolve without schema migrations.
//
// Two storage paths are exposed:
//   • saveProjectAsync — normal async upsert via the supabase client
//   • saveProjectBeacon — fetch({ keepalive: true }) that survives the
//     tab-close `beforeunload` window so the user's work is preserved
//     whether they confirm Leave or Cancel in the native exit prompt.

import { supabase } from "@/integrations/supabase/client";
import type { StudioDraft } from "@/lib/studioDraft";
import { recordAutosave } from "@/lib/autosaveMetrics";

export type StudioProjectData = Omit<StudioDraft, "v" | "savedAt">;

export interface SavedStudioProject {
  id: string;
  user_id: string;
  name: string;
  data: StudioProjectData;
  is_autosave: boolean;
  created_at: string;
  updated_at: string;
}

interface SaveOpts {
  id?: string | null;
  isAutosave?: boolean;
}

/**
 * Upsert a project row for the signed-in user. Returns the saved row.
 *
 * Performance note: this is the highest-volume write in the app — the
 * Studio autosave fires this on a 1.2s debounce while the user edits.
 *  - INSERT path: full row + minimal echo (id, name, updated_at).
 *  - UPDATE path: only mutated columns (data, name, is_autosave) — never
 *    re-sends user_id (immutable, RLS-protected) so PostgREST doesn't
 *    rewrite that column and re-trigger RLS WITH CHECK on every tick.
 *  - UPDATE return: only id/name/updated_at, not the full `data` jsonb
 *    that the client already has in memory. This was the dominant cost
 *    in the slow-query report (81ms mean, 225ms max).
 */
export async function saveProjectAsync(
  userId: string,
  name: string,
  data: StudioProjectData,
  opts: SaveOpts = {},
): Promise<SavedStudioProject | null> {
  if (!userId) return null;
  const safeName = (name || "Untitled project").trim() || "Untitled project";
  const isAutosave = !!opts.isAutosave;

  if (opts.id) {
    // UPDATE path — trimmed payload, trimmed return.
    const t0 = performance.now();
    const { data: saved, error } = await supabase
      .from("studio_projects")
      .update({ name: safeName, data: data as any, is_autosave: isAutosave } as any)
      .eq("id", opts.id)
      .select("id, user_id, name, is_autosave, created_at, updated_at")
      .maybeSingle();
    recordAutosave({ ts: Date.now(), ms: performance.now() - t0, ok: !error && !!saved, op: "update" });
    if (error) {
      console.warn("saveProjectAsync (update) failed:", error.message);
      return null;
    }
    if (!saved) return null;
    // Re-attach the in-memory `data` so callers see a complete SavedStudioProject
    // without paying for the jsonb echo on the wire.
    return { ...(saved as any), data } as SavedStudioProject;
  }

  // INSERT path — first save of a project.
  const t0 = performance.now();
  const { data: saved, error } = await supabase
    .from("studio_projects")
    .insert({
      user_id: userId,
      name: safeName,
      data: data as any,
      is_autosave: isAutosave,
    } as any)
    .select("id, user_id, name, is_autosave, created_at, updated_at")
    .maybeSingle();
  recordAutosave({ ts: Date.now(), ms: performance.now() - t0, ok: !error && !!saved, op: "insert" });
  if (error) {
    console.warn("saveProjectAsync (insert) failed:", error.message);
    return null;
  }
  if (!saved) return null;
  return { ...(saved as any), data } as SavedStudioProject;
}

/** List the user's saved projects, newest first. */
export async function listProjects(userId: string): Promise<SavedStudioProject[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("studio_projects")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) {
    console.warn("listProjects failed:", error.message);
    return [];
  }
  return (data as unknown as SavedStudioProject[]) ?? [];
}

export async function getProject(userId: string, id: string): Promise<SavedStudioProject | null> {
  if (!userId || !id) return null;
  const { data, error } = await supabase
    .from("studio_projects")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.warn("getProject failed:", error.message);
    return null;
  }
  return (data as unknown as SavedStudioProject) ?? null;
}

export async function deleteProject(userId: string, id: string): Promise<boolean> {
  if (!userId || !id) return false;
  const { error } = await supabase
    .from("studio_projects")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    console.warn("deleteProject failed:", error.message);
    return false;
  }
  return true;
}

/**
 * Fire-and-forget save that completes after the tab unloads.
 * Uses fetch({ keepalive: true }) against the PostgREST endpoint so the
 * request survives navigation. Returns true if the request was dispatched.
 */
export function saveProjectBeacon(
  userId: string,
  accessToken: string,
  name: string,
  data: StudioProjectData,
  opts: SaveOpts = {},
): boolean {
  if (!userId || !accessToken) return false;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !apikey) return false;

  const row = {
    user_id: userId,
    name: (name || "Untitled project").trim() || "Untitled project",
    data,
    is_autosave: !!opts.isAutosave,
    ...(opts.id ? { id: opts.id } : {}),
  };

  // Upsert via the on-conflict path so the same id updates in place.
  // Without id, Postgres assigns a fresh uuid.
  const endpoint = `${url}/rest/v1/studio_projects${opts.id ? "?on_conflict=id" : ""}`;
  try {
    void fetch(endpoint, {
      method: "POST",
      keepalive: true,
      headers: {
        apikey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: opts.id ? "resolution=merge-duplicates,return=minimal" : "return=minimal",
      },
      body: JSON.stringify(row),
    }).catch(() => { /* swallow — tab is going away */ });
    return true;
  } catch {
    return false;
  }
}
