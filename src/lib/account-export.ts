/**
 * Account data export.
 *
 * Bundles everything the signed-in user owns in this app — profile, linked
 * identity metadata, project history (with scenes and render jobs), credit
 * activity and the local security audit log — into a single .zip download.
 * All reads go through the authenticated client, so RLS scopes the export to
 * the current user by construction.
 */

import JSZip from "jszip";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { loadSecurityAuditLog } from "@/lib/security-audit-log";

export interface AccountExportProgress {
  done: number;
  total: number;
  label: string;
}

export interface AccountExportInput {
  user: User | null;
  hubUser?: User | null;
  session?: Session | null;
  profile?: { display_name: string; avatar_url: string } | null;
  onProgress?: (p: AccountExportProgress) => void;
}

export interface AccountExportResult {
  blob: Blob;
  fileName: string;
  counts: Record<string, number>;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
}

/** Identity rows, stripped of tokens — only provider + profile metadata. */
function safeIdentities(user: User | null | undefined) {
  const list = (user?.identities ?? []) as unknown as Array<Record<string, unknown>>;
  return list.map((i) => ({
    provider: i.provider ?? null,
    identity_id: i.identity_id ?? null,
    created_at: i.created_at ?? null,
    updated_at: i.updated_at ?? null,
    last_sign_in_at: i.last_sign_in_at ?? null,
    email: (i.identity_data as Record<string, unknown> | undefined)?.email ?? null,
    name: (i.identity_data as Record<string, unknown> | undefined)?.name ?? null,
    avatar_url: (i.identity_data as Record<string, unknown> | undefined)?.avatar_url ?? null,
  }));
}

export async function buildAccountExport(
  input: AccountExportInput,
): Promise<AccountExportResult> {
  const { user, hubUser, profile, onProgress } = input;
  if (!user) throw new Error("You must be signed in to export your account data.");

  const steps = 7;
  let done = 0;
  const step = (label: string) => onProgress?.({ done: ++done, total: steps, label });

  const zip = new JSZip();
  const counts: Record<string, number> = {};

  // 1. Profile + identity
  step("Collecting profile");
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  zip.file(
    "profile.json",
    JSON.stringify(
      {
        user_id: user.id,
        email: user.email ?? null,
        display_name: profile?.display_name ?? profileRow?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? profileRow?.avatar_url ?? null,
        created_at: user.created_at ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
        user_metadata: user.user_metadata ?? {},
        profile_row: profileRow ?? null,
      },
      null,
      2,
    ),
  );

  step("Collecting linked identities");
  zip.file(
    "identities.json",
    JSON.stringify(
      {
        app: safeIdentities(user),
        hub: safeIdentities(hubUser),
        hub_user_id: hubUser?.id ?? null,
      },
      null,
      2,
    ),
  );

  // 2. Projects
  step("Collecting projects");
  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const projectRows = projects ?? [];
  counts.projects = projectRows.length;
  zip.file("projects/projects.json", JSON.stringify(projectRows, null, 2));
  zip.file(
    "projects/projects.csv",
    toCsv(
      projectRows.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        current_step: p.current_step,
        bpm: p.bpm,
        music_key: p.music_key,
        mood: p.mood,
        segment_count: p.segment_count,
        created_at: p.created_at,
        updated_at: p.updated_at,
      })),
    ),
  );

  // 3. Scenes
  step("Collecting scenes");
  const { data: scenes } = await supabase
    .from("scenes")
    .select("*")
    .eq("user_id", user.id)
    .order("scene_number");
  const sceneRows = scenes ?? [];
  counts.scenes = sceneRows.length;
  zip.file("projects/scenes.json", JSON.stringify(sceneRows, null, 2));

  // 4. Characters
  step("Collecting characters");
  const { data: characters } = await supabase
    .from("characters")
    .select("*")
    .eq("user_id", user.id);
  counts.characters = characters?.length ?? 0;
  zip.file("projects/characters.json", JSON.stringify(characters ?? [], null, 2));

  // 5. Render history + credits
  step("Collecting render history and credits");
  const [{ data: renderJobs }, { data: credits }, { data: topups }] = await Promise.all([
    supabase
      .from("render_jobs")
      .select("id, project_id, scene_number, provider, quality, status, progress, error, final_output_url, estimated_cost_gbp, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("user_credits").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("credit_topups")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);
  counts.render_jobs = renderJobs?.length ?? 0;
  counts.credit_topups = topups?.length ?? 0;
  zip.file("history/render-jobs.json", JSON.stringify(renderJobs ?? [], null, 2));
  zip.file("history/render-jobs.csv", toCsv((renderJobs ?? []) as Record<string, unknown>[]));
  zip.file(
    "history/credits.json",
    JSON.stringify({ balance: credits ?? null, topups: topups ?? [] }, null, 2),
  );

  // 6. Security audit log (device-local)
  const auditLog = loadSecurityAuditLog();
  counts.security_events = auditLog.length;
  zip.file("security/audit-log.json", JSON.stringify(auditLog, null, 2));

  // 7. Manifest + readme
  step("Packaging");
  const generatedAt = new Date().toISOString();
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        format: "resonance-syncvision-account-export",
        version: 1,
        generated_at: generatedAt,
        user_id: user.id,
        email: user.email ?? null,
        counts,
      },
      null,
      2,
    ),
  );
  zip.file(
    "README.txt",
    [
      "Resonance SyncVision — account data export",
      `Generated: ${generatedAt}`,
      "",
      "profile.json            Your profile and account metadata",
      "identities.json         Linked sign-in providers (no tokens or secrets)",
      "projects/               Projects, scenes and characters you own",
      "history/                Render jobs and credit activity",
      "security/audit-log.json Sign-in / refresh / sign-out events recorded on this device",
      "",
      "Media files are not included — asset URLs are listed inside the JSON files.",
    ].join("\n"),
  );

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const fileName = `syncvision-account-export-${generatedAt.slice(0, 10)}.zip`;
  return { blob, fileName, counts };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
