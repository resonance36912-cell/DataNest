import { supabase } from "@/integrations/supabase/client";

export interface LibraryItem {
  id: string;
  user_id: string;
  kind: string;
  label: string | null;
  storage_path: string;
  /**
   * Transient signed URL minted by `listLibrary` / `signLibraryItem`.
   * The `library` bucket is PRIVATE — never serve this column raw from the DB;
   * always re-sign before use. New inserts no longer persist a URL here.
   */
  public_url: string;
  content_type: string | null;
  aspect_ratio: string | null;
  brief: Record<string, unknown> | null;
  created_at: string;
}

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

function extFromMime(mime: string, fallbackUrl: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("pdf")) return "pdf";
  const m = fallbackUrl.split("?")[0].match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : "bin";
}

async function signPath(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("library")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw error ?? new Error("Couldn't sign library file URL.");
  }
  return data.signedUrl;
}

async function signMany(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (paths.length === 0) return map;
  const { data, error } = await supabase.storage
    .from("library")
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) map.set(row.path, row.signedUrl);
  }
  return map;
}

/** Re-sign a single item's URL (use right before download/playback if stale). */
export async function signLibraryItem<T extends Pick<LibraryItem, "storage_path">>(
  item: T,
): Promise<string> {
  return signPath(item.storage_path);
}

export async function saveToLibrary(args: {
  url: string;
  kind: string;
  label?: string;
  aspectRatio?: string;
  brief?: Record<string, unknown> | null;
}): Promise<LibraryItem> {
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) throw new Error("Sign in to save to your Library.");

  // Fetch the asset and re-upload to our own bucket for permanence.
  const res = await fetch(args.url);
  if (!res.ok) throw new Error(`Couldn't fetch asset (${res.status}).`);
  const blob = await res.blob();
  const contentType = blob.type || "application/octet-stream";
  const ext = extFromMime(contentType, args.url);
  const id = crypto.randomUUID();
  const path = `${user.id}/${id}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("library")
    .upload(path, blob, { contentType, upsert: false });
  if (upErr) throw upErr;

  const signedUrl = await signPath(path);

  const { data, error } = await supabase
    .from("library_items")
    .insert([{
      user_id: user.id,
      kind: args.kind,
      label: args.label ?? null,
      storage_path: path,
      // Do NOT persist signed URLs. The library bucket is private — readers
      // (listLibrary / signLibraryItem) mint fresh signed URLs on demand.
      public_url: null,
      content_type: contentType,
      aspect_ratio: args.aspectRatio ?? null,
      brief: (args.brief ?? null) as never,
    }])
    .select("*")
    .single();
  if (error) throw error;
  // Return with the freshly-minted signed URL for immediate client use.
  return { ...(data as LibraryItem), public_url: signedUrl };
}

export async function listLibrary(): Promise<LibraryItem[]> {
  const { data, error } = await supabase
    .from("library_items")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const items = (data ?? []) as LibraryItem[];
  if (items.length === 0) return items;
  // Mint fresh signed URLs in one batch — the library bucket is private and
  // any persisted `public_url` value is treated as untrusted/stale.
  try {
    const signed = await signMany(items.map((i) => i.storage_path));
    return items.map((i) => ({ ...i, public_url: signed.get(i.storage_path) ?? "" }));
  } catch (e) {
    console.warn("Library URL signing failed:", e);
    return items.map((i) => ({ ...i, public_url: "" }));
  }
}

export async function deleteLibraryItem(item: Pick<LibraryItem, "id" | "storage_path">): Promise<void> {
  // Remove the file first (RLS scopes by folder). Ignore "not found" errors.
  await supabase.storage.from("library").remove([item.storage_path]).catch(() => {});
  const { error } = await supabase.from("library_items").delete().eq("id", item.id);
  if (error) throw error;
}

export async function downloadUrl(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(blobUrl);
  } catch {
    await navigator.clipboard.writeText(url);
    throw new Error("Direct download blocked — link copied to clipboard.");
  }
}
