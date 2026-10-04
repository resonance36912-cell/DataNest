/**
 * Upload a merge debug ZIP to the media-uploads bucket and return a signed
 * URL that can be shared with collaborators without re-downloading.
 *
 * Files are stored under `{auth.uid()}/debug-reports/…zip` to satisfy the
 * bucket's owner-scoped RLS policies. The signed URL is long-lived (7 days).
 */
import { supabase } from "@/integrations/supabase/client";
import {
  buildMergeDebugZipBlob,
  type MergeDebugReport,
} from "@/lib/merge-debug-report";

const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

async function zipReport(report: MergeDebugReport): Promise<Blob> {
  return buildMergeDebugZipBlob(report);
}



export interface ShareableDebugZip {
  url: string;
  path: string;
  expires_at: string;
  size_bytes: number;
}

export async function shareMergeDebugZip(report: MergeDebugReport): Promise<ShareableDebugZip> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    throw new Error("You must be signed in to create a shareable debug ZIP.");
  }
  const userId = userData.user.id;

  const blob = await zipReport(report);
  const jobSlug = report.render_job.id ? report.render_job.id.slice(0, 8) : "no-job";
  const ts = report.generated_at.replace(/[:.]/g, "-");
  const path = `${userId}/debug-reports/merge-debug-${jobSlug}-${ts}.zip`;

  const { error: upErr } = await supabase.storage
    .from("media-uploads")
    .upload(path, blob, {
      contentType: "application/zip",
      cacheControl: "3600",
      upsert: true,
    });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  const { data: signed, error: signErr } = await supabase.storage
    .from("media-uploads")
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (signErr || !signed?.signedUrl) {
    throw new Error(`Could not create signed URL: ${signErr?.message ?? "unknown error"}`);
  }

  return {
    url: signed.signedUrl,
    path,
    expires_at: new Date(Date.now() + SIGNED_URL_TTL_SEC * 1000).toISOString(),
    size_bytes: blob.size,
  };
}
