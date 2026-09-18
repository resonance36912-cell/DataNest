import { supabase } from "@/integrations/supabase/client";
import type { Scene } from "@/contexts/ProjectContext";

/**
 * For scenes missing a video, find the latest completed video from the gallery
 * (generation_jobs or render_jobs) and backfill it.
 */
export async function backfillGalleryVideos(scenes: Scene[], projectId: string, userId: string): Promise<Scene[]> {
  const missing = scenes.filter(s => !s.videoUrl);
  if (missing.length === 0) return scenes;

  const missingNumbers = missing.map(s => s.scene_number);

  const [genRes, renderRes] = await Promise.all([
    supabase
      .from("generation_jobs")
      .select("scene_number, output_asset_url, updated_at")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .in("scene_number", missingNumbers)
      .eq("status", "succeeded")
      .not("output_asset_url", "is", null)
      .order("updated_at", { ascending: false }),
    supabase
      .from("render_jobs")
      .select("scene_number, final_output_url, quality, updated_at, output")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .in("scene_number", missingNumbers)
      .eq("status", "succeeded")
      .order("updated_at", { ascending: false }),
  ]);

  const videoMap: Record<number, { url: string; quality: Scene["videoQuality"] }> = {};

  for (const row of renderRes.data || []) {
    const num = row.scene_number;
    if (videoMap[num]) continue;
    const url = row.final_output_url || (row.output as any)?.video_url;
    if (url) videoMap[num] = { url, quality: (row.quality as Scene["videoQuality"]) || "hd" };
  }
  for (const row of genRes.data || []) {
    const num = row.scene_number;
    if (videoMap[num]) continue;
    if (row.output_asset_url) videoMap[num] = { url: row.output_asset_url, quality: "preview" };
  }

  if (Object.keys(videoMap).length === 0) return scenes;

  return scenes.map(s => {
    if (s.videoUrl || !videoMap[s.scene_number]) return s;
    return { ...s, videoUrl: videoMap[s.scene_number].url, videoQuality: videoMap[s.scene_number].quality };
  });
}
